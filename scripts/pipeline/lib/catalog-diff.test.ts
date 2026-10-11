import { describe, expect, it } from "vitest";
import { catalogDiff } from "./catalog-diff.ts";

const a = { id: "a", name: "A", venues: [{ id: "a", geo: { lat: 1, lon: 2 } }] };
const b = { id: "b", name: "B", notes: ["x"] };

describe("catalogDiff (Plan 0032, E7 G2)", () => {
  it("unverändert: ok, nichts neu", () => {
    expect(catalogDiff([a, b], [a, b])).toEqual({ ok: true, added: [] });
  });

  it("neue Einträge am Ende: ok mit ihren IDs", () => {
    const c = { id: "c", name: "C" };
    const d = { id: "d", name: "D" };
    expect(catalogDiff([a, b], [a, b, c, d])).toEqual({ ok: true, added: ["c", "d"] });
  });

  it("Schlüsselreihenfolge zählt nicht, Werte schon", () => {
    expect(catalogDiff([a], [{ name: "A", venues: a.venues, id: "a" }])).toEqual({ ok: true, added: [] });
  });

  it("geändertes Feld eines bestehenden Eintrags bricht ab", () => {
    const r = catalogDiff([a, b], [a, { ...b, name: "B neu" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/b.*geändert/);
  });

  it("verschachtelte Änderung (Koordinate) bricht ab", () => {
    const moved = { ...a, venues: [{ id: "a", geo: { lat: 1, lon: 3 } }] };
    expect(catalogDiff([a], [moved]).ok).toBe(false);
  });

  it("neue Notiz an einem bestehenden Eintrag bricht ab", () => {
    expect(catalogDiff([b], [{ ...b, notes: ["x", "y"] }]).ok).toBe(false);
  });

  it("entfernter Eintrag bricht ab", () => {
    const r = catalogDiff([a, b], [a]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/b.*entfernt/);
  });

  it("umsortierte Einträge brechen ab", () => {
    expect(catalogDiff([a, b], [b, a]).ok).toBe(false);
  });

  it("neuer Eintrag mit vorhandener ID bricht ab", () => {
    const r = catalogDiff([a, b], [a, b, { id: "a", name: "A2" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/doppelt/);
  });

  it("neuer Eintrag ohne ID bricht ab", () => {
    expect(catalogDiff([a], [a, { name: "ohne" }]).ok).toBe(false);
  });

  it("kein Array: bricht ab", () => {
    expect(catalogDiff([a], { a }).ok).toBe(false);
    expect(catalogDiff(null, [a]).ok).toBe(false);
  });
});
