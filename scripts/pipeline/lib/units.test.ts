import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { shortId } from "../../../src/domain/ids.ts";
import type { Anbieter, Offer } from "../../../src/domain/schema.ts";
import { Offer as OfferSchema } from "../../../src/domain/schema.ts";
import { RawEvent } from "./raw.ts";
import {
  caseUnits,
  duplicateUnitIds,
  KANDIDATEN,
  matchUnits,
  type UnitEvents,
  unitExcerpt,
  unitIdOf,
  unitsOf,
} from "./units.ts";

const page = (url: string, over: Partial<Anbieter["programme"][number]> = {}): Anbieter["programme"][number] => ({
  url,
  kind: "html",
  use: "termine",
  ...over,
});

function anbieter(programme: Anbieter["programme"], over: Partial<Anbieter> = {}): Anbieter {
  return {
    id: "fam",
    publicId: shortId("fam"),
    role: "anbieter",
    region: "nuernberg",
    name: "Familienzentrum",
    url: "https://example.org/",
    venues: [{ id: "fam", name: "Haus", address: "Hauptstr. 1, 90402 Nürnberg", geo: { lat: 49.45, lon: 11.08 } }],
    programme,
    availability: { shown: "nein" },
    verified: "2026-10-26",
    notes: ["Protokoll"],
    ...over,
  };
}

describe("unitIdOf (E1)", () => {
  it("Vorlage statt ausgefüllter URL, bei request mit Body-Hash", () => {
    expect(unitIdOf({ url: "https://example.org/kal?von={von}" })).toBe("seite:https://example.org/kal?von={von}");
    const body = '{"von":"{von}"}';
    const hash = createHash("sha256").update(body).digest("hex").slice(0, 8);
    expect(unitIdOf({ url: "https://example.org/api", request: { method: "POST", body } })).toBe(
      `seite:https://example.org/api#${hash}`,
    );
  });
});

describe("caseUnits (Eval je Einheit)", () => {
  it("erlaubte URLs je Einheit wie im Nachtlauf: eigene Seiten, Kandidaten getrennt, Weiterleitungsziele für alle", () => {
    const p = anbieter([page("https://example.org/a"), page("https://example.org/b")]);
    const cand = {
      source: "stadt-vk" as const,
      sourceId: "1",
      title: "Treff",
      description: "",
      detailUrl: "https://stadt.de/1",
      cancelled: false,
      soldOut: false,
      waitlist: false,
      weekly: false,
      occurrences: [{ start: "2026-11-02T10:00" }],
    };
    const units = caseUnits({
      catalog: p,
      today: "2026-10-26",
      text: `## Seite 1: https://example.org/a (html)\nA\n\n## Seite 2: https://example.org/b (html)\nB\n\n## Kandidaten (1)\n${JSON.stringify(cand)}`,
      pageUrls: ["https://example.org/a", "https://example.org/b"],
      candidates: [cand],
      allowedUrls: [
        "https://example.org/a",
        "https://example.org/b",
        "https://example.org/a/neu",
        "https://stadt.de/1",
      ],
    });
    expect(units.map((u) => [u.def.id, u.allowedUrls])).toEqual([
      ["seite:https://example.org/a", ["https://example.org/a", "https://example.org/a/neu"]],
      ["seite:https://example.org/b", ["https://example.org/b", "https://example.org/a/neu"]],
      ["kandidaten", ["https://stadt.de/1", "https://example.org/a/neu"]],
    ]);
    expect(units[1]?.text).toBe("## Seite 1: https://example.org/b (html)\nB");
  });
});

describe("duplicateUnitIds (E1, data:validate)", () => {
  it("meldet dieselbe Vorlage zweimal, info zählt nicht", () => {
    const dup = anbieter([page("https://example.org/a"), page("https://example.org/a", { use: "verfuegbarkeit" })]);
    expect(duplicateUnitIds(dup)).toEqual(["seite:https://example.org/a"]);
    const info = anbieter([page("https://example.org/a"), page("https://example.org/a", { use: "info" })]);
    expect(duplicateUnitIds(info)).toEqual([]);
  });
});

describe("unitsOf (E1)", () => {
  const p = anbieter([
    page("https://example.org/a"),
    page("https://example.org/info", { use: "info" }),
    page("https://example.org/plaetze", { use: "verfuegbarkeit", render: "browser" }),
    page("https://example.org/zu", { blocked: { reason: "Login", since: "2026-10-01" } }),
    page("https://example.org/b", { kind: "pdf" }),
  ]);

  it("je Terminseite eine Einheit in Katalogreihenfolge, Beilagen in jeder, info und blocked ausgenommen", () => {
    expect(unitsOf(p, { candidates: false, hadKandidaten: false })).toEqual([
      { id: "seite:https://example.org/a", own: 0, beilagen: [2] },
      { id: "seite:https://example.org/b", own: 4, beilagen: [2] },
    ]);
  });

  it("kandidaten zuletzt, wenn es Kandidaten gibt oder der Vorzustand sie hatte", () => {
    for (const opts of [
      { candidates: true, hadKandidaten: false },
      { candidates: false, hadKandidaten: true },
    ])
      expect(unitsOf(p, opts).map((u) => u.id)).toEqual([
        "seite:https://example.org/a",
        "seite:https://example.org/b",
        KANDIDATEN,
      ]);
  });

  it("coveredBy und skipCrawl: nur kandidaten", () => {
    const overs: Partial<Anbieter>[] = [
      { coveredBy: "stadt" },
      { skipCrawl: { reason: "nur Sammelkalender", since: "2026-10-01" } },
    ];
    for (const over of overs)
      expect(unitsOf(anbieter(p.programme, over), { candidates: false, hadKandidaten: false })).toEqual([
        { id: KANDIDATEN, beilagen: [] },
      ]);
  });
});

describe("unitExcerpt (E3, Nachtrag 1)", () => {
  const programme = [
    page("https://example.org/a", { hint: "Hinweis A" }),
    page("https://example.org/b", { hint: "Hinweis B" }),
    page("https://example.org/plaetze", { use: "verfuegbarkeit", hint: "Plätze" }),
    page("https://example.org/info", { use: "info", hint: "Info" }),
  ];
  const p = anbieter(programme);
  const [a, b] = unitsOf(p, { candidates: true, hadKandidaten: false });
  const kand = unitsOf(p, { candidates: true, hadKandidaten: false }).at(-1);
  const hints = (x: Anbieter) => x.programme.map((g) => [g.url.replace("https://example.org/", ""), g.hint ?? null]);

  it("alle Seiten ohne info, Hinweise nur der eigenen Seite und der Beilagen; ohne notes", () => {
    if (!a || !kand) throw new Error("Einheiten fehlen");
    const x = unitExcerpt(p, a);
    expect(hints(x)).toEqual([
      ["a", "Hinweis A"],
      ["b", null],
      ["plaetze", "Plätze"],
    ]);
    expect(x).not.toHaveProperty("notes");
    expect(hints(unitExcerpt(p, kand))).toEqual([
      ["a", null],
      ["b", null],
      ["plaetze", null],
    ]);
  });

  it("geänderte hint einer anderen Seite ändert den Auszug nicht, eine neue Seite schon", () => {
    if (!a || !b) throw new Error("Einheiten fehlen");
    const changed = anbieter(programme.map((g) => (g.url.endsWith("/b") ? { ...g, hint: "neu" } : g)));
    expect(unitExcerpt(changed, a)).toEqual(unitExcerpt(p, a));
    expect(unitExcerpt(changed, b)).not.toEqual(unitExcerpt(p, b));
    const more = anbieter([...programme, page("https://example.org/c")]);
    expect(unitExcerpt(more, a)).not.toEqual(unitExcerpt(p, a));
  });
});

const W = { from: "2026-10-26", to: "2027-10-26" };
const weekly = (from: string, count: number): RawEvent["schedule"] => ({
  kind: "weekly",
  weekdays: ["MO"],
  start: "10:00",
  end: "11:00",
  from,
  count,
  skipHolidays: false,
});
const dates = (days: string[]): RawEvent["schedule"] => ({
  kind: "dates",
  dates: days.map((d) => ({ start: `${d}T10:00`, end: `${d}T11:00` })),
});
const MONDAYS = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07", "2026-12-14"];

function ev(title: string, format: RawEvent["format"], schedule: RawEvent["schedule"], over: Partial<RawEvent> = {}) {
  return RawEvent.parse({
    providerId: "fam",
    venueId: "fam",
    title,
    summary: "Für Babys.",
    topics: ["pekip"],
    category: "babykurse",
    format,
    registration: "mit-anmeldung",
    cost: "kostenpflichtig",
    url: "https://example.org/a",
    sourceUrl: "https://example.org/a",
    availability: { status: "unbekannt" },
    schedule,
    ...over,
  });
}
const unit = (id: string, events: RawEvent[], failed = false): UnitEvents => ({ id, failed, events });
const offer = (title: string, format: Offer["format"], days: string[], id = "aaaaaaaa"): Offer =>
  OfferSchema.parse({
    id,
    providerId: "fam",
    venueId: "fam",
    title,
    summary: "Für Babys.",
    category: "babykurse",
    topics: ["pekip"],
    format,
    registration: "mit-anmeldung",
    cost: "kostenpflichtig",
    sessions: days.map((d) => ({ start: `${d}T10:00:00+01:00`, end: `${d}T11:00:00+01:00` })),
    availability: { status: "unbekannt", checkedAt: "2026-10-26T05:00:00+01:00" },
    url: "https://example.org/a",
    sourceUrl: "https://example.org/a",
  });
const run = (units: UnitEvents[], previous?: Offer[]) => matchUnits(units, { previous, horizon: W, freeDays: {} });
const titles = (r: ReturnType<typeof run>) => r.units.map((u) => u.events.map((e) => `${e.title}/${e.format}`));

describe("matchUnits (E12)", () => {
  it("PEKiP als kurs und regelmaessig aus zwei Einheiten → eines, mit Hinweis", () => {
    const r = run([
      unit("seite:a", [ev("PEKiP", "kurs", weekly("2026-11-02", 7))]),
      unit("seite:b", [ev("PEKiP-Kurs", "regelmaessig", weekly("2026-11-02", 7))]),
    ]);
    expect(titles(r)).toEqual([["PEKiP/kurs"], []]);
    expect(r.notes).toEqual([
      "„PEKiP-Kurs“ (regelmaessig, 7 Termine) entfällt, gleich „PEKiP“ (kurs, 7 Termine) aus seite:a",
    ]);
  });

  it("1:n wie theater-mummpitz: die einmalig-Fassung des Vorstands bleibt, auch aus der späteren Einheit", () => {
    const previous = MONDAYS.map((d, i) => offer("Babykonzert", "einmalig", [d], `aaaaaaa${i}`));
    const r = run(
      [
        unit("seite:a", [ev("Babykonzert", "regelmaessig", weekly("2026-11-02", 7))]),
        unit("seite:b", [ev("Babykonzert", "einmalig", dates(MONDAYS))]),
      ],
      previous,
    );
    expect(titles(r)).toEqual([[], ["Babykonzert/einmalig"]]);
  });

  it("ohne Vorstand: die Fassung mit mehr künftigen Terminen, bei Gleichstand die frühere", () => {
    const more = run([
      unit("seite:a", [ev("Krabbeln", "kurs", weekly("2026-11-02", 5))]),
      unit("seite:b", [ev("Krabbeln", "regelmaessig", weekly("2026-11-02", 6))]),
    ]);
    expect(titles(more)).toEqual([[], ["Krabbeln/regelmaessig"]]);
    const tie = run([
      unit("seite:a", [ev("Krabbeln", "kurs", weekly("2026-11-02", 6))]),
      unit("seite:b", [ev("Krabbeln", "regelmaessig", weekly("2026-11-02", 6))]),
    ]);
    expect(titles(tie)).toEqual([["Krabbeln/kurs"], []]);
  });

  it("Einheit im Fehler verliert immer und steht nach den Einheiten mit ok", () => {
    const previous = [offer("Krabbeln", "regelmaessig", MONDAYS)];
    const r = run(
      [
        unit("seite:a", [ev("Krabbeln", "regelmaessig", weekly("2026-11-02", 7))], true),
        unit("seite:b", [ev("Krabbeln", "kurs", weekly("2026-11-02", 5))]),
      ],
      previous,
    );
    expect(r.units.map((u) => u.id)).toEqual(["seite:b", "seite:a"]);
    expect(titles(r)).toEqual([["Krabbeln/kurs"], []]);
  });

  it("gleich gebaute Fassungen bleiben für mergeParts", () => {
    const r = run([
      unit("seite:a", [ev("PEKiP", "kurs", weekly("2026-11-02", 7))]),
      unit("seite:b", [ev("PEKiP-Kurs", "kurs", weekly("2026-11-02", 7))]),
    ]);
    expect(titles(r)).toEqual([["PEKiP/kurs"], ["PEKiP-Kurs/kurs"]]);
  });

  it("anderes Alter (unverträglich), Gruppe A/B, dieselbe Einheit und kandidaten bleiben", () => {
    const young = { age: { minMonths: 0, maxMonths: 6 } };
    const old = { age: { minMonths: 12, maxMonths: 24 } };
    expect(
      titles(
        run([
          unit("seite:a", [ev("PEKiP", "kurs", weekly("2026-11-02", 7), young)]),
          unit("seite:b", [ev("PEKiP", "regelmaessig", weekly("2026-11-02", 7), old)]),
        ]),
      ),
    ).toEqual([["PEKiP/kurs"], ["PEKiP/regelmaessig"]]);
    expect(
      titles(
        run([
          unit("seite:a", [ev("Babyschwimmen Gruppe A", "kurs", weekly("2026-11-02", 7))]),
          unit("seite:b", [ev("Babyschwimmen Gruppe B", "regelmaessig", weekly("2026-11-02", 7))]),
        ]),
      ),
    ).toEqual([["Babyschwimmen Gruppe A/kurs"], ["Babyschwimmen Gruppe B/regelmaessig"]]);
    expect(
      titles(
        run([
          unit("seite:a", [
            ev("PEKiP", "kurs", weekly("2026-11-02", 7)),
            ev("PEKiP", "regelmaessig", weekly("2026-11-02", 7)),
          ]),
        ]),
      ),
    ).toEqual([["PEKiP/kurs", "PEKiP/regelmaessig"]]);
    expect(
      titles(
        run([
          unit("seite:a", [ev("PEKiP", "kurs", weekly("2026-11-02", 7))]),
          unit(KANDIDATEN, [ev("PEKiP", "regelmaessig", weekly("2026-11-02", 7))]),
        ]),
      ),
    ).toEqual([["PEKiP/kurs"], ["PEKiP/regelmaessig"]]);
  });

  it("weniger als 80 % gemeinsame künftige Termine: beide bleiben", () => {
    const r = run([
      unit("seite:a", [ev("PEKiP", "kurs", dates(MONDAYS.slice(0, 5)))]),
      unit("seite:b", [ev("PEKiP", "regelmaessig", weekly("2026-11-23", 4))]),
    ]);
    expect(titles(r)).toEqual([["PEKiP/kurs"], ["PEKiP/regelmaessig"]]);
  });
});
