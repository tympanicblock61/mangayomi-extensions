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
    "version": "0.1.4",
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

class KeyGenerator {
    constructor() {
        this.BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

        this.KEYS = [
            'JxTcdyiA5GZxnbrmthXBQfU2IMTKcY1+3nNhbq98Sgo=',
            '3PordjODbhqla382Cxapmo/1JiABJQcjiJj1+48gTJ4=',
            'OaKvnI5ARA==',
            'MHNBHYWA7lvy867fXgvGcJwWDk79KqUJUVFsh3RwnnI=',
            '8i0Cru/VJBSVB2Y1GcMDVpzx2WepOcfnWdd81yxICl4=',
            'Fyskubz8VvA=',
            'B46L1x+UeWP+19cRpQ+OZvdLAK9EHID8g3mSgn57tew=',
            'DTSTmUt6LpDUw9r1lSQqyb3YlFTzruT8tk8wUGkwehQ=',
            'vY/meeI=',
            '7xWfIF5THL5LAnRgAARg+4mjWHPU9n3PQwvzbaMNi+Q=',
            'bewtiTuV+HJk56xxkf2iCljLgruCpBmN9BgE8i6gc9M=',
            '/Xcb2zAu8AU=',
            'WgeCQ3T8R51uTwVSiVa7Zy0dN6JOg6Z5JleMS+HV8Aw=',
            'yXayUVFrrcW56jQCEfZzuCidjpnWKjTDUNT7XeX9i7k=',
            'tSLco2w=',
        ].map(b64 => this.base64Decode(b64));

        const SR7L1 = e => ((e >> 7) | (e << 1)) & 0xFF;
        const SL1R7 = e => ((e << 1) | (e >> 7)) & 0xFF;
        const SR2L6 = e => ((e >> 2) | (e << 6)) & 0xFF;
        const SL4R4 = e => ((e << 4) | (e >> 4)) & 0xFF;
        const SR4L4 = e => ((e >> 4) | (e << 4)) & 0xFF;
        const X37   = e => (e ^ 37)  & 0xFF;
        const X81   = e => (e ^ 81)  & 0xFF;
        const X147  = e => (e ^ 147) & 0xFF;
        const X180  = e => (e ^ 180) & 0xFF;
        const X218  = e => (e ^ 218) & 0xFF;
        const P34   = e => (e + 34)  & 0xFF;
        const P159  = e => (e + 159) & 0xFF;

        this.ROUNDS = [
            { map: [SR7L1, X37,   X81,   X147,  SR2L6, SR4L4, X218,  P159,  SR4L4, X180], pref: 7 },
            { map: [X180,  SL1R7, X147,  SR7L1, SR2L6, SR4L4, P159,  P34,   P159,  X180], pref: 8 },
            { map: [X81,   SR4L4, SL4R4, X37,   P159,  SL1R7, X180,  P34,   SR2L6, SL4R4], pref: 5 },
            { map: [X218,  SL1R7, SR7L1, P159,  SL1R7, X180,  X147,  X218,  X180,  X37],  pref: 8 },
            { map: [SL4R4, X147,  P34,   X147,  X218,  SL1R7, X180,  SL1R7, SR2L6, X218], pref: 5 },
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

    getMutKey(mk, idx) {
        if (mk.length === 0) return 0;
        if ((idx % 32) < mk.length) return mk[idx % mk.length];
        return 0;
    }

    mutate(data, mk, pk, cfg) {
        const out = [];
        for (let i = 0; i < data.length; i++) {
            if (i < cfg.pref && i < pk.length) out.push(pk[i]);
            let v = (data[i] ^ this.getMutKey(mk, i)) & 0xFF;
            v = cfg.map[i % 10](v);
            out.push(v);
        }
        return new Uint8Array(out);
    }

    round(data, ki) {
        const k   = this.KEYS[ki];
        const mk  = this.KEYS[ki + 1];
        const pk  = this.KEYS[ki + 2];
        const cfg = this.ROUNDS[(ki / 3) | 0];
        return this.rc4(k, this.mutate(data, mk, pk, cfg));
    }

    encodeURLElement(path) {
        const str = encodeURIComponent(path);
        const bytes = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
        return bytes;
    }

    generate(path) {
        let bytes = this.encodeURLElement(path);
        bytes = this.round(bytes, 0);
        bytes = this.round(bytes, 3);
        bytes = this.round(bytes, 6);
        bytes = this.round(bytes, 9);
        bytes = this.round(bytes, 12);
        return this.base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
}

function parseRelativeDate(str) {
    const now = Date.now();

    const match = str.match(/^(\d+)\s*(s|m|h|d|w|mos|y)$/i);
    if (!match) return null;
    console.log(match);
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000,
        mos: 30 * 24 * 60 * 60 * 1000,
        y: 365 * 24 * 60 * 60 * 1000
    };

    return String(now - (value * multipliers[unit]));
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
        var resp = await this.client.get(`${this.source.apiUrl}/v1/manga/top${query}`, {})
        return JSON.parse(resp.body);
    }

    comicData(comic) {
        console.log(comic);
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

        const key = this.keyGenerator.generate(`/manga/${id}/chapters`);
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
                console.log(parseRelativeDate(c.createdAtFormatted));
                chapters.push({
                    name: c.name && c.name.length ? c.name : `Chapter ${c.number}`,
                    url: `${url}/${c.id}`,
                    dateUpload: parseRelativeDate(c.createdAtFormatted),
                    scanlator: c.isOfficial ? "Official" : c.group?.name ?? "Unknown"
                })
            }
        }

        return chapters;
    }
    async getDetail(link) {
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
       var chapter_id = url.split("/")[5];
       const key = this.keyGenerator.generate(`/chapters/${chapter_id}`)
        const req = await this.client.get(`${this.source.apiUrl}/v1/chapters/${chapter_id}?_=${key}`);
        const js = JSON.parse(req.body);
        var images = [];
        for (const page of js.result.pages) {
          images.push(page.url);
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
