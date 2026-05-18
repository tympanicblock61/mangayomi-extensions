const mangayomiSources = [{
    "name": "mangadot",
    "lang": "en",
    "baseUrl": "https://mangadot.net",
    "apiUrl": "https://mangadot.net/api",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://mangadot.net",
    "typeSource": "single",
    "itemType": 0,
    "isManga": true,
    "isNsfw": true,
    "version": "0.0.1",
    "pkgPath": "manga/src/en/mangadot.js",
    "notes": ""
}];

function fixMojibake(str) {
  let out = "";
  for (let i = 0; i < str.length; i++) {
    out += String.fromCharCode(str.charCodeAt(i) & 0xFF);
  }
  return decodeURIComponent(escape(out));
}

class ProxyClient {
    constructor(prefs) {
        this.client = new Client({"useDartHttpClient": false, "verifyCertificates": false});
        this.prefs = prefs;
    }

    async head(url, headers) {
        if (this.prefs.get("proxy-use")) {
            return this.client.post(this.prefs.get("proxy-url"), {
                    "x-api-key": this.prefs.get("proxy-key"),
                    "x-impersonate": this.prefs.get("proxy-impersonate")
                }, {
                    "url": url,
                    "method": "HEAD",
                    "headers": headers
                })
        } else {
                return this.client.head(url, headers);
        }
    }

    async get(url, headers) {
        if (this.prefs.get("proxy-use")) {
            return this.client.post(this.prefs.get("proxy-url"), {
                    "x-api-key": this.prefs.get("proxy-key"),
                    "x-impersonate": this.prefs.get("proxy-impersonate")
                }, JSON.stringify({
                    "url": url,
                    "method": "GET",
                    "headers": headers
                }))
        } else {
                return this.client.get(url, headers);
        }
    }

    async post(url, headers, body) {
        if (this.prefs.get("proxy-use")) {
            return this.client.post(this.prefs.get("proxy-url"), {
                    "x-api-key": this.prefs.get("proxy-key"),
                    "x-impersonate": this.prefs.get("proxy-impersonate")
                }, {
                    "url": url,
                    "method": "POST",
                    "headers": headers,
                    "body": JSON.stringify(body),
                })
        } else {
                return this.client.post(url, headers, body);
        }
    }

    async put(url, headers, body) {
        if (this.prefs.get("proxy-use")) {
            return this.client.post(this.prefs.get("proxy-url"), {
                    "x-api-key": this.prefs.get("proxy-key"),
                    "x-impersonate": this.prefs.get("proxy-impersonate")
                }, {
                    "url": url,
                    "method": "PUT",
                    "headers": headers,
                    "body": SON.stringify(body),
                })
        } else {
                return this.client.put(url, headers, body);
        }
    }

    async delete(url, headers, body) {
        if (this.prefs.get("proxy-use")) {
            return this.client.post(this.prefs.get("proxy-url"), {
                    "x-api-key": this.prefs.get("proxy-key"),
                    "x-impersonate": this.prefs.get("proxy-impersonate")
                }, {
                    "url": url,
                    "method": "DELETE",
                    "headers": headers,
                    "body": SON.stringify(body),
                })
        } else {
                return this.client.patch(url, headers, body);
        }
    }


    async patch(url, headers, body) {
        if (this.prefs.get("proxy-use")) {
            return this.client.post(this.prefs.get("proxy-url"), {
                    "x-api-key": this.prefs.get("proxy-key"),
                    "x-impersonate": this.prefs.get("proxy-impersonate")
                }, {
                    "url": url,
                    "method": "PATCH",
                    "headers": headers,
                    "body": SON.stringify(body),
                })
        } else {
                return this.client.patch(url, headers, body);
        }
    }
}

function hydrate(rootIndex, table) {
  const seen = new Map();
  function resolve(value) {
    if (value === -5) return null;
    if (typeof value === "number" && typeof table[value] == "string") {
        const s = table[value].trim();
        if (s[0] === "[" && s[s.length - 1] === "]") {
            return JSON.parse(s);
        }
    }
    if (typeof value === "number" && table[value] !== undefined) {
      return walk(table[value]);
    }
    return walk(value);
  }
  function walk(node) {
    if (node == null) return node;
    if (seen.has(node)) {
      return seen.get(node);
    }
    if (Array.isArray(node)) {
      const arr = node.map(resolve);
      return arr;
    }
    if (typeof node === "object") {
      const out = {};
      seen.set(node, out);
      for (const [k, v] of Object.entries(node)) {
        if (k.startsWith("_")) {
          const realKey = table[Number(k.slice(1))];
          out[realKey] = resolve(v);
        } else {
          out[k] = resolve(v);
        }
      }
      return out;
    }
    return node;
  }
  return resolve(rootIndex);
}

const StatusMap = {
    "Ongoing": 0,
    "Completed": 1,
    "on_hiatus": 2,
    "unknown": 5
}

class DefaultExtension extends MProvider {
    constructor() {
      super();
      this.prefs = new SharedPreferences();
      this.client = new ProxyClient(this.prefs);
      this.total = 100;
    }
    getHeaders(url) {
        throw new Error("getHeaders not implemented");
    }
    async getPopular(page) {
        let first = await this.client.get(`${this.source.baseUrl}/view-all/most-tracked.data?adult=1&_routes=pages/ViewAllPage`)
        // need to request first page every time because its the only one with the max pages number
        let first_hydro = hydrate(7, JSON.parse(first.body));
        // 7 is {manga_list, pagination}

        let manga = first_hydro.manga_list;
        if (page > 1) {
            let res = await this.client.get(`${this.source.baseUrl}/view-all/most-tracked.data?adult=1&page=${page}&_routes=pages/ViewAllPage`);
            let hydro = hydrate(7, JSON.parse(res.body))
            // 7 is {manga_list, pagination}
            manga = hydro.manga_list;
        }

        return {
            list: manga.map(c => this.mangaData(c)),
            hasNextPage: page != first_hydro.pagination.total_pages
        }
    }
    get supportsLatest() {
        return true;
    }

    mangaData(manga) {
        return {
            name: fixMojibake(manga.title),
            imageUrl: this.source.baseUrl+manga.photo,
            link: `${this.source.baseUrl}/manga/${manga.id}`,
            description: fixMojibake(manga.description),
            status: manga.hiatus != "No" ? StatusMap["on_hiatus"] : StatusMap[manga.status],
            genre: manga.genres,
            author: manga.authors?.join(" & ") ?? "Unknown",
            artist: manga.artists?.join(" & ") ?? "Unknown"
        }
    }

    async getLatestUpdates(page) {
        let first = await this.client.get(`${this.source.baseUrl}/view-all/latest-updates.data?adult=1&_routes=pages/ViewAllPage`);
        // need to request first page every time because its the only one with the max pages number
        let first_hydro = hydrate(7, JSON.parse(first.body));
        // 7 is {manga_list, pagination}
        let manga = first_hydro.manga_list;
        if (page > 1) {
            let res = await this.client.get(`${this.source.baseUrl}view-all/latest-updates.data?adult=1&page=${page}&_routes=pages/ViewAllPage`);
            let hydro = hydrate(7, JSON.parse(res.body))
            // 7 is {manga_list, pagination}
            manga = hydro.manga_list;
        }

        return {
            list: manga.map(c => this.mangaData(c)),
            hasNextPage: page != first_hydro.pagination.total_pages
        }
    }

    async search(query, page, filters) {
        let res = await this.client.get(`${this.source.baseUrl}/search.data?search=h&adult=1&page=${page}&perPage=${this.total}&_routes=pages%2FSearchPage`);
        let hydrated = hydrate(4, JSON.parse(res.body))
        // 4 is {allGenres,displayMode,filters,page,pagination,query,results}

        return {
            list: hydrated.results.map(c => this.mangaData(c)),
            hasNextPage: page != hydrated.pagination.total_pages
        }
    }
    async getChapters(id) {
        let res = await this.client.get(`${this.source.apiUrl}/manga/${id}/chapters/list`);
        let data = JSON.parse(res.body);

        let chapters = []
        for (const c of data) {
            console.log(c);
            chapters.push({
                name: c.chapter_title && c.chapter_title.length ? c.chapter_title : `${c.volume_number ? "Volume "+c.volume_number+" " : ""}Chapter ${c.chapter_number}`,
                url: `${this.source.baseUrl}/chapter/${c.id}${c.group_name && c.group_name.length ? "?source=user" : ""}`,
                dateUpload: String(new Date(c.date_added.replace(/([+-]\d{2})$/,"$1:00").replace(" ", "T")).getTime()),
                scanlator: c.group_name && c.group_name.length ? c.group_name : "Official"
            })
        }
        return chapters;
    }

    async getDetail(link) {
        let id = link.split("/")[4];
        let res = await this.client.get(`${this.source.baseUrl}/manga/${id}.data?_routes=pages/MangaDetailPage`)
        
        return {
            link,
            ...this.mangaData(hydrate(8, JSON.parse(res.body))),
            chapters: await this.getChapters(id)
        };
    }
    async getPageList(url) {
        let res;
        if (url.includes("?source=user")) {
          let id = url.split("?")[0].split("/")[4];
          res = await this.client.get(`${this.source.apiUrl}/uploads/${id}/images`);   
        } else {
          let id = url.split("/")[4];
          res = await this.client.get(`${this.source.apiUrl}/chapters/${id}/images`);        
        }
        let data = JSON.parse(res.body);
        console.log(data);
        let images = [];
        for (const image of data.images) {
          console.log(res.headers);
          images.push({
            url: `${this.source.baseUrl}${image.url}`,
            headers: res.headers
            });
        }
        return images;
    }
    getFilterList() {
        return []
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
                    "value": "http://localhost:8080/",
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
