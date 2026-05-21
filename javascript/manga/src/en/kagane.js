const mangayomiSources = [{
    "name": "kagane",
    "lang": "en",
    "baseUrl": "https://kagane.org",
    "apiUrl": "https://{}kagane.org/api",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://kagane.org",
    "typeSource": "single",
    "itemType": 0,
    "isManga": true,
    "isNsfw": true,
    "hasCloudflare": true,
    "version": "0.0.1",
    "pkgPath": "manga/src/en/kagane.js",
    "notes": "requires cloudflare proxy"
}];

class ProxyClient {
    constructor(prefs) {
        this.prefs = prefs;
        this.client = new Client({
            useDartHttpClient: false,
            verifyCertificates: false
        });
    }

    req(method, url, headers, body) {
        if (!this.prefs.get("proxy-use")) {
            return this.client[method.toLowerCase()](
                url,
                headers,
                body
            );
        }

        return this.client.post(
            this.prefs.get("proxy-url"),
            {
                "x-api-key": this.prefs.get("proxy-key"),
                "x-impersonate": this.prefs.get("proxy-impersonate")
            },
            JSON.stringify({
                url,
                method,
                headers,
                body: JSON.stringify(body)
            })
        );
    }

    head(u,h){return this.req("HEAD",u,h)}
    get(u,h){return this.req("GET",u,h)}
    post(u,h,b){return this.req("POST",u,h,b)}
    put(u,h,b){return this.req("PUT",u,h,b)}
    delete(u,h,b){return this.req("DELETE",u,h,b)}
    patch(u,h,b){return this.req("PATCH",u,h,b)}
}

function buildParams(params) {
    let out = "";

    for (const [key, value] of Object.entries(params)) {
        const k = encodeURIComponent(key);

        if (Array.isArray(value)) {
            for (const v of value) {
                out += (out ? "&" : "") + k + "=" + encodeURIComponent(v);
            }
        } else if (value != null) {
            out += (out ? "&" : "") + k + "=" + encodeURIComponent(value);
        }
    }

    return out;
}

const StatusMap = {
    "Ongoing": 0,
    "Completed": 1,
    "Hiatus": 2,
    "unknown": 5
}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.prefs = new SharedPreferences();
        this.client = new ProxyClient(this.prefs);
        this.total = 100;
    }
    async getChallenge(url, bookid) {
        const emeScript = `
            (async function() {
                function hexToBytes(hex) {
                    const b = new Uint8Array(hex.length / 2);
                    for (let i = 0; i < hex.length; i += 2)
                    b[i / 2] = parseInt(hex.substr(i, 2), 16);
                    return b;
                }

                function concat(...arrays) {
                    const total = arrays.reduce((s, a) => s + a.length, 0);
                    const out = new Uint8Array(total);
                    let off = 0;
                    for (const a of arrays) { out.set(a, off); off += a.length; }
                    return out;
                }

                function encodeVarint(n) {
                    const out = [];
                    while (n > 127) { out.push((n & 0x7F) | 0x80); n >>>= 7; }
                    out.push(n & 0x7F);
                    return new Uint8Array(out);
                }

                function pbBytes(field, data) {
                    return concat(encodeVarint((field << 3) | 2), encodeVarint(data.length), data);
                }

                function pbVarint(field, value) {
                    return concat(encodeVarint((field << 3) | 0), encodeVarint(value));
                }

                async function getKID(bookId) {
                    const enc = new TextEncoder().encode(':' + bookId);
                    const hash = await crypto.subtle.digest('SHA-256', enc);
                    return new Uint8Array(hash).slice(0, 16);
                }

                function buildWidevinePSSH(kid) {
                    const systemId     = hexToBytes('edef8ba979d64acea3c827dcd51d21ed');
                    const versionFlags = new Uint8Array([0, 0, 0, 0]);
                    const kidProto     = new Uint8Array([0x12, kid.length, ...kid]);
                    const dataLen      = new Uint8Array(4);
                    new DataView(dataLen.buffer).setUint32(0, kidProto.length, false);
                    const psshBody = concat(versionFlags, systemId, dataLen, kidProto);
                    const totalLen = new Uint8Array(4);
                    new DataView(totalLen.buffer).setUint32(0, psshBody.length + 8, false);
                    return concat(totalLen, new TextEncoder().encode('pssh'), psshBody);
                }

                async function getChallengeViaEME(bookId) {
                    const kid  = await getKID(bookId);
                    const pssh = buildWidevinePSSH(kid);

                    const certRes = await fetch('${this.source.apiUrl.replace("{}", "yuzuki.")}/v2/static/bin.bin');
                    const cert    = await certRes.arrayBuffer();

                    const access = await navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
                    initDataTypes: ['cenc'],
                    audioCapabilities: [],
                    videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.42E01E"' }]
                    }]);

                    const mediaKeys = await access.createMediaKeys();
                    await mediaKeys.setServerCertificate(cert);

                    const session = mediaKeys.createSession();

                    const rawChallenge = await new Promise((resolve, reject) => {
                    session.addEventListener('message', e => resolve(e.message));
                    session.addEventListener('error',   () => reject(new Error('EME session error')));
                    session.generateRequest('cenc', pssh.buffer);
                    });

                    session.close();
                    return btoa(String.fromCharCode(...new Uint8Array(rawChallenge)));
                }

                try {
                    window.flutter_inappwebview.callHandler('setResponse', await getChallengeViaEME('${bookid}'));
                } catch(e) {
                    window.flutter_inappwebview.callHandler('setResponse', 'ERROR:' + e.message);
                }
            })()
        `;

        const result = await evaluateJavascriptViaWebview(url, {}, [emeScript]);

        if (!result || result.startsWith('ERROR:')) {
            throw new Error('EME challenge failed: ' + result);
        }
        return result;
    }
    async getIntegrityToken() {
        const res = await this.client.post(`${this.source.apiUrl.replace("{}", "")}/api/integrity`, 
            { 'Content-Type': 'application/json' },
            {}
        );
        return JSON.parse(res.body).token;
    }
    getMangaData(manga, full=false) {
        let imageUrl = null;
        if (manga?.cover_image_id) {
            imageUrl = `${this.source.apiUrl.replace("{}", "yuzuki.")}/v2/image/${manga.cover_image_id}`;
        } else if (manga?.series_covers != null&& manga?.series_covers[0]?.image_id) {
            imageUrl = `${this.source.apiUrl.replace("{}", "yuzuki.")}/v2/image/${manga.series_covers[0].image_id}`;
        }
        if (this.prefs.get("proxy-use") && imageUrl != null) imageUrl = `${this.prefs.get("proxy-url")}/image?url=${imageUrl}`
      
        let chapters = [];
        if (manga?.series_books != null) {
            for (const chapter of manga.series_books) {
            chapters.push({
                name: chapter?.title ?? `${chapter?.volume_no != null ? "Vol: "+chapter.volume_no : ""}Chapter: ${chapter.chapter_no}`,
                url: `${this.source.baseUrl}/series/${manga.series_id}/reader/${chapter.book_id}`,
                dateUpload: String(new Date(chapter.created_at).getTime()),
                scanlator: chapter?.groups != null && chapter?.groups[0] != null ? chapter.groups[0].title : chapter?.uploader?.username ?? "Unknown" 
            })
            }
        }
      
        return {
            name: manga.title,
            imageUrl,
            link: `${this.source.baseUrl}/series/${manga.series_id}`,
            description: manga?.description ?? "Unknown", //manga.description,
            status: StatusMap[manga.upload_status],
            genre: manga?.genres[0]?.genre_name != null ? manga?.genres?.map((c)=>c?.genre_name) ?? [] : [],
            author: "Unknown",
            artist: "Unknown",
            ...(chapters != null ? {chapters} : {})
        }
    }
    
    async getPopular(page) {
        // https://yuzuki.kagane.org/api/v2/search/series?page=0&size=30&sort=avg_views_today%2Cdesc
        return await this.searchApi(null, "avg_views_today,desc", page);
    }
    get supportsLatest() {
        return true;
    }
    async getLatestUpdates(page) {
        return await this.searchApi(null, "updated_at,desc", page);
    }
    async searchApi(query=null, sort=null, page=1) {
      let params = {};
      
      if (sort != null) params["sort"] = sort
      params["size"]=this.total;
      params["page"]=page-1;

      let res = await this.client.post(`${this.source.apiUrl.replace("{}", "yuzuki.")}/v2/search/series?${buildParams(params)}`, 
            { "content-type": "application/json"}, 
            { 
                "content_lang": [],
                "content_rating": [
                    "Safe",
                    "Suggestive",
                    "Erotica",
                    "Pornographic"
                ],
                ...(query != null ? {title:query}: {})
            }
        );
        
        let data = JSON.parse(res.body)
        return {
            list: data?.content?.map((c)=>this.getMangaData(c)) ?? [],
            hasNextPage: page != (data?.total_pages ?? page)
        }
    }
    async search(query, page, filters) {
        return await this.searchApi(query, null, page);
    }
    async getDetail(url) {
        let id = url.split("/").slice(-1)[0];
        let res = await this.client.get(`${this.source.apiUrl.replace("{}", "yuzuki.")}/v2/series/${id}`);
        let data = JSON.parse(res.body);
        return this.getMangaData(data)
    }
    async getPageList(url) {
        const [seriesid, _, bookid] = url.split("/").slice(-3);
        const [challenge, integrityToken] = await Promise.all([
            this.getChallenge(url, bookid),
            this.getIntegrityToken()
        ]);
        
        const res = await this.client.post(
            `${this.source.apiUrl.replace("{}", "yuzuki.")}/v2/books/${bookid}?is_datasaver=false`,
            {
                'Content-Type':      'application/json',
                'x-integrity-token': `${integrityToken}`
            },
            { challenge }
        );
        const data = JSON.parse(res.body); // { access_token, cache_url, pages }
        let pages = [];
        for (const page of data.pages) {
            pages.push({
                url: `${this.source.apiUrl.replace("{}", "akari.")}/v2/books/file/${bookid}/${page.page_uuid}?token=${data.access_token}&is_datasaver=false`
            })
        }
        return pages;
    }
    getFilterList() {
        throw new Error("getFilterList not implemented");
    }
    getSourcePreferences() {
        return [
            {
                "key": "proxy-use",
                "checkBoxPreference": {
                    "title": "cloudflare proxy",
                    "summary": "Use a custom cloudflare proxy",
                    "value": true
                }
            },{
                "key": "proxy-url",
                "editTextPreference": {
                    "title": "Set Cloudflare proxy url",
                    "summary": "Cloudflare proxy url",
                    "value": "http://localhost:8080",
                    "dialogTitle": "Custom Proxy URL",
                    "dialogMessage": "set the proxy url to use",
                }
            },{
                "key": "proxy-key",
                "editTextPreference": {
                    "title": "Set Cloudflare proxy API key",
                    "summary": "Cloudflare proxy API Key",
                    "value": "secret123",
                    "dialogTitle": "Proxy URL API Key",
                    "dialogMessage": "set the proxy API Key",
                }
            },{
                "key": "proxy-impersonate",
                "editTextPreference": {
                    "title": "Set Cloudflare browser impersonation",
                    "summary": "Cloudflare browser impersonation",
                    "value": "chrome120",
                    "dialogTitle": "Proxy Impersonation",
                    "dialogMessage": "set the browser impersonation to use",
                }
            }
        ]
    }
}
