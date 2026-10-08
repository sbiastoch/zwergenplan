import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE, SITE_URL } from "../../site.config.ts";
import type { SiteOffer, SiteProvider } from "../../src/domain/site-data.ts";
import { fixtureSiteOffers } from "../../src/domain/test-fixtures.ts";
import { checkSharePages, notFoundPage, offerPreview, offerSharePage, providerSharePage } from "./share-pages.ts";

const GENERATED_AT = "2026-10-05T06:00:00+02:00";
const offers = fixtureSiteOffers();
const byTitle = (start: string): SiteOffer => {
  const offer = offers.find((o) => o.title.startsWith(start));
  if (!offer) throw new Error(`Fixture ${start} fehlt`);
  return offer;
};
const meta = (html: string, key: string) =>
  html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`))?.[1];

afterEach(() => {
  vi.useRealTimers();
});

describe("Titel der Vorschau: Rhythmus statt nächster Termin (Plan 0026, E3)", () => {
  it("einmalig mit Datum und Uhrzeit, auch in der Winterzeit", () => {
    expect(offerPreview(byTitle("Babykonzert im Advent"), GENERATED_AT).ogTitle).toBe(
      "Babykonzert im Advent · So 6. Dez. 2026, 10:00",
    );
  });

  it("Kurs mit Beginn und Zahl der Termine", () => {
    expect(offerPreview(byTitle("PEKiP-Gruppe Herbst"), GENERATED_AT).when).toBe("Kurs ab Di 13. Okt., 8 Termine");
  });

  it("wöchentlich mit Uhrzeit über den Wechsel auf Winterzeit (25.10.)", () => {
    expect(offerPreview(byTitle("Offener Krabbeltreff"), GENERATED_AT).ogTitle).toBe(
      "Offener Krabbeltreff · jeden Mittwoch, 10:00",
    );
  });

  it("gleicher Wochentag, nicht wöchentlich", () => {
    expect(offerPreview(byTitle("Krabbelreime"), GENERATED_AT).when).toBe("Freitags, 10:30");
  });

  it("Rhythmus ab generatedAt, nie ab der Systemuhr", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-06-01T12:00:00+02:00"));
    const krabbeltreff = byTitle("Offener Krabbeltreff");
    expect(offerPreview(krabbeltreff, GENERATED_AT).when).toBe("jeden Mittwoch, 10:00");
    // ab dem 1.11. bleibt nur ein Termin: kein Rhythmus mehr
    expect(offerPreview(krabbeltreff, "2026-11-01T06:00:00+01:00").when).toBe("regelmäßig");
  });

  it("kürzt einen langen Titel am Wortende, „ · wann“ bleibt", () => {
    const long = { ...byTitle("Offener Krabbeltreff"), title: `${"Krabbelgruppe mit Liedern ".repeat(6)}Ende` };
    const { ogTitle } = offerPreview(long, GENERATED_AT);
    expect(ogTitle.length).toBeLessThanOrEqual(110);
    expect(ogTitle).toMatch(/[a-z]… · jeden Mittwoch, 10:00$/);
  });
});

describe("Beschreibung (Plan 0026, E3)", () => {
  it("Ort, Stadtteil, Alter, Kosten, Anmeldung – Anbieter", () => {
    expect(offerPreview(byTitle("Offener Krabbeltreff"), GENERATED_AT).description).toBe(
      "Familientreff Beispielhof (fiktiv), Altstadt · 6–24 Monate · Kostenlos · Ohne Anmeldung",
    );
  });

  it("nennt Ort und Anbieter getrennt, wenn sie verschieden heißen", () => {
    expect(offerPreview(byTitle("Musikgarten 1"), GENERATED_AT).description).toMatch(
      /^Musikschule Beispiel, Haus Süd, Südstadt · 12–24 Monate · .* – Musikschule Beispiel \(fiktiv\)$/,
    );
  });

  it("ohne Stadtteil nur der Ort", () => {
    const offer = byTitle("Offener Krabbeltreff");
    const { district: _, ...venue } = offer.venue;
    expect(offerPreview({ ...offer, venue }, GENERATED_AT).description).toMatch(
      /^Familientreff Beispielhof \(fiktiv\) · 6–24/,
    );
  });

  it("kürzt bei 200 Zeichen am Wortende mit „…“", () => {
    const { description } = offerPreview(byTitle("Eltern-Kind-Bewegungslandschaft"), GENERATED_AT);
    expect(description.length).toBeLessThanOrEqual(200);
    expect(description).toMatch(/[^\s]…$/);
  });
});

describe("Kachel im Bild (Nachtrag A, E16)", () => {
  it("Leitkategorie, Meta mit Ort und Fakten wie auf der Kachel, Alter immer", () => {
    const preview = offerPreview(byTitle("PEKiP-Gruppe Herbst"), GENERATED_AT);
    expect(preview.category).toBe("babykurse");
    // Ort heißt wie der Anbieter (ohne Klammerzusatz): nicht doppelt nennen
    expect(preview.meta).toBe("Familientreff Beispielhof (fiktiv), Altstadt");
    // Ort zuerst: lange Anbieternamen verdrängen sonst das „Wo“ aus den zwei Zeilen
    expect(offerPreview(byTitle("Musikgarten 1"), GENERATED_AT).meta).toBe(
      "Musikschule Beispiel, Haus Süd, Südstadt · Musikschule Beispiel (fiktiv)",
    );
    expect(preview.facts).toEqual([
      { text: "1–5 Monate", kind: "plain" },
      { text: "120 € (8 Termine)", kind: "plain" },
      { text: "Anmeldung nötig", kind: "reg" },
      { text: "Wenige Plätze", kind: "avail-wenige" },
    ]);
  });

  it("kürzt freie Preistexte im Bild auf 40 Zeichen, die Beschreibung bleibt vollständig", () => {
    const price = "22,73 € (1 Erw. mit Babys), 41,36 € (2 Erw. mit Babys)";
    const preview = offerPreview({ ...byTitle("PEKiP-Gruppe Herbst"), price }, GENERATED_AT);
    expect(preview.facts[1]?.text).toBe("22,73 € (1 Erw. mit Babys), 41,36 €…");
    expect(preview.description).toContain(price);
  });

  it("Version des Bildes folgt den Texten", () => {
    const offer = byTitle("PEKiP-Gruppe Herbst");
    const v = offerPreview(offer, GENERATED_AT).imageVersion;
    expect(v).toMatch(/^[0-9a-f]{8}$/);
    expect(offerPreview(offer, GENERATED_AT).imageVersion).toBe(v);
    const full = { ...offer, availability: { ...offer.availability, status: "ausgebucht" as const } };
    expect(offerPreview(full, GENERATED_AT).imageVersion).not.toBe(v);
  });
});

describe("Vorschauseite eines Angebots (Plan 0026, E4)", () => {
  const offer = byTitle("Offener Krabbeltreff");
  const page = offerSharePage(offer, GENERATED_AT);

  it("liegt unter angebot/<id>/index.html und hat alle Tags", () => {
    expect(page.path).toBe(`angebot/${offer.id}/index.html`);
    expect(page.html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(meta(page.html, "og:title")).toBe("Offener Krabbeltreff · jeden Mittwoch, 10:00");
    expect(meta(page.html, "og:url")).toBe(`${SITE_URL}angebot/${offer.id}/`);
    expect(meta(page.html, "og:image")).toMatch(
      new RegExp(`^${SITE_URL}angebot/${offer.id}/vorschau\\.jpg\\?v=[0-9a-f]{8}$`),
    );
    expect(meta(page.html, "og:image:alt")).toBe("Kachel des Angebots im Zwergenplan");
    expect(meta(page.html, "og:image:width")).toBe("1200");
    expect(meta(page.html, "og:image:height")).toBe("630");
    expect(meta(page.html, "twitter:card")).toBe("summary_large_image");
    expect(page.html).toContain("<title>Offener Krabbeltreff · jeden Mittwoch, 10:00 – Zwergenplan</title>");
    expect(page.html).toContain(`<a id="go" href="${BASE}?angebot=${offer.id}">Im Zwergenplan öffnen</a>`);
  });

  it("escapet Titel überall, genau ein Skript", () => {
    const evil = offerSharePage({ ...offer, title: `Tom & Jerry's "<script>"` }, GENERATED_AT).html;
    const escaped = "Tom &amp; Jerry&#39;s &quot;&lt;script&gt;&quot;";
    expect(evil).toContain(`<title>${escaped} · jeden Mittwoch, 10:00 – Zwergenplan</title>`);
    expect(meta(evil, "og:title")).toBe(`${escaped} · jeden Mittwoch, 10:00`);
    expect(evil).toContain(`<h1>${escaped} · jeden Mittwoch, 10:00</h1>`);
    expect(evil.match(/<script/g)).toHaveLength(1);
  });

  it("Weiterleitung für alle Seiten byte-gleich", () => {
    const script = (html: string) => html.match(/<script>[\s\S]*?<\/script>/)?.[0];
    const other = offerSharePage(byTitle("Babykonzert im Advent"), GENERATED_AT).html;
    expect(script(page.html)).toBeDefined();
    expect(script(page.html)).toBe(script(other));
    expect(script(page.html)).toContain("location.replace");
    expect(script(page.html)).toContain("facebookexternalhit|Facebot|Twitterbot|bot\\b|crawler|spider");
  });

  it("wirft bei einer ungültigen ID", () => {
    expect(() => offerSharePage({ ...offer, id: "../x" }, GENERATED_AT)).toThrow();
  });

  it("deterministisch, unabhängig von der Systemuhr", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    expect(offerSharePage(offer, GENERATED_AT)).toEqual(page);
  });

  it("keine Fixture-Seite reißt den Wächter", () => {
    const pages = offers.map((o) => offerSharePage(o, GENERATED_AT));
    expect(checkSharePages(pages)).toEqual([]);
  });
});

describe("Vorschauseite eines Anbieters (Plan 0026, E3)", () => {
  const provider: SiteProvider = {
    id: "familientreff-beispiel",
    name: "Familientreff Beispielhof (fiktiv)",
    url: "https://example.org/",
    topics: ["pekip", "krabbelgruppe", "elterncafe", "babymassage"],
    venues: [{ name: "Familientreff Beispielhof", address: "Beispielweg 1", district: "Altstadt" }],
  };

  it("zählt kommende Angebote ab generatedAt, höchstens drei Kategorien", () => {
    const page = providerSharePage(provider, offers, GENERATED_AT);
    expect(page.path).toBe("anbieter/familientreff-beispiel/index.html");
    expect(meta(page.html, "og:title")).toBe("Familientreff Beispielhof (fiktiv)");
    expect(meta(page.html, "og:description")).toBe(
      "4 kommende Angebote im Zwergenplan · Babykurse · Krabbel- &amp; Spielgruppen · Treffs &amp; Cafés · Altstadt",
    );
    expect(meta(page.html, "og:image")).toBe(`${SITE_URL}og/vorschau-v1.jpg`);
    expect(page.html).toContain(`href="${BASE}?anbieter=familientreff-beispiel"`);
  });

  it("ohne kommende Angebote", () => {
    const page = providerSharePage(provider, offers, "2027-06-01T06:00:00+02:00");
    expect(meta(page.html, "og:description")).toMatch(/^Im Zwergenplan · Babykurse/);
  });
});

describe("404.html (Plan 0026, E7)", () => {
  const html = notFoundPage();
  it("noindex, ohne og:, mit beiden Mustern", () => {
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).not.toContain("og:");
    expect(html).toContain("angebot");
    expect(html).toContain("anbieter");
    expect(html).toContain("Zum Zwergenplan");
  });
});

describe("Wächter gegen Fehler im Generator (Tests 10)", () => {
  it("meldet Seiten über 10 kB", () => {
    expect(checkSharePages([{ path: "angebot/x/index.html", html: "x".repeat(10 * 1024) }])).toEqual([]);
    expect(checkSharePages([{ path: "angebot/x/index.html", html: "x".repeat(10 * 1024 + 1) }])).toEqual([
      "angebot/x/index.html: 10,2 kB (höchstens 10 kB)",
    ]);
  });

  it("Daten allein reißen ihn nie: Titel und Beschreibung voller Anführungszeichen", () => {
    const offer = byTitle("Offener Krabbeltreff");
    const worst = {
      ...offer,
      id: `${"a".repeat(60)}--${"b".repeat(80)}--${"c".repeat(58)}`,
      title: '"'.repeat(300),
      providerName: '"'.repeat(300),
    };
    expect(checkSharePages([offerSharePage(worst, GENERATED_AT)])).toEqual([]);
  });
});
