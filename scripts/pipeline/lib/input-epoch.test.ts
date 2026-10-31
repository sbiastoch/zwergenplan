import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Candidate } from "./candidate.ts";
import { assembleProvider, type PageOutcome, programmeText } from "./fetch.ts";
import { extractKey, INPUT_EPOCH, normalizeText } from "./normalize.ts";

/**
 * Pin-Test der Eingabe-Epoche (Plan 0049, Nachtrag 2, B1): Ändert sich der Code, der den Eingabetext erzeugt, ändert
 * sich jeder Cache-Schlüssel, und die Neuextraktion liefe am ID-Gate vorbei, wenn die Fassung (`partsHash`) gleich
 * bliebe. Rot heißt: `INPUT_EPOCH` in `lib/normalize.ts` erhöhen und unten Epoche und Werte neu eintragen.
 *
 * Gepinnt ist die ganze Kette einer eingefrorenen Einheit (Arch-Review B, M1): Seitentext je Art (`programmeText` für
 * HTML, iCal und PDF), Zusammensetzung des Einheitentexts (`assembleProvider`: Seitenköpfe, Kandidaten-Abschnitt,
 * Leerraum) und der Schlüssel selbst (`extractKey`: Grundhash samt `ORDER_FREE_KEY`, reihenfolgefreier Hash, `dated`).
 * Die Abrufart (`--abruf alt|neu`) liegt davor und ist hier nicht pinbar; sie geht als eigener Bestandteil in die
 * Fassung ein (`fassung` von `extractKey`, Arch-Review 2, M2), nicht in den Schlüssel.
 */
const PAGES: ReadonlyArray<{ kind: "html" | "ical" | "pdf"; url: string; body: string }> = [
  {
    kind: "html",
    url: "https://fz.example.org/kurse/",
    body: `<html><head><script type="application/ld+json">{"@type":"Event","name":"Krabbelgruppe","startDate":"2026-11-03T09:30"}</script></head>
<body><header>Kopf</header><nav>Menü</nav><main><h1>Kurse</h1><p>Babymassage   dienstags 9:30&nbsp;Uhr</p>
<ul><li>PEKiP, Do 10:00</li><li>Krabbelgruppe Mo 15:30 – <b>ausgebucht</b></li></ul><a href="/anmeldung">Anmeldung</a></main><footer>Tellerringstr. 56</footer></body></html>`,
  },
  {
    kind: "ical",
    url: "https://fz.example.org/kurse.ics",
    body: [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:1",
      "SUMMARY:Eltern-Kind-Turnen",
      "DTSTART;TZID=Europe/Berlin:20261104T100000",
      "DTEND;TZID=Europe/Berlin:20261104T110000",
      "LOCATION:Turnhalle",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
  },
  {
    // zweiter Feed: Serie (bleibt im Grundhash), vergangener ganztägiger Termin (zählt nicht), UTC-Zeit, die in Berlin schon der nächste Tag ist
    kind: "ical",
    url: "https://fz.example.org/treff.ics",
    body: [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:2",
      "SUMMARY:Babytreff",
      "DTSTART;TZID=Europe/Berlin:20261102T150000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:3",
      "SUMMARY:Herbstfest",
      "DTSTART;VALUE=DATE:20261020",
      "DTEND;VALUE=DATE:20261021",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:4",
      "SUMMARY:Laternenbasteln",
      "DTSTART:20261111T233000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
  },
  {
    kind: "pdf",
    url: "https://fz.example.org/programm.pdf",
    body: "Programm Herbst 2026\f\nStand: 12.10.2026 08:15\n\nKrabbelgruppe\t\tMo 15:30–17:00\r\nPEKiP   Do 10:00 (8 Termine)\n",
  },
];

/** aus einem Sammelkalender: ein vergangener und ein künftiger Termin */
const CANDIDATES: readonly Candidate[] = [
  {
    source: "evtermine",
    sourceId: "4711",
    title: "Krabbelgottesdienst",
    description: "Für Kinder bis 3 Jahre mit Eltern.",
    organizer: "Ev. Familienzentrum",
    location: "Gemeindehaus",
    detailUrl: "https://termine.example.org/4711",
    cancelled: false,
    soldOut: false,
    waitlist: false,
    weekly: false,
    occurrences: [{ start: "2026-10-25T10:00" }, { start: "2026-11-08T10:00", end: "2026-11-08T11:00" }],
  },
];

const PARTS = { catalog: '{"id":"fz"}', prompt: "Prompt", schema: "Schema", model: "modell@medium" };
const TODAY = "2026-10-31";

const sha16 = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

const outcomes = (): PageOutcome[] =>
  PAGES.map((p) => ({ url: p.url, art: p.kind, ok: true, text: programmeText(p.kind, p.body, p.url), ms: 0 }));

const PINNED = {
  epoch: 1,
  text: "84af6424a08059a2",
  unitText: "f6dedee9926ba036",
  hash: "99e742097eaebbcf",
  orderFree: "7db108397cc7a691",
  // 25.10. (Kandidat) und 20.10. (Feed) liegen vor `TODAY`, die Serie hat keinen Tag
  dated: { "2026-11-04": "13421ea3bca2a841", "2026-11-08": "896689c9f34ff880", "2026-11-12": "7dd671b67a5d4b40" },
};

describe("INPUT_EPOCH (Pin)", () => {
  it("Eingabetext und Schlüssel einer eingefrorenen Einheit sind unverändert, sonst Epoche erhöhen", () => {
    const pages = outcomes().flatMap((o) => (o.ok ? [{ url: o.url, text: o.text }] : []));
    const input = { pages, candidates: CANDIDATES };
    const key = extractKey(input, PARTS, { today: TODAY });
    const orderFree = extractKey(input, PARTS, { today: TODAY, orderFree: true });
    expect({
      epoch: INPUT_EPOCH,
      // erster Pin (B1): Seitentext der HTML-Seite und des ersten Feeds
      text: sha16(
        PAGES.slice(0, 2)
          .map((p) => normalizeText(programmeText(p.kind, p.body, p.url)))
          .join("\n---\n"),
      ),
      // Eingabetext der Einheit, wie ihn das Modell sieht (Seitenköpfe, Kandidaten-Abschnitt)
      unitText: sha16(assembleProvider({ pages: outcomes(), candidates: CANDIDATES }).text),
      hash: key.hash.slice(0, 16),
      orderFree: orderFree.hash.slice(0, 16),
      dated: Object.fromEntries(Object.entries(key.dated).map(([day, h]) => [day, h.slice(0, 16)])),
    }).toEqual(PINNED);
  });
});
