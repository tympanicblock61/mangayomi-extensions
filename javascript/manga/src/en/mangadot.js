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
    "hasCloudflare": true,
    "version": "0.0.7",
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
                body
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

function hydrate(rootIndex, table) {
  const seen = new Map();
  function resolve(value) {
    if (value === -5) return null;
    if (typeof value === "number" && typeof table[value] == "string") {
        const s = table[value].trim();
        if (s[0] === "[" && s[s.length - 1] === "]") {
            try {return JSON.parse(s);} catch {}
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

function buildParams(params) {
  let out = "";

  for (const [key, value] of Object.entries(params)) {
    const k = encodeURIComponent(key);

    if (Array.isArray(value)) {
      for (const v of value) {
        out += (out ? "&" : "") +
          k + "=" + encodeURIComponent(v);
      }
    } else if (value != null) {
      out += (out ? "&" : "") +
        k + "=" + encodeURIComponent(value);
    }
  }

  return out;
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
    mangaData(manga) {
        return {
            name: fixMojibake(manga.title),
            imageUrl: this.prefs.get("proxy-use") ? `${this.prefs.get("proxy-url")}/image?url=${this.source.baseUrl+manga.photo}` : this.source.baseUrl+manga.photo,
            link: `${this.source.baseUrl}/manga/${manga.id}`,
            description: fixMojibake(manga.description),
            status: manga.hiatus != "No" ? StatusMap["on_hiatus"] : StatusMap[manga.status],
            genre: manga.genres,
            author: manga.authors?.join(" & ") ?? "Unknown",
            artist: manga.artists?.join(" & ") ?? "Unknown"
        }
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
    async getLatestUpdates(page) {
        let first = await this.client.get(`${this.source.baseUrl}/view-all/latest-updates.data?adult=1&_routes=pages/ViewAllPage`);
        // need to request first page every time because its the only one with the max pages number
        let first_hydro = hydrate(7, JSON.parse(first.body));
        // 7 is {manga_list, pagination}
        let manga = first_hydro.manga_list;
        if (page > 1) {
            let res = await this.client.get(`${this.source.baseUrl}/view-all/latest-updates.data?adult=1&page=${page}&_routes=pages/ViewAllPage`);
            let hydro = hydrate(7, JSON.parse(res.body))
            // 7 is {manga_list, pagination}
            manga = hydro.manga_list;
        }

        return {
            list: manga.map(c => this.mangaData(c)),
            hasNextPage: page != first_hydro.pagination.total_pages
        }
    }

    async search(query, page=1, filters) {
        let url = `${this.source.baseUrl}/search.data`
        let params = {};
    
        if (query) {
            params["search"] = query;
        }
        
        for (const filter of filters) {
            if (filter.type == "GenreFilter") {
                params["genre"] = [];
                filter.state.forEach(e => {
                    if (e.state === 1) params["genre"].push(e.value);
                    if (e.state === 2) params["genre"].push(`-${e.value}`);
                });
            }
            if (filter.type == "AuthorFilter") {
                params["author"] = filter.state;
            }
            if (filter.type == "ArtistFilter") {
                params["artist"] = filter.state;
            }
            if (filter.type == "OriginFilter") {
                params["orgin"] = filter.state.some(e => e.state && e.value === "all")
                    ? filter.state
                        .filter(e => e.value !== "all")
                        .map(e => e.value)
                    : filter.state
                        .filter(e => e.state && e.value !== "all")
                        .map(e => e.value);
            }
            if (filter.type == "StatusFilter") {
                let val = filter.values[filter.state].value;
                if (val == "Any") continue;
                params["status"] = val;
                }
            if (filter.type == "SortFilter") {
                params["sortBy"] = filter.values[filter.state].value;
            }
        }
        
        params["adult"]=1;
        params["perPage"] = this.total;
        params["_routes"] = "pages/SearchPage"
        
        let res = await this.client.get(`${this.source.baseUrl}/search.data?${buildParams(params)}`);
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
        let images = [];
        for (const image of data.images) {
          images.push({
            url: this.prefs.get("proxy-use") ? `${this.prefs.get("proxy-url")}/image?url=${this.source.baseUrl}${image.url}` : `${this.source.baseUrl}${image.url}`,
            headers: res.headers
            });
        }
        return images;
    }
    // not needed
    // async getGenres() {
    //     let res = await this.client.get(`${this.source.baseUrl}/collections.data?adult=1&_routes=pages%2FCollectionsPage`);
    //     let hydro = hydrate(6, JSON.parse(res.body));
    //     let genres = [];
    //     for (const collection of hydro) {
    //         genres.push(collection.genre);
    //     }
    //     return genres;
    // }
    getFilterList() {
        return [
          {
              type_name: "TextFilter",
              type: "AuthorFilter",
              name: "Author",
          },
          {
              type_name: "TextFilter",
              type: "ArtistFilter",
              name: "Artist",
          },
          {
                type_name: "SelectFilter",
                type: "SortFilter",
                name: "Sort",
                state: 0,
                values: [
                    ["LATEST", "latest"],
                    ["A -> Z", "alphabetical"],
                    ["CHAPTERS", "chapters"],
                    ["MOST VIEWED", "views"],
                    ["MOST TRACKED", "tracked"],
                    ["TOP RATED", "rating"]
                ].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
            },
          {
              type_name: "SelectFilter",
              type: "StatusFilter",
              name: "Status",
              state: 0,
              values: [
                  "Any",
                  "Ongoing",
                  "Completed",
                  "Hiatus"
              ].map(x => ({ type_name: 'SelectOption', name: x, value: x }))
          },
          {
              type_name: "GroupFilter",
              type: "OriginFilter",
              name: "Origin",
              state: [
                  ["All", "all"],
                  ["Manga", "JP"],
                  ["Manhwa", "KR"],
                  ["Manhua", "CN"],
                  ["One Shot", "ONESHOT"]
              ].map(x => ({ type_name: 'CheckBox', name: x[0], value: x[1] }))
          },
          {
                type_name: "GroupFilter",
                type: "GenreFilter",
                name: "Genre",
                state: [
                    "Academy",
                    "Acting",
                    "action",
                    "Action",
                    "Adeventure",
                    "adult",
                    "Adult",
                    "adventure",
                    "Adventure",
                    "Aliens",
                    "and slice-of-life",
                    "Animals",
                    "Anthology",
                    "Avant Garde",
                    "award_winning",
                    "Award winning",
                    "Award Winning",
                    "Based on an Anime",
                    "boys' love",
                    "boys_love",
                    "Boys Love",
                    "Boys' Love",
                    "Bully",
                    "business",
                    "child abuse",
                    "child neglect",
                    "comedy",
                    "Comedy",
                    "Comic",
                    "Cooking",
                    "Crime",
                    "Crossdressing",
                    "Delinquents",
                    "Demons",
                    "difficult childhood",
                    "doujinshi",
                    "Doujinshi",
                    "drama",
                    "Drama",
                    "ecchi",
                    "Ecchi",
                    "erotica",
                    "Erotica",
                    "fantasy",
                    "Fantasy",
                    "female protagonist",
                    "femdom",
                    "Fight",
                    "Fluff",
                    "gender_bender",
                    "Gender bender",
                    "Gender Bender",
                    "Genderswap",
                    "Genius MC",
                    "Ghosts",
                    "girls_love",
                    "Girls love",
                    "Girls Love",
                    "Girls' Love",
                    "gore",
                    "Gourmet",
                    "Gyaru",
                    "harem",
                    "Harem",
                    "hentai",
                    "Hentai",
                    "historical",
                    "Historical",
                    "horror",
                    "Horror",
                    "Hunters",
                    "Idol",
                    "Idols",
                    "Incest",
                    "Isekai",
                    "josei",
                    "Josei",
                    "Loli",
                    "Lolicon",
                    "Mafia",
                    "magic",
                    "Magic",
                    "Magical Girls",
                    "mahou_shoujo",
                    "Mahou Shoujo",
                    "manga",
                    "Manga",
                    "Mangatoon",
                    "manhua",
                    "Manhua",
                    "manhwa",
                    "Manhwa",
                    "martial arts",
                    "martial_arts",
                    "Martial arts",
                    "Martial Arts",
                    "mature",
                    "Mature",
                    "mecha",
                    "Mecha",
                    "Medical",
                    "Medicaldrama",
                    "medieval area",
                    "military",
                    "Military",
                    "Monster Girls",
                    "monsters",
                    "Monsters",
                    "music",
                    "Music",
                    "mystery",
                    "Mystery",
                    "myth",
                    "naruto",
                    "Ninja",
                    "nobility",
                    "office worker",
                    "office workers",
                    "Office Workers",
                    "Official",
                    "One Shot",
                    "Otome",
                    "Philosophical",
                    "Police",
                    "politics",
                    "Post-Apocalyptic",
                    "psychological",
                    "Psychological",
                    "red flag",
                    "reincarnation",
                    "Reincarnation",
                    "Reverse Harem",
                    "romance",
                    "Romance",
                    "royalty",
                    "Samurai",
                    "school_life",
                    "School life",
                    "School_life",
                    "School Life",
                    "sci-fi",
                    "Sci-fi",
                    "Sci-Fi",
                    "seinen",
                    "Seinen",
                    "Shota",
                    "Shotacon",
                    "shoujo",
                    "Shoujo",
                    "shoujo_ai",
                    "Shoujo Ai",
                    "shounen",
                    "Shounen",
                    "shounen_ai",
                    "Shounen Ai",
                    "slice_of_life",
                    "Slice of life",
                    "Slice of Life",
                    "smut",
                    "Smut",
                    "sports",
                    "Sports",
                    "Superhero",
                    "supernatural",
                    "Supernatural",
                    "Survival",
                    "suspense",
                    "Suspense",
                    "system",
                    "System",
                    "thriller",
                    "Thriller",
                    "Time Travel",
                    "Traditional Games",
                    "tragedy",
                    "Tragedy",
                    "Vampires",
                    "Video Games",
                    "Villainess",
                    "Virtual Reality",
                    "War",
                    "webtoon",
                    "Webtoon",
                    "webtoons",
                    "wuxia",
                    "Wuxia",
                    "yaoi",
                    "Yaoi",
                    "yuri",
                    "Yuri",
                    "Zombies"
                ].map(x => ({ type_name: 'TriState', name: x, value: x }))
            }
        ]
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
