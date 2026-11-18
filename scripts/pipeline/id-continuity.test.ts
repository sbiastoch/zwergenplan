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

/**
 * Befristete Ausnahme (Plan 0061, Schritt 2; ADR 0044 zu ADR 0041, Punkt 10): verworfene Dubletten gleicher Quelle,
 * deren ID der Build seit Plan 0061 (E1, ältere Fassung bleibt) gewollt verliert, je mit der Partner-ID, die bleibt.
 * Bewusst eine feste Liste statt einer Regel über `sameOfferTwice`: Die Ausnahme darf sich nicht auf die Funktion
 * stützen, die der Test überwacht. Entfällt mit dem Neueinfrieren nach dem ersten Nachtlauf mit Plan 0061, Etappe 1.
 */
const EXPECTED_DUPLICATE_LOSSES: ReadonlyArray<readonly [lost: string, partner: string]> = [
  ["j9onxbbk", "yjra3gp9"], // Achtsame Babymassage 6 Wochen–5 Monate, Mo 11:00 (Familienbox)
  ["4ipjvk1y", "a1fqz31f"], // Babygymnastik 2–5 Monate, Di 12:00
  ["jlig0xtb", "da0wom76"], // Babygymnastik 5–8 Monate, Di 10:45
  ["9av43cgf", "uivdyj4b"], // Babymassage 0–4 Monate, Do 12:00
  ["yowa6a76", "4qcl8tkf"], // BabySinne 12–30 Monate, Di 9:30
  ["mkgtkrw7", "yu8gebuk"], // BabySinne 6–12 Monate, Di 10:30
  ["w1orp58q", "pbd2mt1t"], // Babyturnen 8–15 Monate, Do 9:30
  ["o4xo6513", "u6msbbr7"], // Babyturnen 8–15 Monate, Mi 10:45 (Anlass des Plans)
  ["oprewsns", "f27vtp28"], // Babyturnen 8–15 Monate, Mo 10:45
  ["1e7vjtwz", "w2yqks2g"], // Babyturnen 8–18 Monate, Di 14:45
  ["xmqdby2y", "rb6gyhs5"], // Beckenboden Mama-Baby-Yoga, Fr 10:30
  ["pjurpnqq", "ja800eov"], // Kleinkindturnen 12–36 Monate, Do 10:45
  ["89ctcvmc", "9h4opmvn"], // Kleinkindturnen 12–36 Monate, Di 9:30
  ["n3i6wtqq", "r0ypsyq0"], // Kleinkindturnen 12–36 Monate, Mo 9:30
  ["cxiojojy", "mqpa27ka"], // Kleinkindturnen 18–36 Monate, Di 16:00
  ["7zsydjdc", "ogcteqdd"], // Musikalische Früherziehung 1–3 Jahre, Mo 16:30
  ["lexg976t", "4lgay38d"], // Musikalische Früherziehung 6–12 Monate, Mi 10:30
  ["cyqagasm", "lmg8yj5q"], // Musikalische Früherziehung 9–15 Monate, Mi 9:30
  ["8knnhep1", "rz2wvnyl"], // Zumbini 0–4 Jahre, Di 14:00
  ["npwglq1a", "n71txrp8"], // Zumbini 0–4 Jahre, Di 15:00
  ["natqt72s", "gmjhemwu"], // Mini-Club Passionskirche, Do 9:00 (ev-langwasser-miniclubs)
  ["nk3e706i", "gmjhemwu"], // dasselbe, dritte Fassung
];

/**
 * IDs aus `expected`, die `built` nicht beim selben Anbieter hat, lesbar für die Fehlermeldung. Ausgenommen ist ein
 * Verlust aus `allowed`, wenn dessen Partner beim selben Anbieter in `built` steht.
 */
function lost(
  expected: readonly Offer[],
  built: readonly Offer[],
  allowed: ReadonlyArray<readonly [string, string]> = EXPECTED_DUPLICATE_LOSSES,
): string[] {
  const owner = new Map(built.map((o) => [o.id, o.providerId] as const));
  const partner = new Map(allowed);
  return expected
    .filter((o) => owner.get(o.id) !== o.providerId)
    .filter((o) => {
      const p = partner.get(o.id);
      return p === undefined || owner.has(o.id) || owner.get(p) !== o.providerId;
    })
    .map((o) => `${o.id} ${o.providerId} „${o.title}“${owner.has(o.id) ? ` (jetzt bei ${owner.get(o.id)})` : ""}`);
}

describe("Ausnahmeliste der ID-Kontinuität (Plan 0061, Schritt 2)", () => {
  const [sample] = offers("offers.json.gz").offers;
  if (sample === undefined) throw new Error("Fixture ohne Angebot");
  const offer = (id: string, providerId = "anbieter-a"): Offer => ({ ...sample, id, providerId });
  it("nimmt nur gelistete Verluste aus, und nur, wenn der Partner beim selben Anbieter bleibt", () => {
    const allowed = [["aaaaaaaa", "bbbbbbbb"]] as const;
    const expected = [offer("aaaaaaaa"), offer("cccccccc")];
    // gelistet, Partner da: kein Befund; ein künstlicher Verlust außerhalb der Liste bleibt rot
    expect(lost(expected, [offer("bbbbbbbb")], allowed).map((l) => l.slice(0, 8))).toEqual(["cccccccc"]);
    // Partner fehlt oder wechselte den Anbieter: rot
    expect(lost([offer("aaaaaaaa")], [], allowed)).toHaveLength(1);
    expect(lost([offer("aaaaaaaa")], [offer("bbbbbbbb", "anbieter-b")], allowed)).toHaveLength(1);
    // die ID selbst wechselt den Anbieter: rot, auch wenn gelistet
    expect(lost([offer("aaaaaaaa")], [offer("aaaaaaaa", "anbieter-b"), offer("bbbbbbbb")], allowed)).toHaveLength(1);
  });
});

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
