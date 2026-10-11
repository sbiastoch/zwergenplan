import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adapterFailureFor,
  assembleProvider,
  botWall,
  compareHashes,
  type HashesFile,
  MAX_INPUT_CHARS,
  programmeText,
  renderFetchMarkdown,
  runLimited,
} from "./fetch.ts";

const fixture = (file: string) =>
  readFileSync(new URL(`../../../tests/fixtures/pipeline/${file}`, import.meta.url), "utf8");

describe("programmeText", () => {
  it("html: Text und JSON-LD, ohne Links", () => {
    const text = programmeText(
      "html",
      fixture("html/ohana-kurs.html"),
      "https://buchung.schwimmschule-ohana.de/iframe/",
    );
    expect(text).toContain("## JSON-LD");
    expect(text).toContain("## TEXT");
    expect(text).not.toContain("## LINKS");
  });

  it("ical: VEVENTs als JSON; json-api: eingerückt; pdf: wie geliefert", () => {
    expect(programmeText("ical", fixture("api/evtermine-vid124.ics"), "https://x")).toMatch(/^## ICAL\n\[/);
    expect(programmeText("json-api", '{"a":[1,2]}', "https://x")).toBe('{\n "a": [\n  1,\n  2\n ]\n}');
    expect(programmeText("json-api", "kein json", "https://x")).toBe("kein json");
    expect(programmeText("pdf", "Seite 1", "https://x")).toBe("Seite 1");
  });
});

describe("adapterFailureFor (E5: Adapter ausgefallen, auch teilweise; Arch-Review S1.2, M2)", () => {
  const ok = { status: "ok" as const, candidates: 3, matched: 2, warnings: [] };
  it("Anbieter nur mit Kandidaten: jeder Ausfall und jede Warnung eines Adapters ist fehler", () => {
    expect(adapterFailureFor("kandidaten", { "stadt-vk": ok, evtermine: ok })).toBeUndefined();
    expect(
      adapterFailureFor("kandidaten", {
        "stadt-vk": ok,
        evtermine: { ...ok, warnings: ['evtermine {"vid":"124"}: HTTP 500', "x"] },
      }),
    ).toBe('evtermine: Teilausfall (2 Warnungen): evtermine {"vid":"124"}: HTTP 500');
    expect(
      adapterFailureFor("kandidaten", {
        evtermine: { ...ok, warnings: ["w"] },
        "stadt-vk": { status: "fehler", reason: "HTTP 500", candidates: 0, matched: 0, warnings: [] },
      }),
    ).toBe("stadt-vk: HTTP 500");
  });

  it("Anbieter mit eigenen Seiten: Kandidaten ergänzen nur, kein fehler", () => {
    const down = { status: "fehler" as const, reason: "HTTP 500", candidates: 0, matched: 0, warnings: [] };
    expect(adapterFailureFor("seiten", { "stadt-vk": down })).toBeUndefined();
  });
});

describe("botWall", () => {
  it("erkennt Bot-Schutz-Seiten statt Inhalt (eversports im Headless-Chromium, Probe 2026-10-11)", () => {
    const cf =
      "## TEXT\nwww.eversports.de\nSicherheitsüberprüfung wird durchgeführt\nDiese Website nutzt einen Sicherheitsservice, um sich vor böswilligen Bots zu schützen.\nRay ID: a48bdec88b13dc4a\nPerformance und Sicherheit von Cloudflare";
    expect(botWall(cf)).toBe("Bot-Schutz (Cloudflare)");
    expect(botWall("## TEXT\nJust a moment...\nEnable JavaScript and cookies to continue")).toBe(
      "Bot-Schutz (Cloudflare)",
    );
    expect(botWall("## TEXT\nKrabbelgruppe dienstags, Performance und Sicherheit sind uns wichtig")).toBeUndefined();
  });
});

const page = (url: string, text: string, art: "html" | "browser" | "pdf" = "html") => ({
  url,
  art,
  ok: true as const,
  text,
  ms: 10,
});

describe("assembleProvider (Plan 0032, E3)", () => {
  it("ok: Hash, Zeichen, normalisierter Eingabetext mit Seiten und Kandidaten", () => {
    const r = assembleProvider({
      pages: [page("https://a.de/1", "Kurs A\nStand: 11.10.2026 03:12")],
      candidates: [{ title: "Babymassage" }],
    });
    expect(r.entry.status).toBe("ok");
    expect(r.entry.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.entry.candidates).toBe(1);
    expect(r.text).toContain("## Seite 1: https://a.de/1 (html)\nKurs A\nStand: 11.10.2026 03:12");
    expect(r.text).toContain('## Kandidaten (1)\n{"title":"Babymassage"}');
    expect(r.entry.chars).toBeGreaterThan(20);
    const later = assembleProvider({
      pages: [page("https://a.de/1", "Kurs A\nStand: 12.10.2026 04:00")],
      candidates: [{ title: "Babymassage" }],
    });
    expect(later.entry.inputHash).toBe(r.entry.inputHash);
  });

  it("Redirect-Ziel steht im Eintrag (erlaubte sourceUrl für extract --from), nicht im Hash", () => {
    const moved = { ...page("https://a.de/1", "Kurs A"), finalUrl: "https://a.de/neu" };
    const r = assembleProvider({ pages: [moved], candidates: [] });
    expect(r.entry.pages[0]).toMatchObject({ url: "https://a.de/1", finalUrl: "https://a.de/neu" });
    expect(r.entry.inputHash).toBe(
      assembleProvider({ pages: [page("https://a.de/1", "Kurs A")], candidates: [] }).entry.inputHash,
    );
  });

  it("leer: keine Seiten, keine Kandidaten (coveredBy ohne Treffer)", () => {
    const r = assembleProvider({ pages: [], candidates: [] });
    expect(r.entry).toMatchObject({ status: "leer", chars: 0, candidates: 0 });
    expect(r.entry.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fehler: eine Seite ausgefallen → kein Hash, Grund und Art der ersten Störung", () => {
    const r = assembleProvider({
      pages: [
        page("https://a.de/1", "ok"),
        { url: "https://a.de/2.pdf", art: "pdf", ok: false, reason: "leeres PDF", ms: 5 },
        { url: "https://a.de/3", art: "browser", ok: false, reason: "Zeitüberschreitung", ms: 5 },
      ],
      candidates: [],
    });
    expect(r.entry).toMatchObject({
      status: "fehler",
      art: "pdf",
      reason: "https://a.de/2.pdf: leeres PDF (+1 weitere)",
    });
    expect(r.entry.inputHash).toBeUndefined();
    expect(r.entry.pages.map((p) => p.ok)).toEqual([true, false, false]);
  });

  it("fehler: Sammelkalender des Anbieters ausgefallen", () => {
    const r = assembleProvider({ pages: [], candidates: [], adapterFailure: "stadt-vk: HTTP 500" });
    expect(r.entry).toMatchObject({ status: "fehler", art: "adapter", reason: "stadt-vk: HTTP 500" });
  });

  it("fehler: Eingabe über 350 000 Zeichen wird nie gekürzt", () => {
    const r = assembleProvider({ pages: [page("https://a.de/1", "x".repeat(MAX_INPUT_CHARS))], candidates: [] });
    expect(r.entry).toMatchObject({ status: "fehler", art: "eingabe" });
    expect(r.entry.reason).toMatch(/^Eingabe zu groß \(350\.\d{3} Zeichen\)$/);
  });
});

const entry = (inputHash: string | undefined, status: "ok" | "fehler" = "ok", orderFreeHash = inputHash) => ({
  status,
  ...(inputHash ? { inputHash } : {}),
  ...(orderFreeHash ? { orderFreeHash } : {}),
  chars: 1,
  candidates: 0,
  pages: [],
});

describe("compareHashes", () => {
  it("Anteil geänderter Hashes unter Anbietern, die in beiden Nächten einen Hash haben", () => {
    const prev: HashesFile = {
      a: entry("1"),
      b: entry("2"),
      c: entry("3"),
      d: entry(undefined, "fehler"),
      e: entry("5"),
      g: entry("7", "ok", "o7"),
    };
    const cur: HashesFile = {
      a: entry("1"),
      b: entry("x"),
      c: entry(undefined, "fehler"),
      d: entry("4"),
      f: entry("6"),
      // nur umsortiert: inputHash neu, orderFreeHash gleich
      g: entry("7b", "ok", "o7"),
    };
    expect(compareHashes(prev, cur)).toEqual({
      compared: 3,
      changed: ["b", "g"],
      changedOrderFree: ["b"],
      appeared: ["d", "f"],
      disappeared: ["c", "e"],
    });
  });

  it("assembleProvider liefert beide Hashes", () => {
    const r = assembleProvider({ pages: [page("https://a.de/1", "B\nA")], candidates: [] });
    const s = assembleProvider({ pages: [page("https://a.de/1", "A\nB")], candidates: [] });
    expect(r.entry.inputHash).not.toBe(s.entry.inputHash);
    expect(r.entry.orderFreeHash).toBe(s.entry.orderFreeHash);
  });
});

describe("renderFetchMarkdown", () => {
  it("Summen, Fehler je Art, Zeichen und Vergleich", () => {
    const providers: HashesFile = {
      a: { ...entry("1"), chars: 1000, pages: [{ url: "https://a", art: "html", ok: true, ms: 1, chars: 1000 }] },
      b: {
        ...entry(undefined, "fehler"),
        chars: 0,
        art: "browser",
        reason: "https://b: Zeitüberschreitung",
        pages: [{ url: "https://b", art: "browser", ok: false, reason: "Zeitüberschreitung", ms: 1 }],
      },
      c: { ...entry("3"), chars: 5000 },
    };
    const md = renderFetchMarkdown({
      date: "2026-10-11",
      durationMs: 125_000,
      providers,
      adapters: { "stadt-vk": { status: "fehler", reason: "HTTP 500", candidates: 0, matched: 0, warnings: [] } },
      skipped: [{ id: "liste", reason: "Verzeichnis" }],
      comparison: { compared: 2, changed: ["c"], changedOrderFree: [], appeared: [], disappeared: [] },
    });
    expect(md).toContain("Anbieter: 3 gesamt, 2 ok, 0 leer, 1 fehler");
    expect(md).toContain("Dauer: 2,1 Min.");
    expect(md).toContain("Zeichen: 6.000 gesamt, max 5.000 (c)");
    expect(md).toMatch(/\| browser \| 1 \| 1 \| b: https:\/\/b: Zeitüberschreitung \|/);
    expect(md).toMatch(/\| adapter \| 1 \| 1 \| stadt-vk: HTTP 500 \|/);
    expect(md).toContain("Geändert: 1 von 2 (50 %)");
    expect(md).toContain("ohne Reihenfolge der Zeilen: 0 von 2 (0 %;");
    expect(md).toContain("- c");
    expect(
      renderFetchMarkdown({ date: "d", durationMs: 0, providers, adapters: {}, skipped: [], comparison: undefined }),
    ).toContain("kein Vorlauf");
  });
});

describe("runLimited (Höflichkeit: 4 parallel, 2 je Host)", () => {
  it("hält beide Grenzen ein und liefert die Ergebnisse in Eingabereihenfolge", async () => {
    const items = ["a", "a", "a", "a", "b", "b", "b", "c", "d", "e"].map((host, i) => ({ host, i }));
    let active = 0;
    let maxActive = 0;
    const perHost = new Map<string, number>();
    let maxPerHost = 0;
    const out = await runLimited(
      items,
      { total: 4, perKey: 2 },
      (x) => x.host,
      async (x) => {
        active++;
        maxActive = Math.max(maxActive, active);
        perHost.set(x.host, (perHost.get(x.host) ?? 0) + 1);
        maxPerHost = Math.max(maxPerHost, perHost.get(x.host) ?? 0);
        await new Promise((r) => setTimeout(r, 2));
        perHost.set(x.host, (perHost.get(x.host) ?? 0) - 1);
        active--;
        return x.i;
      },
    );
    expect(out).toEqual(items.map((x) => x.i));
    expect(maxActive).toBe(4);
    expect(maxPerHost).toBe(2);
  });
});
