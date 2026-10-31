/**
 * ID-Kontinuität des Build-Codes (Plan 0049, Nachtrag 2, B7; ADR 0022). Eingefroren ist der letzte Nachtlauf:
 * `data/raw`, Katalog, freie Tage, `today`, `generatedAt`, sein Vorstand und sein Ergebnis. Der Test baut mit
 * derselben Funktion wie der Nachtlauf (`buildFromState`). Verliert der Build bei gleicher Eingabe eine ID mit
 * künftigem Termin, hat eine Änderung an `lib/build-offers.ts`, `lib/stable-ids.ts`, `lib/units.ts`,
 * `lib/similar.ts` usw. Merklisten auf den Geräten gebrochen. Fixture neu: `node scripts/pipeline/freeze-id-continuity.ts`.
 */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { z } from "zod";
import { type Offer, OffersFile, ProvidersFile } from "../../src/domain/schema.ts";
import { berlinIsoDate } from "../../src/domain/time.ts";
import { buildFromState } from "./lib/build-offers.ts";
import { ProviderRaw } from "./lib/raw.ts";

const DIR = new URL("./fixtures/id-continuity/", import.meta.url);
const gz = (name: string) => gunzipSync(readFileSync(new URL(name, DIR))).toString("utf8");
const meta = z
  .object({ today: z.string(), generatedAt: z.string() })
  .parse(JSON.parse(readFileSync(new URL("meta.json", DIR), "utf8")));
const offers = (name: string) => OffersFile.parse(JSON.parse(gz(name)));

/**
 * Eigenes Zeitlimit: Ein Build über alle Anbieter samt Abgleich der Einheiten braucht rund 1,2 s CPU; unter der Last
 * paralleler Sessions risse er die Standardgrenze von 5 s (CLAUDE.md, Stolperfallen).
 */
const BUILD_TIMEOUT_MS = 30_000;
const HINT = "gewollt? Fixture neu einfrieren und im Commit begründen (Plan 0049, Nachtrag 2, B7)";

/** Eingabe des Laufs, einmal gelesen und geprüft für beide Fälle */
const input = {
  raws: z.record(z.string(), ProviderRaw).parse(JSON.parse(gz("raw.json.gz"))),
  catalog: ProvidersFile.parse(parse(gz("providers.yaml.gz"))),
  freeDays: z.record(z.string(), z.string()).parse(JSON.parse(gz("free-days.json.gz"))),
};

function build(previous: OffersFile): Offer[] {
  const { file, report } = buildFromState({
    ...input,
    previous,
    today: meta.today,
    generatedAt: meta.generatedAt,
    sources: {},
  });
  expect(report.errors).toEqual([]);
  return file?.offers ?? [];
}

const future = (o: Offer) => o.sessions.some((s) => berlinIsoDate(s.start) >= meta.today);

/** IDs aus `expected`, die `built` nicht beim selben Anbieter hat, lesbar für die Fehlermeldung */
function lost(expected: readonly Offer[], built: readonly Offer[]): string[] {
  const owner = new Map(built.map((o) => [o.id, o.providerId] as const));
  return expected
    .filter((o) => owner.get(o.id) !== o.providerId)
    .map((o) => `${o.id} ${o.providerId} „${o.title}“${owner.has(o.id) ? ` (jetzt bei ${owner.get(o.id)})` : ""}`);
}

describe("ID-Kontinuität des Build-Codes (Plan 0049, Nachtrag 2, B7)", () => {
  it(
    "Fixpunkt: mit dem Ergebnis des Laufs als Vorstand bleibt jede ID mit Termin ab today",
    () => {
      const after = offers("offers.json.gz");
      const missing = lost(after.offers.filter(future), build(after));
      expect(missing, `${missing.length} IDs mit künftigem Termin verloren – ${HINT}`).toEqual([]);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "Nachtlauf nachgebaut: jede ID, die der Lauf mit Termin ab today aus dem Vorstand übernahm, bleibt",
    () => {
      // Der Vorstand des Laufs schöpft die Zuordnung aus (Stufen 1 und 2, Schwellen); der Fixpunkt träfe nur Stufe 0
      const before = offers("offers-before.json.gz");
      const kept = new Set(before.offers.map((o) => o.id));
      const expected = offers("offers.json.gz").offers.filter((o) => kept.has(o.id) && future(o));
      const missing = lost(expected, build(before));
      expect(missing, `${missing.length} IDs mit künftigem Termin verloren – ${HINT}`).toEqual([]);
    },
    BUILD_TIMEOUT_MS,
  );
});
