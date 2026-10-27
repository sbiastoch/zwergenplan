import { describe, expect, it } from "vitest";
import { shortId } from "../../../src/domain/ids.ts";
import type { Offer, OffersFile, Session } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import {
  assignIds,
  checkIdContinuity,
  type Draft,
  keyOf,
  SAME_DAYS,
  SAME_SESSIONS,
  SAME_SOURCE_SESSIONS,
  sameOfferTwice,
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
  category: "babykurse",
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

describe("sameOfferTwice (Plan 0038, E1)", () => {
  const { from } = HORIZON;
  const twin = (over: Partial<Draft> = {}) => draft({ title: "PEKiP-Gruppe (Babys, dienstags)", ...over });

  it("erkennt ein Angebot in zwei Fassungen", () => {
    expect(sameOfferTwice(draft(), twin(), from)).toBe(true);
    expect(sameOfferTwice(twin(), draft(), from)).toBe(true);
    expect(
      sameOfferTwice(
        draft({ age: { minMonths: 0, maxMonths: 12 } }),
        twin({ age: { minMonths: 7, maxMonths: 10 } }),
        from,
      ),
    ).toBe(true);
  });

  it("verlangt gleichen Anbieter, Ort, Format, verträgliches Alter und Kerntitel", () => {
    expect(sameOfferTwice(draft(), twin({ providerId: "familientreff-beispiel" }), from)).toBe(false);
    expect(sameOfferTwice(draft(), twin({ venueId: "turnverein-beispiel-gymnastik" }), from)).toBe(false);
    expect(sameOfferTwice(draft(), twin({ format: "kurs" }), from)).toBe(false);
    expect(
      sameOfferTwice(
        draft({ age: { minMonths: 9, maxMonths: 15 } }),
        twin({ age: { minMonths: 12, maxMonths: 36 } }),
        from,
      ),
    ).toBe(false);
    expect(sameOfferTwice(draft(), twin({ title: "Musikgarten (Di 9:30)" }), from)).toBe(false);
    expect(sameOfferTwice(draft({ title: "PEKiP Gruppe A" }), twin({ title: "PEKiP Gruppe B" }), from)).toBe(false);
  });

  it("Schwelle: 80 % gleiche Beginnzeiten", () => {
    expect(SAME_SOURCE_SESSIONS).toBe(0.8);
    const days = weekly("2026-10-06", 10);
    // Jaccard 8/10 = 0,8: zwei Ferientage fehlen in der einen Fassung
    expect(sameOfferTwice(draft({ sessions: at(days) }), twin({ sessions: at(days.slice(0, 8)) }), from)).toBe(true);
    // 7/10 = 0,7
    expect(sameOfferTwice(draft({ sessions: at(days) }), twin({ sessions: at(days.slice(0, 7)) }), from)).toBe(false);
    // gleiche Tage, andere Uhrzeit: auf die Minute verschieden
    expect(sameOfferTwice(draft({ sessions: at(days) }), twin({ sessions: at(days, "10:30") }), from)).toBe(false);
  });

  it("vergangene Termine zählen nicht", () => {
    // 4 Termine vor `from` (08.–29.09.), 6 danach
    const days = weekly("2026-09-08", 10);
    const running = draft({ sessions: at(days) });
    // Laufender Kurs mit und ohne vergangene Termine: ab `from` gleich (über alle Termine nur 6/10)
    expect(sameOfferTwice(running, twin({ sessions: at(days.slice(4)) }), from)).toBe(true);
    // Nur die vergangenen Termine gleich, ab `from` verschieden
    const other = twin({ sessions: [...at(days.slice(0, 4)), ...at(days.slice(4), "11:00")] });
    expect(sameOfferTwice(running, other, from)).toBe(false);
    // Ohne Termin ab `from` keine Dublette
    expect(
      sameOfferTwice(draft({ sessions: at(days.slice(0, 4)) }), twin({ sessions: at(days.slice(0, 4)) }), from),
    ).toBe(false);
  });
});

describe("assignIds – Zwillinge und Stufe 2 mit erstem Termin (Plan 0038, E2/E3; ADR 0031)", () => {
  const fridays = weekly("2026-10-09", 10);
  const ids = (r: ReturnType<typeof run>) => r.offers.map((o) => o.id);
  const twinIds = ["aaaaaaaa", "bbbbbbbb"];
  /** Zwei Fassungen eines Angebots im Vorstand, ohne Zeitraum im Titel (sonst schlösse `conflictingLabels` mit aus). */
  const twins = (over: Partial<Draft> = {}) => [
    old("aaaaaaaa", { title: "PEKiP Fr 9:30", sessions: at(fridays), ...over }),
    old("bbbbbbbb", { title: "PEKiP-Gruppe (freitags)", sessions: at(fridays), ...over }),
  ];

  it("Test 9: Gleichstand unter Zwillingen – der titelähnlichere behält die ID, der andere fällt weg", () => {
    const previous = prev([
      old("aaaaaaaa", { title: "PEKiP Fr 9:30 (geb. Jan.–März)", sessions: at(fridays) }),
      old("bbbbbbbb", { title: "PEKiP-Gruppe (geb. Jan.–März, freitags)", sessions: at(fridays) }),
    ]);
    const r = run([draft({ title: "PEKiP-Gruppe (Babys geb. Jan.–März)", sessions: at(fridays) })], previous);
    expect(ids(r)).toEqual(["bbbbbbbb"]); // höhere `ratio`, obwohl die größere ID
    const notes = r.notes.join("\n");
    expect(notes).toContain(
      "IDs: Zwilling im Vorstand – aaaaaaaa „PEKiP Fr 9:30 (geb. Jan.–März)“ fällt weg, bbbbbbbb „PEKiP-Gruppe (geb. Jan.–März, freitags)“ bleibt",
    );
    expect(notes).toContain("IDs: Stufe 1 bbbbbbbb");
    expect(notes).not.toContain("mehrdeutig");
    expect(r.notes[0]).toBe("IDs: 0 gleicher Schlüssel, 1 gleiche Termine, 0 ähnlicher Titel, 0 neu, 1 weggefallen");
  });

  it("Test 10: gleiche Titelähnlichkeit – die kleinere ID, unabhängig von der Reihenfolge", () => {
    // gleicher Titel, eine Fassung ohne Alter: gleicher Fensterschlüssel, Stufe 0 greift nicht (zwei alte)
    const a = old("kkkkkkkk", { title: "PEKiP (Fr 9:30)", sessions: at(fridays) });
    const b = old("cccccccc", {
      title: "PEKiP (Fr 9:30)",
      sessions: at(fridays),
      age: { minMonths: 0, maxMonths: 12 },
    });
    const d = draft({ title: "PEKiP (Fr 9:30)", sessions: at(fridays) });
    const other = draft({ title: "Musikgarten", sessions: at(weekly("2026-10-07", 10), "16:00") });
    for (const r of [run([d, other], prev([a, b])), run([other, d], prev([b, a]))]) {
      expect(idOf(r, "PEKiP (Fr 9:30)")).toBe("cccccccc");
      expect(ids(r)).not.toContain("kkkkkkkk");
    }
  });

  it("Test 11: der unterlegene Zwilling bekommt in Stufe 2 nicht die Schwestergruppe (Review 1, B1)", () => {
    const sister = draft({ title: "PEKiP Fr 11:15 (Babys ab 6 Monaten)", sessions: at(fridays, "11:15") });
    // Treffer in Stufe 1 (neuer Titel) und in Stufe 0 (Titel eines Zwillings)
    for (const title of ["PEKiP-Gruppe (Babys, freitags)", "PEKiP Fr 9:30"]) {
      const r = run([draft({ title, sessions: at(fridays) }), sister], prev(twins()));
      expect(twinIds).toContain(idOf(r, title));
      expect(twinIds).not.toContain(idOf(r, sister.title));
      expect(r.notes.join("\n")).toContain("IDs: Zwilling im Vorstand");
    }
  });

  it("Test 11b: der unterlegene Zwilling trifft auch im nächsten Durchgang von Stufe 1 nichts (Review 2, Blocker 1)", () => {
    // Parallelkurs: anderer Kerntitel, aber `similarTitle`-ähnlich, 9 von 10 Terminen gleich (T = 0,9)
    const parallel = draft({ title: "Babymassage mit PEKiP-Elementen", sessions: at(fridays.slice(0, 9)) });
    for (const title of ["PEKiP-Gruppe (Babys, freitags)", "PEKiP Fr 9:30"]) {
      const r = run([draft({ title, sessions: at(fridays) }), parallel], prev(twins()));
      expect(twinIds).toContain(idOf(r, title));
      expect(twinIds).not.toContain(idOf(r, parallel.title));
      expect(r.notes.join("\n")).not.toContain("mehrdeutig in Stufe 1");
    }
  });

  it("Test 11c: Zwillinge mit veränderter Reihe – einer behält die ID über den ersten Termin (Review 2, Punkt 2)", () => {
    // 4 von 10 Tagen: Tage-Jaccard 0,4 < 0,5, aber gleicher erster Termin
    const r = run([draft({ title: "PEKiP am Freitag", sessions: at(fridays.slice(0, 4)) })], prev(twins()));
    expect(ids(r).filter((id) => twinIds.includes(id))).toHaveLength(1);
    expect(r.notes.join("\n")).toContain("IDs: Stufe 2");
    expect(r.notes.join("\n")).toContain("IDs: Zwilling im Vorstand");
  });

  it("Test 11d: zwei Fassungen mit verschiedenem Format sind keine Zwillinge und behalten beide ihre ID", () => {
    const previous = prev([
      old("aaaaaaaa", { title: "PEKiP Fr 9:30", format: "kurs", sessions: at(fridays) }),
      old("bbbbbbbb", { title: "PEKiP-Gruppe (freitags)", format: "regelmaessig", sessions: at(fridays) }),
    ]);
    const r = run(
      [
        draft({ title: "PEKiP Fr 9:30", format: "kurs", sessions: at(fridays) }),
        draft({ title: "PEKiP-Gruppe (Babys, freitags)", format: "regelmaessig", sessions: at(fridays) }),
      ],
      previous,
    );
    expect(idOf(r, "PEKiP Fr 9:30")).toBe("aaaaaaaa");
    expect(idOf(r, "PEKiP-Gruppe (Babys, freitags)")).toBe("bbbbbbbb");
  });

  it("Test 11e: Zwillinge mit Vorschlägen an verschiedene Entwürfe in Stufe 2 – beide mehrdeutig (Review 3, Major 4)", () => {
    // Zwillinge: 9 von 11 Freitagen gemeinsam (Jaccard 9/11 ≈ 0,82), erste Termine 09.10. und 16.10.
    const eleven = weekly("2026-10-09", 11);
    const previous = prev([
      old("aaaaaaaa", { title: "PEKiP Fr 9:30", sessions: at(eleven.slice(0, 10)) }),
      old("bbbbbbbb", { title: "PEKiP-Gruppe (freitags)", sessions: at(eleven.slice(1)) }),
    ]);
    // Je ein Einzeltermin am ersten Termin eines Zwillings: Stufe 2 nur über den ersten Termin
    const r = run(
      [
        draft({ title: "PEKiP Schnupperstunde", sessions: at(eleven.slice(0, 1)) }),
        draft({ title: "PEKiP Infotreffen", sessions: at(eleven.slice(1, 2)) }),
      ],
      previous,
    );
    expect(ids(r)).not.toContain("aaaaaaaa");
    expect(ids(r)).not.toContain("bbbbbbbb");
    expect(r.notes.join("\n")).toContain("mehrdeutig in Stufe 2");
  });

  it("Test 11e: dasselbe in einem Durchgang von Stufe 1 – beide Zwillinge gewinnen verschiedene Entwürfe", () => {
    // Zwillinge mit 9 gemeinsamen von 11 Terminen (9/11 ≈ 0,82). Zu d1 (9 gemeinsame) passen beide gleich gut (0,9),
    // A ist titelähnlicher; d2 ist genau B (T = 1). Ohne Regel träfen A → d1 und B → d2 im selben Durchgang.
    const eleven = weekly("2026-10-09", 11);
    const previous = prev([
      old("aaaaaaaa", { title: "PEKiP Fr 9:30", sessions: at(eleven.slice(0, 10)) }),
      old("bbbbbbbb", { title: "PEKiP-Gruppe (freitags)", sessions: at([...eleven.slice(0, 9), ...eleven.slice(10)]) }),
    ]);
    const r = run(
      [
        draft({ title: "PEKiP Fr 9:30 Uhr", sessions: at(eleven.slice(0, 9)) }),
        draft({ title: "PEKiP-Gruppe (Babys, freitags)", sessions: at([...eleven.slice(0, 9), ...eleven.slice(10)]) }),
      ],
      previous,
    );
    expect(ids(r)).not.toContain("aaaaaaaa");
    expect(ids(r)).not.toContain("bbbbbbbb");
    expect(r.notes.join("\n")).toContain("IDs: mehrdeutig in Stufe 1 – Zwilling aaaaaaaa");
  });

  it("Test 11e: ein Zwillingskonflikt aus Stufe 1 wird in Stufe 2 nicht doch entschieden (Arch-Review, Minor 1)", () => {
    // Wie oben, aber d2 ist nicht titelähnlich: Stufe 2 fände für A nur noch d1 und entschiede mit schwächeren Belegen,
    // welcher Entwurf das andere Angebot ist. Beide Zwillinge bleiben deshalb auch in Stufe 2 außen vor.
    const eleven = weekly("2026-10-09", 11);
    const previous = prev([
      old("aaaaaaaa", { title: "PEKiP Fr 9:30", sessions: at(eleven.slice(0, 10)) }),
      old("bbbbbbbb", { title: "PEKiP-Gruppe (freitags)", sessions: at([...eleven.slice(0, 9), ...eleven.slice(10)]) }),
    ]);
    const r = run(
      [
        draft({ title: "PEKiP Fr 9:30 Uhr", sessions: at(eleven.slice(0, 9)) }),
        draft({ title: "Babymassage am Freitag", sessions: at([...eleven.slice(0, 9), ...eleven.slice(10)]) }),
      ],
      previous,
    );
    expect(ids(r)).not.toContain("aaaaaaaa");
    expect(ids(r)).not.toContain("bbbbbbbb");
    expect(r.notes.join("\n")).toContain("IDs: mehrdeutig in Stufe 1 – Zwilling aaaaaaaa");
    expect(r.notes.join("\n")).not.toContain("Stufe 2 aaaaaaaa");
  });

  it("Test 12: keine Zwillinge bei unverträglichem Alter – weiter mehrdeutig", () => {
    const r = run(
      [draft({ title: "PEKiP-Gruppe (Babys, freitags)", sessions: at(fridays) })],
      prev([
        old("aaaaaaaa", { title: "PEKiP Fr 9:30", sessions: at(fridays), age: { minMonths: 9, maxMonths: 15 } }),
        old("bbbbbbbb", {
          title: "PEKiP-Gruppe (freitags)",
          sessions: at(fridays),
          age: { minMonths: 12, maxMonths: 36 },
        }),
      ]),
    );
    expect(ids(r)).not.toContain("aaaaaaaa");
    expect(ids(r)).not.toContain("bbbbbbbb");
    expect(r.notes.join("\n")).toContain("mehrdeutig in Stufe 1");
    expect(r.notes.join("\n")).not.toContain("Zwilling");
  });

  describe("Stufe 2 mit erstem Termin", () => {
    const kurs = { format: "kurs" as const };
    const sundays = (first: string) => at(weekly(first, 8), "10:00");

    it("Test 13: gleicher erster Termin hält die ID einer gewachsenen Reihe, ohne Vertauschung", () => {
      const previous = prev([
        old("aaaaaaaa", { ...kurs, title: "Babyschwimmen, Start 08.11.", sessions: at(["2026-11-08"], "10:00") }),
        old("bbbbbbbb", { ...kurs, title: "Babyschwimmen, Start 10.01.", sessions: at(["2027-01-10"], "10:00") }),
      ]);
      const r = run(
        [
          draft({ ...kurs, title: "Babyschwimmen (So ab 08.11.)", sessions: sundays("2026-11-08") }),
          draft({ ...kurs, title: "Babyschwimmen (So ab 10.01.)", sessions: sundays("2027-01-10") }),
        ],
        previous,
      );
      expect(idOf(r, "Babyschwimmen (So ab 08.11.)")).toBe("aaaaaaaa");
      expect(idOf(r, "Babyschwimmen (So ab 10.01.)")).toBe("bbbbbbbb");
      expect(r.notes[0]).toBe("IDs: 0 gleicher Schlüssel, 0 gleiche Termine, 2 ähnlicher Titel, 0 neu, 0 weggefallen");
    });

    it("Test 13: alter Einzeltermin als `einmalig` → neue ID (Format verschieden)", () => {
      const previous = prev([
        old("aaaaaaaa", {
          format: "einmalig",
          title: "Babyschwimmen, Start 08.11.",
          sessions: at(["2026-11-08"], "10:00"),
        }),
      ]);
      const r = run(
        [draft({ ...kurs, title: "Babyschwimmen (So ab 08.11.)", sessions: sundays("2026-11-08") })],
        previous,
      );
      expect(ids(r)).not.toContain("aaaaaaaa");
    });

    it("Test 14: ohne Termin im Fenster auf beiden Seiten kein Treffer über den ersten Termin (Review M3)", () => {
      // Vorstand bis 31.10., Lauf ab 12.10.: alter Kurs endet vor dem 12.10., der neue beginnt nach dem 31.10.
      const previous = prev([old("aaaaaaaa", { ...kurs, title: "PEKiP", sessions: at(weekly("2026-09-01", 6)) })], {
        from: "2026-08-01",
        to: "2026-10-31",
      });
      const r = run([draft({ ...kurs, title: "PEKiP", sessions: at(weekly("2026-11-10", 6)) })], previous, {
        from: "2026-10-12",
        to: "2027-02-12",
      });
      expect(ids(r)).not.toContain("aaaaaaaa");
    });

    it("Test 15b (ii): widersprechende Kennung schließt den ersten Termin aus (Review 3, Major 3)", () => {
      const previous = prev([
        old("aaaaaaaa", { ...kurs, title: "Babyschwimmen A, Start 08.11.", sessions: at(["2026-11-08"], "10:00") }),
      ]);
      const r = run(
        [draft({ ...kurs, title: "Babyschwimmen B (So ab 08.11.)", sessions: sundays("2026-11-08") })],
        previous,
      );
      expect(ids(r)).not.toContain("aaaaaaaa");
    });
  });

  describe("Stufe 2: Uhrzeit entscheidet", () => {
    // 16 Freitage ab 09.10. (bis 22.01., alle im Fenster); die Entwürfe ohne 5 Ferientage: 11 von 16.
    // Jaccard der Beginnzeiten 11/16 ≈ 0,69 < 0,8 (keine Stufe 1), der Tage ebenso ≥ 0,5 – zu beiden Gruppen.
    const all = weekly("2026-10-09", 16);
    const term = [...all.slice(0, 2), ...all.slice(4, 10), ...all.slice(13)];

    it("Test 15: gemeinsame Uhrzeit entscheidet, beide IDs gehalten, keine vertauscht", () => {
      expect(term).toHaveLength(11);
      const previous = prev([
        old("aaaaaaaa", { title: "Babyschwimmen (Fr 10:45)", sessions: at(all, "10:45") }),
        old("bbbbbbbb", { title: "Babyschwimmen (Fr 11:15)", sessions: at(all, "11:15") }),
      ]);
      const r = run(
        [
          draft({ title: "Babyschwimmen am Freitag, 10:45 Uhr", sessions: at(term, "10:45") }),
          draft({ title: "Babyschwimmen am Freitag, 11:15 Uhr", sessions: at(term, "11:15") }),
        ],
        previous,
      );
      expect(idOf(r, "Babyschwimmen am Freitag, 10:45 Uhr")).toBe("aaaaaaaa");
      expect(idOf(r, "Babyschwimmen am Freitag, 11:15 Uhr")).toBe("bbbbbbbb");
    });

    it("Test 15: ändern beide Gruppen zugleich die Uhrzeit, bleibt es mehrdeutig", () => {
      const previous = prev([
        old("aaaaaaaa", { title: "Babyschwimmen (Fr 10:45)", sessions: at(all, "10:45") }),
        old("bbbbbbbb", { title: "Babyschwimmen (Fr 11:15)", sessions: at(all, "11:15") }),
      ]);
      const r = run(
        [
          draft({ title: "Babyschwimmen am Freitag, 11:00 Uhr", sessions: at(term, "11:00") }),
          draft({ title: "Babyschwimmen am Freitag, 11:30 Uhr", sessions: at(term, "11:30") }),
        ],
        previous,
      );
      expect(ids(r)).not.toContain("aaaaaaaa");
      expect(ids(r)).not.toContain("bbbbbbbb");
      expect(r.notes.join("\n")).toContain("mehrdeutig in Stufe 2");
    });

    it("Test 15b (i): Gruppe 2 zieht auf die Zeit der entfallenen Gruppe 1 und bekommt nie deren ID", () => {
      const previous = prev([
        old("aaaaaaaa", { title: "Babyschwimmen 1 (Fr 10:45)", sessions: at(all, "10:45") }),
        old("bbbbbbbb", { title: "Babyschwimmen 2 (Fr 11:15)", sessions: at(all, "11:15") }),
      ]);
      const r = run([draft({ title: "Babyschwimmen 2 (Fr 10:45)", sessions: at(term, "10:45") })], previous);
      expect(ids(r)).not.toContain("aaaaaaaa");
      expect(ids(r)).toEqual(["bbbbbbbb"]); // über Stufe 2, die Uhrzeit entscheidet nicht gegen die Kennung
    });
  });
});

describe("assignIds – Formatwechsel kurs ↔ regelmaessig (Plan 0048, E11)", () => {
  // S0: „Babymassage (montags)“ als Kurs, nach der Neuextraktion regelmäßig mit anderer Länge: im Fenster weniger als
  // 80 % gleiche Termine (10 gegen 17, Jaccard 0,59), also kein Treffer in Stufe 1
  const kurs = { title: "Babymassage (montags)", format: "kurs" as const, sessions: at(weekly("2026-10-12", 10)) };
  const regel = {
    title: "Babymassage (montags)",
    format: "regelmaessig" as const,
    sessions: at(weekly("2026-10-12", 17)),
  };

  it("gleicher erster Beginn: die ID bleibt, in beide Richtungen", () => {
    const r = run([draft(regel)], prev([old("aaaaaaaa", kurs)]));
    expect(idOf(r, regel.title)).toBe("aaaaaaaa");
    expect(r.notes.join("\n")).toContain("IDs: Stufe 2 aaaaaaaa");
    expect(idOf(run([draft(kurs)], prev([old("aaaaaaaa", regel)])), kurs.title)).toBe("aaaaaaaa");
  });

  it("anderer erster Beginn: neue ID, auch bei gleichen Tagen", () => {
    // ab dem 19.: 9 von 10 Tagen gleich (≥ 50 %), das genügt nur bei gleichem Format
    const later = { ...regel, sessions: at(weekly("2026-10-19", 16)) };
    expect(idOf(run([draft(later)], prev([old("aaaaaaaa", kurs)])), regel.title)).not.toBe("aaaaaaaa");
  });

  it("mit Konkurrent zur selben Uhrzeit: neue IDs statt einer geratenen", () => {
    const rival = { ...regel, title: "Babymassage (montags) für Väter" };
    const r = run([draft(regel), draft(rival)], prev([old("aaaaaaaa", kurs)]));
    expect(r.offers.map((o) => o.id)).not.toContain("aaaaaaaa");
  });

  it("widersprechende Kennungen: neue ID", () => {
    const one = { ...kurs, title: "Babymassage 1" };
    const two = { ...regel, title: "Babymassage 2" };
    expect(idOf(run([draft(two)], prev([old("aaaaaaaa", one)])), two.title)).not.toBe("aaaaaaaa");
  });
});
