const mangayomiSources = (() => {
    const COUNT = 10000;
    
    const langs = [];
    const ids = {};
    
    for (let i = 0; i < COUNT; i++) {
        const lang = `xx-${i.toString().padStart(5, '0')}`;
        langs.push(lang);
        ids[lang] = Math.floor(Math.random() * 2**31);
    }

    return [{
        "name": "DO NOT INSTALL THIS IS A VULN TEST",
        "langs": langs,
        "ids": ids,
        "baseUrl": "DO NOT INSTALL",
        "apiUrl": "DO NOT INSTALL",
        "iconUrl": "",
        "typeSource": "single",
        "itemType": 0,
        "version": "0.1.0",
        "pkgPath": "manga/src/en/do_not_install.js",
        "notes": "UNINSTALL THIS RIGHT NOW"
    }];
})();

class DefaultExtension extends MProvider {
}
