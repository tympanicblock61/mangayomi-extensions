const mangayomiSources = [{
    "name": "Comix",
    "lang": "en",
    "baseUrl": "https://comix.to",
    "apiUrl": "https://comix.to/api",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://comix.to",
    "typeSource": "single",
    "itemType": 0,
    "isManga": true,
    "isNsfw": true,
    "version": "0.1.6",
    "pkgPath": "manga/src/en/comix.js",
    "notes": "this is not finished, it was rushed, missing some options, but works"
}];

const StatusMap = {
    "releasing": 0,
    "finished": 1,
    "on_hiatus": 2,
    "discontinued": 3,
    "not_yet_released": 4,
    "unknown": 5
}

function parseRelativeTime(str) {
  const units = {
    s:   1000,
    m:   60000,
    h:   3600000,
    d:   86400000,
    w:   604800000,
    mo:  2592000000,
    mos: 2592000000,
    y:   31536000000,
  };

  const match = str.match(/^(\d+)\s*(mos|mo|[smhdwy])(?:\s*ago)?$/);
  if (!match) throw new Error("Unknown format: " + str);

  const amount = parseInt(match[1]);
  const unit   = match[2];
  if (!(unit in units)) throw new Error("Unknown unit: " + unit);

  return String(Date.now() - (amount * units[unit]));
}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.prefs = new SharedPreferences();
        this.limit = 100;
        this.encoder = null;
        this.decoder = null;
    }
    
    find(obj) {
        for (const k in obj) {
            const v = obj[k];
            if (
                v &&
                typeof v === "object" &&
                typeof v.D === "function" &&
                typeof v.R === "function"
            ) {
                return v;
            }
        }
        return null;
    }
    
    async getEncoderDecoder() {
        if (this.encoder == null && this.decoder == null) {
            var res = await this.client.get(`${this.source.baseUrl}/assets/build/35595e3de3c99889c1aa70/dist/secure-teup0d-D6PE046x.js`);

            function stripModule(src) {
                return src
                .replace(/export\s+default/g, "const __default_export =")
                .replace(/export\s+function/g, "function")
                .replace(/export\s+const/g, "const")
                .replace(/export\s*\{/g, "// export {");
            }

            const src = stripModule(res.body);

            var B64CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            var B64TABLE = (function() {
                var t = {};
                for (var i = 0; i < B64CHARS.length; i++) t[B64CHARS[i]] = i;
                return t;
            })();
            function _atob(s) {
                s = String(s).replace(/[\t\n\f\r ]/g, "");
                var rem = s.length % 4;
                if (rem === 1) s += "A==";
                else if (rem === 2) s += "==";
                else if (rem === 3) s += "=";
                var o = "";
                for (var i = 0; i < s.length; i += 4) {
                    var a = B64TABLE[s[i]]   | 0;
                    var b = B64TABLE[s[i+1]] | 0;
                    var c = s[i+2] === "=" ? 0 : (B64TABLE[s[i+2]] | 0);
                    var d = s[i+3] === "=" ? 0 : (B64TABLE[s[i+3]] | 0);
                    var n = (a << 18) | (b << 12) | (c << 6) | d;
                    o += String.fromCharCode((n >> 16) & 255);
                    if (s[i+2] !== "=") o += String.fromCharCode((n >> 8) & 255);
                    if (s[i+3] !== "=") o += String.fromCharCode(n & 255);
                }
                return o;
            }

            function _btoa(s) {
                s = String(s);
                for (var i = 0; i < s.length; i++)
                    if (s.charCodeAt(i) > 255) throw new Error("btoa: not latin1");
                var o = "";
                for (var i = 0; i < s.length; i += 3) {
                    var a = s.charCodeAt(i);
                    var b = s.charCodeAt(i+1);
                    var c = s.charCodeAt(i+2);
                    o += B64CHARS[a >> 2];
                    o += B64CHARS[((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4)];
                    o += isNaN(b) ? "=" : B64CHARS[((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6)];
                    o += isNaN(c) ? "=" : B64CHARS[c & 63];
                }
                return o;
            }

            var id = 1;
            var timers = new Map();
            var fakeEl = {
                appendChild:      function(){},
                setAttribute:     function(){},
                addEventListener: function(){},
                removeChild:      function(){},
            };

            const querySelector = function querySelector() {
                return null;
            };
            Object.defineProperty(querySelector, "toString", {
                value: () =>
                    "function querySelector() { [native code] }"
            });
            Object.defineProperty(querySelector, "name", {
                value: "querySelector"
            });

            var fakeGlobal = {
                setTimeout:   function setTimeout(fn, ms)  { var i=id++; timers.set(i,{fn:fn,ms:ms}); return i; },
                setInterval:  function setInterval(fn, ms) { var i=id++; timers.set(i,{fn:fn,ms:ms,interval:true}); return i; },
                clearTimeout:  function clearTimeout(i)    { timers.delete(i); },
                clearInterval: function clearInterval(i)   { timers.delete(i); },
                navigator: {
                    appCodeName: "Mozilla",
                    userAgent:   "Mozilla/5.0",
                    platform:    "Win32",
                },
                location: { host: "comix.to", href: "https://comix.to" },
                document: {
                    createElement:    function() { return fakeEl; },
                    addEventListener: function() {},
                    querySelector:    querySelector,
                    body:             fakeEl,
                    documentElement:  fakeEl,
                },
                atob:           function atob(s)  { return _atob(s); },
                btoa:           function btoa(s)  { return _btoa(s); },
                queueMicrotask: function queueMicrotask(fn) { Promise.resolve().then(fn); },
                crypto:      { getRandomValues: function(a) { for(var i=0;i<a.length;i++) a[i]=(Math.random()*256)|0; return a; } },
                performance: { now: function now() { return Date.now(); } },
                encodeURIComponent,decodeURIComponent,isNaN,isFinite,parseInt,parseFloat,Math,Object,Array,String,Date,Promise,JSON,RegExp,Error,TypeError,RangeError,Map,Set,WeakMap,WeakSet,Symbol,Proxy,Reflect,Uint8Array,Int32Array,Float64Array,ArrayBuffer,
            }
            fakeGlobal.window = fakeGlobal;
            fakeGlobal.self = fakeGlobal;
            fakeGlobal.globalThis = fakeGlobal;
            var paramNames  = Object.keys(fakeGlobal);
            var paramValues = Object.values(fakeGlobal);

            var fn = new Function(
                paramNames.join(","),
                src + "\nreturn globalThis;"
            );

            var capturedGlobal = fn.apply(null, paramValues);
            var found = this.find(capturedGlobal);
            this.encoder = found.D;
            this.decoder = found.R;
        }
    }
    
    async getAPI(type, days, exclude_genres) {
        var query = ""
        for (const genre in exclude_genres) {
            if (query.length == 0) query += "?";
            query += `exclude_genres[]=${genre}`;
        }
        if (exclude_genres.length == 0) query += "?";
        else query += "&";
        query += `type=${type}`;
        query += `&days=${days}`;
        query += `&limit=${this.limit}`;
        console.log(query);
        var resp = await this.client.get(`${this.source.apiUrl}/v1/manga/top${query}`, {})
        return JSON.parse(resp.body);
    }

    comicData(comic) {
        return {
            name: comic.title,
            imageUrl: comic.poster.large ?? comic.poster.medium,
            link: `${this.source.baseUrl}/title/${comic.hid}`,
            description: comic.synopsis,
            status: StatusMap[comic.status] ?? 5,
            genre: comic?.genres?.map((g)=>g?.title)?.filter((g)=>g != null),
            author: comic?.authors?.map((a)=>a?.title)?.filter((a)=>a != null).join(" & "),
            artist: comic?.artists?.map((a)=>a?.title)?.filter((a)=>a != null).join(" & "),
        };
    }

    async getPopular(page) {
        const days = [1,7,30,90,180,365];
        const res = await this.getAPI("trending", days[page > 6 ? 6 : page-1], []);
        return {
            list: res.result.map(c => this.comicData(c)),
            hasNextPage: (page < 6)
        };
    }

    get supportsLatest() {
        return true;
    }

    getHeaders(url) {
        return {}
    }
    async getLatestUpdates(page) {
        var res = await this.client.get(`${this.source.apiUrl}/v1/manga?scope=hot&limit=${this.limit}&order[chapter_updated_at]=desc&page=${page}`)
        var res = JSON.parse(res.body);
        return {
            list: res.result.items.map(c => this.comicData(c)),
            hasNextPage: page != res.result.meta.lastPage
        }
    }
    async search(query, page, filters) {
        var res = await this.client.get(`${this.source.apiUrl}/v1/manga?keyword=${query}&limit=${this.limit}&page=${page}&order[relevance]=desc`) // just use order[relevance]=desc for now
        var res = JSON.parse(res.body);
        return {
            list: res.result.items.map(c => this.comicData(c)),
            hasNextPage: page != res.result.meta.lastPage
        }
    }
    async getChapters(url, comic) {
        const id = url.split("/").pop();
        const key = this.encoder(`/manga/${id}/chapters`);
        const firstResp = await this.client.get(`${this.source.apiUrl}/v1/manga/${id}/chapters?limit=${this.limit}&order[number]=desc&_=${key}&page=1`);
        const firstJson = JSON.parse(firstResp.body);
        const last_page = firstJson.result.meta.lastPage;
        const pageRequests = [firstResp];
        for (let page = 2; page <= last_page; page++) {
            pageRequests.push(this.client.get(`${this.source.apiUrl}/v1/manga/${id}/chapters?limit=${this.limit}&order[number]=desc&page=${page}&_=${key}`));
        }

        const chapters = [];

        const results = await Promise.all(pageRequests);
        for (const r of results) {
            const j = JSON.parse(r.body);
            for (const c of j.result.items) {
                console.log(c.createdAtFormatted);
                chapters.push({
                    name: c.name && c.name.length ? c.name : `Chapter ${c.number}`,
                    url: `${url}/${c.id}`,
                    dateUpload: parseRelativeTime(c.createdAtFormatted),
                    scanlator: c.isOfficial ? "Official" : c.group?.name ?? "Unknown"
                })
            }
        }

        return chapters;
    }
    async getDetail(link) {
        await this.getEncoderDecoder();
        var [id] = link.split("/").slice(-1);
        var comic = await this.client.get(`${this.source.apiUrl}/v1/manga/${id}?includes[]=author&includes[]=artist&includes[]=genre&includes[]=theme&includes[]=demographic`);
        comic = JSON.parse(comic.body);
        comic = comic["result"];
        return {
            link,
            chapters: await this.getChapters(link, comic),
            ...this.comicData(comic)
        };
    }
    async getPageList(url) {
        await this.getEncoderDecoder();
        var chapter_id = url.split("/")[5];
        const key = this.encoder(`/chapters/${chapter_id}`)
        const req = await this.client.get(`${this.source.apiUrl}/v1/chapters/${chapter_id}?_=${key}`);
        const js = JSON.parse(req.body);
        console.log(js)
        var images = [];
        for (const page of js.result.pages.items) {
            images.push(js.result.pages.baseUrl+page.url);
        }
        return images;
    }
    getFilterList() {
        return []
    }
    getSourcePreferences() {
        return []
    }
}
