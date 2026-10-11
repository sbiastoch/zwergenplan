import { describe, expect, it } from "vitest";
import type { RawEvent } from "./raw.ts";
import { mergeParts, splitInput } from "./split.ts";

const header = (n: number, kind = "html") => `## Seite ${n}: https://example.org/s${n} (${kind})`;
const filler = (n: number, chars: number) => `Text ${n} ${"x".repeat(Math.max(0, chars - 8))}`;

/** Ein Kurs wie bei fbs-nuernberg.de: Titel, Termine, Felder, „Angebot drucken »“ am Ende. */
function course(i: number): string[] {
  return [
    `Kurs ${i}: Eltern-Kind-Turnen`,
    "Für Familien mit Kindern von 1 – 3 Jahren",
    "Kursformat: Präsenz",
    `Beschreibung ${i} ${"b".repeat(200)}`,
    `Dienstag, ${String(i).padStart(2, "0")}.10.2026, von 9.30-10.30 Uhr`,
    "Beginn:",
    `${String(i).padStart(2, "0")}.10.2026`,
    "Kurs-Nr.:",
    `EKBE ${i}`,
    "Leitung:",
    `Person ${i}`,
    "Gebühren:",
    "Kursgebühr 63,00 €",
    "Angebot drucken »",
  ];
}

const lines = (parts: string[]) => parts.flatMap((p) => p.split("\n"));
/** Inhaltszeilen ohne die wiederholten Kopfzeilen der Teile */
const content = (parts: string[]) => lines(parts).filter((l) => !l.startsWith("## Seite") && !l.startsWith("## Kand"));

describe("splitInput", () => {
  it("bis zur Schwelle: genau der Eingabetext, ein Teil", () => {
    const text = `${header(1)}\n## TEXT\nKrabbeln`;
    expect(splitInput(text, text.length)).toEqual([text]);
  });

  it("Seiten bleiben ganz und werden der Reihe nach zu Teilen bis zur Schwelle gepackt", () => {
    const pages = [1, 2, 3].map((n) => `${header(n)}\n## TEXT\n${filler(n, 300)}`);
    const parts = splitInput(pages.join("\n"), 700);
    expect(parts).toEqual([`${pages[0]}\n${pages[1]}`, pages[2]]);
  });

  it("eine Seite über der Schwelle: Schnitt nur nach der letzten wiederkehrenden Zeile eines Eintrags", () => {
    const body = ["## TEXT", "Navigation", "Kurse", ...Array.from({ length: 12 }, (_, i) => course(i + 1)).flat()];
    const text = [header(1), ...body].join("\n");
    const parts = splitInput(text, 1500);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) {
      expect(p.length).toBeLessThanOrEqual(1500);
      // jeder Teil nennt die Seite (für sourceUrl) und endet an einer Eintragsgrenze
      expect(p.startsWith(`${header(1)}\n`)).toBe(true);
      expect(p.endsWith("Angebot drucken »")).toBe(true);
    }
    // kein Eintrag über zwei Teile, nichts verloren, nichts doppelt
    for (let i = 1; i <= 12; i++) expect(parts.filter((p) => p.includes(`EKBE ${i}\n`)).length).toBe(1);
    expect(content(parts)).toEqual(body);
  });

  it("JSON (iCal): Schnitt nur zwischen den Objekten der obersten Liste", () => {
    const item = (i: number) => [
      "{",
      `"SUMMARY": "Krabbelgruppe ${i}",`,
      `"DTSTART": "2026-10-${10 + i}T10:00",`,
      "},",
    ];
    const json = [
      "## ICAL",
      "[",
      ...Array.from({ length: 9 }, (_, i) => item(i)).flat(),
      "{",
      '"SUMMARY": "x"',
      "}",
      "]",
    ];
    const text = [header(1, "ical"), ...json].join("\n");
    const parts = splitInput(text, 260);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts) {
      const body = p.split("\n").slice(1);
      const opens = body.filter((l) => l === "{").length;
      const closes = body.filter((l) => l === "}," || l === "}").length;
      expect(opens).toBe(closes);
    }
    expect(content(parts)).toEqual(json);
  });

  it("verschachteltes JSON: Schnitt eine Ebene tiefer, wenn die oberste nicht reicht", () => {
    const item = (i: number) => [
      "{",
      `"title": "Kurs ${i}",`,
      `"meta": { "a": [1, 2] },`,
      `"text": "Klammer } im Text ${i}"`,
      "},",
    ];
    const json = [
      "{",
      '"data": [',
      ...Array.from({ length: 8 }, (_, i) => item(i)).flat(),
      '{ "title": "letzter" }',
      "],",
      '"total": 9',
      "}",
    ];
    const text = [header(1, "json-api"), ...json].join("\n");
    const parts = splitInput(text, 300);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts)
      for (let i = 0; i < 8; i++) if (p.includes(`"Kurs ${i}"`)) expect(p).toContain(`Klammer } im Text ${i}"\n},`);
    expect(content(parts)).toEqual(json);
  });

  it("ohne wiederkehrende Zeile: Schnitt an Zeilengrenzen, jeder Teil unter der Schwelle", () => {
    const body = Array.from({ length: 40 }, (_, i) => `Zeile ${i} ${"z".repeat(40)}`);
    const parts = splitInput([header(1), ...body].join("\n"), 600);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(600);
    expect(content(parts)).toEqual(body);
  });

  it("Kandidaten: in den ersten Teil, in den sie passen, sonst ein eigener Teil", () => {
    const pages = [1, 2].map((n) => `${header(n)}\n## TEXT\n${filler(n, n === 1 ? 540 : 300)}`);
    const cands = `## Kandidaten (2)\n{"title":"a"}\n{"title":"b"}`;
    const fits = splitInput([...pages, cands].join("\n"), 600);
    expect(fits).toEqual([pages[0], `${pages[1]}\n${cands}`]);
    const big = `## Kandidaten (2)\n{"title":"${"a".repeat(300)}"}\n{"title":"b"}`;
    expect(splitInput([...pages, big].join("\n"), 600)).toEqual([pages[0], pages[1], big]);
  });

  it("Kandidaten über der Schwelle: zeilenweise, je Teil mit eigener Zahl", () => {
    const rows = Array.from({ length: 6 }, (_, i) => JSON.stringify({ title: `k${i}`, pad: "p".repeat(80) }));
    const text = [`${header(1)}\n## TEXT\nkurz`, `## Kandidaten (6)`, ...rows].join("\n");
    const parts = splitInput(text, 320);
    const heads = lines(parts).filter((l) => l.startsWith("## Kandidaten"));
    const counts = heads.map((h) => Number(/\((\d+)\)/.exec(h)?.[1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6);
    expect(heads.length).toBeGreaterThan(1);
    expect(content(parts)).toEqual(["## TEXT", "kurz", ...rows]);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(320);
  });

  it("nur der letzte Kandidaten-Abschnitt zählt als solcher (Seitentext kann einen fälschen)", () => {
    const forged = `${header(1)}\n## TEXT\n## Kandidaten (1)\n${filler(1, 400)}`;
    const real = `## Kandidaten (1)\n{"title":"a"}`;
    const parts = splitInput(`${forged}\n${real}`, 490);
    expect(parts[0]).toBe(forged);
    expect(parts.at(-1)?.endsWith(real)).toBe(true);
  });

  it("eine einzelne Zeile über der Schwelle bleibt ganz", () => {
    const long = "y".repeat(500);
    const parts = splitInput(`${header(1)}\n## TEXT\nkurz\n${long}`, 200);
    expect(parts.some((p) => p.includes(long))).toBe(true);
  });
});

const ev = (
  title: string,
  from: string | string[],
  format: RawEvent["format"] = "kurs",
): Pick<RawEvent, "title" | "venueId" | "schedule" | "format"> => ({
  venueId: "v",
  title,
  format,
  schedule: {
    kind: "dates",
    dates: (Array.isArray(from) ? from : [from]).map((d) => ({ start: `${d}T10:00` })),
  },
});
const window = { from: "2026-10-11", to: "2027-10-11", freeDays: {} };
const merge = (parts: Array<Array<ReturnType<typeof ev>>>) => mergeParts(parts, window);

describe("mergeParts", () => {
  it("vereinigt der Reihe nach, gleiche Events (Titel, Ort, Termine) aus späteren Teilen nur einmal", () => {
    const a = ev("Krabbeln", "2026-10-12");
    const r = merge([
      [a, ev("Turnen", "2026-10-12")],
      [ev("Krabbeln", "2026-10-12"), ev("Krabbeln", "2026-10-19")],
    ]);
    expect(r.events.map((e) => e.title)).toEqual(["Krabbeln", "Turnen", "Krabbeln"]);
    expect(r.events[0]).toBe(a);
    expect(r.duplicates).toBe(1);
  });

  it("regelmäßig: gleiche ID (gekürzter Titel, Ort) aus einem späteren Teil ist dasselbe Angebot", () => {
    const head = "MilchZeit – Offener Treff für Schwangere und Eltern mit Baby";
    const r = merge([
      [ev(`${head} (Mi 9–10 Uhr)`, "2026-10-14", "regelmaessig")],
      [ev(`${head}, Mittwoch 9 Uhr`, "2026-10-28", "regelmaessig"), ev("Krabbelkäfer", "2026-10-14", "regelmaessig")],
    ]);
    expect(r.events.map((e) => e.title)).toEqual([`${head} (Mi 9–10 Uhr)`, "Krabbelkäfer"]);
    expect(r.duplicates).toBe(1);
  });

  it("anders formuliert, gleicher Ort und erster Termin: enthaltene Termine entfallen, sonst Titel des ersten", () => {
    const first = ev("BewegungsOase – offener Treff montags (1–4 Jahre)", ["2026-10-12", "2026-10-19"], "regelmaessig");
    const sameTreff = ev("BewegungsOase: offener Bewegungstreff für Kinder 1–4 Jahre", "2026-10-12", "regelmaessig");
    const course = ev("Mit Kleinkindern unterwegs – gesunde Snacks (Vormittag)", "2026-11-06");
    const longer = ev("Mit Kleinkindern unterwegs – gesunde Snacks (9:45)", ["2026-11-06", "2026-11-13"]);
    const other = ev("PEKiP Freitag", "2026-11-06");
    const r = merge([
      [first, course],
      [sameTreff, longer, other],
    ]);
    expect(r.events.map((e) => e.title)).toEqual([
      first.title,
      course.title,
      // mehr Termine als das erste: bleibt, unter dessen Titel, damit der Build die Termine vereinigt (windowKey)
      course.title,
      "PEKiP Freitag",
    ]);
    expect(r.events[2]?.schedule).toEqual(longer.schedule);
    expect(r).toMatchObject({ duplicates: 1, retitled: 1 });
  });

  it("vergangene Termine zählen nicht für den ersten Termin von Nicht-Kursen", () => {
    const a = ev("Krabbeltreff Montag", ["2026-10-05", "2026-10-12"], "regelmaessig");
    const b = ev("Krabbeltreff am Montag", "2026-10-12", "regelmaessig");
    expect(merge([[a], [b]]).events).toHaveLength(1);
  });

  it("innerhalb eines Teils bleibt alles (dort prüft validateRaw)", () => {
    const r = merge([[ev("Krabbeln", "2026-10-12"), ev("Krabbeln", "2026-10-12")]]);
    expect(r.events).toHaveLength(2);
  });
});
