import { describe, expect, it } from "vitest";
import { shortId } from "../../../src/domain/ids.ts";
import type { Offer, OffersFile, Session } from "../../../src/domain/schema.ts";
import { loadFixtures, rawFixtures } from "../../../src/domain/test-fixtures.ts";
import {
  assignIds,
  checkIdContinuity,
  type Draft,
  keyOf,
  LegacyOffersFile,
  migrateCatalogIds,
  migrateIds,
  migrateOfferIds,
  SAME_DAYS,
  SAME_SESSIONS,
} from "./stable-ids.ts";

const { providers, file: fixtures } = loadFixtures();
const HORIZON = { from: "2026-10-05", to: "2027-02-05" };

/** Termine an Berliner Tagen zur Uhrzeit `time`, 60 Minuten lang (Offset nach Sommer-/Winterzeit 2026/27). */
function at(days: readonly string[], time = "09:30"): Session[] {
  const [h, m] = time.split(":") as [string, string];
  const endHour = String(Number(h) + 1).padStart(2, "0");
  return days.map((d) => {
    const offset = d >= "2026-10-25" && d < "2027-03-28" ? "+01:00" : "+02:00";
    return { start: `${d}T${h}:${m}:00${offset}`, end: `${d}T${endHour}:${m}:00${offset}` };
  });
}

/** Wöchentlich ab `first` (YYYY-MM-DD), `count` Termine. */
function weekly(first: string, count: number): string[] {
  const start = Date.parse(`${first}T12:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10));
}

const draft = (over: Partial<Draft> = {}): Draft => ({
  providerId: "turnverein-beispiel",
  venueId: "turnverein-beispiel-halle",
  title: "PEKiP (Di 9:30)",
  summary: "Bewegung und Spiel für Babys.",
  topics: ["pekip"],
  format: "regelmaessig",
  registration: "mit-anmeldung",
  cost: "kostenpflichtig",
  sessions: at(weekly("2026-10-06", 10)),
  availability: { status: "frei", checkedAt: "2026-10-05T05:00:00+02:00" },
  url: "https://example.org/turnverein",
  sourceUrl: "https://example.org/turnverein",
  ...over,
});
const old = (id: string, over: Partial<Draft> = {}): Offer => ({ id, ...draft(over) });
const prev = (offers: Offer[], horizon = HORIZON): OffersFile => ({
  generatedAt: "2026-10-05T06:00:00+02:00",
  horizon,
  offers,
});
const run = (drafts: Draft[], previous: OffersFile | undefined, horizon = HORIZON) =>
  assignIds({ drafts, previous, providers, horizon });
const idOf = (r: ReturnType<typeof run>, title: string) => r.offers.find((o) => o.title === title)?.id;

describe("assignIds – Stufe 0", () => {
  it("unveränderter Bestand behält alle IDs", () => {
    const drafts = fixtures.offers.map(({ id: _id, ...d }) => d);
    const r = assignIds({ drafts, previous: fixtures, providers, horizon: fixtures.horizon });
    expect(r.offers.map((o) => o.id).sort()).toEqual(fixtures.offers.map((o) => o.id).sort());
    expect(r.notes[0]).toBe(
      `IDs: ${fixtures.offers.length} gleicher Schlüssel, 0 gleiche Termine, 0 ähnlicher Titel, 0 neu, 0 weggefallen`,
    );
  });
});

describe("assignIds – Stufe 1: gleiche Termine", () => {
  it("hält die ID bei neuem Titel", () => {
    const r = run([draft({ title: "Bewegungsgruppe für Babys" })], prev([old("aaaaaaaa")]));
    expect(r.offers[0]?.id).toBe("aaaaaaaa");
    expect(r.notes.join("\n")).toContain("IDs: Stufe 1 aaaaaaaa „PEKiP (Di 9:30)“ → „Bewegungsgruppe für Babys“");
  });

  it("fragt das Format nicht ab (kurs → regelmäßig bei gleichen Terminen)", () => {
    const r = run(
      [draft({ title: "Babyturnen", format: "regelmaessig" })],
      prev([old("aaaaaaaa", { format: "kurs" })]),
    );
    expect(r.offers[0]?.id).toBe("aaaaaaaa");
  });

  it("erlaubt einen anderen Ort nur, wenn der alte nicht mehr im Katalog steht", () => {
    const gone = run([draft({ title: "Babyturnen" })], prev([old("aaaaaaaa", { venueId: "alte-halle" })]));
    expect(gone.offers[0]?.id).toBe("aaaaaaaa");
    const other = run(
      [draft({ title: "Babyturnen" })],
      prev([old("aaaaaaaa", { venueId: "turnverein-beispiel-gymnastik" })]),
    );
    expect(other.offers[0]?.id).not.toBe("aaaaaaaa");
  });

  it("verlangt den gleichen Anbieter", () => {
    const r = run(
      [draft({ title: "Babyturnen" })],
      prev([old("aaaaaaaa", { providerId: "familientreff-beispiel", venueId: "familientreff-beispiel-haus" })]),
    );
    expect(r.offers[0]?.id).not.toBe("aaaaaaaa");
  });

  it("vertauscht nie: zwei Angebote mit identischen Terminen ändern beide den Titel", () => {
    const previous = prev([
      old("aaaaaaaa", { title: "Kleinkindturnen nach Pikler (12–36 Monate, Mo 16:30)" }),
      old("bbbbbbbb", { title: "Musikalische Früherziehung (1–3 Jahre, Mo 16:30)" }),
    ]);
    const r = run([draft({ title: "Pikler-Turnen" }), draft({ title: "Singen und Tanzen" })], previous);
    expect(idOf(r, "Pikler-Turnen")).not.toBe("bbbbbbbb");
    expect(idOf(r, "Singen und Tanzen")).not.toBe("aaaaaaaa");
    expect(r.notes.join("\n")).toContain("mehrdeutig in Stufe 1");
    // Stufe 2 darf es erneut versuchen: Pikler ↔ Pikler ist dort der einzige Kandidat
    expect(idOf(r, "Pikler-Turnen")).toBe("aaaaaaaa");
  });

  it("Titel-Widerspruch: rückt ein Angebot auf den frei gewordenen Platz der Schwester, erbt es nicht deren ID", () => {
    const days = weekly("2026-10-06", 10);
    const previous = prev([
      old("aaaaaaaa", { title: "Babyturnen nach Pikler (Di 14:45)", sessions: at(days, "14:45") }),
      old("bbbbbbbb", { title: "Zumbini (Di 15:00)", sessions: at(days, "15:00") }),
    ]);
    const r = run(
      [
        draft({ title: "Babyturnen nach Pikler", sessions: at(days, "15:00") }),
        draft({ title: "Zumbini", sessions: at(days, "15:15") }),
      ],
      previous,
    );
    expect(idOf(r, "Babyturnen nach Pikler")).toBe("aaaaaaaa"); // Stufe 2, nicht Zumbinis ID aus Stufe 1
    expect(idOf(r, "Zumbini")).toBe("bbbbbbbb");
  });

  it("Titel-Widerspruch gilt auch, wenn die Schwester schon zugeordnet ist (Arch-Review M1)", () => {
    const days = weekly("2026-10-06", 10);
    const previous = prev([
      old("aaaaaaaa", { title: "Zumbini (Di 15:00)", sessions: at(days, "15:00") }),
      old("bbbbbbbb", { title: "Babyturnen nach Pikler (Di 14:45)", sessions: at(days, "14:45") }),
    ]);
    // Zumbini entfällt, eine zweite Pikler-Gruppe übernimmt seinen Platz
    const r = run(
      [
        draft({ title: "Babyturnen nach Pikler", sessions: at(days, "14:45") }),
        draft({ title: "Babyturnen nach Pikler 2", sessions: at(days, "15:00") }),
      ],
      previous,
    );
    expect(idOf(r, "Babyturnen nach Pikler")).toBe("bbbbbbbb");
    expect(idOf(r, "Babyturnen nach Pikler 2")).not.toBe("aaaaaaaa");
  });

  it("gibt die ID eines entfallenen Angebots nicht an seine Schwester mit gleichen Terminen weiter (Review B2)", () => {
    const previous = prev([
      old("aaaaaaaa", { title: "Kleinkindturnen nach Pikler" }),
      old("bbbbbbbb", { title: "Musikalische Früherziehung" }),
    ]);
    const kept = run([draft({ title: "Musikalische Früherziehung" })], previous);
    expect(kept.offers.map((o) => o.id)).toEqual(["bbbbbbbb"]);
    const renamed = run([draft({ title: "Singen und Tanzen" })], previous);
    expect(renamed.offers[0]?.id).not.toBe("aaaaaaaa");
  });

  it("beschneidet beide Seiten auf das gemeinsame Fenster (Review M1)", () => {
    // Vorstand bis 05.02., Lauf vier Wochen später bis 02.03.: ohne Beschnitt T = 13/17 < 0,8
    const before = old("aaaaaaaa", { sessions: at(weekly("2026-10-06", 18)) });
    const later = { from: "2026-11-02", to: "2027-03-02" };
    const r = run([draft({ title: "Babyturnen", sessions: at(weekly("2026-11-03", 18)) })], prev([before]), later);
    expect(r.offers[0]?.id).toBe("aaaaaaaa");
  });

  it("Schwelle: T = 0,8 trifft, knapp darunter nicht", () => {
    expect(SAME_SESSIONS).toBe(0.8);
    const days = weekly("2026-10-06", 5);
    const previous = prev([old("aaaaaaaa", { title: "Alpha", sessions: at(days) })]);
    expect(run([draft({ title: "Zeta", sessions: at(days.slice(0, 4)) })], previous).offers[0]?.id).toBe("aaaaaaaa");
    const below = at([...days.slice(0, 4), "2026-11-10"]);
    expect(run([draft({ title: "Zeta", sessions: below })], previous).offers[0]?.id).not.toBe("aaaaaaaa");
  });
});

describe("assignIds – Stufe 2: ähnlicher Titel, gleiche Tage", () => {
  const days = weekly("2026-10-06", 10);
  const groups = prev([
    old("aaaaaaaa", { title: "PEKiP (Di 9:30)", sessions: at(days, "09:30") }),
    old("bbbbbbbb", { title: "PEKiP (Di 11:30)", sessions: at(days, "11:30") }),
  ]);

  it("hält die ID bei neuer Uhrzeit, während die Schwestergruppe unverändert bleibt", () => {
    const r = run(
      [
        draft({ title: "PEKiP (Di 9:45)", sessions: at(days, "09:45") }),
        draft({ title: "PEKiP (Di 11:30)", sessions: at(days, "11:30") }),
      ],
      groups,
    );
    expect(idOf(r, "PEKiP (Di 11:30)")).toBe("bbbbbbbb"); // Stufe 0
    expect(idOf(r, "PEKiP (Di 9:45)")).toBe("aaaaaaaa"); // Stufe 2
    expect(r.notes[0]).toBe("IDs: 1 gleicher Schlüssel, 0 gleiche Termine, 1 ähnlicher Titel, 0 neu, 0 weggefallen");
  });

  it("nur als einziger Kandidat: Ändern beide Gruppen Titel und Uhrzeit, gibt es keinen Treffer (Review M2)", () => {
    const r = run(
      [
        draft({ title: "PEKiP-Gruppe A (Di 9:45)", sessions: at(days, "09:45") }),
        draft({ title: "PEKiP-Gruppe B (Di 11:45)", sessions: at(days, "11:45") }),
      ],
      groups,
    );
    expect(r.offers.map((o) => o.id)).not.toContain("aaaaaaaa");
    expect(r.offers.map((o) => o.id)).not.toContain("bbbbbbbb");
    expect(r.notes.join("\n")).toContain("mehrdeutig in Stufe 2");
  });

  it("Schwelle: D = 0,5 trifft, knapp darunter nicht", () => {
    expect(SAME_DAYS).toBe(0.5);
    const four = weekly("2026-10-06", 4);
    const previous = prev([old("aaaaaaaa", { sessions: at(four, "09:30") })]);
    const hit = run([draft({ title: "PEKiP (Di 10:00)", sessions: at(four.slice(0, 2), "10:00") })], previous);
    expect(hit.offers[0]?.id).toBe("aaaaaaaa");
    const miss = run(
      [draft({ title: "PEKiP (Di 10:00)", sessions: at([...four.slice(0, 2), "2026-12-01"], "10:00") })],
      previous,
    );
    expect(miss.offers[0]?.id).not.toBe("aaaaaaaa");
  });

  it("verlangt das gleiche Format", () => {
    const previous = prev([old("aaaaaaaa", { format: "kurs" })]);
    const r = run(
      [draft({ title: "PEKiP (Di 10:00)", format: "regelmaessig", sessions: at(days, "10:00") })],
      previous,
    );
    expect(r.offers[0]?.id).not.toBe("aaaaaaaa");
  });
});

describe("assignIds – Kurse", () => {
  const kurs = { format: "kurs" as const, title: "PEKiP" };
  const from = { from: "2026-10-12", to: "2027-02-12" };

  it("laufender Kurs: Entwurf nur mit künftigen Terminen behält die ID, nur vergangene Termine kommen dazu", () => {
    const previous = prev([
      old("aaaaaaaa", { ...kurs, sessions: at(["2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20"]) }),
    ]);
    // 20.10. abgesagt, 27.10. neu
    const r = run([draft({ ...kurs, sessions: at(["2026-10-13", "2026-10-27"]) })], previous, from);
    expect(r.offers[0]?.id).toBe("aaaaaaaa");
    expect(r.offers[0]?.sessions.map((s) => s.start.slice(0, 10))).toEqual([
      "2026-09-29",
      "2026-10-06",
      "2026-10-13",
      "2026-10-27",
    ]);
    expect(r.notes.join("\n")).toContain("aaaaaaaa: Kurs fortgeschrieben (2 vergangene Termine)");
  });

  it("Folgekurs mit gleichem Titel und Wochentag nach Kursende bekommt eine neue ID", () => {
    const previous = prev([old("aaaaaaaa", { ...kurs, sessions: at(weekly("2026-09-01", 6)) })]);
    const r = run([draft({ ...kurs, sessions: at(weekly("2026-10-13", 6)) })], previous, from);
    expect(r.offers[0]?.id).not.toBe("aaaaaaaa");
    expect(r.offers[0]?.sessions).toHaveLength(6);
  });
});

describe("assignIds – Teilung und neue IDs", () => {
  it("Teilung: einer behält die ID, der andere wird neu, mit Hinweis", () => {
    const tueThu = [...weekly("2026-10-06", 6), ...weekly("2026-10-08", 6)].sort();
    const previous = prev([old("aaaaaaaa", { title: "Babyturnen", sessions: at(tueThu) })]);
    const r = run(
      [
        draft({ title: "Babyturnen", sessions: at(tueThu) }),
        draft({ title: "Babyturnen dienstags", sessions: at(weekly("2026-10-06", 6)) }),
      ],
      previous,
    );
    expect(idOf(r, "Babyturnen")).toBe("aaaaaaaa");
    expect(idOf(r, "Babyturnen dienstags")).not.toBe("aaaaaaaa");
    expect(r.notes.join("\n")).toContain("IDs: geteilt? aaaaaaaa bleibt bei „Babyturnen“, neu: „Babyturnen dienstags“");
  });

  it("neue ID: shortId(Schlüssel, 0), bei belegter ID der nächste seed; unabhängig von der Reihenfolge", () => {
    const a = draft({ title: "Neu A", sessions: at(weekly("2026-10-05", 3)) });
    const b = draft({ title: "Neu B", sessions: at(weekly("2026-10-07", 3)) });
    expect(run([a], undefined).offers[0]?.id).toBe(shortId(keyOf(a), 0));
    // ein fremdes Angebot im Vorstand belegt shortId(key(a), 0)
    const blocker = old(shortId(keyOf(a), 0), {
      providerId: "familientreff-beispiel",
      venueId: "familientreff-beispiel-haus",
      title: "Etwas ganz anderes",
      sessions: at(["2026-12-24"]),
    });
    const first = run([a, b], prev([blocker]));
    expect(idOf(first, "Neu A")).toBe(shortId(keyOf(a), 1));
    const second = run([b, a], prev([blocker]));
    expect(second.offers.map((o) => o.id).sort()).toEqual(first.offers.map((o) => o.id).sort());
    expect(idOf(second, "Neu A")).toBe(idOf(first, "Neu A"));
  });

  it("vergibt einer früher verschwundenen alten ID bei Rückkehr wieder ihre Kurz-ID (E15)", () => {
    const d = draft();
    expect(run([d], prev([])).offers[0]?.id).toBe(shortId(keyOf(d), 0));
  });

  it("meldet neue und weggefallene IDs je Anbieter", () => {
    const r = run([draft({ title: "Neu", sessions: at(["2026-12-01"]) })], prev([old("aaaaaaaa")]));
    expect(r.notes.join("\n")).toContain("IDs: turnverein-beispiel – 1 neu, 1 weggefallen");
  });
});

describe("checkIdContinuity", () => {
  it("meldet eine ID, die den Anbieter wechselt", () => {
    const before = prev([old("aaaaaaaa")]);
    expect(checkIdContinuity(before, [old("aaaaaaaa")])).toEqual([]);
    expect(checkIdContinuity(before, [old("aaaaaaaa", { providerId: "familientreff-beispiel" })])).toEqual([
      "ID aaaaaaaa wechselt den Anbieter: turnverein-beispiel → familientreff-beispiel (Fehler in der Zuordnung)",
    ]);
    expect(checkIdContinuity(undefined, [old("aaaaaaaa")])).toEqual([]);
  });
});

describe("migrateOfferIds (E17)", () => {
  const legacy = LegacyOffersFile.parse({
    ...fixtures,
    offers: fixtures.offers.map((o, i) => ({ ...o, id: `alt--angebot-${i}--ort` })),
  });

  it("setzt shortId(alt, 0) je Angebot und sortiert", () => {
    const out = migrateOfferIds(legacy);
    expect(out.offers.map((o) => o.id).sort()).toEqual(legacy.offers.map((o) => shortId(o.id, 0)).sort());
    const order = out.offers.map((o) => `${o.providerId} ${o.title}`);
    expect(order).toEqual([...order].sort((a, b) => a.split(" ")[0]?.localeCompare(b.split(" ")[0] ?? "") || 0));
  });

  it("bricht bei Kollision und bei schon migrierter Datei ab", () => {
    expect(() => migrateOfferIds(legacy, () => "kollisio")).toThrow("Kollision");
    expect(() => migrateOfferIds(LegacyOffersFile.parse(fixtures))).toThrow("schon migriert");
  });
});

describe("migrateCatalogIds (E17)", () => {
  const catalog = `# Kommentar oben
- id: anbieter-eins
  role: anbieter
  name: "Eins" # Kommentar am Wert
  topics: [ pekip, musik ]
  notes:
    - erste Notiz
    - zweite Notiz
- id: kalender
  role: aggregator
  name: Kalender
- id: anbieter-zwei
  role: anbieter
  geo: { lat: 49.4, lon: 11.0 }
`;

  it("setzt publicId direkt nach id, nur bei Anbietern, und ändert sonst keine Zeile", () => {
    const out = migrateCatalogIds(catalog);
    const added = out.split("\n").filter((l) => !catalog.split("\n").includes(l));
    expect(added).toEqual([`  publicId: ${shortId("anbieter-eins", 0)}`, `  publicId: ${shortId("anbieter-zwei", 0)}`]);
    expect(out.split("\n")[2]).toBe(`  publicId: ${shortId("anbieter-eins", 0)}`);
    expect(out).toContain("topics: [ pekip, musik ]");
    expect(out).toContain("    - erste Notiz");
  });

  it("bricht ab bei Kollision, vorhandener publicId und Katalog-ID in Kurzform", () => {
    expect(() => migrateCatalogIds(catalog, () => "kollisio")).toThrow("Kollision");
    expect(() => migrateCatalogIds(migrateCatalogIds(catalog))).toThrow("hat schon eine publicId");
    expect(() => migrateCatalogIds("- id: abcd1234\n  role: anbieter\n")).toThrow("Form einer Kurz-ID");
  });
});

describe("migrateIds", () => {
  it("prüft das Ergebnis mit validateDataset", () => {
    const raw = rawFixtures();
    expect(() => migrateIds(raw.offers, "[]", () => raw.providers)).toThrow();
  });
});
