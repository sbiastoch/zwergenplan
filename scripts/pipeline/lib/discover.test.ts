import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { shortId } from "../../../src/domain/ids.ts";
import { type Offer, type Provider, ProvidersFile } from "../../../src/domain/schema.ts";
import type { Candidate } from "./candidate.ts";
import {
  type AssessEntry,
  aggregatorFinds,
  allowedUrlsOf,
  assessMessage,
  assessResponseSchema,
  catalogId,
  directoryFinds,
  entryFromAssessment,
  type Find,
  findsFromSearch,
  newProviderCommitMessage,
  newProvidersIssue,
  normalizeUrl,
  parseAssessment,
  postpone,
  prefilter,
  proveYield,
  renderDiscoverReport,
  searchMessage,
  searchResponseSchema,
  staleHints,
} from "./discover.ts";
import { DiscoverState, emptyState } from "./discover-state.ts";
import type { ProviderRaw } from "./raw.ts";

const catalog: Provider[] = ProvidersFile.parse(
  parse(readFileSync(new URL("../../../tests/fixtures/providers.yaml", import.meta.url), "utf8")),
);
const today = "2026-10-11";
const find = (over: Partial<Find> = {}): Find => ({
  name: "Krabbelzwerge Gostenhof",
  url: "https://krabbelzwerge.example.net/kurse",
  warum: "Krabbelgruppe für 0–3",
  quelle: "suche:Krabbelgruppe",
  ...over,
});

describe("normalizeUrl", () => {
  it("ohne Schema, www, Schlusspunkt-Slash, Fragment und Tracking", () => {
    expect(normalizeUrl("https://www.Example.org/Kurse/?utm_source=x&b=2&a=1#oben")).toBe("example.org/Kurse?a=1&b=2");
    expect(normalizeUrl("http://example.org")).toBe("example.org");
  });
  it("keine http-URL: undefined", () => {
    expect(normalizeUrl("mailto:a@b.de")).toBeUndefined();
    expect(normalizeUrl("kein Link")).toBeUndefined();
  });
});

describe("prefilter (E7.3)", () => {
  it("lässt unbekannte durch und fasst gleiche URLs im Lauf zusammen", () => {
    const r = prefilter([find(), find({ url: "https://krabbelzwerge.example.net/kurse/", quelle: "x" })], {
      catalog,
      state: emptyState("nuernberg"),
      today,
    });
    expect(r.keep).toHaveLength(1);
    expect(r.dropped).toEqual([]);
  });

  it("verwirft eine URL, die normalisiert im Katalog steht (auch Programmseiten)", () => {
    const r = prefilter([find({ url: "http://www.example.org/familientreff/programm/" })], {
      catalog,
      state: emptyState("nuernberg"),
      today,
    });
    expect(r.keep).toEqual([]);
    expect(r.dropped[0]?.grund).toMatch(/Katalog.*familientreff-beispiel/);
  });

  it("verwirft bei gleichem Host UND ähnlichem Namen, nicht bei gleichem Host allein", () => {
    const ctx = { catalog, state: emptyState("nuernberg"), today };
    const twin = prefilter([find({ name: "Familientreff Beispielhof", url: "https://example.org/neu" })], ctx);
    expect(twin.dropped[0]?.grund).toMatch(/Host und Name.*familientreff-beispiel/);
    const other = prefilter([find({ name: "Krabbelgruppe Sonnenschein", url: "https://example.org/sonne" })], ctx);
    expect(other.keep).toHaveLength(1);
  });

  it("verwirft abgelehnte URL und abgelehnten Host", () => {
    const state = DiscoverState.parse({
      region: "nuernberg",
      abgelehnt: [
        { url: "https://krabbelzwerge.example.net/kurse", grund: "Vermittler", datum: "2026-09-01" },
        { host: "spam.example.net", grund: "Werbung", datum: "2026-09-01" },
      ],
      zurueckgestellt: [],
    });
    const r = prefilter([find(), find({ url: "https://www.spam.example.net/x", name: "Spam" })], {
      catalog,
      state,
      today,
    });
    expect(r.keep).toEqual([]);
    expect(r.dropped.map((d) => d.grund)).toEqual(["abgelehnt: Vermittler", "abgelehnt: Werbung"]);
  });

  it("zurückgestellt bis zur Wiedervorlage, danach wieder dabei", () => {
    const state = postpone(emptyState("nuernberg"), find(), "kein Angebot für 0–3", "2026-08-01");
    expect(state.zurueckgestellt[0]?.wiedervorlage).toBe("2026-09-26");
    const early = prefilter([find()], { catalog, state, today: "2026-09-25" });
    expect(early.dropped[0]?.grund).toMatch(/zurückgestellt bis 2026-09-26/);
    expect(prefilter([find()], { catalog, state, today: "2026-09-26" }).keep).toHaveLength(1);
  });

  it("verwirft Seiten sozialer Netzwerke und ungültige URLs", () => {
    const r = prefilter([find({ url: "https://www.facebook.com/krabbel" }), find({ url: "javascript:void(0)" })], {
      catalog,
      state: emptyState("nuernberg"),
      today,
    });
    expect(r.keep).toEqual([]);
    expect(r.dropped).toHaveLength(2);
  });
});

describe("postpone", () => {
  it("ersetzt einen älteren Eintrag derselben URL", () => {
    const once = postpone(emptyState("nuernberg"), find(), "a", "2026-08-01");
    const twice = postpone(once, find({ url: "https://krabbelzwerge.example.net/kurse/" }), "b", "2026-10-11");
    expect(twice.zurueckgestellt).toHaveLength(1);
    expect(twice.zurueckgestellt[0]).toMatchObject({ grund: "b", datum: "2026-10-11" });
  });
});

const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  source: "frankenkids",
  sourceId: "1",
  title: "Babymassage für Eltern mit Baby",
  description: "",
  organizer: "Hebammenpraxis Morgenrot",
  organizerUrl: "https://morgenrot.example.net",
  address: "Irgendwo 5, 90443 Nürnberg",
  detailUrl: "https://frankenkids.example.net/e/1",
  cancelled: false,
  soldOut: false,
  waitlist: false,
  weekly: false,
  occurrences: [{ start: "2026-10-20T10:00" }],
  ...over,
});

describe("aggregatorFinds (E7.1)", () => {
  it("Veranstalter ohne Katalog-Treffer mit eigener Website und Babybezug", () => {
    const r = aggregatorFinds([candidate(), candidate({ sourceId: "2" })], catalog);
    expect(r.finds).toEqual([
      {
        name: "Hebammenpraxis Morgenrot",
        url: "https://morgenrot.example.net",
        warum: "Termin „Babymassage für Eltern mit Baby“ im Sammelkalender frankenkids",
        quelle: "sammelkalender:frankenkids",
      },
    ]);
  });

  it("ohne Website oder ohne Babybezug kein Kandidat", () => {
    const { organizerUrl: _, ...noUrl } = candidate();
    expect(aggregatorFinds([noUrl, candidate({ title: "Lesung für Erwachsene" })], catalog).finds).toEqual([]);
  });

  it("bekannter Anbieter mit unbekannter Seite auf seinem Host: Hinweis ohne Aktion", () => {
    const known = candidate({
      organizer: "Familientreff Beispielhof (fiktiv)",
      organizerUrl: "https://example.org/familientreff/herbst",
      address: "Beispielstraße 1, 90402 Nürnberg",
    });
    const r = aggregatorFinds([known], catalog);
    expect(r.finds).toEqual([]);
    expect(r.hints).toEqual([
      "familientreff-beispiel: neue Programmseite? https://example.org/familientreff/herbst (aus frankenkids)",
    ]);
  });
});

describe("directoryFinds (E7.1)", () => {
  const dir = catalog.find((p) => p.role === "aggregator");
  it("externe Links eines Verzeichnisses, ohne eigene Seiten und Netzwerke", () => {
    if (!dir) throw new Error("Fixture ohne Sammelkalender");
    const host = new URL(dir.url).host;
    const r = directoryFinds(dir, [
      { label: "Pfarrei St. Beispiel", url: "https://st-beispiel.example.net/" },
      { label: "Impressum", url: `https://${host}/impressum` },
      { label: "Instagram", url: "https://instagram.com/x" },
      { label: "ab", url: "https://kurz.example.net" },
    ]);
    expect(r).toEqual([
      {
        name: "Pfarrei St. Beispiel",
        url: "https://st-beispiel.example.net/",
        warum: `Eintrag im Verzeichnis ${dir.name}`,
        quelle: `verzeichnis:${dir.id}`,
      },
    ]);
  });
});

describe("Nachrichten an das Modell", () => {
  it("Suche nennt Begriff mit Region", () => {
    expect(searchMessage("PEKiP", "Nürnberg")).toBe("Suchbegriff: PEKiP Nürnberg\nRegion: Nürnberg");
  });
  it("Bewerten: Text gekürzt, Links mit Ziel; erlaubt sind Fund-URL, Seite und Links", () => {
    const page = {
      finalUrl: "https://k.example.net/",
      text: "x".repeat(40_000),
      links: [{ label: "Kurse", url: "https://k.example.net/kurse" }],
    };
    const m = assessMessage(find(), page, "Nürnberg");
    expect(m).toMatch(/Region: Nürnberg/);
    expect(m).toMatch(/\[… gekürzt\]/);
    expect(m).toMatch(/Kurse -> https:\/\/k\.example\.net\/kurse/);
    expect(allowedUrlsOf(find(), page)).toEqual([find().url, "https://k.example.net/", "https://k.example.net/kurse"]);
  });
});

describe("parseAssessment", () => {
  it("verwerfen, aufnehmen mit Eintrag, aufnehmen ohne Eintrag ist ungültig", () => {
    expect(parseAssessment({ entscheidung: "verwerfen", grund: "ab 3" })).toEqual({ kind: "verwerfen", grund: "ab 3" });
    expect(parseAssessment({ entscheidung: "aufnehmen", grund: "g", eintrag: assessed })).toEqual({
      kind: "aufnehmen",
      grund: "g",
      entry: assessed,
    });
    expect(parseAssessment({ entscheidung: "aufnehmen", grund: "g" })).toEqual({ kind: "ungueltig" });
    expect(parseAssessment("Text")).toEqual({ kind: "ungueltig" });
  });
  it("Antwortschemata ohne $schema (CLI 2.1.296)", () => {
    expect(assessResponseSchema()).not.toHaveProperty("$schema");
    expect(searchResponseSchema()).toHaveProperty("properties.kandidaten");
  });
});

describe("findsFromSearch (E7.2)", () => {
  it("nimmt gültige Treffer, verwirft Rest", () => {
    const r = findsFromSearch(
      {
        kandidaten: [
          { name: "Krabbelzwerge", url: "https://krabbelzwerge.example.net", warum: "Kurse ab 0" },
          { name: "kaputt", url: "keine-url", warum: "x" },
        ],
      },
      "Krabbelgruppe",
    );
    expect(r).toEqual({
      ok: true,
      finds: [
        {
          name: "Krabbelzwerge",
          url: "https://krabbelzwerge.example.net",
          warum: "Kurse ab 0",
          quelle: "suche:Krabbelgruppe",
        },
      ],
    });
  });
  it("falsche Form: ungültig", () => {
    expect(findsFromSearch({ foo: 1 }, "PEKiP").ok).toBe(false);
  });
});

describe("catalogId (E7.7)", () => {
  it("kebab aus dem Namen, Suffix bei Kollision", () => {
    expect(catalogId("Krabbelzwerge Gostenhof e.V.", catalog)).toBe("krabbelzwerge-gostenhof-e-v");
    expect(catalogId("Familientreff Beispiel", catalog)).toBe("familientreff-beispiel-2");
  });
  it("nie in der Form einer publicId (8 Zeichen ohne Bindestrich)", () => {
    expect(catalogId("Kinderzz", catalog)).toBe("kinderzz-anbieter");
  });
});

const assessed: AssessEntry = {
  name: "Krabbelzwerge Gostenhof",
  url: "https://krabbelzwerge.example.net/",
  age: { minMonths: 0, maxMonths: 36 },
  programme: [
    { url: "https://krabbelzwerge.example.net/kurse", kind: "html", use: "termine" },
    { url: "https://boese.example.com/termine", kind: "html", use: "termine" },
  ],
  venues: [{ name: "Gemeindehaus Gostenhof", address: "Kernstraße 3, 90429 Nürnberg" }],
  availability: "unbekannt",
};

describe("entryFromAssessment (E7.4, E7.7)", () => {
  const ctx = {
    find: find(),
    grund: "Krabbelgruppe mit Terminen",
    region: "nuernberg" as const,
    catalog,
    today,
    geos: [{ lat: 49.449, lon: 11.06, district: "Gostenhof" }],
    allowedUrls: ["https://krabbelzwerge.example.net/kurse", "https://krabbelzwerge.example.net/"],
  };

  it("vergibt IDs, publicId, Region, verified; Programmseiten nur aus der abgerufenen Seite", () => {
    const r = entryFromAssessment(assessed, ctx);
    if (!r.ok) throw new Error(r.grund);
    const e = r.entry;
    expect(e.id).toBe("krabbelzwerge-gostenhof");
    expect(e.publicId).toBe(shortId("krabbelzwerge-gostenhof", 0));
    expect(e.region).toBe("nuernberg");
    expect(e.verified).toBe(today);
    expect(e.programme).toEqual([{ url: "https://krabbelzwerge.example.net/kurse", kind: "html", use: "termine" }]);
    expect(e.venues).toEqual([
      {
        id: "krabbelzwerge-gostenhof",
        name: "Gemeindehaus Gostenhof",
        address: "Kernstraße 3, 90429 Nürnberg",
        district: "Gostenhof",
        geo: { lat: 49.449, lon: 11.06 },
      },
    ]);
    expect(e.availability).toEqual({ shown: "unbekannt" });
    expect(e.notes?.[0]).toMatch(/Entdeckt 2026-10-11 über suche:Krabbelgruppe/);
    expect(r.notes).toEqual([
      "Programmseite nicht auf der abgerufenen Seite verlinkt: https://boese.example.com/termine",
    ]);
  });

  it("zweiter Ort bekommt eine eigene, freie Orts-ID", () => {
    const two = {
      ...assessed,
      venues: [...assessed.venues, { name: "Turnhalle", address: "Turnweg 1, 90429 Nürnberg" }],
    };
    const r = entryFromAssessment(two, { ...ctx, geos: [...ctx.geos, { lat: 49.45, lon: 11.05 }] });
    expect(r.ok && r.entry.venues.map((v) => v.id)).toEqual(["krabbelzwerge-gostenhof", "krabbelzwerge-gostenhof-2"]);
  });

  it("ohne erlaubte Terminseite: verworfen", () => {
    const r = entryFromAssessment(assessed, { ...ctx, allowedUrls: [] });
    expect(r).toEqual({ ok: false, grund: "keine abrufbare Terminseite (use: termine)" });
  });

  it("Programmseite eines bekannten Anbieters: verworfen", () => {
    const known = {
      ...assessed,
      programme: [{ url: "https://example.org/bibliothek/termine", kind: "html" as const, use: "termine" as const }],
    };
    const r = entryFromAssessment(known, { ...ctx, allowedUrls: ["https://example.org/bibliothek/termine"] });
    expect(r).toEqual({ ok: false, grund: "Programmseite steht schon im Katalog (stadtbibliothek-beispiel)" });
  });

  it("Ort außerhalb der Region: verworfen", () => {
    const r = entryFromAssessment(assessed, { ...ctx, geos: [{ lat: 48.1, lon: 11.5 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.grund).toMatch(/außerhalb der Region/);
  });
});

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: "abcdefgh",
  providerId: "krabbelzwerge-gostenhof",
  venueId: "krabbelzwerge-gostenhof",
  title: "Krabbelgruppe",
  summary: "Spielen",
  topics: ["krabbelgruppe"],
  format: "regelmaessig",
  registration: "ohne-anmeldung",
  cost: "kostenlos",
  sessions: [{ start: "2026-10-20T10:00:00+02:00", end: "2026-10-20T11:30:00+02:00" }],
  availability: { status: "ohne-anmeldung", checkedAt: "2026-10-11T04:30:00+02:00" },
  url: "https://krabbelzwerge.example.net/kurse",
  sourceUrl: "https://krabbelzwerge.example.net/kurse",
  ...over,
});

describe("proveYield (E7.6)", () => {
  const now = "2026-10-11T06:00:00+02:00";
  const id = "krabbelzwerge-gostenhof";
  it("ein gültiges Angebot 0–3 mit künftigem Termin und Babybezug im Text", () => {
    const r = proveYield([offer()], id, "Krabbelgruppe für Babys", now);
    expect(r.ok && r.first.title).toBe("Krabbelgruppe");
  });
  it("nur vergangene Termine: kein Ertrag", () => {
    const past = offer({ sessions: [{ start: "2026-10-01T10:00:00+02:00", end: "2026-10-01T11:00:00+02:00" }] });
    expect(proveYield([past], id, "Krabbelgruppe", now)).toEqual({
      ok: false,
      grund: "kein Angebot für 0–3 Jahre mit künftigem Termin",
    });
  });
  it("Angebot eines anderen Anbieters zählt nicht", () => {
    expect(proveYield([offer({ providerId: "x" })], id, "Krabbelgruppe", now).ok).toBe(false);
  });
  it("ohne Babybezug im abgerufenen Text (isRelevant): kein Ertrag", () => {
    expect(proveYield([offer()], id, "Yoga für Erwachsene", now)).toEqual({
      ok: false,
      grund: "kein Baby- oder Kleinkindbezug im abgerufenen Text",
    });
  });
});

describe("staleHints", () => {
  it("Anbieter mit failingSince älter als 14 Tage", () => {
    const raw = (failingSince?: string): ProviderRaw => ({
      events: [],
      status: "fehler",
      reason: "HTTP 404",
      checkedAt: "2026-10-11T01:30:00+02:00",
      sources: [],
      ...(failingSince ? { failingSince } : {}),
    });
    expect(
      staleHints({ a: raw("2026-09-20T01:30:00+02:00"), b: raw("2026-10-01T01:30:00+02:00"), c: raw() }, today),
    ).toEqual(["a: Quelle fehlerhaft seit 2026-09-20 (HTTP 404)"]);
  });
});

describe("Bericht und Commit-Text (E7.8 G4, E10)", () => {
  const adopted = {
    id: "krabbelzwerge-gostenhof",
    name: "Krabbelzwerge Gostenhof",
    region: "nuernberg" as const,
    find: find(),
    grund: "Krabbelgruppe mit Terminen",
    first: {
      title: "Krabbelgruppe",
      start: "2026-10-20T10:00:00+02:00",
      url: "https://krabbelzwerge.example.net/kurse",
    },
  };

  it("Commit-Text nennt ID, Region, Fund-URL, Grund und erstes Angebot", () => {
    const m = newProviderCommitMessage(adopted);
    expect(m.split("\n")[0]).toBe("data: neuer Anbieter krabbelzwerge-gostenhof (nuernberg)");
    expect(m).toMatch(/Fund-URL: https:\/\/krabbelzwerge\.example\.net\/kurse/);
    expect(m).toMatch(/Grund: Krabbelgruppe mit Terminen/);
    expect(m).toMatch(/Erstes Angebot: Krabbelgruppe am 20\.10\.2026/);
  });

  it("Trockenlauf: „würde aufnehmen“ und „verworfen“ mit Grund", () => {
    const md = renderDiscoverReport({
      date: today,
      dryRun: true,
      durationMs: 60_000,
      regions: [
        {
          region: "nuernberg",
          finds: 3,
          dropped: [{ find: find({ name: "Alt" }), grund: "steht im Katalog (x)" }],
          adopted: [adopted],
          rejected: [{ find: find({ name: "Yoga" }), grund: "nur Erwachsene" }],
          hints: ["a: Quelle fehlerhaft seit 2026-09-20 (HTTP 404)"],
        },
      ],
      calls: [],
      budgetHit: false,
    });
    expect(md).toMatch(/# Entdecken 2026-10-11 \(Trockenlauf\)/);
    expect(md).toMatch(/## Würde aufnehmen/);
    expect(md).toMatch(/krabbelzwerge-gostenhof/);
    expect(md).toMatch(/## Verworfen[\s\S]*Yoga[\s\S]*nur Erwachsene/);
    expect(md).toMatch(/Hinweise ohne Aktion[\s\S]*HTTP 404/);
    expect(md).toMatch(/Kosten/);
  });
});

describe("newProvidersIssue (E7.10)", () => {
  it("ein Eintrag je neuem Anbieter mit Commit-Link, andere Commits zählen nicht", () => {
    const message = newProviderCommitMessage({
      id: "krabbelzwerge-gostenhof",
      name: "Krabbelzwerge Gostenhof",
      region: "nuernberg",
      find: find(),
      grund: "g",
      first: { title: "Krabbelgruppe", start: "2026-10-20T10:00:00+02:00", url: "https://k.example.net" },
    });
    const issue = newProvidersIssue(
      [
        { sha: "abc123", message },
        { sha: "def456", message: "data: Entdecken 2026-10-11 (nuernberg)" },
      ],
      { repoUrl: "https://github.com/x/y", date: today },
    );
    expect(issue?.title).toBe("Neue Anbieter 2026-10-11");
    expect(issue?.body).toMatch(
      /- \[krabbelzwerge-gostenhof\]\(https:\/\/github\.com\/x\/y\/commit\/abc123\) \(nuernberg\): Krabbelzwerge Gostenhof – Fund-URL https:\/\/krabbelzwerge\.example\.net\/kurse/,
    );
    expect(issue?.body).not.toMatch(/def456/);
  });

  it("ohne neuen Anbieter kein Issue", () => {
    expect(
      newProvidersIssue([{ sha: "a", message: "data: Entdecken" }], { repoUrl: "u", date: today }),
    ).toBeUndefined();
  });
});
