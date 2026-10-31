import { describe, expect, it } from "vitest";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import type { Candidate } from "./candidate.ts";
import {
  catalogExcerpt,
  datedFrom,
  extractKey,
  ICAL_HEADING,
  inputHash,
  normalizeText,
  normalizeWhitespace,
  ORDER_FREE_KEY,
  orderFreeHash,
  sameKey,
} from "./normalize.ts";

const page = (stand: string) =>
  [
    "Krabbelgruppe   Sonnenschein",
    "",
    "",
    "Di 20.10.2026, 9:30–11:00 Uhr · noch 3 Plätze",
    `Stand: ${stand}`,
    "Wir verwenden Cookies, um Ihnen das beste Erlebnis zu bieten.",
    "Alle akzeptieren",
  ].join("\n");

describe("normalizeText (Plan 0032, E3)", () => {
  it("fasst Leerraum zusammen, entfernt Leerzeilen, NBSP und unsichtbare Zeichen", () => {
    expect(normalizeText("  a  b \t c  \r\n\n\n  d​ e  \n")).toBe("a b c\nd e");
  });

  it("ersetzt Zeitstempel, lässt Termine stehen", () => {
    expect(normalizeText("Stand: 11.10.2026 03:12")).toBe("Stand: <zeit>");
    expect(normalizeText("Zuletzt aktualisiert am 2026-10-11T03:12:45+02:00")).toBe("Zuletzt aktualisiert am <zeit>");
    expect(normalizeText('{"updated_at":"2026-10-11T03:12:45.123Z","start":"2026-10-20T09:30:00"}')).toBe(
      '{"updated_at":"<zeit>","start":"2026-10-20T09:30:00"}',
    );
    expect(normalizeText("erzeugt 10:41:07 Uhr, Kurs 9:30 Uhr")).toBe("erzeugt <zeit> Uhr, Kurs 9:30 Uhr");
    // Termine aus APIs (kursorganizer) tragen volle Sekunden mit Nullbruch: bleiben (Probe 2026-10-11)
    expect(normalizeText('"startDateTime": "2026-11-05T10:15:00.000Z"')).toBe(
      '"startDateTime": "2026-11-05T10:15:00.000Z"',
    );
    expect(normalizeText("um 2026-10-11T03:12:00.481Z")).toBe("um <zeit>");
    // Termin-Informationen bleiben (Arch-Review S1.2, M1 und Minor 6)
    expect(normalizeText('{"start": 1761123600000, "id": 1700000001}')).toBe(
      '{"start": 1761123600000, "id": 1700000001}',
    );
    expect(normalizeText("bis 2026-10-20T23:59:59, Ende 23:59:59")).toBe("bis 2026-10-20T23:59:59, Ende 23:59:59");
    expect(normalizeText("Info-Stand 20.10.2026 10:00")).toBe("Info-Stand 20.10.2026 10:00");
    expect(normalizeText("Stand 20.10.2026 10:00")).toBe("Stand 20.10.2026 10:00");
    expect(normalizeText("https://a.de/x.css?v=1760151234")).toBe("https://a.de/x.css?v=<zeit>");
    // Calendly zeigt die aktuelle Uhrzeit hinter der Zeitzone (Probe 2026-10-11, dance-maxx)
    expect(normalizeText("Zeitzone\nMitteleuropäische Zeit\n(08:45)\nMo 9:30")).toBe(
      "Zeitzone\nMitteleuropäische Zeit\n(<zeit>)\nMo 9:30",
    );
    expect(normalizeText("Central European Time (8:45am)")).toBe("Central European Time (<zeit>)");
    expect(normalizeText("x?_=1760151234567&y=1")).toBe("x?_=<zeit>&y=1");
    expect(normalizeText("Kurs am 20.10.2026 um 9:30 Uhr, Tel. 0911 123456")).toBe(
      "Kurs am 20.10.2026 um 9:30 Uhr, Tel. 0911 123456",
    );
  });

  it("entfernt Session-IDs und Tracking-Parameter aus URLs", () => {
    expect(normalizeText("https://a.de/kurs;jsessionid=AB12CD34?id=7")).toBe("https://a.de/kurs?id=7");
    expect(normalizeText("https://a.de/k?id=7&PHPSESSID=9f8e7d6c5b4a&sid=xyz")).toBe(
      "https://a.de/k?id=7&PHPSESSID=<sid>&sid=<sid>",
    );
    expect(normalizeText("https://a.de/k?utm_source=nl&fbclid=IwAR0x&id=7")).toBe(
      "https://a.de/k?utm_source=<sid>&fbclid=<sid>&id=7",
    );
    // TYPO3-cHash hängt am Inhalt, nicht an der Sitzung: bleibt
    expect(normalizeText("https://a.de/k?tx_news=1&cHash=0a1b2c")).toBe("https://a.de/k?tx_news=1&cHash=0a1b2c");
  });

  it("entfernt Zeilen von Cookie-Bannern aus der festen Liste, aber keine langen Absätze", () => {
    expect(normalizeText("Kurs A\nCookie-Einstellungen\nNur notwendige Cookies\nKurs B")).toBe("Kurs A\nKurs B");
    const long = `Wir verwenden Cookies. ${"Krabbelgruppe dienstags. ".repeat(30)}`;
    expect(normalizeText(long)).toBe(long.trim());
  });
});

describe("normalizeWhitespace (Eingabetext, Arch-Review S1.2, M1)", () => {
  it("nur Leerraum, Zeitstempel und Cookie-Zeilen bleiben für das Modell erhalten", () => {
    expect(normalizeWhitespace("  Stand: 11.10.2026 03:12 \n\n Alle akzeptieren  ")).toBe(
      "Stand: 11.10.2026 03:12\nAlle akzeptieren",
    );
  });
});

describe("inputHash (Plan 0032, E3/E4)", () => {
  const base = { pages: [{ url: "https://a.de/kurse", text: page("11.10.2026 03:12") }], candidates: [] };

  it("gleicher Inhalt mit anderem Zeitstempel ergibt gleichen Hash", () => {
    const other = { ...base, pages: [{ url: "https://a.de/kurse", text: page("12.10.2026 03:47") }] };
    expect(inputHash(other)).toBe(inputHash(base));
    expect(inputHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("geänderter Platzstand, andere URL oder neue Kandidaten ändern den Hash", () => {
    const fewer = { ...base, pages: [{ url: "https://a.de/kurse", text: page("x").replace("3 Plätze", "2 Plätze") }] };
    expect(inputHash(fewer)).not.toBe(inputHash(base));
    expect(inputHash({ ...base, pages: [{ ...base.pages[0], url: "https://a.de/k2", text: "" }] })).not.toBe(
      inputHash({ ...base, pages: [{ ...base.pages[0], url: "https://a.de/k3", text: "" }] }),
    );
    expect(inputHash({ ...base, candidates: [{ title: "Babymassage" }] })).not.toBe(inputHash(base));
  });

  it("Reihenfolge der Kandidaten zählt nicht, die der Seiten schon (Katalogreihenfolge)", () => {
    const a = { title: "A" };
    const b = { title: "B" };
    expect(inputHash({ ...base, candidates: [a, b] })).toBe(inputHash({ ...base, candidates: [b, a] }));
    const p1 = { url: "https://a.de/1", text: "eins" };
    const p2 = { url: "https://a.de/2", text: "zwei" };
    expect(inputHash({ pages: [p1, p2], candidates: [] })).not.toBe(inputHash({ pages: [p2, p1], candidates: [] }));
  });

  it("orderFreeHash (nur Messung S1.2): gleiche Zeilen in anderer Reihenfolge ergeben gleichen Hash", () => {
    // FBS listet Kurse am selben Tag bei jedem Abruf anders sortiert (Probe 2026-10-11)
    const a = { pages: [{ url: "https://a.de/1", text: "Kurs A\n10:45\nKurs B\n9:30" }], candidates: [] };
    const b = { pages: [{ url: "https://a.de/1", text: "Kurs B\n9:30\nKurs A\n10:45" }], candidates: [] };
    expect(inputHash(a)).not.toBe(inputHash(b));
    expect(orderFreeHash(a)).toBe(orderFreeHash(b));
    expect(orderFreeHash({ ...a, pages: [{ url: "https://a.de/1", text: "Kurs A\n11:45\nKurs B\n9:30" }] })).not.toBe(
      orderFreeHash(a),
    );
  });

  it("weitere Bestandteile (Stufe 2: Prompt, Schema, Modell) gehen benannt in den Schlüssel", () => {
    expect(inputHash({ ...base, extra: { model: "haiku" } })).not.toBe(inputHash(base));
    expect(inputHash({ ...base, extra: { model: "haiku" } })).not.toBe(
      inputHash({ ...base, extra: { model: "sonnet" } }),
    );
    expect(inputHash({ ...base, extra: { a: "1", b: "2" } })).toBe(inputHash({ ...base, extra: { b: "2", a: "1" } }));
  });
});

describe("extractKey (Plan 0032, E4)", () => {
  const input = { pages: [{ url: "https://a.de/1", text: "Kurs A\n10:45\nKurs B\n9:30" }], candidates: [] };
  const parts = { catalog: "{}", prompt: "Prompt v1", schema: "{}", model: "haiku" };
  const today = { today: "2026-10-12" };

  it("Prompt, Schema, Modell und Katalogauszug gehen je in den Schlüssel (N3: Modellwechsel extrahiert neu)", () => {
    const key = extractKey(input, parts, today).hash;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    for (const change of [{ prompt: "Prompt v2" }, { schema: '{"x":1}' }, { model: "sonnet" }, { catalog: '{"a":1}' }])
      expect(extractKey(input, { ...parts, ...change }, today).hash).not.toBe(key);
    expect(extractKey(input, parts, today).hash).toBe(key);
  });

  it("Standard ist der Hash mit Reihenfolge; der reihenfolgefreie ist per ORDER_FREE_KEY umschaltbar (offen)", () => {
    const swapped = { ...input, pages: [{ url: "https://a.de/1", text: "Kurs B\n9:30\nKurs A\n10:45" }] };
    expect(ORDER_FREE_KEY).toBe(false);
    expect(extractKey(swapped, parts, today).hash).not.toBe(extractKey(input, parts, today).hash);
    expect(extractKey(swapped, parts, { ...today, orderFree: true }).hash).toBe(
      extractKey(input, parts, { ...today, orderFree: true }).hash,
    );
  });

  it("ohne datierte Bestandteile ist der Grundschlüssel der frühere inputHash (keine Neu-Extraktion nach dem Umbau)", () => {
    expect(extractKey(input, parts, today)).toMatchObject({
      hash: inputHash({ ...input, extra: { ...parts } }),
      dated: {},
    });
  });

  it("Abrufart geht in die Fassung, nicht in den Schlüssel (Arch-Review 2, M2)", () => {
    const neu = extractKey(input, parts, today);
    const alt = extractKey(input, parts, { ...today, fassung: { abruf: "alt" } });
    expect(alt.hash).toBe(neu.hash);
    expect(alt.dated).toEqual(neu.dated);
    expect(alt.parts).not.toBe(neu.parts);
    // Standard (Abruf neu wie im Nachtlauf) lässt die Fassung bitgleich: kein Gate nach dem Umbau
    expect(extractKey(input, parts, { ...today, fassung: {} }).parts).toBe(neu.parts);
  });

  it("catalogExcerpt: ohne notes (ADR 0025, Punkt 5), sonst der ganze Eintrag", () => {
    const [p] = loadFixtures().providers;
    if (!p) throw new Error("Fixture fehlt");
    const withNotes = { ...p, notes: ["2026-10-01: Protokoll"] };
    const { notes: _notes, ...without } = withNotes;
    expect(catalogExcerpt(withNotes)).toBe(catalogExcerpt(without));
    expect(catalogExcerpt(withNotes)).not.toContain("Protokoll");
    expect(catalogExcerpt({ ...p, name: "Anders" })).not.toBe(catalogExcerpt(p));
  });
});

describe("extractKey: vergangene Termine zählen nicht (Plan 0032, Kostenhebel)", () => {
  const parts = { catalog: "{}", prompt: "Prompt v1", schema: "{}", model: "haiku" };
  const feed = (...events: object[]) => ({
    url: "https://kirche.de/feed.ics",
    text: ICAL_HEADING + JSON.stringify(events, null, 1),
  });
  const termin = (day: string, summary = "Krabbelgruppe") => ({
    SUMMARY: summary,
    DTSTART: `${day.replaceAll("-", "")}T093000`,
  });
  const serie = { SUMMARY: "Babytreff", DTSTART: "20260901T100000", RRULE: "FREQ=WEEKLY;BYDAY=MO" };
  const kandidat = (starts: string[], title = "Eltern-Kind-Singen"): Candidate => ({
    source: "evtermine",
    sourceId: title,
    title,
    description: "",
    detailUrl: `https://termine.de/${title}`,
    cancelled: false,
    soldOut: false,
    waitlist: false,
    weekly: false,
    occurrences: starts.map((start) => ({ start })),
  });
  const key = (pages: ReturnType<typeof feed>[], candidates: Candidate[], day: string) =>
    extractKey({ pages, candidates }, parts, { today: day });

  it("ein Feed, der über Nacht nur den gestrigen Termin verliert, hat am neuen Tag denselben Schlüssel", () => {
    const night1 = key([feed(termin("2026-10-11"), serie, termin("2026-10-14"))], [], "2026-10-11");
    const night2 = key([feed(serie, termin("2026-10-14"))], [], "2026-10-12");
    expect(Object.keys(night1.dated)).toEqual(["2026-10-11", "2026-10-14"]);
    expect(sameKey({ inputHash: night1.hash, dated: night1.dated }, night2, "2026-10-12")).toBe(true);
    // ein Feed, der den gestrigen Termin noch zeigt, ist am neuen Tag ebenfalls gleich
    const late = key([feed(termin("2026-10-11"), serie, termin("2026-10-14"))], [], "2026-10-12");
    expect(sameKey({ inputHash: night1.hash, dated: night1.dated }, late, "2026-10-12")).toBe(true);
    const night3 = key([feed(serie, termin("2026-10-14"))], [], "2026-10-13");
    expect(sameKey({ inputHash: night2.hash, dated: night2.dated }, night3, "2026-10-13")).toBe(true);
  });

  it("neuer oder geänderter künftiger Termin, geänderte Serie: anderer Schlüssel", () => {
    const base = key([feed(serie, termin("2026-10-14"))], [], "2026-10-12");
    const stored = { inputHash: base.hash, dated: base.dated };
    for (const next of [
      key([feed(serie, termin("2026-10-14"), termin("2026-10-20"))], [], "2026-10-12"),
      key([feed(serie, termin("2026-10-14", "Krabbelgruppe fällt aus"))], [], "2026-10-12"),
      key([feed({ ...serie, RRULE: "FREQ=WEEKLY;BYDAY=DI" }, termin("2026-10-14"))], [], "2026-10-12"),
    ])
      expect(sameKey(stored, next, "2026-10-12")).toBe(false);
  });

  it("Serien und Termine ohne lesbares DTSTART bleiben im Grundschlüssel", () => {
    const k = key([feed(serie, { SUMMARY: "irgendwann" })], [], "2026-10-12");
    expect(k.dated).toEqual({});
    expect(k.hash).toBe(
      inputHash({ pages: [feed(serie, { SUMMARY: "irgendwann" })], candidates: [], extra: { ...parts } }),
    );
  });

  it("Kandidaten zählen unter ihrem letzten Termin; vergangene fallen weg, ohne den Grundschlüssel zu ändern", () => {
    const night1 = key(
      [],
      [kandidat(["2026-10-11T10:00"]), kandidat(["2026-10-11T10:00", "2026-10-18T10:00"], "Reihe")],
      "2026-10-11",
    );
    expect(Object.keys(night1.dated)).toEqual(["2026-10-11", "2026-10-18"]);
    const night2 = key([], [kandidat(["2026-10-11T10:00", "2026-10-18T10:00"], "Reihe")], "2026-10-12");
    expect(night2.hash).toBe(night1.hash);
    expect(sameKey({ inputHash: night1.hash, dated: night1.dated }, night2, "2026-10-12")).toBe(true);
    const later = key([], [kandidat(["2026-10-18T10:00"], "Reihe")], "2026-10-12");
    expect(sameKey({ inputHash: night1.hash, dated: night1.dated }, later, "2026-10-12")).toBe(true);
    const other = key([], [kandidat(["2026-10-11T10:00", "2026-10-18T10:30"], "Reihe")], "2026-10-12");
    expect(sameKey({ inputHash: night1.hash, dated: night1.dated }, other, "2026-10-12")).toBe(false);
  });

  it("mehrtägige, ganztägige (DTEND exklusiv) und UTC-Termine zählen bis zu ihrem letzten Berliner Tag", () => {
    const k = key(
      [
        feed(
          { SUMMARY: "Freizeit", DTSTART: "20261010T090000", DTEND: "20261013T120000" },
          { SUMMARY: "Familientag", DTSTART: "20261011", DTEND: "20261012" },
          { SUMMARY: "Mitternacht", DTSTART: "20261011T223000Z" },
        ),
      ],
      [],
      "2026-10-12",
    );
    // Freizeit bis 13., Familientag nur am 11. (vor heute), Mitternacht 00:30 Berlin am 12.
    expect(Object.keys(k.dated)).toEqual(["2026-10-12", "2026-10-13"]);
  });

  it("iCal-Text, der sich nicht lesen lässt, bleibt ganz im Grundschlüssel", () => {
    const broken = { url: "https://kirche.de/feed.ics", text: `${ICAL_HEADING}[{"SUMMARY": ` };
    const odd = feed({ SUMMARY: "TZ", DTSTART: "2026-10-14" });
    for (const page of [broken, odd]) {
      const k = key([page], [], "2026-10-12");
      expect(k).toMatchObject({ hash: inputHash({ pages: [page], candidates: [], extra: { ...parts } }), dated: {} });
    }
  });

  it("gespeicherter Schlüssel ohne dated (vor dem Umbau) passt nur ohne künftige datierte Bestandteile", () => {
    const k = key([feed(serie)], [], "2026-10-12");
    expect(sameKey({ inputHash: k.hash }, k, "2026-10-12")).toBe(true);
    const withDates = key([feed(serie, termin("2026-10-14"))], [], "2026-10-12");
    expect(sameKey({ inputHash: withDates.hash }, withDates, "2026-10-12")).toBe(false);
  });

  it("datedFrom: nur Tage ab heute, sortiert", () => {
    expect(datedFrom({ "2026-10-13": "b", "2026-10-11": "a", "2026-10-12": "c" }, "2026-10-12")).toEqual({
      "2026-10-12": "c",
      "2026-10-13": "b",
    });
  });
});
