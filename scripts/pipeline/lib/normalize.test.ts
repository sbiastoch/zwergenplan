import { describe, expect, it } from "vitest";
import { inputHash, normalizeText, normalizeWhitespace, orderFreeHash } from "./normalize.ts";

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
