const mangayomiSources = [{
    "name": "KickAssAnime",
    "lang": "all",
    "baseUrl": "https://kaa.lt",
    "apiUrl": "https://kaa.lt/api",
    "iconUrl": "https://www.google.com/s2/favicons?sz=256&domain=https://kaa.lt",
    "typeSource": "multi",
    "itemType": 1,
    "isManga":false,
    "hasCloudflare":true,
    "version": "0.0.3",
    "pkgPath": "anime/src/all/kaa.js",
    "notes": ""
}];

var B64CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var B64TABLE = (function() {
    var t = {};
    for (var i = 0; i < B64CHARS.length; i++) t[B64CHARS[i]] = i;
    return t;
})();

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

const StatusMap = {
    "currently_airing": 0,
    "finished_airing": 1,
    "on_hiatus": 2,
    "discontinued": 3,
    "not_yet_released": 4,
    "unknown": 5
}

// modified to take string instead of url
async function m3u8Extractor(url, text, headers) {
    // https://developer.apple.com/documentation/http-live-streaming/creating-a-multivariant-playlist
    // https://developer.apple.com/documentation/http-live-streaming/adding-alternate-media-to-a-playlist
    // define attribute lists
    const streamAttributes = [
        ['avg_bandwidth', /AVERAGE-BANDWIDTH=(\d+)/],
        ['bandwidth', /\bBANDWIDTH=(\d+)/],
        ['resolution', /\bRESOLUTION=([\dx]+)/],
        ['framerate', /\bFRAME-RATE=([\d\.]+)/],
        ['codecs', /\bCODECS="(.*?)"/],
        ['video', /\bVIDEO="(.*?)"/],
        ['audio', /\bAUDIO="(.*?)"/],
        ['subtitles', /\bSUBTITLES="(.*?)"/],
        ['captions', /\bCLOSED-CAPTIONS="(.*?)"/]
    ];
    const mediaAttributes = [
        ['type', /\bTYPE=([\w-]*)/],
        ['group', /\bGROUP-ID="(.*?)"/],
        ['lang', /\bLANGUAGE="(.*?)"/],
        ['name', /\bNAME="(.*?)"/],
        ['autoselect', /\bAUTOSELECT=(\w*)/],
        ['default', /\bDEFAULT=(\w*)/],
        ['instream-id', /\bINSTREAM-ID="(.*?)"/],
        ['assoc-lang', /\bASSOC-LANGUAGE="(.*?)"/],
        ['channels', /\bCHANNELS="(.*?)"/],
        ['uri', /\bURI="(.*?)"/]
    ];
    const streams = [], videos = {}, audios = {}, subtitles = {}, captions = {};
    const dict = { 'VIDEO': videos, 'AUDIO': audios, 'SUBTITLES': subtitles, 'CLOSED-CAPTIONS': captions };

    // collect media
    for (const match of text.matchAll(/#EXT-X-MEDIA:(.*)/g)) {
        const info = match[1], medium = {};
        for (const attr of mediaAttributes) {
            const m = info.match(attr[1]);
            medium[attr[0]] = m ? m[1] : null;
        }

        const type = medium.type;
        delete medium.type;
        const group = medium.group;
        delete medium.group;

        const typedict = dict[type];
        if (typedict[group] == undefined)
            typedict[group] = [];
        typedict[group].push(medium);
    }

    // collect streams
    for (const match of text.matchAll(/#EXT-X-STREAM-INF:(.*)\s*(.*)/g)) {
        const info = match[1], stream = { 'url': absUrl(match[2], url) };
        for (const attr of streamAttributes) {
            const m = info.match(attr[1]);
            stream[attr[0]] = m ? m[1] : null;
        }

        stream['video'] = videos[stream.video] ?? null;
        stream['audio'] = audios[stream.audio] ?? null;
        stream['subtitles'] = subtitles[stream.subtitles] ?? null;
        stream['captions'] = captions[stream.captions] ?? null;

        // format resolution or bandwidth
        let quality;
        if (stream.resolution) {
            quality = stream.resolution.match(/x(\d+)/)[1] + 'p';
        } else {
            quality = (parseInt(stream.avg_bandwidth ?? stream.bandwidth) / 1000000) + 'Mb/s'
        }

        // add stream to list
        const subs = stream.subtitles?.map((s) => {
            return { file: absUrl(s.uri, url), label: s.name };
        });
        const auds = stream.audio?.map((a) => {
            return { file: absUrl(a.uri, url), label: a.name };
        });
        streams.push({
            url: stream.url,
            quality: quality,
            originalUrl: stream.url,
            headers: headers,
            subtitles: subs ?? null,
            audios: auds ?? null
        });
    }
    return streams.length ? streams : [{
        url: url,
        quality: '',
        originalUrl: url,
        headers: headers,
        subtitles: null,
        audios: null
    }];
}

function absUrl(url, base) {
    if (url.search(/^\w+:\/\//) == 0) {
        return url;
    } else if (url.startsWith('/')) {
        return base.slice(0, base.lastIndexOf('/')) + url;
    } else {
        return base.slice(0, base.lastIndexOf('/') + 1) + url;
    }
}

class TimeHandler {
    constructor(startIso) {
        this.date = new Date(startIso);
    }

    setWeekday(targetDay) {
        const days = {
            sunday: 0,
            monday: 1,
            tuesday: 2,
            wednesday: 3,
            thursday: 4,
            friday: 5,
            saturday: 6
        };
    
        const target = days[targetDay.toLowerCase()];
        if (target == null) return this;
    
        const current = this.date.getUTCDay();
    
        let diff = target - current;
    
        // always move forward in time
        if (diff <= 0) diff += 7;
    
        this.date.setUTCDate(this.date.getUTCDate() + diff);
    
        return this;
    }
    setTime(hhmm = "00:00") {
        const [h, m] = hhmm.split(":").map(Number);
        this.date.setUTCHours(h || 0, m || 0, 0, 0);
        return this;
    }

    ms() {
        return this.date.getTime();
    }

    getISO() {
        return this.date.toISOString();
    }
}

function getYears(startYear) {
    const currentYear = new Date().getFullYear();
    const years = [];

    for (let y = startYear; y <= currentYear; y++) {
        years.push(String(y));
    }

    return years;
}

class DefaultExtension extends MProvider {
    constructor() {
      super();
      this.prefs = new SharedPreferences();
      this.client = new ProxyClient(this.prefs);
    }
    image(url) {
      if (this.prefs.get("proxy-use")) {
        return `${this.prefs.get("proxy-url")}/image?url=${url}`
      }
      return url;
    }
    async getEpisodes(manga) {
      let locale = null;
      if (manga.locales.includes("en-US")) {
        locale = "en-US";
      } else if (manga.locales.includes("ja-JP")) {
        locale = "ja-JP";
      } else {
        locale = manga.locales[0];
      }
      if (locale == null) return [];
      const episodes = [];
      let res = await this.client.get(`${this.source.apiUrl}/show/${manga.slug}/episodes?lang=${locale}`);
      let data = JSON.parse(res.body);
      let time = new TimeHandler(manga.start_date);
      let sorted = data.result.sort((a, b) => a.episode_number - b.episode_number);
      for (let i =0; i<data.result.length; i++) {
        let d = sorted[i];
        let ep = await this.client.get(`${this.source.apiUrl}/show/${manga.slug}/episode/ep-${d.episode_string}-${d.slug}`);
        let epd = JSON.parse(ep.body)
        time = time.setWeekday(epd.broadcast_day);
        time = time.setTime(epd.broadcast_time);
        episodes.push({
          name: epd?.episode_title ?? `Episode ${d.episode_string}`,
          url: `${this.source.baseUrl}/${manga.slug}/ep-${d.episode_string}-${d.slug}`,
          // manga has start date, each episode has day and time uploaded
          dateUpload: String(time.ms()),
          thumbnailUrl: d?.thumbnail != null ? this.image(`${this.source.baseUrl}/image/thumbnail/${d.thumbnail.hq ?? d.thumbnail.sm}.webp`) : null,
          description: "",
          duration: String(manga.episode_duration)
        })
      }
      return episodes;
    }
    async getMangaData(manga, full) {
      //idk why but it lies and says it has jpeg but has only webp
      return {
        name: manga?.title_en ?? manga?.title ?? manga?.title_original,
        imageUrl: this.image(`${this.source.baseUrl}/image/poster/${manga?.poster?.hq ?? manga?.poster?.sm}.webp`),
        link: `${this.source.baseUrl}/${manga?.slug}`,
        description: manga?.synopsis ?? "",
        status: StatusMap[manga?.status ?? "unknown"],
        genre: manga?.genres ?? [],
        author: "",
        artist: "",
        episodes: (full ? await this.getEpisodes(manga) : [])
      }
    }
    async getPopular(page) {
        let res = await this.client.get(`${this.source.apiUrl}/show/recent?type=all&page=${page}`);
        let data = JSON.parse(res.body);
        return {
          list: await Promise.all(
              (data?.result ?? []).map(c => this.getMangaData(c, false))
          ) ?? [],
          hasNextPage: data?.hadNext ?? false
        }
    }
    get supportsLatest() {
        return true;
    }
    async getLatestUpdates(page) {
        let res = await this.client.get(`${this.source.apiUrl}/show/recent?page=${page}`);
        let data = JSON.parse(res.body);
        return {
          list: await Promise.all(
              (data?.result ?? []).map(c => this.getMangaData(c, false))
          ) ?? [],
          hasNextPage: data?.hadNext ?? false
        }
    }
    async search(query, page, filters) {
        let genres = [];
        let year = null;
        let status = "";
        let type = "";
        for (const filter of filters) {
          if (filter.type == "GenreFilter") {
            genres = filter.state
              .filter((f) => f.state)
              .map((f) => f.value);
          }
          if (filter.type == "YearFilter") {
            year = filter.values[filter.state].value;
          }
          if (filter.type == "StatusFilter") {
            status = filter.values[filter.state].value;
          }
          if (filter.type == "TypeFilter") {
            type = filter.values[filter.state].value;
          }
        }
    
        let res = await this.client.post(`${this.source.apiUrl}/fsearch`, {
          "content-type":"application/json"
        }, {
          'query': query,
          'page': page,
          'filters': _btoa(JSON.stringify({
            ...(genres.length > 0 ? {"genres": genres} : {}),
            ...(year != new Date().getFullYear() && year != null ? {"year": year} : {}),
            ...(status != "all" ? {"status": status} : {}),
            ...(type != "all" ? {"type": type} : {})
          }))
        })
        let data = JSON.parse(res.body);
        return {
          list: await Promise.all(
              (data?.result ?? []).map(c => this.getMangaData(c, false))
          ) ?? [],
          hasNextPage: (data?.maxPage ?? page) != page
        }
    }
    async getDetail(url) {
        const slug = url.split("/").slice(-1)[0];
        let res = await this.client.get(`${this.source.baseUrl}/api/show/${slug}`);
        let data = JSON.parse(res.body);
        return this.getMangaData(data, true);
    }
    async getVideoList(url) {
        const [animeSlug, epSlug] = url.split("/").slice(-2);
        let res = await this.client.get(`${this.source.apiUrl}/show/${animeSlug}/episode/${epSlug}`);
        let data = JSON.parse(res.body);
        const videos = [];
        for (const server of data.servers) {
          if (server.name == "CatStream") {
            let res2 = await this.client.get(server.src);
            let doc = new Document(res2.body);
            const props = JSON.parse(doc.selectFirst("astro-island").attr("props"));
            let idUrl;
            if (props.manifest[1].includes("master")) {
              idUrl = props.manifest[1];
            } else {
              idUrl= props.thumbnails[1];
            }
            const [id, _] = idUrl.split("/").slice(-2);
            let master = await this.client.client.get(`https://bl.krussdomi.com/playlist/${id}/master.m3u8`, {
              'origin': 'https://krussdomi.com'
            });
            videos.push(
              ...(
                await m3u8Extractor(`https://bl.krussdomi.com/playlist/${id}/`, master.body, {
                  'origin': 'https://krussdomi.com'
                })
              )
            )
          }
          if (server.name == "VidStreaming") {
            const [_,id] = server.src.split("?")[1].split("&")[0].split("=");
            let master = await this.client.get(`https://hls.krussdomi.com/manifest/${id}/master.m3u8`, {
              'origin': 'https://krussdomi.com'
            });
            videos.push(...(await m3u8Extractor(`https://hls.krussdomi.com/manifest/${id}/`, master.body, {
              'origin': 'https://krussdomi.com'
            })))
          }
        }
        // handle different servers
        // VidStreaming, -> https://krussdomi.com/cat-player/vast?id=6a0a57c2ab00ea3267b2ff0c&source=vidstream&ln=en-US -> https://hls.krussdomi.com/manifest/${id}/master.m3u8
        // CatStream, -> https://krussdomi.com/cat-player/vast?id=OTM2MDU1MTY5NTQxMGFjMmY0ZjAxODA4N2NlMjQ2ZjY6MzY0NGYxY2M3OTMyNDBhYzBiOTVjMDAyM2UxYmE2OGM&type=hls&source=catstream ??? -> https://bl.krussdomi.com/playlist/6a17bf70ab00ea326783c22a/master.m3u8
        return videos;
    }
    getFilterList() {
      let years = getYears(1967);
      return [
        {
                type_name: "GroupFilter",
                type: "GenreFilter",
                name: "Genre",
                state: [
                    "Action", 
                    "Adult Cast", 
                    "Adventure", 
                    "Anthropomorphic", 
                    "Avant Garde", 
                    "Award Winning", 
                    "Boys Love", 
                    "CGDCT", 
                    "Childcare", 
                    "Combat Sports", 
                    "Comedy", 
                    "Crossdressing", 
                    "Delinquents", 
                    "Detective", 
                    "Drama", 
                    "Ecchi", 
                    "Educational",
                    "Erotica", 
                    "Fantasy", 
                    "Gag Humor", 
                    "Girls Love", 
                    "Gore", 
                    "Gourmet", 
                    "Harem", 
                    "High Stakes Game", 
                    "Historical", 
                    "Horror", 
                    "Idols (Female)", 
                    "Idols (Male)", 
                    "Isekai", 
                    "Iyashikei", 
                    "Josei", 
                    "Kids", 
                    "Love Polygon", 
                    "Magical Sex Shift", 
                    "Mahou Shoujo", 
                    "Martial Arts", 
                    "Mecha", 
                    "Medical", 
                    "Military", 
                    "Music", 
                    "Mystery", 
                    "Mythology", 
                    "Organized Crime", 
                    "Otaku Culture", 
                    "Parody", 
                    "Performing Arts", 
                    "Pets", 
                    "Psychological", 
                    "Racing", 
                    "Reincarnation", 
                    "Reverse Harem", 
                    "Romance", 
                    "Romantic Subtext", 
                    "Samurai", 
                    "School", 
                    "Sci-Fi", 
                    "Seinen", 
                    "Shoujo", 
                    "Shounen", 
                    "Showbiz", 
                    "Slice of Life", 
                    "Space", 
                    "Sports", 
                    "Strategy Game", 
                    "Super Power", 
                    "Supernatural", 
                    "Survival", 
                    "Suspense", 
                    "Team Sports", 
                    "Time Travel", 
                    "Urban Fantasy", 
                    "Vampire", 
                    "Video Game", 
                    "Villainess", 
                    "Visual Arts", 
                    "Workplace"
                ].map(x => ({ type_name: 'CheckBox', name: x, value: x }))
            },
            {
              type_name: "SelectFilter",
              type: "YearFilter",
              name: "Year",
              state: years.length-1,
              values: years.map(x=> ({ type_name: "SelectOption", name: x, value: x }))
            },
            {
              type_name: "SelectFilter",
              type: "StatusFilter",
              name: "Status",
              state: 0,
              values: Object.entries({
                "All": "all",
                "Finished Airing": "finished",
                "Currently Airing": "airing"
              }).map((x)=>({ type_name: "SelectOption", name: x[0], value: x[1] }))
            },
            {
              type_name: "SelectFilter",
              type: "TypeFilter",
              name: "Type",
              state: 0,
              values: [
                "all",
                "tv", 
                "movie", 
                "ona", 
                "ova", 
                "special", 
                "tv_special"
              ].map((x)=>({type_name:"SelectOption", name:x.toUpperCase(), value: x}))
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

