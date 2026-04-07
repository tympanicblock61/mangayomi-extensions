const mangayomiSources = [{
    "name": "Comix",
    "lang": "all",
    "baseUrl": "https://comix.to",
    "apiUrl": "https://comix.to/api",
    "iconUrl": "https://comix.to/images/icon_512x512.png",
    "typeSource": "single",
    "itemType": 0,
    "isManga": true,
    "isNsfw": true,
    "version": "0.0.2",
    "pkgPath": "manga/src/all/comix.js",
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

class KeyGenerator {
    constructor() {
        this.BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        this.KEYS = [
            '13YDu67uDgFczo3DnuTIURqas4lfMEPADY6Jaeqky+w=',
            'yEy7wBfBc+gsYPiQL/4Dfd0pIBZFzMwrtlRQGwMXy3Q=',
            'yrP+EVA1Dw==',
            'vZ23RT7pbSlxwiygkHd1dhToIku8SNHPC6V36L4cnwM=',
            'QX0sLahOByWLcWGnv6l98vQudWqdRI3DOXBdit9bxCE=',
            'WJwgqCmf',
            'BkWI8feqSlDZKMq6awfzWlUypl88nz65KVRmpH0RWIc=',
            'v7EIpiQQjd2BGuJzMbBA0qPWDSS+wTJRQ7uGzZ6rJKs=',
            '1SUReYlCRA==',
            'RougjiFHkSKs20DZ6BWXiWwQUGZXtseZIyQWKz5eG34=',
            'LL97cwoDoG5cw8QmhI+KSWzfW+8VehIh+inTxnVJ2ps=',
            '52iDqjzlqe8=',
            'U9LRYFL2zXU4TtALIYDj+lCATRk/EJtH7/y7qYYNlh8=',
            'e/GtffFDTvnw7LBRixAD+iGixjqTq9kIZ1m0Hj+s6fY=',
            'xb2XwHNB',
        ].map(b64 => this.base64Decode(b64));

        const ror = (x, n) => ((x >> n) | (x << (8 - n))) & 0xFF;
        const rol = (x, n) => ((x << n) | (x >> (8 - n))) & 0xFF;
        const B = e => (e - 12 + 256) % 256;
        const C = e => (e + 115) % 256;
        const D = e => rol(e, 4);
        const F = e => (e - 188 + 256) % 256;
        const G = e => rol(e, 2);
        const H = e => (e - 42 + 256) % 256;
        const K = e => (e - 241 + 256) % 256;
        const L = e => ror(e, 1);
        const M = e => (e ^ 177) & 0xFF;
        const S = e => (e + 143) % 256;
        const U = e => (e - 20 + 256) % 256;
        const Y = e => ror(e, 1);

        this.ROUNDS = [
            { map: [C,B,Y,D,H,S,H,K,L,C], pref: 7 },
            { map: [C,B,D,H,S,K,D,U,C,S], pref: 6 },
            { map: [C,F,S,G,Y,M,D,K,S,B], pref: 7 },
            { map: [B,M,L,S,U,S,U,L,Y,M], pref: 8 },
            { map: [U,S,C,M,B,M,F,S,D,G], pref: 6 },
        ];
    }

    base64Decode(b64) {
        const chars = this.BASE64_CHARS;
        const lookup = new Uint8Array(128);
        for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
        b64 = b64.replace(/=+$/, '');
        const len = b64.length;
        const bytes = new Uint8Array((len * 3 / 4) | 0);
        let i = 0, j = 0;
        while (i < len) {
            const a = lookup[b64.charCodeAt(i++)];
            const b = lookup[b64.charCodeAt(i++)];
            const c = i < len ? lookup[b64.charCodeAt(i++)] : 0;
            const d = i < len ? lookup[b64.charCodeAt(i++)] : 0;
            bytes[j++] = (a << 2) | (b >> 4);
            if (j < bytes.length) bytes[j++] = ((b & 0xF) << 4) | (c >> 2);
            if (j < bytes.length) bytes[j++] = ((c & 0x3) << 6) | d;
        }
        return bytes;
    }

    base64Encode(bytes) {
        const chars = this.BASE64_CHARS;
        let out = '', i = 0;
        while (i < bytes.length) {
            const a = bytes[i++];
            const b = i < bytes.length ? bytes[i++] : 0;
            const c = i < bytes.length ? bytes[i++] : 0;
            out += chars[a >> 2];
            out += chars[((a & 3) << 4) | (b >> 4)];
            out += chars[((b & 15) << 2) | (c >> 6)];
            out += chars[c & 63];
        }
        const pad = bytes.length % 3;
        return (pad ? out.slice(0, pad - 3) : out) + '==='.slice(pad || 3);
    }

    encodeUTF8(str) {
        const out = [];
        for (let i = 0; i < str.length; i++) {
            let cp = str.charCodeAt(i);
            if (cp < 0x80) {
                out.push(cp);
            } else if (cp < 0x800) {
                out.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F));
            } else {
                out.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
            }
        }
        return new Uint8Array(out);
    }

    rc4(key, data) {
        const s = new Uint8Array(256);
        for (let i = 0; i < 256; i++) s[i] = i;
        for (let i = 0, j = 0; i < 256; i++) {
            j = (j + s[i] + key[i % key.length]) % 256;
            const t = s[i]; s[i] = s[j]; s[j] = t;
        }
        const out = new Uint8Array(data.length);
        for (let k = 0, i = 0, j = 0; k < data.length; k++) {
            i = (i + 1) % 256;
            j = (j + s[i]) % 256;
            const t = s[i]; s[i] = s[j]; s[j] = t;
            out[k] = data[k] ^ s[(s[i] + s[j]) % 256];
        }
        return out;
    }

    round(data, ki) {
        const k = this.KEYS[ki], mk = this.KEYS[ki + 1], pk = this.KEYS[ki + 2];
        const cfg = this.ROUNDS[(ki / 3) | 0];
        const enc = this.rc4(k, data);
        const out = [];
        for (let i = 0; i < enc.length; i++) {
            if (i < cfg.pref && i < pk.length) out.push(pk[i]);
            const mkv = mk.length && (i % 32) < mk.length ? mk[i % mk.length] : 0;
            let v = (enc[i] ^ mkv) & 0xFF;
            if (cfg.map[i % 10]) v = cfg.map[i % 10](v);
            out.push(v);
        }
        return new Uint8Array(out);
    }

    generate(path) {
        let bytes = this.encodeUTF8(decodeURIComponent(path + ':0:1'));
        bytes = this.round(bytes, 0);
        bytes = this.round(bytes, 3);
        bytes = this.round(bytes, 6);
        bytes = this.round(bytes, 9);
        bytes = this.round(bytes, 12);
        return this.base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
}

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.prefs = new SharedPreferences();
        this.limit = 100;
        this.keyGenerator = new KeyGenerator();
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
        var resp = await this.client.get(`${this.source.apiUrl}/v2/top${query}`, {})
        return JSON.parse(resp.body);
    }

    comicData(comic) {
        console.log(comic);
        return {
            name: comic.title,
            imageUrl: comic.poster.large,
            link: `${this.source.baseUrl}/title/${comic.hash_id}`,
            description: comic.synopsis,
            status: StatusMap[comic.status] ?? 5,
            genre: comic?.genre?.map((g)=>g?.title)?.filter((g)=>g != null),
            author: comic?.author?.map((a)=>a?.title)?.filter((a)=>a != null).join(" & "),
            artist: comic?.artist?.map((a)=>a?.title)?.filter((a)=>a != null).join(" & "),
        };
    }

    async getPopular(page) {
        const res = await this.getAPI("trending", 1, []);
        return {
            list: res.result.items.map(c => this.comicData(c)),
            hasNextPage: false
        };
    }

    get supportsLatest() {
        return true;
    }

    getHeaders(url) {
        return {}
    }
    async getLatestUpdates(page) {
        var res = await this.client.get(`${this.source.apiUrl}/v2/manga?scope=hot&limit=${this.limit}&order[chapter_updated_at]=desc&page=${page}`)
        var res = JSON.parse(res.body);
        return {
            list: res.result.items.map(c => this.comicData(c)),
            hasNextPage: page != res.result.pagination.last_page
        }
    }
    async search(query, page, filters) {
        // https://comix.to/api/v2/manga?order[relevance]=desc&keyword=shangri&statuses[]=releasing&statuses[]=finished&statuses[]=on_hiatus&statuses[]=discontinued&statuses[]=not_yet_released&genres[]=6&genres[]=87264&genres[]=7&genres[]=8&genres[]=9&genres[]=10&genres[]=11&genres[]=87265&genres[]=12&genres[]=13&genres[]=87266&genres[]=14&genres[]=15&genres[]=16&genres[]=17&genres[]=87267&genres[]=18&genres[]=19&genres[]=20&genres[]=21&genres[]=22&genres[]=23&genres[]=24&genres[]=25&genres[]=87268&genres[]=26&genres[]=27&genres[]=28&genres[]=29&genres[]=30&genres[]=31&genres[]=32&genres[]=33&genres[]=34&genres[]=35&genres[]=36&genres[]=37&genres[]=38&genres[]=39&genres[]=40&genres[]=41&genres[]=42&genres[]=43&genres[]=44&genres[]=45&genres[]=46&genres[]=47&genres[]=48&genres[]=49&genres[]=50&genres[]=51&genres[]=52&genres[]=53&genres[]=54&genres[]=55&genres[]=56&genres[]=57&genres[]=58&genres[]=59&genres[]=60&genres[]=61&genres[]=62&genres[]=63&genres[]=64&genres[]=65&genres[]=66&genres[]=67&genres[]=93164&genres[]=93167&genres[]=93165&genres[]=93166&genres[]=93168&genres[]=93172&genres[]=93170&genres[]=93169&genres[]=93171&genres_mode=or&demographics[]=3&demographics[]=4&demographics[]=1&demographics[]=2&authors[]=81339&artists[]=81340&release_year[from]=2026&release_year[to]=1990&limit=28
        var res = await this.client.get(`${this.source.apiUrl}/v2/manga?keyword=${query}&limit=${this.limit}&page=${page}&order[relevance]=desc`) // just use order[relevance]=desc for now
        var res = JSON.parse(res.body);
        return {
            list: res.result.items.map(c => this.comicData(c)),
            hasNextPage: page != res.result.pagination.last_page
        }
    }
    async getChapters(url, comic) {
        const id = url.split("/").pop();

        const key = this.keyGenerator.generate(`/manga/${id}/chapters`);
        const firstResp = await this.client.get(`${this.source.apiUrl}/v2/manga/${id}/chapters?limit=${this.limit}&order[number]=desc&time=1&_=${key}`);
        const firstJson = JSON.parse(firstResp.body);
        const last_page = firstJson.result.pagination.last_page;
        const pageRequests = [firstResp];
        for (let page = 2; page <= last_page; page++) {
            pageRequests.push(this.client.get(`${this.source.apiUrl}/v2/manga/${id}/chapters?limit=${this.limit}&order[number]=desc&page=${page}&time=1&_=${key}`));
        }

        const chapters = [];

        const results = await Promise.all(pageRequests);
        for (const r of results) {
            const j = JSON.parse(r.body);
            for (const c of j.result.items) {
                chapters.push({
                    name: c.name && c.name.length ? c.name : `Chapter ${c.number}`,
                    url: `${url}/${c.chapter_id}`,
                    dateUpload: String(new Date(c.updated_at * 1000).getTime()),
                    scanlator: c.scanlation_group?.name ?? "Unknown"
                })
            }
        }

        return chapters;
    }
    async getDetail(link) {
        var [id] = link.split("/").slice(-1);
        var comic = await this.client.get(`${this.source.apiUrl}/v2/manga/${id}?includes[]=author&includes[]=artist&includes[]=genre&includes[]=theme&includes[]=demographic`);
        comic = JSON.parse(comic.body);
        comic = comic["result"];
        return {
            link,
            chapters: await this.getChapters(link, comic),
            ...this.comicData(comic)
        };
    }
    decodeFlight(entry) {
        if (!Array.isArray(entry)) return null;
        const payload = entry[1];
        if (typeof payload !== "string" || !payload.startsWith("d:")) return null;
        return JSON.parse(payload.slice(2));
    }
    async getChapterImages(url) {
        var res = await this.client.get(url);
        var doc = new Document(res.body);

        const scripts = doc.select("script");
        const flightEntries = [];

        for (const s of scripts) {
            const txt = s.text;
            if (!txt || !txt.includes("__next_f.push")) continue;

            const matches = txt.match(/__next_f\.push\((\[[\s\S]*?\])\)/g);
            if (!matches) continue;

            for (const m of matches) {
                const arr = eval(m.replace("__next_f.push", ""));
                flightEntries.push(arr);
            }
        }

        var chapters = [];
        for (const entry of flightEntries) {
            const decoded = this.decodeFlight(entry);
            if (!decoded) continue;

            const data = decoded[3];
            if (!data?.chapter) continue;

            const c = data.chapter;
            chapters.push({
                number: c.number,
                link: c._link,
                createdAt: c.created_at,
                images: c.images,
            })
        }
        return chapters;
    }
    async getPageList(url) {
        var id = url.split("/").slice(1)[0].split("-")[0];

        for (const chapter of await this.getChapterImages(url)) {
            if (chapter.link.includes(id)) {
                return chapter.images.map((i) => i.url)
            }
        }
        return []
    }
    getFilterList() {
        return []
    }
    getSourcePreferences() {
        return []
    }
}
