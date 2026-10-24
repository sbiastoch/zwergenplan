import { describe, expect, it } from "vitest";
import type { Provider } from "../../../src/domain/schema.ts";
import { loadFixtures } from "../../../src/domain/test-fixtures.ts";
import { planFetch } from "./select.ts";

const { providers, anbieter } = loadFixtures();
function fail(): never {
  throw new Error("Fixture");
}
const { name, url, programme, availability, verified } = anbieter[0] ?? fail();
const source = { region: "nuernberg" as const, name, url, programme, availability, verified };
const catalog: Provider[] = [
  ...providers.map((p) => (p.id === "theater-beispiel" ? { ...p, coveredBy: "kalender" } : p)),
  { ...source, id: "kalender", role: "aggregator", adapter: "stadt-vk" },
  { ...source, id: "liste", role: "verzeichnis" },
];

describe("planFetch (Plan 0032, E3; ADR 0025, Punkt 7)", () => {
  const today = "2026-10-11";
  const base = anbieter.find((p) => p.id === "familientreff-beispiel") ?? fail();
  const crawl: Provider[] = [
    {
      ...base,
      id: "mit-allem",
      programme: [
        { url: "https://a.example/termine?von={von}&bis={bis}", kind: "html", use: "termine" },
        { url: "https://a.example/ueber-uns", kind: "html", use: "info" },
        { url: "https://a.example/plaetze", kind: "html", use: "verfuegbarkeit", render: "browser" },
        {
          url: "https://a.example/login",
          kind: "html",
          use: "termine",
          blocked: { reason: "Login", since: "2026-10-01" },
        },
        {
          url: "https://api.example/graphql",
          kind: "json-api",
          use: "termine",
          request: { method: "POST", headers: { "x-a": "1" }, body: '{"from":"{von}","to":"{bis}"}' },
        },
        { url: "https://a.example/flyer.pdf", kind: "pdf", use: "termine" },
        { url: "https://a.example/feed.ics", kind: "ical", use: "termine" },
        { url: "https://a.example/liste", kind: "html", use: "termine", follow: { match: "browse=forward", max: 3 } },
      ],
    },
    { ...base, id: "abgedeckt", coveredBy: "kalender" },
    { ...base, id: "ohne-termine", skipCrawl: { reason: "keine Termine online", since: "2026-10-01" } },
    ...catalog.filter((p) => p.role !== "anbieter"),
  ];

  it("ruft nur termine/verfuegbarkeit ohne blocked ab, füllt {von}/{bis}, folgt keinen Links", () => {
    const plan = planFetch(crawl, { today });
    const p = plan.providers.find((x) => x.id === "mit-allem") ?? fail();
    expect(p.via).toBe("seiten");
    expect(p.pages).toEqual([
      { url: "https://a.example/termine?von=2026-10-01&bis=2027-11-01", kind: "html" },
      { url: "https://a.example/plaetze", kind: "html", render: "browser" },
      {
        url: "https://api.example/graphql",
        kind: "json-api",
        request: { method: "POST", headers: { "x-a": "1" }, body: '{"from":"2026-10-01","to":"2027-11-01"}' },
      },
      { url: "https://a.example/flyer.pdf", kind: "pdf" },
      { url: "https://a.example/feed.ics", kind: "ical" },
      // Folgeseiten nur, wenn der Katalog sie nennt (Plan 0042, E2)
      { url: "https://a.example/liste", kind: "html", follow: { match: "browse=forward", max: 3 } },
    ]);
  });

  it("coveredBy und skipCrawl: keine Seiten, nur Kandidaten; Sammelkalender nur über den Adapter; Verzeichnis nie", () => {
    const plan = planFetch(crawl, { today });
    expect(plan.providers.find((x) => x.id === "abgedeckt")).toEqual({
      id: "abgedeckt",
      via: "kandidaten",
      reason: "Termine über kalender",
      pages: [],
    });
    expect(plan.providers.find((x) => x.id === "ohne-termine")).toMatchObject({ via: "kandidaten", pages: [] });
    expect(plan.providers.map((p) => p.id)).not.toContain("kalender");
    expect(plan.adapters).toEqual([
      { id: "sammelkalender-beispiel", adapter: "frankenkids" },
      { id: "kalender", adapter: "stadt-vk" },
    ]);
    expect(plan.skipped).toEqual([{ id: "liste", reason: "Verzeichnis (nur Katalogpflege)" }]);
  });

  it("--only: nur diese Anbieter, aber alle Adapter (Hashes vergleichbar mit dem vollen Lauf, Arch-Review Minor 1)", () => {
    const all = planFetch(crawl, { today }).adapters;
    const plan = planFetch(crawl, { today, only: ["abgedeckt", "mit-allem"] });
    expect(plan.providers.map((p) => p.id)).toEqual(["mit-allem", "abgedeckt"]);
    expect(plan.adapters).toEqual(all);
    expect(planFetch(crawl, { today, only: ["mit-allem"] }).adapters).toEqual(all);
    expect(() => planFetch(crawl, { today, only: ["gibts-nicht"] })).toThrow("Unbekannter Anbieter");
  });
});
