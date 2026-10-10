import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { applyOutputs, migrateText, noteParts, problemsOf } from "./migrate-0031.ts";

describe("migrate-0031 (Plan 0031, Phase a)", () => {
  it("setzt region nach role, streicht ring, stellt kind: js um und lässt Kommentare stehen", () => {
    const out = migrateText(`# Kopf
- id: a
  role: anbieter
  name: A
  venues:
    - id: a
      ring: innen
      geo: { lat: 49.45, lon: 11.07 }
  programme:
    - url: https://example.org/
      kind: js
      note: nur im Browser
`);
    expect(out).toBe(`# Kopf
- id: a
  role: anbieter
  region: nuernberg
  name: A
  venues:
    - id: a
      geo: { lat: 49.45, lon: 11.07 }
  programme:
    - url: https://example.org/
      kind: html
      render: browser
      note: nur im Browser
`);
    expect(migrateText(out)).toBe(out);
  });
});

describe("migrate-0031 --apply: Schutz gegen Datenverlust (Plan 0031, E6.3; Review 2, M4)", () => {
  const CATALOG = `- id: a
  role: anbieter
  region: nuernberg
  venues:
    - id: a-haus
      name: Haus
  programme:
    - url: https://example.org/termine?von=FROM
      kind: html
      note: "Alle Gruppen mit Uhrzeit; nach 'ab 2' filtern – FROM durch Laufbeginn ersetzen"
    - url: https://example.org/widget
      kind: html
      render: browser
      note: Buchungswidget mit freien Plätzen
  notes:
    - "Ort Haus: Babymassage freitags"
`;
  const good = {
    programme: [
      { url: "https://example.org/termine?von={von}", kind: "html", use: "termine", hint: "nach 'ab 2' filtern" },
      { url: "https://example.org/widget", kind: "html", render: "browser", use: "verfuegbarkeit" },
    ],
    notes: [
      "Ort Haus: Babymassage freitags",
      "[example.org/termine] Alle Gruppen mit Uhrzeit",
      "[example.org/termine] FROM durch Laufbeginn ersetzen",
      "[example.org/widget] Buchungswidget mit freien Plätzen",
    ],
    venueHints: { "a-haus": "Babymassage freitags" },
    placeholders: { "https://example.org/termine?von=FROM": "https://example.org/termine?von={von}" },
  };
  const old = (parse(CATALOG) as Parameters<typeof problemsOf>[0][])[0] as Parameters<typeof problemsOf>[0];

  it("setzt ein gültiges Ergebnis ein: Programm, Notizen, Ortshinweis", () => {
    expect(problemsOf(old, good)).toEqual([]);
    const out = parse(applyOutputs(CATALOG, { a: good }));
    expect(out[0].programme[0]).toEqual(good.programme[0]);
    expect(out[0].venues[0].hint).toBe("Babymassage freitags");
    expect(out[0].notes).toEqual(good.notes);
  });

  it.each([
    ["fehlende URL", { ...good, placeholders: {} }, "URL fehlt"],
    [
      "verlorenes render",
      { ...good, programme: [good.programme[0], { url: "https://example.org/widget", kind: "html", use: "info" }] },
      "render verloren",
    ],
    [
      "geändertes kind",
      { ...good, programme: [{ ...good.programme[0], kind: "pdf" }, good.programme[1]] },
      "kind geändert",
    ],
    ["alte notes nicht vorn", { ...good, notes: good.notes.slice(1) }, "Präfix"],
    ["Teil der note fehlt", { ...good, notes: good.notes.slice(0, 2) }, "Teil der note fehlt"],
    ["unbekannter Ort", { ...good, venueHints: { "x-haus": "y" } }, "unbekannter Ort"],
    ["ohne use", { ...good, programme: [{ ...good.programme[0], use: undefined }, good.programme[1]] }, "ohne use"],
    [
      "nur gesperrte Terminseite",
      {
        ...good,
        programme: [{ ...good.programme[0], blocked: { reason: "Login", since: "2026-10-04" } }, good.programme[1]],
      },
      "keine Terminseite",
    ],
    ["Zusatzschlüssel", { ...good, extra: 1 }, "out"],
  ])("bricht ab: %s", (_name, out, expected) => {
    expect(problemsOf(old, out).join("\n")).toContain(expected);
  });

  it("bricht ab, wenn Ausgaben fehlen oder ohne Eingabe sind", () => {
    expect(() => applyOutputs(CATALOG, {})).toThrow("Ausgabe fehlt");
    expect(() => applyOutputs(CATALOG, { a: good, b: good })).toThrow("Ausgabe ohne Eingabe");
  });

  it("Teile der note: nur an „; “ und „ – “, kurze Teile zählen nicht", () => {
    expect(noteParts("z. B. ab 2; ca. – Mon. 3-12 Monate")).toEqual(["z. B. ab 2", "Mon. 3-12 Monate"]);
  });
});
