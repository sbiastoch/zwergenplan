import { describe, expect, it } from "vitest";
import {
  ASSETS_MAX,
  assetsToEvict,
  DATA_CACHE,
  RULES,
  retiredDataEntries,
  type Strategy,
  shellCache,
  staleShells,
  strategyFor,
} from "./routes.ts";

const SCOPE = "https://zwergenplan.app/";
const get = (url: string, navigate = false, scope = SCOPE) => strategyFor({ url, scope, method: "GET", navigate });

describe("strategyFor: Tabelle aus Plan 0011, E4", () => {
  const rows: Array<[url: string, navigate: boolean, expected: Strategy]> = [
    // 1 fremde Origins: nie eingreifen (ADR 0008)
    ["https://tiles.openfreemap.org/planet/test/1/2/3.pbf", false, "fremd"],
    ["https://tiles.openfreemap.org/styles/positron", true, "fremd"],
    ["http://zwergenplan.app/assets/index-A.js", false, "fremd"],
    // 2 ics/** – auch als Navigation (einfache <a href> im Detail)
    ["https://zwergenplan.app/ics/x/serie.ics", false, "ics"],
    ["https://zwergenplan.app/ics/x/serie.ics", true, "ics"],
    // 3 assets/**
    ["https://zwergenplan.app/assets/index-A.js", false, "asset"],
    ["https://zwergenplan.app/assets/karte/MapView-B.js", false, "asset"],
    // 4, 5 Daten
    ["https://zwergenplan.app/data/site.json", false, "site"],
    // Wegzeit je Netz (Plan 0039, E5): Tabelle und Linien (Plan 0012), nie im Precache
    ["https://zwergenplan.app/data/wegzeit/vgn.json", false, "oepnv"],
    ["https://zwergenplan.app/data/linien/vgn.json", false, "oepnv"],
    ["https://zwergenplan.app/data/wegzeit/vrr.json", false, "oepnv"],
    ["https://zwergenplan.app/data/linien/vrr.json", false, "oepnv"],
    // alte Pfade bis Plan 0039: kein eigener Cache mehr
    ["https://zwergenplan.app/data/wegzeit.json", false, "netz"],
    ["https://zwergenplan.app/data/linien.json", false, "netz"],
    ["https://zwergenplan.app/data/wegzeit/xyz.json", false, "netz"],
    // 6 Navigation auf die App, mit beliebiger Query
    ["https://zwergenplan.app/", true, "schale"],
    ["https://zwergenplan.app/index.html", true, "schale"],
    ["https://zwergenplan.app/?ansicht=karte&kat=natur", true, "schale"],
    ["https://zwergenplan.app/index.html?angebot=x", true, "schale"],
    // 7 alles andere vom eigenen Origin
    ["https://zwergenplan.app/data/meta.json", false, "netz"],
    ["https://zwergenplan.app/data/anbieter.json", false, "netz"],
    ["https://zwergenplan.app/sw.js", false, "netz"],
    ["https://zwergenplan.app/manifest.webmanifest", false, "netz"],
    ["https://zwergenplan.app/icons/icon-192.png", false, "netz"],
    ["https://zwergenplan.app/anderes.html", true, "netz"],
    // Vorschauseiten, Kachelbild und 404.html zum Teilen: nie vorgehalten, nie abgefangen (Plan 0026, E7; ADR 0020)
    // – unter a/ und p/ (ADR 0022) wie unter den alten Ordnern, deren Links weiter ankommen
    ["https://zwergenplan.app/a/4tpu5qaq/", true, "netz"],
    ["https://zwergenplan.app/a/4tpu5qaq/vorschau.jpg?v=0123abcd", false, "netz"],
    ["https://zwergenplan.app/p/gl1sfqim/", true, "netz"],
    ["https://zwergenplan.app/angebot/a--b--c/", true, "netz"],
    ["https://zwergenplan.app/angebot/a--b--c/vorschau.jpg?v=0123abcd", false, "netz"],
    ["https://zwergenplan.app/anbieter/familientreff-beispiel/", true, "netz"],
    ["https://zwergenplan.app/404.html", true, "netz"],
    // Impressum: eigene statische Seite, offline nicht vorgehalten (Plan 0034, E5)
    ["https://zwergenplan.app/impressum/", true, "netz"],
    ["https://zwergenplan.app/", false, "netz"],
  ];
  for (const [url, navigate, expected] of rows) {
    it(`${navigate ? "Navigation" : "Abruf"} ${url} → ${expected}`, () => {
      expect(get(url, navigate)).toBe(expected);
    });
  }

  it("Reihenfolge: Pfadregeln vor der Navigationsregel, fremd zuerst (routes.test prüft die Liste)", () => {
    expect(RULES.map((r) => r.strategy)).toEqual(["fremd", "ics", "asset", "site", "oepnv", "schale"]);
  });

  it("Querystring und Fragment ändern die Datenregeln nicht", () => {
    expect(get("https://zwergenplan.app/data/site.json?v=1")).toBe("site");
    expect(get("https://zwergenplan.app/data/linien/vgn.json?v=2")).toBe("oepnv");
    expect(get("https://zwergenplan.app/data/wegzeit/vrr.json?v=2")).toBe("oepnv");
    expect(get("https://zwergenplan.app/assets/a.js#x")).toBe("asset");
  });

  it("nur GET: alles andere greift nie ein", () => {
    expect(strategyFor({ url: `${SCOPE}data/site.json`, scope: SCOPE, method: "POST", navigate: false })).toBe("netz");
  });

  describe("Pfade relativ zum Scope, nie mit festem /", () => {
    const scope = "https://beispiel.github.io/zwerg/";
    it("unter dem Scope", () => {
      expect(get("https://beispiel.github.io/zwerg/data/site.json", false, scope)).toBe("site");
      expect(get("https://beispiel.github.io/zwerg/", true, scope)).toBe("schale");
      expect(get("https://beispiel.github.io/zwerg/ics/a.ics", true, scope)).toBe("ics");
    });
    it("außerhalb des Scopes gleicher Origin: nur Netz", () => {
      expect(get("https://beispiel.github.io/data/site.json", false, scope)).toBe("netz");
      expect(get("https://beispiel.github.io/", true, scope)).toBe("netz");
      expect(get("https://beispiel.github.io/zwergx/assets/a.js", false, scope)).toBe("netz");
    });
  });
});

describe("Caches (E4)", () => {
  it("activate löscht die alten Kopien data/wegzeit.json und data/linien.json aus zp-data (Plan 0039, E5)", () => {
    const keys = [
      `${SCOPE}data/site.json`,
      `${SCOPE}data/wegzeit.json`,
      `${SCOPE}data/linien.json`,
      `${SCOPE}data/wegzeit/vgn.json`,
      `${SCOPE}data/linien/vgn.json`,
      "https://anders.example/data/wegzeit.json",
    ];
    expect(retiredDataEntries(keys, SCOPE)).toEqual([`${SCOPE}data/wegzeit.json`, `${SCOPE}data/linien.json`]);
    const sub = "https://beispiel.github.io/zwerg/";
    expect(retiredDataEntries([`${sub}data/linien.json?v=1`, `${SCOPE}data/linien.json`], sub)).toEqual([
      `${sub}data/linien.json?v=1`,
    ]);
  });

  it("Schale je Version, alte Schalen werden gelöscht, andere Caches bleiben", () => {
    expect(shellCache("abc")).toBe("zp-shell-abc");
    expect(staleShells(["zp-shell-alt", "zp-shell-abc", "zp-assets", DATA_CACHE, "fremd"], "abc")).toEqual([
      "zp-shell-alt",
    ]);
  });

  describe("Rotation von zp-assets", () => {
    const urls = (n: number) => Array.from({ length: n }, (_, i) => `${SCOPE}assets/a${i}.js`);
    it(`höchstens ${ASSETS_MAX} Einträge: die ältesten fliegen raus`, () => {
      expect(assetsToEvict(urls(ASSETS_MAX), new Set())).toEqual([]);
      expect(assetsToEvict(urls(ASSETS_MAX + 2), new Set())).toEqual([`${SCOPE}assets/a0.js`, `${SCOPE}assets/a1.js`]);
    });
    it("nie ein Eintrag der aktuellen Precache-Liste", () => {
      const keep = new Set([`${SCOPE}assets/a0.js`]);
      expect(assetsToEvict(urls(ASSETS_MAX + 2), keep)).toEqual([`${SCOPE}assets/a1.js`, `${SCOPE}assets/a2.js`]);
    });
    it("nur aktuelle Einträge über der Grenze: nichts löschen", () => {
      const all = urls(ASSETS_MAX + 1);
      expect(assetsToEvict(all, new Set(all))).toEqual([]);
    });
  });
});
