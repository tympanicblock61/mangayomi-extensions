const mangayomiSources = [{
    "name": "Bato.to",
    "lang": "all",
    "baseUrl": "https://bato.to",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/tympanicblock61/mangayomi-extensions/refs/heads/main/javascript/icon/en.bato.png",
    "typeSource": "multi",
    "itemType": 0,
    "version": "0.0.1",
    "pkgPath": "src/en/bato.js",
    "notes": ""
}];

const client = new Client();

function getHeaders(url) {
  return {
    'Referer': url,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  };
}

class DefaultExtension extends MProvider {
    mangaListFromPage(body, hasNextPage) {
      const doc = new Document(body);
      const mangaElements = doc.select('[class^="col item"]');
      const list = [];
      for (const element of mangaElements) {
        const name = element.selectFirst("a.item-title").text;
        const imageUrl = element.selectFirst("a.item-cover > img").getSrc;
        const link = this.source.baseUrl + element.selectFirst("a.item-cover").getHref;
        const genreDiv = element.selectFirst('.item-genre');
        let genre = [];
        if (genreDiv) {
          const genreElements = genreDiv.select('span, u'); 
          genre = genreElements.map(g => g.text.trim());
        }
        list.push({ name, imageUrl, link, genre });
      }
      
      return {"list": list, hasNextPage};
    }
    get supportsLatest() {
        return true;
    }
    async getPopular(page) {
        let headers = getHeaders(this.source.baseUrl);
        let res = await client.get(
          this.source.baseUrl,
          headers
        );
        let doc = new Document(res.body);
        let popularBody = doc.selectFirst("#mainer > div > div.mt-4.row.row-cols-3.row-cols-md-4.row-cols-lg-8.g-0.home-popular")
        return this.mangaListFromPage(popularBody.outerHtml, false);
    }  
    async getLatestUpdates(page) {
        let headers = getHeaders(this.source.baseUrl);
        let res = await client.get(
          `${this.source.baseUrl}/latest?page=${page}`,
         headers,
        );
        let body = page == 1 ? res.body : JSON.parse(res.body)["res"]["html"];
        let hasNextPage = page == 1 ? true : JSON.parse(res.body)["res"]["more"];
        return this.mangaListFromPage(body, hasNextPage);
    }
    async search(query, page, filters) {
        throw new Error("search not implemented");
    }
    
    statusCode(status) {
      return (
        {
          "Ongoing": 0,
          "Completed": 1,
          //"on hiatus": 2,
          //"discontinued": 3,
          //"not yet published": 4,
        }[status] ?? 5
      );
    }
    async getDetail(link) {
        let headers = getHeaders(link);
        let res = await client.get(
          link,
          headers
        );
        const doc = new Document(res.body);
        const name = doc.selectFirst("h3.item-title > a").text;
        const cover_attr = doc.selectFirst("div.attr-cover")
        const imageUrl = cover_attr.selectFirst("img").getSrc;
        const main_attr = doc.selectFirst("div.attr-main");
        const childDivs = main_attr.select("div");
        const authors = childDivs[1].select("span");
        const artists = childDivs[2].select("span");
        const genres = childDivs[3].select("span > span")
        let status;
        if (childDivs.length >= 8) {
          status = this.statusCode(childDivs[7].selectFirst("span").text.trim());
        } else {
          status = 5
        }
        const description = doc.selectFirst("#limit-height-body-summary > div").text.trim();
        
        const chapters = [];
        const chapElements = doc.select("div.p-2.d-flex.flex-column.flex-md-row.item");
        for (const element of chapElements) {
          let chap = element.selectFirst("a.visited.chapt");
          let name = chap.text.trim()
          let url = this.source.baseUrl + chap.getHref;
          console.log(name);
          let scanlator = element.selectFirst("div.extra > a:nth-child(1)").text.trim()
          chapters.push({ name, url, scanlator });
        }
        
        return {
          name,
          link,
          imageUrl,
          author: authors.map(g => g.text.trim()).join(" & "),
          artist: artists.map(g => g.text.trim()).join(" & "),
          genre: genres.map(g =>g.text.trim()),
          status,
          description,
          chapters
        }
    }
    // For novel html content
    async getHtmlContent(name, url) {
        throw new Error("getHtmlContent not implemented");
    }
    // Clean html up for reader
    async cleanHtmlContent(html) {
        throw new Error("cleanHtmlContent not implemented");
    }
    // For anime episode video list
    async getVideoList(url) {
        throw new Error("getVideoList not implemented");
    }
    // For manga chapter pages
    async getPageList(link) {
      let headers = getHeaders(link);
      let res = await client.get(
        link,
        headers
      );
      let doc = new Document(res.body);
      let urls = [];
      const scripts = doc.select('script');
      let targetScript = null;
      
      for (const script of scripts) {
        const code = script.text;
        if (code.includes('const imgHttps')) {
          targetScript = code;
          break;
        }
      }
      if (targetScript != null) {
        const match = targetScript.match(/const imgHttps\s*=\s*(\[[\s\S]*?\]);/);
        if (match) {
          const imgHttpsCode = match[1];
          urls = eval(imgHttpsCode);
          console.log(urls);
        }
      }
      return urls;
    }
    getFilterList() {
        throw new Error("getFilterList not implemented");
    }
    getSourcePreferences() {
        throw new Error("getSourcePreferences not implemented");
    }
}
