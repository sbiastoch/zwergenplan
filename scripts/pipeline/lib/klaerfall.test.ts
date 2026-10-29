import { describe, expect, it } from "vitest";
import type { Find } from "./discover.ts";
import { emptyState } from "./discover-state.ts";
import { addKlaerfall, endKlaerfall, klaerfallFinds, SUSPEND_DAYS } from "./klaerfall.ts";

const find: Find = {
  name: "Krabbelzwerge",
  url: "https://krabbelzwerge.example.net/kurse",
  warum: "x",
  quelle: "suche:x",
};
const start = emptyState("nuernberg");

describe("Klärfälle im Zustand (Plan 0050, E5)", () => {
  it("neuer Klärfall am Kandidaten: seit = zuletzt = heute, anzahl 1", () => {
    const s = addKlaerfall(start, find, "Geocoder ohne Treffer", "kandidat", "2026-10-01");
    expect(s.klaerfaelle).toEqual([
      {
        url: find.url,
        name: "Krabbelzwerge",
        grund: "Geocoder ohne Treffer",
        seit: "2026-10-01",
        zuletzt: "2026-10-01",
        anzahl: 1,
      },
    ]);
  });

  it("ab dem dritten am Kandidaten: aussetzenBis = heute + 35; Lauf-Gründe zählen nicht, aktualisieren aber zuletzt", () => {
    let s = addKlaerfall(start, find, "a", "kandidat", "2026-09-01");
    s = addKlaerfall(s, { ...find, url: "https://krabbelzwerge.example.net/kurse/" }, "b", "lauf", "2026-09-15");
    expect(s.klaerfaelle).toHaveLength(1);
    // der Lauf-Grund überdeckt nicht den Grund am Kandidaten (Arch-Review S1, m3)
    expect(s.klaerfaelle[0]).toMatchObject({ anzahl: 1, zuletzt: "2026-09-15", seit: "2026-09-01", grund: "a" });
    s = addKlaerfall(s, find, "c", "kandidat", "2026-10-01");
    expect(s.klaerfaelle[0]?.aussetzenBis).toBeUndefined();
    s = addKlaerfall(s, find, "d", "kandidat", "2026-11-01");
    expect(s.klaerfaelle[0]).toMatchObject({ anzahl: 3, aussetzenBis: "2026-12-06" });
    expect(SUSPEND_DAYS).toBe(35);
  });

  it("endKlaerfall beendet ihn (Aufnahme, Verwerfung, bekannt), andere bleiben", () => {
    let s = addKlaerfall(start, find, "a", "kandidat", "2026-10-01");
    s = addKlaerfall(s, { ...find, url: "https://andere.example.net/" }, "a", "kandidat", "2026-10-01");
    expect(endKlaerfall(s, find.url).klaerfaelle.map((k) => k.url)).toEqual(["https://andere.example.net/"]);
  });

  it("offene Klärfälle sind Kandidaten der Quelle klaerfall, ausgesetzte nicht", () => {
    let s = addKlaerfall(start, find, "a", "kandidat", "2026-10-01");
    s = addKlaerfall(s, { ...find, name: "B", url: "https://b.example.net/" }, "a", "kandidat", "2026-10-01");
    s = { ...s, klaerfaelle: s.klaerfaelle.map((k) => (k.name === "B" ? { ...k, aussetzenBis: "2026-11-05" } : k)) };
    expect(klaerfallFinds(s, "2026-11-01")).toEqual([
      { name: "Krabbelzwerge", url: find.url, warum: "offener Klärfall: a", quelle: "klaerfall" },
    ]);
    expect(klaerfallFinds(s, "2026-11-05").map((f) => f.name)).toEqual(["Krabbelzwerge", "B"]);
  });
});
