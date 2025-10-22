const mangayomiSources = [{
    "name": "Bato.to",
    "lang": "all",
    "baseUrl": "https://bato.si",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/tympanicblock61/mangayomi-extensions/refs/heads/main/javascript/icon/all.bato.png",
    "typeSource": "single",
    "isManga": true,
    "isNsfw": true,
    "itemType": 0,
    "version": "0.0.3",
    "pkgPath": "manga/src/all/bato.js",
    "notes": ""
}];

const queries = {
  "get_content_searchComic":"query get_content_searchComic($select: SearchComic_Select) {get_content_searchComic(select: $select) {items {id data {name slug summary {text} urlPath urlCover600 genres artists authors uploadStatus }}}}",
  "get_content_comicNode": "query get_content_comicNode($id: ID!) {get_content_comicNode(id: $id) {id data {name slug summary {text} urlPath urlCover600 genres artists authors uploadStatus}}}",
  "get_content_chapterList": "query get_content_chapterList($comicId: ID!) {get_content_chapterList(comicId: $comicId) {data {datePublic dname urlPath userNode {data {name}}}}}",
  "get_content_chapterNode": "query get_content_chapterNode($id: ID!) {get_content_chapterNode(id: $id) {data {imageFiles}}}"
}

class DefaultExtension extends MProvider {
    constructor() {
       super();
       this.client = new Client();
       this.prefs = new SharedPreferences();
       this.defaultUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
       this.graphql_endpoint = "apo"; // or ap2, which is v4 and uses different queries
    }
    
    getHeaders(url) {
      let useragent = this.prefs.get("useragent");
      if (useragent.length == 0) {
        useragent = this.defaultUserAgent;
      }
      return {
        'referer': url,
        'user-agent': useragent,
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate',
        'connection': 'keep-alive'
      };
    }
    
    async graphql(query_name, variables) {
      const link = `${this.baseUrl}/${this.graphql_endpoint}`;
      let headers = this.getHeaders(this.baseUrl);
      headers["content-type"] = "application/json";
      
      const body = {
        query: queries[query_name],
        variables: variables || {},
        operationName: null
      };
      
      const res = await this.client.post(link, headers, body);
      const js = JSON.parse(res.body || "{}");
      console.log(JSON.stringify(js))
      if (js.data && js.data[query_name]) return js.data[query_name];
      return js;
    }
    statusCode(status) {
      return (
        {
          "ongoing": 0,
          "completed": 1,
          "hiatus": 2,
          "cancelled": 3,
          //"not yet published": 4,
        }[status] ?? 5
      );
    }    
    get supportsLatest() {
        return true;
    }
    async getPopular(page) {
        let res = await this.graphql("get_content_searchComic", {
         "select": {
             "where": "popular",
            "page": page,
            "size": 10,
            "word": null,
            "excGenres": [],
            "incGenres": []
        }
      });
      let list = [];
      for (const comic of res["items"]) {
        list.push({ 
          name: comic["data"]["name"], 
          imageUrl: comic["data"]["urlCover600"], 
          link: this.baseUrl+comic["data"]["urlPath"], 
          genre: comic["data"]["genres"],
          author: comic["data"]["authors"].join(" & "),
          artist: comic["data"]["artists"].join(" & "),
          description: comic["data"]["summary"]["text"],
          status: this.statusCode(comic["data"]["uploadStatus"])
        });
      }
      
      return {"list": list, hasNextPage: true};
    }  
    async search(query, page, filters) {
      let res = await this.graphql("get_content_searchComic", {
         "select": {
             "where": "browse",
            "page": page,
            "size": 10,
            "word": query,
            "excGenres": [], // add this later
            "incGenres": [] // add this later
        }
      });

      let list = [];
      for (const comic of res["items"]) {
        list.push({ 
          name: comic["data"]["name"], 
          imageUrl: comic["data"]["urlCover600"], 
          link: this.baseUrl+comic["data"]["urlPath"], 
          genre: comic["data"]["genres"],
          author: comic["data"]["authors"].join(" & "),
          artist: comic["data"]["artists"].join(" & "),
          description: comic["data"]["summary"]["text"],
          status: this.statusCode(comic["data"]["uploadStatus"])
        });
      }
      
      return {"list": list, hasNextPage: true};
    }
    async getLatestUpdates(page) {
       let res = await this.graphql("get_content_searchComic", {
         "select": {
             "where": "latest",
            "page": page,
            "size": 10,
            "word": null,
            "excGenres": [],
            "incGenres": []
        }
      });
      let list = [];
      for (const comic of res["items"]) {
        list.push({ 
          name: comic["data"]["name"], 
          imageUrl: comic["data"]["urlCover600"], 
          link: this.baseUrl+comic["data"]["urlPath"], 
          genre: comic["data"]["genres"],
          author: comic["data"]["authors"].join(" & "),
          artist: comic["data"]["artists"].join(" & "),
          description: comic["data"]["summary"]["text"],
          status: this.statusCode(comic["data"]["uploadStatus"])
        });
      }
      
      return {"list": list, hasNextPage: true};
    }
    get baseUrl() {
      let baseUrl = this.prefs.get("baseurl");
      if (baseUrl.length == 0) baseUrl = this.source.baseUrl;
      if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);
      return baseUrl;
    }
    async getDetail(link) {
        const match = link.match(/\/title\/(\d+)-/);
        const id = match ? match[1] : null;
        let comic = await this.graphql("get_content_comicNode", {
          "id": id
        });
        let chaps = await this.graphql("get_content_chapterList", {
          "comicId": id,
        });
        let chapters = [];

        for (const chapter of chaps) {
          chapters.push({
            name: chapter["data"]["dname"],
            url: this.baseUrl+chapter["data"]["urlPath"],
            dateUpload: String(new Date(chapter["data"]["datePublic"]).getTime()),
            scanlator: chapter["data"]["userNode"]["data"]["name"],
          })
        }
        return {
          name: comic["data"]["name"],
          link,
          imageUrl: comic["data"]["urlCover600"],
          author:comic["data"]["authors"].join(" & "),
          artist: comic["data"]["artists"].join(" & "),
          genre: comic["data"]["genres"],
          status: this.statusCode(comic["data"]["uploadStatus"]),
          description: comic["data"]["summary"]["text"],
          chapters
        }
    }
    async getPageList(link) {
      const match = link.match(/\/title\/(\d+)-[^/]+\/(\d+)-/);
      const comicId = match ? match[1] : null;
      const chapterId = match ? match[2] : null;
      let res = await this.graphql("get_content_chapterNode", {
        id: chapterId
      })
      return res["data"]["imageFiles"];
    }
    getFilterList() {
        return [
          {
            type_name: "GroupFilter",
            type: "GenreFilter",
            name: "Genres",
            state: [
              ["Artbook", "artbook"],
              ["Cartoon", "cartoon"],
              ["Comic", "comic"],
              ["Doujinshi", "doujinshi"],
              ["Imageset", "imageset"],
              [
                  "Manga",
                  "manga"
              ],
              [
                  "Manhua",
                  "manhua"
              ],
              [
                  "Manhwa",
                  "manhwa"
              ],
              [
                  "Webtoon",
                  "webtoon"
              ],
              [
                  "Western",
                  "western"
              ],
              [
                  "Josei",
                  "josei"
              ],
              [
                  "Seinen",
                  "seinen"
              ],
              [
                  "Shoujo",
                  "shoujo"
              ],
              [
                  "Shoujo ai",
                  "shoujo_ai"
              ],
              [
                  "Shounen",
                  "shounen"
              ],
              [
                  "Shounen ai",
                  "shounen_ai"
              ],
              [
                  "Yaoi",
                  "yaoi"
              ],
              [
                  "Yuri",
                  "yuri"
              ],
              [
                  "Gore",
                  "gore"
              ],
              [
                  "Bloody",
                  "bloody"
              ],
              [
                  "Violence",
                  "violence"
              ],
              [
                  "Ecchi",
                  "ecchi"
              ],
              [
                  "Adult",
                  "adult"
              ],
              [
                  "Mature",
                  "mature"
              ],
              [
                  "Smut",
                  "smut"
              ],
              [
                  "Hentai",
                  "hentai"
              ],
              [
                  "4-Koma",
                  "_4_koma"
              ],
              [
                  "Action",
                  "action"
              ],
              [
                  "Adaptation",
                  "adaptation"
              ],
              [
                  "Adventure",
                  "adventure"
              ],
              [
                  "Aliens",
                  "aliens"
              ],
              [
                  "Animals",
                  "animals"
              ],
              [
                  "Anthology",
                  "anthology"
              ],
              [
                  "cars",
                  "cars"
              ],
              [
                  "Comedy",
                  "comedy"
              ],
              [
                  "Cooking",
                  "cooking"
              ],
              [
                  "crime",
                  "crime"
              ],
              [
                  "Crossdressing",
                  "crossdressing"
              ],
              [
                  "Cultivation",
                  "cultivation"
              ],
              [
                  "Delinquents",
                  "delinquents"
              ],
              [
                  "Dementia",
                  "dementia"
              ],
              [
                  "Demons",
                  "demons"
              ],
              [
                  "Drama",
                  "drama"
              ],
              [
                  "Fantasy",
                  "fantasy"
              ],
              [
                  "Fan-Colored",
                  "fan_colored"
              ],
              [
                  "Full Color",
                  "full_color"
              ],
              [
                  "Game",
                  "game"
              ],
              [
                  "Gender Bender",
                  "gender_bender"
              ],
              [
                  "Genderswap",
                  "genderswap"
              ],
              [
                  "Ghosts",
                  "ghosts"
              ],
              [
                  "Gyaru",
                  "gyaru"
              ],
              [
                  "Harem",
                  "harem"
              ],
              [
                  "Harlequin",
                  "harlequin"
              ],
              [
                  "Historical",
                  "historical"
              ],
              [
                  "Horror",
                  "horror"
              ],
              [
                  "Incest",
                  "incest"
              ],
              [
                  "Isekai",
                  "isekai"
              ],
              [
                  "Kids",
                  "kids"
              ],
              [
                  "Loli",
                  "loli"
              ],
              [
                  "Magic",
                  "magic"
              ],
              [
                  "Magical Girls",
                  "magical_girls"
              ],
              [
                  "Martial Arts",
                  "martial_arts"
              ],
              [
                  "Mecha",
                  "mecha"
              ],
              [
                  "Medical",
                  "medical"
              ],
              [
                  "Military",
                  "military"
              ],
              [
                  "Monster Girls",
                  "monster_girls"
              ],
              [
                  "Monsters",
                  "monsters"
              ],
              [
                  "Music",
                  "music"
              ],
              [
                  "Mystery",
                  "mystery"
              ],
              [
                  "Netorare/NTR",
                  "netorare"
              ],
              [
                  "Ninja",
                  "ninja"
              ],
              [
                  "Office Workers",
                  "office_workers"
              ],
              [
                  "Oneshot",
                  "oneshot"
              ],
              [
                  "parody",
                  "parody"
              ],
              [
                  "Philosophical",
                  "philosophical"
              ],
              [
                  "Police",
                  "police"
              ],
              [
                  "Post-Apocalyptic",
                  "post_apocalyptic"
              ],
              [
                  "Psychological",
                  "psychological"
              ],
              [
                  "Reincarnation",
                  "reincarnation"
              ],
              [
                  "Reverse Harem",
                  "reverse_harem"
              ],
              [
                  "Romance",
                  "romance"
              ],
              [
                  "Samurai",
                  "samurai"
              ],
              [
                  "School Life",
                  "school_life"
              ],
              [
                  "Sci-Fi",
                  "sci_fi"
              ],
              [
                  "Shota",
                  "shota"
              ],
              [
                  "Slice of Life",
                  "slice_of_life"
              ],
              [
                  "SM/BDSM",
                  "sm_bdsm"
              ],
              [
                  "Space",
                  "space"
              ],
              [
                  "Sports",
                  "sports"
              ],
              [
                  "Super Power",
                  "super_power"
              ],
              [
                  "Superhero",
                  "superhero"
              ],
              [
                  "Supernatural",
                  "supernatural"
              ],
              [
                  "Survival",
                  "survival"
              ],
              [
                  "Thriller",
                  "thriller"
              ],
              [
                  "Time Travel",
                  "time_travel"
              ],
              [
                  "Traditional Games",
                  "traditional_games"
              ],
              [
                  "Tragedy",
                  "tragedy"
              ],
              [
                  "Vampires",
                  "vampires"
              ],
              [
                  "Video Games",
                  "video_games"
              ],
              [
                  "Villainess",
                  "villainess"
              ],
              [
                  "Virtual Reality",
                  "virtual_reality"
              ],
              [
                  "Wuxia",
                  "wuxia"
              ],
              [
                  "Xianxia",
                  "xianxia"
              ],
              [
                  "Xuanhuan",
                  "xuanhuan"
              ],
              [
                  "Zombies",
                  "zombies"
              ]
            ].map(x => ({ type_name: 'TriState', name: x[0], value: x[1] }))
          },
          {
            type_name: "SelectFilter",
            type: "GenreFilterType",
            name: "white/black list toggle",
            state: 0,
            values: [
              ["Blacklist", "b"],
              ["Whitelist", "w"]
            ].map(x => ({ type_name: 'SelectOption', name: x[0], value: x[1] }))
          }
        ]
    }
    getSourcePreferences() {
        return [
          {
            "key": "baseurl",
            "editTextPreference": {
              "title": "Set Custom BaseUrl",
              "summary": "Custom BaseUrl",
              "value": this.source.baseUrl,
              "dialogTitle": "Custom BaseUrl",
              "dialogMessage": "set the baseurl to use this can be bato.to or a mirror",
            }
          },
          {
              "key": "useragent",
              "editTextPreference": {
                  "title": "Set Custom User-Agent",
                  "summary": "Custom User-Agent",
                  "value": this.defaultUserAgent,
                  "dialogTitle": "Custom User-Agent",
                  "dialogMessage": "set this to whatever valid useragent you want (some might get blocked)",
              }
          },
        ]
    }
}
