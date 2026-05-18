from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse
from curl_cffi import requests as curl_requests
import socket, random, ipaddress, asyncio, subprocess, time, httpx, os, signal
from dataclasses import dataclass, field
from typing import Optional

app = FastAPI()

API_KEY = "secret123"
IMPERSONATIONS = list(curl_requests.impersonate.BrowserTypeLiteral.__args__)
PREFERRED_IMPERSONATIONS = [
    i for i in IMPERSONATIONS
    if any(b in i for b in ("chrome12", "chrome13", "edge"))
] or IMPERSONATIONS

FLARESOLVERR_PORT = 8191
FLARESOLVERR_URL  = f"http://localhost:{FLARESOLVERR_PORT}/v1"
FLARESOLVERR_IDLE_TIMEOUT = 300

HOP_BY_HOP = {
    "content-encoding", "transfer-encoding", "connection",
    "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "upgrade", "host",
    "x-api-key", "x-client-id", "x-impersonate",
}

CHROME_BASELINE_HEADERS = {
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,image/apng,*/*;"
        "q=0.8,application/signed-exchange;v=b3;q=0.7"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

CHALLENGE_MARKERS = (
    "_cf_chl_opt",
    "jschl_vc",
    "jschl-answer",
    "challenge-form",
    "cf-chl-bypass",
    "Just a moment",
    "Enable JavaScript and cookies",
    "Checking your browser",
    "DDoS protection by Cloudflare",
    "challenges.cloudflare.com/turnstile",
)

BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

class FlareSolverrManager:
    def __init__(self):
        self._proc: Optional[subprocess.Popen] = None
        self._lock = asyncio.Lock()
        self._last_used: float = 0
        self._idle_task: Optional[asyncio.Task] = None

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    async def ensure_running(self):
        async with self._lock:
            if self.running:
                self._touch()
                return

            print("[FlareSolverr] Starting process...")
            env = os.environ.copy()
            env["LOG_LEVEL"] = "warning"
            self._proc = subprocess.Popen(
                ["flaresolverr"],
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            await self._wait_ready(timeout=30)
            self._touch()
            print("[FlareSolverr] Ready.")

            if self._idle_task:
                self._idle_task.cancel()
            self._idle_task = asyncio.create_task(self._idle_watcher())

    async def _wait_ready(self, timeout: int):
        deadline = time.monotonic() + timeout
        async with httpx.AsyncClient() as client:
            while time.monotonic() < deadline:
                try:
                    r = await client.get(
                        f"http://localhost:{FLARESOLVERR_PORT}/health",
                        timeout=2,
                    )
                    if r.status_code == 200:
                        return
                except Exception:
                    pass
                await asyncio.sleep(0.5)
        raise RuntimeError("FlareSolverr failed to start within timeout")

    def _touch(self):
        self._last_used = time.monotonic()

    async def _idle_watcher(self):
        """Shuts FlareSolverr down after FLARESOLVERR_IDLE_TIMEOUT seconds of no use."""
        try:
            while True:
                await asyncio.sleep(10)
                idle = time.monotonic() - self._last_used
                if idle >= FLARESOLVERR_IDLE_TIMEOUT:
                    async with self._lock:
                        if self.running and (time.monotonic() - self._last_used) >= FLARESOLVERR_IDLE_TIMEOUT:
                            print(f"[FlareSolverr] Idle for {idle:.0f}s — shutting down.")
                            self._shutdown()
                    break
        except asyncio.CancelledError:
            pass

    def _shutdown(self):
        if self._proc and self._proc.poll() is None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=5)
            except Exception:
                self._proc.kill()
        self._proc = None

    async def solve(self, url: str, cookies: dict = None, user_agent: str = None) -> dict:
        """
        Ask FlareSolverr to fetch a URL through a real browser and return
        the cf_clearance cookie + user-agent.
        Retries once if FlareSolverr crashes mid-solve.
        """
        for attempt in range(2):
            await self.ensure_running()
            self._touch()
            payload = {
                "cmd": "request.get",
                "url": url,
                "maxTimeout": 40000,
            }
            if cookies:
                payload["cookies"] = [{"name": k, "value": v} for k, v in cookies.items()]
            if user_agent:
                payload["userAgent"] = user_agent

            try:
                async with httpx.AsyncClient(timeout=50) as client:
                    r = await client.post(FLARESOLVERR_URL, json=payload)
                result = r.json()
            except Exception as e:
                if attempt == 0:
                    print(f"[FlareSolverr] Solve failed ({e}), restarting...")
                    async with self._lock:
                        self._shutdown()
                    continue
                raise HTTPException(502, f"FlareSolverr unreachable: {e}")

            if result.get("status") != "ok":
                raise HTTPException(502, f"FlareSolverr error: {result.get('message')}")

            solution = result["solution"]
            raw_cookies = {c["name"]: c["value"] for c in solution.get("cookies", [])}
            return {
                "cf_clearance": raw_cookies.get("cf_clearance"),
                "cookies": raw_cookies,
                "user_agent": solution.get("userAgent", ""),
                "status_code": solution.get("status"),
                "response": solution.get("response", ""),
            }
        raise HTTPException(502, "FlareSolverr failed after retry")

    @property
    def status(self):
        return {
            "running": self.running,
            "pid": self._proc.pid if self._proc else None,
            "idle_seconds": round(time.monotonic() - self._last_used, 1) if self._last_used else None,
        }


flare = FlareSolverrManager()

@dataclass
class SessionEntry:
    session: curl_requests.Session = field(default_factory=curl_requests.Session)
    impersonate: str = field(default_factory=lambda: random.choice(PREFERRED_IMPERSONATIONS))
    # CF clearance state
    cf_clearance: Optional[str] = None
    cf_user_agent: Optional[str] = None
    cf_obtained_at: float = 0
    cf_for_url: Optional[str] = None

    CF_TTL = 3600

    @property
    def cf_valid(self) -> bool:
        return (
            self.cf_clearance is not None
            and (time.monotonic() - self.cf_obtained_at) < self.CF_TTL
        )

    def store_clearance(self, origin: str, clearance: str, user_agent: str, all_cookies: dict):
        self.cf_clearance = clearance
        self.cf_user_agent = user_agent
        self.cf_obtained_at = time.monotonic()
        self.cf_for_url = origin
        for name, value in all_cookies.items():
            self.session.cookies.set(name, value)

    def clear_clearance(self):
        self.cf_clearance = None
        self.cf_obtained_at = 0


sessions: dict[str, SessionEntry] = {}

def get_session_entry(client_id: str, host: str) -> SessionEntry:
    key = f"{client_id}:{host}"
    if key not in sessions:
        sessions[key] = SessionEntry()
    return sessions[key]

def parse_host(url: str) -> Optional[str]:
    try:
        host_part = url.split("://", 1)[1].split("/")[0]
        return host_part.split(":")[0]
    except Exception:
        return None

def is_blocked(host: str) -> bool:
    try:
        for info in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_loopback or ip.is_link_local or ip.is_private:
                return True
            if any(ip in net for net in BLOCKED_NETWORKS):
                return True
        return False
    except Exception:
        return True

def is_cf_challenge(resp) -> bool:
    """
    Check headers first (no body needed), fall back to a small body peek
    for ambiguous cases. Does NOT consume the response body.
    """
    server  = resp.headers.get("server", "").lower()
    cf_ray  = resp.headers.get("cf-ray") or resp.headers.get("CF-RAY")
    is_cf   = "cloudflare" in server or bool(cf_ray)

    if not is_cf:
        return False

    status  = resp.status_code
    ct      = resp.headers.get("content-type", "")

    if "text/html" not in ct:
        return False

    if status in (403, 429, 503):
        preview = resp.content[:4096].decode("utf-8", errors="ignore")
        return any(m in preview for m in CHALLENGE_MARKERS)

    if status == 200:
        preview = resp.content[:4096].decode("utf-8", errors="ignore")
        return "challenges.cloudflare.com/turnstile" in preview

    return False


def origin_of(url: str) -> str:
    parts = url.split("://", 1)
    scheme = parts[0]
    host = parts[1].split("/")[0]
    return f"{scheme}://{host}"

@app.post("/")
async def proxy(request: Request):
    if request.headers.get("x-api-key") != API_KEY:
        raise HTTPException(403, "Forbidden")

    data        = await request.json()
    target_url  = data.get("url")
    method      = data.get("method", "GET").upper()
    req_headers = data.get("headers", {})
    cookies     = data.get("cookies", {})
    body        = data.get("body", b"")

    if not target_url:
        raise HTTPException(400, "Missing url")

    parsed_host = parse_host(target_url)
    if not parsed_host:
        raise HTTPException(400, "Invalid url")
    if is_blocked(parsed_host):
        raise HTTPException(403, "Blocked host")

    client_id = request.headers.get("x-client-id") or request.client.host
    entry = get_session_entry(client_id, parsed_host)

    req_imp = request.headers.get("x-impersonate")
    if req_imp and req_imp in IMPERSONATIONS:
        entry.impersonate = req_imp

    final_headers = {**CHROME_BASELINE_HEADERS}
    for k, v in req_headers.items():
        if k.lower() not in HOP_BY_HOP:
            final_headers[k] = v

    origin = origin_of(target_url)
    if entry.cf_valid and entry.cf_for_url == origin and entry.cf_user_agent:
        final_headers["User-Agent"] = entry.cf_user_agent

    def make_request(stream=False, slvd=None):
        if slvd:
            cookies.update(slvd.get("cookies", {}))
            final_headers["Cookie"] = "; ".join(f"{j}={l}" for j, l in slvd.get("cookies", {}).items())

        return entry.session.request(
            method=method,
            url=target_url,
            headers=final_headers,
            data=body or None,
            cookies=cookies,
            timeout=20,
            allow_redirects=True,
            impersonate=entry.impersonate,
            stream=stream,
        )

    content_length = 0
    try:
        content_length = int(
            data.get("headers", {}).get("content-length", 0)
        )
    except Exception:
        pass

    try:
        resp = make_request(stream=False)
    except Exception as e:
        raise HTTPException(502, f"Upstream error: {e}")

    challenge_detected = is_cf_challenge(resp)

    if challenge_detected:
        print(f"[CF] Challenge detected for {origin} (client={client_id}). Solving...")

        entry.clear_clearance()

        try:
            solved = await flare.solve(url=target_url)
            print(solved)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"Solver error: {e}")

        clearance = solved.get("cf_clearance")
        ua        = solved.get("user_agent", "")
        all_cooks = solved.get("cookies", {})

        if not clearance:
            raise HTTPException(503, {
                "error": "cf_challenge_unsolvable",
                "message": "FlareSolverr could not obtain cf_clearance (Turnstile/hCaptcha?)",
                "solver_status": solved.get("status_code"),
            })

        entry.store_clearance(origin, clearance, ua, all_cooks)
        final_headers["User-Agent"] = ua
        print(f"[CF] Got clearance for {origin}, retrying original request...")

        try:
            resp = make_request(stream=True, slvd=solved)
        except Exception as e:
            raise HTTPException(502, f"Upstream error after solve: {e}")

        # If still a challenge, give up cleanly
        if is_cf_challenge(resp):
            raise HTTPException(503, {
                "error": "cf_challenge_persists",
                "message": "Got CF challenge even after obtaining cf_clearance.",
            })

        stream_iter = resp.iter_content(8192)

    else:
        content = resp.content
        stream_iter = iter([content])

    response_headers = {
        k: v for k, v in resp.headers.items()
        if k.lower() not in HOP_BY_HOP
    }

    return StreamingResponse(
        (chunk for chunk in stream_iter if chunk),
        status_code=resp.status_code,
        headers=response_headers,
    )

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "sessions": len(sessions),
        "flaresolverr": flare.status,
    }

@app.post("/solve")
async def manual_solve(request: Request):
    """Manually trigger a FlareSolverr solve and store the clearance in a session."""
    if request.headers.get("x-api-key") != API_KEY:
        raise HTTPException(403, "Forbidden")
    data = await request.json()
    url = data.get("url")
    if not url:
        raise HTTPException(400, "Missing url")

    solved = await flare.solve(url=url)
    client_id = request.headers.get("x-client-id") or request.client.host
    host = parse_host(url)
    if host and solved.get("cf_clearance"):
        entry = get_session_entry(client_id, host)
        entry.store_clearance(
            origin_of(url),
            solved["cf_clearance"],
            solved["user_agent"],
            solved["cookies"],
        )
    return solved

@app.delete("/session/{client_id}/{host}")
async def clear_session(client_id: str, host: str, request: Request):
    if request.headers.get("x-api-key") != API_KEY:
        raise HTTPException(403, "Forbidden")
    key = f"{client_id}:{host}"
    removed = sessions.pop(key, None)
    return {"cleared": key if removed else None}

@app.delete("/flaresolverr")
async def stop_flaresolverr(request: Request):
    if request.headers.get("x-api-key") != API_KEY:
        raise HTTPException(403, "Forbidden")
    async with flare._lock:
        flare._shutdown()
    return {"stopped": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("proxy-server:app", host="0.0.0.0", port=8080, workers=1)
