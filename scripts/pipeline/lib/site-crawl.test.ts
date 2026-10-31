import { describe, expect, it } from "vitest";
import type { Provider } from "../../../src/domain/schema.ts";
import { extractPage } from "./html-extract.ts";
import {
  type CrawlFetch,
  candidatesOf,
  contactLinks,
  crawlScope,
  exploreSite,
  futureDates,
  iframeLinks,
  inScope,
  isShared,
  kindOf,
  neverCandidate,
  neverVisit,
  pageSignals,
  umbrellaHosts,
  wantsBrowser,
} from "./site-crawl.ts";

const today = "2026-10-30";

const anbieter = (id: string, url: string, programme: Array<Partial<Provider["programme"][number]>>): Provider =>
  ({
    id,
    role: "anbieter",
    region: "nuernberg",
    name: `Anbieter ${id}`,
    url,
    programme: programme.map((g) => ({ kind: "html", use: "termine", ...g })),
    availability: { shown: "unbekannt" },
    verified: "2026-10-01",
    venues: [{ id: `${id}-ort`, name: "Familienzentrum Süd", address: "Tellerringstraße 56, 90473 Nürnberg" }],
    // Cast: Testfixtur mit den Feldern, die der Seitenfinder liest; das volle Schema prüft data:validate
  }) as unknown as Provider;

const aggregator = (id: string, url: string): Provider =>
  // Cast: wie oben
  ({ id, role: "aggregator", url, programme: [{ url, kind: "json-api", use: "termine" }] }) as unknown as Provider;

const own = anbieter("fz-sued", "https://www.fz-sued.de/familie/", [{ url: "https://www.fz-sued.de/kurse/" }]);
const catalog = [
  own,
  anbieter("stadt-a", "https://www.nuernberg.de/internet/a/", [{ url: "https://www.nuernberg.de/internet/a/kurse" }]),
  anbieter("stadt-b", "https://www.nuernberg.de/internet/b/", [{ url: "https://www.nuernberg.de/internet/b/x" }]),
  aggregator("vk", "https://www.nuernberg.de/internet/vk/ajax_vk.pl"),
];

describe("Geteilte Websites (Plan 0049, E1)", () => {
  it("Dachseite aus dem Katalog, Plattformen fest; eigene Subdomain auf jimdofree.com ist eigene Website", () => {
    const u = umbrellaHosts(catalog);
    expect([...u]).toEqual(["nuernberg.de"]);
    expect(isShared("https://www.nuernberg.de/internet/c/", u)).toBe(true);
    expect(isShared("https://www.eversports.de/s/studio", u)).toBe(true);
    expect(isShared("https://kurse.hebamio.de/x", u)).toBe(true);
    expect(isShared("https://familie-mueller.jimdofree.com/", u)).toBe(false);
    expect(isShared("https://www.fz-sued.de/", u)).toBe(false);
  });

  it("Profil auf geteiltem Host nur unterhalb des Pfads und mit gleichen Query-Parametern", () => {
    const p = anbieter("studio", "https://www.eversports.de/s/studio?venueId=7", []);
    const scope = crawlScope(p, [p]);
    expect(inScope("https://www.eversports.de/s/studio/kurse?venueId=7", scope)).toBe(true);
    expect(inScope("https://www.eversports.de/s/studio/kurse?venueId=8", scope)).toBe(false);
    expect(inScope("https://www.eversports.de/s/anderes", scope)).toBe(false);
    // Wurzel einer geteilten Website ist keine Startseite
    expect(scope.starts).toEqual(["https://www.eversports.de/s/studio?venueId=7"]);
  });
});

describe("Dachseite über Subdomain (Arch-Review S1, M1)", () => {
  it("Anker auf bad.nuernberg.de öffnet nicht www.nuernberg.de", () => {
    const bad = anbieter("bad", "https://bad.nuernberg.de/kurse/", []);
    const scope = crawlScope(bad, [...catalog, bad]);
    expect(inScope("https://bad.nuernberg.de/kurse/baby", scope)).toBe(true);
    expect(inScope("https://www.nuernberg.de/internet/x", scope)).toBe(false);
    expect(inScope("https://bad.nuernberg.de/anderes", scope)).toBe(false);
  });
});

describe("crawlScope", () => {
  it("url, Wurzel und Programmseiten; blocked, {von} und request nie Startseite, blocked legt den Bereich fest", () => {
    const p = anbieter("p", "https://www.p.de/familie/", [
      { url: "https://www.p.de/kurse/" },
      { url: "https://www.p.de/api?from={von}", kind: "json-api" },
      { url: "https://www.p.de/post", request: { method: "POST", body: "{}" } },
      { url: "https://buchung.example/p", blocked: { reason: "Login", since: "2026-10-01" } },
    ]);
    const scope = crawlScope(p, [p]);
    expect(scope.starts).toEqual(["https://www.p.de/familie/", "https://www.p.de/", "https://www.p.de/kurse/"]);
    expect(inScope("https://buchung.example/p/kurse", scope)).toBe(true);
  });
});

describe("Ausschlüsse", () => {
  const scope = crawlScope(own, catalog);
  it("nie besucht: Impressum, Datenschutz, Shop, Bilder", () => {
    expect(neverVisit("https://www.fz-sued.de/impressum")).toBe(true);
    expect(neverVisit("https://www.fz-sued.de/x", "Datenschutz")).toBe(true);
    expect(neverVisit("https://www.fz-sued.de/bild.JPG")).toBe(true);
    expect(neverVisit("https://www.fz-sued.de/kurse")).toBe(false);
    // Workshop ist kein Shop (M2)
    expect(neverVisit("https://www.fz-sued.de/workshops/baby", "Tragetuch-Workshop")).toBe(false);
    expect(neverVisit("https://www.fz-sued.de/shop/")).toBe(true);
    expect(neverVisit("https://www.fz-sued.de/x", "Shop")).toBe(true);
  });

  it("nie Kandidat: Sammelkalender, Katalogseiten, Einzeltermin-.ics; Anbieterseite auf nuernberg.de schon", () => {
    expect(neverCandidate("https://www.evangelische-termine.de/x", scope)).toBe(true);
    expect(neverCandidate("https://www.nuernberg.de/internet/vk/ajax_vk.pl?id=3", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/kurse", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/termine/12345-babymassage.ics", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/termine.ics", scope)).toBe(false);
    expect(neverCandidate("https://www.nuernberg.de/internet/c/kurse", scope)).toBe(false);
  });

  it("nie Kandidat: Gottesdienst-, Kontakt- und Anfahrtsseiten (Stichprobe S0); Krabbelgottesdienst und Download schon", () => {
    expect(neverCandidate("https://www.fz-sued.de/gottesdienste/gottesdienste-im-norden", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/kontakt/", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/anfahrt.html", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/so-finden-sie-uns/kontakt-und-anfahrt", scope)).toBe(true);
    expect(neverCandidate("https://www.fz-sued.de/gottesdienste/krabbelgottesdienst", scope)).toBe(false);
    expect(neverCandidate("https://www.fz-sued.de/familiengottesdienst.html", scope)).toBe(false);
    expect(neverCandidate("https://www.fz-sued.de/kontaktgruppe-babys", scope)).toBe(false);
    // Downloadseiten nicht pauschal: Programmhefte liegen oft dort, der Ertragsbeweis entscheidet
    expect(neverCandidate("https://www.fz-sued.de/aktuelles/download", scope)).toBe(false);
  });
});

describe("pageSignals und futureDates", () => {
  const page = (text: string) => ({ jsonLd: [], feeds: [], text, links: [], jsRendered: false });

  it("drei künftige Daten mit Kleinkindbezug → Kandidat; vergangene zählen nicht", () => {
    expect(pageSignals(page("Babymassage am 04.11., 11.11.2026 und 18.11."), today)).toMatchObject({
      candidate: true,
      future: 3,
    });
    expect(pageSignals(page("Babymassage am 04.10.2026, 11.10.2026 und 18.11."), today).candidate).toBe(false);
  });

  it("ohne Jahr über den Jahreswechsel; mehr als 10 Monate voraus gilt als vergangen", () => {
    expect(futureDates("03.01. und 10.01.", "2026-12-20")).toBe(2);
    expect(futureDates("15.12.2027", today)).toBe(0);
    expect(futureDates("29.10.", today)).toBe(0);
  });

  it("Daten mit Monatsnamen zählen wie TT.MM. (wie BRK: „07. Oktober – 16. Dezember 2026“)", () => {
    expect(futureDates("Mittwoch, 07. Oktober - 16. Dezember 2026; Montag, 18. Januar - 15. März 2027", today)).toBe(3);
    expect(futureDates("Freitag, 15. Januar - 19.März 2027 (nicht am 12. Feb.)", today)).toBe(3);
    // „am 3. Advent“ oder „1. Mai“ im Vorjahr: nur echte Monatsnamen, ein vergangenes Datum mit Jahr zählt nicht
    expect(futureDates("am 3. Advent und am 1. Mai 2026", today)).toBe(0);
  });

  it("Wochentag und Uhrzeit in getrennten Zeilen (wie Musikgarten: „Dienstag / Zeit: 09:15 Uhr“)", () => {
    expect(pageSignals(page("Babys\nDienstag\nZeit: 09:15 Uhr\nMittwoch\nZeit: 14:30 Uhr"), today).candidate).toBe(
      true,
    );
    // eine Ziffer dazwischen trennt (kein Datum als Uhrzeit)
    expect(pageSignals(page("Babys am Dienstag 06.10.2026, Mittwoch 07.10.2026"), today).candidate).toBe(false);
  });

  it("Kleinkindbezug auch aus JSON-LD (wie Ohana: Kursname nur im JSON-LD)", () => {
    const jsonLd = [{ name: "Babys ab 3 Monate", start: "2026-11-05T10:00" }];
    expect(pageSignals({ ...page("Kursdetails, Anmeldung"), jsonLd }, today)).toMatchObject({ candidate: true });
    expect(
      pageSignals({ ...page("Kursdetails"), jsonLd: [{ name: "Kraulkurs", start: "2026-11-05T10:00" }] }, today),
    ).toMatchObject({ candidate: false });
  });

  it("Wochentag plus Uhrzeit, iCal, JSON-LD; ohne isRelevant kein Kandidat", () => {
    expect(pageSignals(page("Krabbelgruppe Di 9:30 Uhr und Do 10 Uhr"), today).candidate).toBe(true);
    expect(pageSignals({ ...page("Eltern-Kind-Kurse"), feeds: ["https://x.de/kurse.ics"] }, today).reason).toBe("iCal");
    expect(
      pageSignals({ ...page("Babykurs"), jsonLd: [{ name: "Babykurs", start: "2026-11-05T10:00" }] }, today).reason,
    ).toBe("JSON-LD");
    expect(pageSignals(page("Yoga Di 9:30 Uhr und Do 10 Uhr für Erwachsene"), today)).toMatchObject({
      candidate: false,
      reason: "2× Wochentag mit Uhrzeit, ohne Kleinkindbezug",
    });
  });
});

describe("kindOf und iCal-Feed als Kandidat (M5)", () => {
  it("Art aus dem Content-Type, JSON nie", () => {
    expect(kindOf("text/calendar; charset=utf-8")).toBe("ical");
    expect(kindOf("application/pdf")).toBe("pdf");
    expect(kindOf("application/json")).toBeUndefined();
    expect(kindOf("text/html")).toBe("html");
  });
  it("Feed mit künftigem DTSTART und Kleinkindbezug", () => {
    const ics = "BEGIN:VEVENT\nDTSTART;TZID=Europe/Berlin:20261104T100000\nSUMMARY:Krabbelgruppe\nEND:VEVENT";
    expect(pageSignals({ jsonLd: [], feeds: [], text: ics, links: [], jsRendered: false }, today)).toEqual({
      candidate: true,
      future: 1,
      reason: "iCal",
    });
  });
});

describe("iframeLinks", () => {
  it("liest iframe[src] relativ zur Seite", () => {
    expect(
      iframeLinks('<iframe src="/widget"></iframe><iframe src="https://eversports.de/w/1">', "https://a.de/k/"),
    ).toEqual(["https://a.de/widget", "https://eversports.de/w/1"]);
  });
});

/** Fake-Website: HTML je URL */
function site(pages: Record<string, string>) {
  const log: string[] = [];
  const fetchOne = async (url: string): Promise<CrawlFetch> => {
    log.push(url);
    const html = pages[url];
    if (html === undefined) return { ok: false, url, reason: "HTTP 404", cost: 1 };
    return {
      ok: true,
      url,
      finalUrl: url,
      contentType: "text/html",
      browser: false,
      page: extractPage(html, url),
      html,
      cost: 1,
    };
  };
  return { fetchOne, log };
}
const html = (body: string) => `<html><body>${body}</body></html>`;

describe("exploreSite (Breitensuche)", () => {
  it("Tiefe 2, Wörter vor Alphabet, nicht weiter als Tiefe 2", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({
      "https://s.de/": html('<a href="/a">Über</a><a href="/kurse">Kurse</a>'),
      "https://s.de/kurse": html('<a href="/kurse/baby">Babykurse</a>'),
      "https://s.de/a": html(""),
      "https://s.de/kurse/baby": html('<a href="/tief">tiefer</a>'),
    });
    const r = await exploreSite(crawlScope(p, [p]), s.fetchOne);
    expect(s.log).toEqual(["https://s.de/", "https://s.de/kurse", "https://s.de/a", "https://s.de/kurse/baby"]);
    expect(r.fetches).toBe(4);
  });

  it("Link mit ungültiger Prozentfolge bricht nicht ab (M3)", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({
      "https://s.de/": html('<a href="/f%FCr-babys">Für Babys</a>'),
      "https://s.de/f%FCr-babys": html(""),
    });
    await exploreSite(crawlScope(p, [p]), s.fetchOne);
    expect(s.log).toEqual(["https://s.de/", "https://s.de/f%FCr-babys"]);
  });

  it("Restbudget geht an den Abruf (M4)", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/k${i}">Kurs ${i}</a>`).join("");
    const pages: Record<string, string> = { "https://s.de/": html(links) };
    for (let i = 0; i < 30; i++) pages[`https://s.de/k${i}`] = html("");
    const s = site(pages);
    const remaining: number[] = [];
    await exploreSite(crawlScope(p, [p]), (url, r) => {
      remaining.push(r);
      return s.fetchOne(url);
    });
    expect(remaining.slice(0, 3)).toEqual([20, 19, 18]);
    expect(remaining.at(-1)).toBe(1);
  });

  it("höchstens 20 Abrufe samt Startseiten", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const links = Array.from({ length: 40 }, (_, i) => `<a href="/k${i}">Kurs ${i}</a>`).join("");
    const pages: Record<string, string> = { "https://s.de/": html(links) };
    for (let i = 0; i < 40; i++) pages[`https://s.de/k${i}`] = html("");
    const s = site(pages);
    const r = await exploreSite(crawlScope(p, [p]), s.fetchOne);
    expect(r.fetches).toBe(20);
    expect(s.log).toHaveLength(20);
  });

  it("Plattform-Link und iframe der eigenen Website: ein Sprung, nicht weiter; fremde Websites nie", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({
      "https://s.de/": html(
        '<a href="https://www.eversports.de/s/s">Buchen</a><iframe src="https://kikudoo.com/w/s"></iframe><a href="https://fremd.de/">Partner</a>',
      ),
      "https://www.eversports.de/s/s": html('<a href="https://www.eversports.de/s/s/kurse">Kurse</a>'),
      "https://kikudoo.com/w/s": html(""),
    });
    await exploreSite(crawlScope(p, [p]), s.fetchOne);
    expect(s.log.sort()).toEqual(["https://kikudoo.com/w/s", "https://s.de/", "https://www.eversports.de/s/s"]);
  });

  it("die eigene url ist Kandidat (keine Programmseite), die url eines anderen Anbieters nicht", async () => {
    const p = anbieter("hj", "https://hj.de/kurse", [{ url: "https://hj.de/alt" }]);
    const other = anbieter("x", "https://hj.de/fremd", [{ url: "https://x.de/" }]);
    const kurse = html("<p>Babymassage am 04.11., 11.11. und 18.11.</p>");
    const s = site({ "https://hj.de/kurse": html(`${kurse}<a href="/fremd">Fremd</a>`), "https://hj.de/fremd": kurse });
    const scope = crawlScope(p, [p, other]);
    const crawl = await exploreSite(scope, s.fetchOne);
    expect(candidatesOf(crawl, scope, today).map((c) => c.url)).toEqual(["https://hj.de/kurse"]);
  });

  it("Relaunch wie FamilienBox: alte Seite 404, neue Stundenplan-Seite über die Startseite gefunden", async () => {
    const p = anbieter("box", "https://box.de/", [{ url: "https://box.de/erwachsenenkurse/stundenplan-1/" }]);
    const s = site({
      "https://box.de/": html('<a href="/erwachsenenkurse/stundenplan/">Stundenplan</a>'),
      "https://box.de/erwachsenenkurse/stundenplan/": html(
        "<p>Babymassage Di 9:30 Uhr, Krabbelgruppe Do 10:00 Uhr, Pekip Fr 9 Uhr</p>",
      ),
    });
    const scope = crawlScope(p, [p]);
    const crawl = await exploreSite(scope, s.fetchOne);
    expect(candidatesOf(crawl, scope, today).map((c) => c.url)).toEqual([
      "https://box.de/erwachsenenkurse/stundenplan/",
    ]);
  });

  it("Liste mit Detailseiten (wie Sharky): Kandidaten nach künftigen Terminen, höchstens 5", async () => {
    const p = anbieter("sh", "https://sh.de/", []);
    const pages: Record<string, string> = {
      "https://sh.de/": html(
        Array.from({ length: 7 }, (_, i) => `<a href="/kurs-${i}">Babyschwimmen ${i}</a>`).join(""),
      ),
    };
    for (let i = 0; i < 7; i++)
      pages[`https://sh.de/kurs-${i}`] = html(
        `<p>Babyschwimmen: ${Array.from({ length: 3 + i }, (_, d) => `${String(d + 1).padStart(2, "0")}.12.`).join(", ")}</p>`,
      );
    const scope = crawlScope(p, [p]);
    const c = candidatesOf(await exploreSite(scope, site(pages).fetchOne), scope, today);
    expect(c.map((x) => x.url)).toEqual([
      "https://sh.de/kurs-6",
      "https://sh.de/kurs-5",
      "https://sh.de/kurs-4",
      "https://sh.de/kurs-3",
      "https://sh.de/kurs-2",
    ]);
    // ruhende oder abgelehnte Seiten fallen vor der Grenze heraus (Plan 0049, E4)
    const skipped = new Set(["https://sh.de/kurs-6", "https://sh.de/kurs-5"]);
    const d = candidatesOf(await exploreSite(scope, site(pages).fetchOne), scope, today, (u) => skipped.has(u));
    expect(d.map((x) => x.url)).toEqual([
      "https://sh.de/kurs-4",
      "https://sh.de/kurs-3",
      "https://sh.de/kurs-2",
      "https://sh.de/kurs-1",
      "https://sh.de/kurs-0",
    ]);
  });
});

describe("wantsBrowser", () => {
  const scope = crawlScope(own, catalog);
  it("bei jsRendered; bei 403 nur auf Plattformen oder Browser-Hosts", () => {
    expect(wantsBrowser({ status: 200, jsRendered: true, botWall: false, url: "https://www.fz-sued.de/" }, scope)).toBe(
      true,
    );
    expect(
      wantsBrowser({ status: 403, jsRendered: false, botWall: false, url: "https://www.fz-sued.de/" }, scope),
    ).toBe(false);
    expect(
      wantsBrowser({ status: 403, jsRendered: false, botWall: false, url: "https://www.eversports.de/w" }, scope),
    ).toBe(true);
  });
});

describe("Kontaktseiten (Nachtrag 1, bleibt mit Nachtrag 2)", () => {
  it("nach Tiefe 0 und vor Tiefe 1, höchstens zwei, Impressum trotz neverVisit, zählen zu den 20, nie Kandidat", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({
      "https://s.de/": html(
        '<a href="/kurse">Kurse</a><a href="/impressum">Impressum</a><a href="/kontakt">Kontakt</a><a href="/anfahrt">Anfahrt</a>',
      ),
      "https://s.de/kurse": html("<p>Babymassage Di 9:30 Uhr, Krabbelgruppe Do 10:00 Uhr</p>"),
      "https://s.de/kontakt": html("<p>Kontakt Di 9:30 Uhr, Do 10:00 Uhr</p>"),
      "https://s.de/anfahrt": html(""),
      "https://s.de/impressum": html(""),
    });
    const scope = crawlScope(p, [p]);
    const crawl = await exploreSite(scope, s.fetchOne);
    expect(s.log).toEqual(["https://s.de/", "https://s.de/kontakt", "https://s.de/anfahrt", "https://s.de/kurse"]);
    expect(crawl.pages.filter((x) => x.contact).map((x) => x.url)).toEqual([
      "https://s.de/kontakt",
      "https://s.de/anfahrt",
    ]);
    expect(crawl.fetches).toBe(4);
    expect(candidatesOf(crawl, scope, today).map((c) => c.url)).toEqual(["https://s.de/kurse"]);
  });

  it("nur das Impressum verlinkt: trotzdem abgerufen", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({ "https://s.de/": html('<a href="/impressum">Impressum</a>'), "https://s.de/impressum": html("") });
    await exploreSite(crawlScope(p, [p]), s.fetchOne);
    expect(s.log).toEqual(["https://s.de/", "https://s.de/impressum"]);
  });

  it("Dachseite: nur Kontaktseiten unter der Pfadbindung", async () => {
    const p = catalog[1] as Provider;
    const s = site({
      "https://www.nuernberg.de/internet/a/": html(
        '<a href="/internet/kontakt.html">Kontakt</a><a href="/internet/a/kontakt.html">Kontakt</a>',
      ),
      "https://www.nuernberg.de/internet/a/kurse": html(""),
      "https://www.nuernberg.de/internet/a/kontakt.html": html(""),
    });
    const crawl = await exploreSite(crawlScope(p, catalog), s.fetchOne);
    expect(crawl.pages.filter((x) => x.contact).map((x) => x.url)).toEqual([
      "https://www.nuernberg.de/internet/a/kontakt.html",
    ]);
  });
});

describe("Arch-Review Nachtrag 1 (Erkundung)", () => {
  it("M1: „Kontaktgruppe Babys“ bleibt Kandidat, Links der „Über uns“-Seite werden erkundet", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({
      "https://s.de/": html('<a href="/kontaktgruppe-babys">Kontaktgruppe Babys</a><a href="/ueber-uns">Über uns</a>'),
      "https://s.de/kontaktgruppe-babys": html("<p>Kontaktgruppe für Babys Di 9:30 Uhr, Do 10:00 Uhr</p>"),
      "https://s.de/ueber-uns": html('<a href="/ueber-uns/kurse">Kurse</a>'),
      "https://s.de/ueber-uns/kurse": html(""),
    });
    const scope = crawlScope(p, [p]);
    const crawl = await exploreSite(scope, s.fetchOne);
    expect(s.log).toContain("https://s.de/ueber-uns/kurse");
    expect(candidatesOf(crawl, scope, today).map((c) => c.url)).toEqual(["https://s.de/kontaktgruppe-babys"]);
  });

  it("m5: Iframe einer Plattform auf der eigenen Website merkt sich die eigene Seite in `from`", async () => {
    const p = anbieter("s", "https://s.de/", []);
    const s = site({
      "https://s.de/": html('<iframe src="https://www.eversports.de/widget/w/s"></iframe>'),
      "https://www.eversports.de/widget/w/s": html(""),
    });
    const scope = crawlScope(p, [p]);
    const crawl = await exploreSite(scope, s.fetchOne);
    const widget = crawl.pages.find((x) => x.url === "https://www.eversports.de/widget/w/s");
    expect(widget?.from).toBe("https://s.de/");
  });
});

describe("contactLinks (Adresse für das Bewerten)", () => {
  const page = (links: Array<{ label: string; url: string }>) => ({
    finalUrl: "https://www.schwimm.example.net/kurse/",
    text: "",
    links,
  });
  it("Kontakt, Anfahrt, Impressum derselben Website, höchstens zwei, Kontakt zuerst", () => {
    const r = contactLinks(
      page([
        { label: "Impressum", url: "https://schwimm.example.net/impressum" },
        { label: "Kurse", url: "https://schwimm.example.net/kurse/baby" },
        { label: "So finden Sie uns", url: "https://www.schwimm.example.net/anfahrt" },
        { label: "Kontakt", url: "https://schwimm.example.net/kontakt/" },
      ]),
    );
    expect(r).toEqual(["https://schwimm.example.net/kontakt/", "https://www.schwimm.example.net/anfahrt"]);
  });
  it("Subdomain derselben Website zählt, fremde Website, interne Adresse und die Seite selbst nicht", () => {
    const r = contactLinks(
      page([
        { label: "Kontakt", url: "https://www.schwimm.example.net/kurse/" },
        { label: "Kontakt", url: "https://andere.example.org/kontakt" },
        { label: "Kontakt", url: "http://192.168.0.1/kontakt" },
        { label: "Über uns", url: "https://info.schwimm.example.net/ueber-uns" },
      ]),
    );
    expect(r).toEqual(["https://info.schwimm.example.net/ueber-uns"]);
  });
  it("erkennt die Adresse auch am Pfad ohne passenden Linktext", () => {
    expect(contactLinks(page([{ label: "→", url: "https://schwimm.example.net/de/standorte" }]))).toEqual([
      "https://schwimm.example.net/de/standorte",
    ]);
  });
});
