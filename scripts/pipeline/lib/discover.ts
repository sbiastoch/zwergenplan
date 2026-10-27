/**
 * Entdecken neuer Anbieter (Plan 0032, E7), reine Logik: Kandidaten aus Sammelkalendern, Verzeichnissen und der
 * Websuche, Vorfilter gegen Katalog und `abgelehnt`, Antwortformen der beiden Modellschritte, Katalogeintrag mit
 * vom Code vergebenen IDs, Ertragsbeweis, Zustand `data/discover/<region>.json`, Bericht und Commit-Text.
 * Abruf, Modellaufrufe, Geocodieren, Dateien und git liegen in `io/discover.ts`.
 *
 * Grundsatz (E7.3): Eine übersehene Dublette ist billig (Revert), ein verschluckter Anbieter nicht. Der Vorfilter
 * verwirft deshalb nur bei gleicher URL oder bei gleichem Host UND ähnlichem Namen.
 */
import { z } from "zod";
import { validateDataset } from "../../../src/domain/dataset.ts";
import { inBounds } from "../../../src/domain/geo.ts";
import { nextPublicId, SHORT_ID_PATTERN, slug } from "../../../src/domain/ids.ts";
import { REGIONS, type RegionId } from "../../../src/domain/regions.ts";
import { type Anbieter, type Offer, type Provider, Provider as ProviderSchema } from "../../../src/domain/schema.ts";
import { addDays, berlinIsoDate, formatGermanDate } from "../../../src/domain/time.ts";
import type { Candidate } from "./candidate.ts";
import { catalogDiff } from "./catalog-diff.ts";
import { removeEntries } from "./catalog-yaml.ts";
import { summarizeCosts } from "./cost.ts";
import type { DiscoverState } from "./discover-state.ts";
import { searchQuery } from "./discover-terms.ts";
import type { CallRecord } from "./extract.ts";
import { matchCandidate } from "./match.ts";
import { type ProviderRaw, providerStatus } from "./raw.ts";
import { isInternalHost } from "./redirect.ts";
import { isRelevant } from "./relevance.ts";
import { costSection } from "./report.ts";
import { ratio } from "./similar.ts";

/** G3: höchstens so viele neue Anbieter je Lauf und Region (mit `--bootstrap` gilt `MAX_NEW`) */
export const MAX_NEW_PER_RUN = 10;
/** Wiedervorlage eines Kandidaten ohne Ertrag (E7.6): 8 Wochen */
const WIEDERVORLAGE_DAYS = 56;
/** Fehlerserie, ab der eine Quelle im Bericht steht (E7, Hinweise ohne Aktion) */
const STALE_DAYS = 14;
/** Ähnlicher Name bei gleichem Host (E7.3); streng, weil ein verschluckter Anbieter teurer ist als eine Dublette */
const NAME_RATIO = 0.7;
/** Externe Links je Verzeichnisseite, die als Kandidat zählen */
const MAX_DIRECTORY_FINDS = 30;
/** Seiten ohne eigenes Angebot: Netzwerke, Karten, Suchmaschinen */
const FOREIGN_HOSTS =
  /(^|\.)(facebook\.com|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|tiktok\.com|linkedin\.com|xing\.com|pinterest\.\w+|whatsapp\.com|google\.\w+|goo\.gl|apple\.com|wikipedia\.org|openstreetmap\.org)$/;

/** Ein Kandidat: Name, Fund-URL, Begründung und Herkunft (`suche:<begriff>`, `sammelkalender:<adapter>`, `verzeichnis:<id>`) */
export interface Find {
  name: string;
  url: string;
  warum: string;
  quelle: string;
}

/** Keine IP-Literale und kein `localhost` (`isInternalHost`, gemeinsam mit dem Abruf `io/http.ts`) */
const parseUrl = (url: string): URL | undefined => {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && !isInternalHost(u.hostname) ? u : undefined;
  } catch {
    return undefined;
  }
};

const bareHost = (u: URL) => u.hostname.toLowerCase().replace(/^www\./, "");

/** Host ohne `www.`; ungültige URL: undefined */
export const hostOf = (url: string): string | undefined => {
  const u = parseUrl(url);
  return u ? bareHost(u) : undefined;
};

/** Vergleichsform einer URL: ohne Schema, `www.`, Fragment, Tracking-Parameter und Schrägstrich am Ende. */
export function normalizeUrl(url: string): string | undefined {
  const u = parseUrl(url);
  if (!u) return undefined;
  const params = [...u.searchParams]
    .filter(([k]) => !/^(utm_|fbclid$|gclid$)/i.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const path = u.pathname.replace(/\/+$/, "");
  return `${bareHost(u)}${path}${params.length > 0 ? `?${params.join("&")}` : ""}`;
}

const urlsOf = (p: Provider): string[] => [p.url, ...p.programme.map((g) => g.url)];

/** gleicher oder ähnlicher Name (einer enthält den anderen, oder Ähnlichkeit ≥ NAME_RATIO) */
function similarName(a: string, b: string): boolean {
  // Katalognamen tragen Zusätze („Die FamilienBox – Das 'Dorf' für Familien“): verglichen wird auch der Kopf vor
  // Gedankenstrich, Klammer oder Doppelpunkt, nur Buchstaben und Ziffern (Trockenlauf 2026-10-11)
  const forms = (s: string) => {
    const lower = s.toLowerCase().replace(/\([^)]*\)/g, "");
    return [lower, lower.split(/\s[–-]\s|[(:,|]/)[0] ?? ""]
      .map((f) => f.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter((f) => f.length >= 4);
  };
  const xs = forms(a);
  const ys = forms(b);
  return xs.some((x) => ys.some((y) => x.includes(y) || y.includes(x) || ratio(x, y) >= NAME_RATIO));
}

/**
 * Vorfilter (E7.3): bekannte URL, bekannter Host mit ähnlichem Namen, `abgelehnt`, noch zurückgestellt. `abgelehnt`
 * sind die Sperren aller Regionen, weil sich die Regionen überlappen (Plan 0036, E4); ohne Angabe die der eigenen.
 * `zurueckgestellt` bleibt je Region, der Grund hängt oft an ihr („kein Ort in der Region …“).
 */
export function prefilter(
  finds: readonly Find[],
  ctx: {
    catalog: readonly Provider[];
    state: DiscoverState;
    abgelehnt?: DiscoverState["abgelehnt"];
    today: string;
  },
): { keep: Find[]; dropped: Array<{ find: Find; grund: string }> } {
  const abgelehnt = ctx.abgelehnt ?? ctx.state.abgelehnt;
  const byUrl = new Map<string, string>();
  const byHost = new Map<string, Provider[]>();
  for (const p of ctx.catalog)
    for (const url of urlsOf(p)) {
      const n = normalizeUrl(url);
      if (n && !byUrl.has(n)) byUrl.set(n, p.id);
      const h = hostOf(url);
      if (h) byHost.set(h, [...new Set([...(byHost.get(h) ?? []), p])]);
    }
  const rejectedUrls = new Map(
    abgelehnt.flatMap((a) => {
      const n = a.url ? normalizeUrl(a.url) : undefined;
      return n ? [[n, a.grund] as const] : [];
    }),
  );
  const rejectedHosts = new Map(
    abgelehnt.flatMap((a) => {
      const h = a.host;
      return h ? [[h.toLowerCase().replace(/^www\./, ""), a.grund] as const] : [];
    }),
  );
  const postponed = new Map(
    ctx.state.zurueckgestellt.flatMap((z) => {
      const n = normalizeUrl(z.url);
      return n ? [[n, z] as const] : [];
    }),
  );

  const keep: Find[] = [];
  const dropped: Array<{ find: Find; grund: string }> = [];
  const seen = new Set<string>();
  for (const find of finds) {
    const n = normalizeUrl(find.url);
    const host = hostOf(find.url);
    if (!n || !host) {
      dropped.push({ find, grund: "keine gültige Web-Adresse" });
      continue;
    }
    if (seen.has(n)) continue;
    seen.add(n);
    const drop = (grund: string) => dropped.push({ find, grund });
    const known = byUrl.get(n);
    const twin = (byHost.get(host) ?? []).find((p) => similarName(find.name, p.name));
    // ein abgelehnter Host gilt auch für seine Subdomains
    const rejected = rejectedUrls.get(n) ?? [...rejectedHosts].find(([h]) => host === h || host.endsWith(`.${h}`))?.[1];
    const waiting = postponed.get(n);
    if (FOREIGN_HOSTS.test(host)) drop("keine eigene Website (Netzwerk oder Suchdienst)");
    else if (known) drop(`steht im Katalog (${known})`);
    else if (twin) drop(`Host und Name wie ${twin.id}`);
    else if (rejected) drop(`abgelehnt: ${rejected}`);
    else if (waiting && waiting.wiedervorlage > ctx.today)
      drop(`zurückgestellt bis ${waiting.wiedervorlage}: ${waiting.grund}`);
    else keep.push(find);
  }
  return { keep, dropped };
}

/** Kandidat ohne Ertrag oder mit verworfener Bewertung: Wiedervorlage nach 8 Wochen (E7.6); ersetzt ältere Einträge. */
export function postpone(state: DiscoverState, find: Find, grund: string, today: string): DiscoverState {
  const n = normalizeUrl(find.url);
  return {
    ...state,
    zurueckgestellt: [
      ...state.zurueckgestellt.filter((z) => normalizeUrl(z.url) !== n),
      { url: find.url, name: find.name, grund, datum: today, wiedervorlage: addDays(today, WIEDERVORLAGE_DAYS) },
    ],
  };
}

/**
 * Sammelkalender (E7.1): Veranstalter ohne Katalog-Treffer (`lib/match.ts`) mit eigener Website und Baby- oder
 * Kleinkindbezug im Termin. Ohne Website gibt es nichts abzurufen, die Websuche findet sie gegebenenfalls.
 * Hinweise ohne Aktion: Seiten bekannter Anbieter auf deren Host, die der Katalog nicht kennt.
 */
export function aggregatorFinds(
  candidates: readonly Candidate[],
  catalog: readonly Provider[],
): { finds: Find[]; hints: string[] } {
  const finds = new Map<string, Find>();
  const hints = new Set<string>();
  const byId = new Map(catalog.map((p) => [p.id, p] as const));
  for (const c of candidates) {
    if (c.cancelled || !c.organizerUrl) continue;
    const n = normalizeUrl(c.organizerUrl);
    if (!n) continue;
    const m = matchCandidate(c, catalog);
    if (m.kind === "ok" || m.providerId !== undefined) {
      const p = byId.get(m.providerId ?? "");
      if (!p || (p.role === "anbieter" && p.coveredBy)) continue;
      const known = new Set(urlsOf(p).flatMap((u) => normalizeUrl(u) ?? []));
      const hosts = new Set(urlsOf(p).flatMap((u) => hostOf(u) ?? []));
      const host = hostOf(c.organizerUrl);
      // nur Unterseiten: die Startseite eines bekannten Anbieters ist keine neue Programmseite
      if (!known.has(n) && host && hosts.has(host) && n !== host)
        hints.add(`${p.id}: neue Programmseite? ${c.organizerUrl} (aus ${c.source})`);
      continue;
    }
    if (finds.has(n) || !isRelevant(c.title, c.subtitle, c.description)) continue;
    finds.set(n, {
      name: c.organizer ?? c.location ?? c.title,
      url: c.organizerUrl,
      warum: `Termin „${c.title}“ im Sammelkalender ${c.source}`,
      quelle: `sammelkalender:${c.source}`,
    });
  }
  return { finds: [...finds.values()], hints: [...hints] };
}

/** Website eines Hosts: die letzten zwei Teile (`st-georg.stadtkirche-nuernberg.de` → `stadtkirche-nuernberg.de`) */
const siteOf = (host: string) => host.split(".").slice(-2).join(".");

/** Linktext, der nach einem Veranstalter klingt (Verzeichnisse nennen Pfarreien, Vereine, Praxen) */
const PROVIDER_WORDS =
  /pfarr|gemeinde|kirche|\bst\.|sankt|famili|zentrum|verein|e\. ?v\.|praxis|hebamm|kita|krippe|musikschule|schwimm|turn|sport|bildung|treff|caf[eé]/i;

/**
 * Verzeichnisse (E7.1): Links auf andere Websites, deren Text nach einem Veranstalter oder nach Babys klingt; ob
 * sie neu sind, entscheidet der Vorfilter.
 */
export function directoryFinds(dir: Provider, links: ReadonlyArray<{ label: string; url: string }>): Find[] {
  const own = new Set(urlsOf(dir).flatMap((u) => (hostOf(u) ? [siteOf(hostOf(u) ?? "")] : [])));
  const out = new Map<string, Find>();
  for (const l of links) {
    const host = hostOf(l.url);
    const n = normalizeUrl(l.url);
    const label = l.label.replace(/\s+/g, " ").trim();
    // Navigation (Impressum, Presse, Ticketshop) und Seiten derselben Website kosten nur Bewertungen: Der
    // Trockenlauf vom 2026-10-11 verwarf 35 von 45 solcher Links (Plan 0032, „Stufe 4 – Umsetzung“)
    if (!host || !n || own.has(siteOf(host)) || FOREIGN_HOSTS.test(host) || out.has(n)) continue;
    if (!(isRelevant(label) || PROVIDER_WORDS.test(label))) continue;
    out.set(n, {
      name: label,
      url: l.url,
      warum: `Eintrag im Verzeichnis ${dir.name}`,
      quelle: `verzeichnis:${dir.id}`,
    });
    if (out.size >= MAX_DIRECTORY_FINDS) break;
  }
  return [...out.values()];
}

/** Nachricht an die Websuche (E7.2) */
export const searchMessage = (term: string, regionName: string): string =>
  `Suchbegriff: ${searchQuery(term, regionName)}\nRegion: ${regionName}`;

/** Text der abgerufenen Seite fürs Bewerten (der Abruf kürzt nur hier, das Bewerten braucht nicht alles) */
const ASSESS_MAX_CHARS = 30_000;
const ASSESS_MAX_LINKS = 200;

/** PDF am Content-Type oder an der Endung: beim Bewerten über `pdftotext` lesen, nicht als HTML */
export const isPdf = (contentType: string, url: string): boolean =>
  /application\/pdf/i.test(contentType) || /\.pdf$/i.test(parseUrl(url)?.pathname ?? "");

/** Seite eines Kandidaten nach dem Abruf (`extractPage`) */
export interface FetchedFind {
  finalUrl: string;
  text: string;
  links: ReadonlyArray<{ label: string; url: string }>;
}

/** Seiten mit der Adresse: Reihenfolge = Vorrang (Kontakt vor Anfahrt vor Impressum vor „Über uns“) */
const CONTACT_PATTERNS = [
  /kontakt|contact/i,
  /anfahrt|standort|so finden sie uns|lageplan|adresse/i,
  /impressum|imprint/i,
  /über uns|ueber-uns|uber-uns|about/i,
];
/** weitere Seiten je Kandidat und Zeichen je Seite im Bewerten */
const MAX_CONTACT_PAGES = 2;
const CONTACT_MAX_CHARS = 8_000;

/**
 * Dieselbe Website: gleicher Host oder einer ist Subdomain des anderen (`www.`, `info.`). Strenger als „letzte zwei
 * Teile“, damit zwei Seiten beim selben Baukasten-Hoster (`*.jimdofree.com`) nicht als eine gelten (Arch-Review S4b,
 * m2). Interne Adressen: nie (`hostOf` liefert dann nichts).
 */
export function sameSite(a: string, b: string): boolean {
  const x = hostOf(a);
  const y = hostOf(b);
  return x !== undefined && y !== undefined && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`));
}

/**
 * Kontakt- oder Adressseiten derselben Website aus den Links der Fund-Seite (Nutzerentscheid 2026-10-11, Option A):
 * Startseiten nennen die Kursorte oft nicht, das Bewerten verwarf deshalb passende Anbieter. Höchstens zwei, nach
 * Vorrang; erkannt am Linktext oder am Pfad. Interne Adressen schließt `parseUrl` aus.
 */
export function contactLinks(page: FetchedFind): string[] {
  const self = normalizeUrl(page.finalUrl);
  if (!self) return [];
  const ranked = new Map<string, number>();
  for (const l of page.links) {
    const n = normalizeUrl(l.url);
    if (!n || n === self || !sameSite(l.url, page.finalUrl)) continue;
    const path = parseUrl(l.url)?.pathname ?? "";
    const rank = CONTACT_PATTERNS.findIndex((p) => p.test(l.label) || p.test(path));
    if (rank >= 0 && !ranked.has(n)) ranked.set(n, rank);
  }
  const urls = new Map(page.links.map((l) => [normalizeUrl(l.url) ?? "", l.url] as const));
  return [...ranked]
    .sort(([, a], [, b]) => a - b)
    .slice(0, MAX_CONTACT_PAGES)
    .flatMap(([n]) => urls.get(n) ?? []);
}

/** Nachricht ans Bewerten (E7.4): Region, Kandidat, Text und Links der abgerufenen Seite, weitere Seiten (Kontakt) */
export function assessMessage(
  find: Find,
  page: FetchedFind,
  regionName: string,
  extra: ReadonlyArray<{ url: string; text: string }> = [],
): string {
  const links = page.links
    .filter((l) => parseUrl(l.url))
    .slice(0, ASSESS_MAX_LINKS)
    .map((l) => `${l.label.replace(/\s+/g, " ").slice(0, 80)} -> ${l.url}`);
  return [
    `Region: ${regionName}`,
    `Kandidat: ${find.name} (gefunden über ${find.quelle}: ${find.warum})`,
    `Abgerufene Seite: ${page.finalUrl}`,
    `## TEXT\n${page.text.slice(0, ASSESS_MAX_CHARS)}${page.text.length > ASSESS_MAX_CHARS ? "\n[… gekürzt]" : ""}`,
    ...extra.map((x) => `## WEITERE SEITE: ${x.url}\n${x.text.slice(0, CONTACT_MAX_CHARS)}`),
    `## LINKS\n${links.join("\n")}`,
  ].join("\n\n");
}

/** Erlaubte Programmseiten eines Kandidaten: Fund-URL, abgerufene Seite und ihre Links */
export const allowedUrlsOf = (find: Find, page: FetchedFind): string[] => [
  find.url,
  page.finalUrl,
  ...page.links.map((l) => l.url),
];

/** Antwort der Websuche (E7.2) */
const SearchResponse = z.strictObject({
  kandidaten: z
    .array(z.strictObject({ name: z.string().min(1).max(160), url: z.string().min(1), warum: z.string().max(400) }))
    .max(20),
});

/** JSON Schema ohne `$schema` (die CLI 2.1.296 bricht sonst ab, Stufe 2) */
const jsonSchemaOf = (schema: z.ZodType): object => {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return rest;
};

export const searchResponseSchema = (): object => jsonSchemaOf(SearchResponse);

/** Treffer der Websuche als Kandidaten; Einträge ohne gültige URL entfallen still (der Vorfilter zählt sie nicht). */
export function findsFromSearch(output: unknown, term: string): { ok: true; finds: Find[] } | { ok: false } {
  const parsed = SearchResponse.safeParse(output);
  if (!parsed.success) return { ok: false };
  return {
    ok: true,
    finds: parsed.data.kandidaten.flatMap((k) =>
      parseUrl(k.url) ? [{ name: k.name, url: k.url, warum: k.warum, quelle: `suche:${term}` }] : [],
    ),
  };
}

const AssessEntrySchema = z.strictObject({
  name: z.string().min(1).max(120),
  url: z.string(),
  /** Alter, das der Anbieter insgesamt bedient (vollendete Monate) */
  age: z.strictObject({ minMonths: z.int().min(0).max(216), maxMonths: z.int().min(0).max(216) }).optional(),
  programme: z
    .array(
      z.strictObject({
        url: z.string(),
        kind: z.enum(["html", "pdf", "ical", "json-api"]),
        render: z.literal("browser").optional(),
        use: z.enum(["termine", "verfuegbarkeit", "info"]),
      }),
    )
    .max(8),
  venues: z
    .array(z.strictObject({ name: z.string().min(1), address: z.string().min(5) }))
    .min(1)
    .max(5),
  availability: z.enum(["ja", "teilweise", "nein", "unbekannt"]),
});
export type AssessEntry = z.infer<typeof AssessEntrySchema>;

/** Antwort des Bewertens (E7.4): verwerfen mit Grund oder Katalogeintrag als Ausschnitt von `Provider` */
const AssessResponse = z.strictObject({
  entscheidung: z.enum(["aufnehmen", "verwerfen"]),
  grund: z.string().min(1).max(400),
  eintrag: AssessEntrySchema.optional(),
});

export const assessResponseSchema = (): object => jsonSchemaOf(AssessResponse);

export function parseAssessment(
  output: unknown,
):
  | { kind: "aufnehmen"; grund: string; entry: AssessEntry }
  | { kind: "verwerfen"; grund: string }
  | { kind: "ungueltig" } {
  const parsed = AssessResponse.safeParse(output);
  if (!parsed.success) return { kind: "ungueltig" };
  const { entscheidung, grund, eintrag } = parsed.data;
  if (entscheidung === "verwerfen") return { kind: "verwerfen", grund };
  return eintrag ? { kind: "aufnehmen", grund, entry: eintrag } : { kind: "ungueltig" };
}

/**
 * Zurückgenommene Anbieter (`abgelehnt` mit `id`/`publicId`, alle Regionen): Ihre IDs werden nie neu vergeben (ADR
 * 0022: eine `publicId` in alten Links und Merklisten darf nie auf einen anderen Anbieter zeigen).
 */
export function reservedIds(states: readonly DiscoverState[]): { ids: Set<string>; publicIds: Set<string> } {
  const entries = states.flatMap((s) => s.abgelehnt);
  return {
    ids: new Set(entries.flatMap((a) => (a.id ? [a.id] : []))),
    publicIds: new Set(entries.flatMap((a) => (a.publicId ? [a.publicId] : []))),
  };
}

/** Katalog-ID (E7.7): kebab aus dem Namen, bei Kollision mit Suffix; nie in der Form einer `publicId` (ADR 0022). */
export function catalogId(
  name: string,
  catalog: readonly Provider[],
  reserved: ReadonlySet<string> = new Set(),
): string {
  const taken = new Set([...catalog.map((p) => p.id), ...reserved]);
  let base = slug(name, 50);
  if (SHORT_ID_PATTERN.test(base)) base = `${base}-anbieter`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/**
 * Katalogeintrag aus der Bewertung (E7.4, E7.7). IDs, `publicId`, Region, `verified` und Notiz setzt der Code.
 * Programmseiten nur, wenn ihre URL auf der abgerufenen Seite steht (Schutz vor Prompt-Injection: der Abruf folgt
 * keiner vom Modell erfundenen Adresse). Die Orte kommen mit Koordinaten aus dem Geocoder (`geos`, gleiche Reihenfolge).
 */
export function entryFromAssessment(
  a: AssessEntry,
  ctx: {
    find: Find;
    grund: string;
    region: RegionId;
    catalog: readonly Provider[];
    /** zurückgenommene Katalog-IDs und publicIds (`reservedIds`), gelten als belegt */
    reserved?: { ids: ReadonlySet<string>; publicIds: ReadonlySet<string> };
    today: string;
    geos: ReadonlyArray<{ lat: number; lon: number; district?: string | undefined }>;
    allowedUrls: readonly string[];
  },
): { ok: true; entry: Anbieter; notes: string[] } | { ok: false; grund: string } {
  const allowed = new Set(ctx.allowedUrls.flatMap((u) => normalizeUrl(u) ?? []));
  const notes: string[] = [];
  const programme = a.programme.filter((g) => {
    const n = normalizeUrl(g.url);
    if (n && allowed.has(n)) return true;
    notes.push(`Programmseite nicht auf der abgerufenen Seite verlinkt: ${g.url}`);
    return false;
  });
  if (!programme.some((g) => g.use === "termine"))
    return { ok: false, grund: "keine abrufbare Terminseite (use: termine)" };
  const knownPages = new Map(
    ctx.catalog.flatMap((p) => p.programme.flatMap((g) => normalizeUrl(g.url) ?? []).map((n) => [n, p.id] as const)),
  );
  const owner = programme.map((g) => knownPages.get(normalizeUrl(g.url) ?? "")).find(Boolean);
  if (owner) return { ok: false, grund: `Programmseite steht schon im Katalog (${owner})` };
  const { bbox } = REGIONS[ctx.region];
  if (ctx.geos.length !== a.venues.length) return { ok: false, grund: "Orte ohne Koordinaten" };
  // Orte außerhalb der Region fallen weg (Nutzerentscheid 2026-10-11, wie „musikfuechse nur Nürnberg“); verworfen
  // wird nur, wenn keiner übrig bleibt
  const located = a.venues.map((v, i) => ({ v, g: ctx.geos[i] ?? { lat: 0, lon: 0 } }));
  const inside = located.filter((x) => inBounds(x.g, bbox));
  const outside = located.filter((x) => !inBounds(x.g, bbox));
  if (inside.length === 0)
    return {
      ok: false,
      grund: `kein Ort in der Region ${REGIONS[ctx.region].name} (außerhalb: ${outside.map((x) => x.v.address).join("; ")})`,
    };
  for (const x of outside) notes.push(`Ort außerhalb der Region weggelassen: ${x.v.name}, ${x.v.address}`);
  const outsideHint =
    outside.length > 0
      ? `Nur Termine an ${inside.map((x) => x.v.name).join(", ")}; Termine an ${outside.map((x) => x.v.name).join(", ")} weglassen (außerhalb der Region)`
          .replace(/\d{1,2}\.\d{1,2}\./g, "")
          .slice(0, 200)
      : undefined;

  const reservedIds = ctx.reserved?.ids ?? new Set<string>();
  const id = catalogId(a.name, ctx.catalog, reservedIds);
  const usedPublic = new Set([
    ...ctx.catalog.flatMap((p) => (p.role === "anbieter" ? [p.publicId] : [])),
    ...(ctx.reserved?.publicIds ?? []),
  ]);
  // Orts-IDs zurückgenommener Anbieter: belegt ist nur deren Basis-ID (Orts-IDs sind intern, `offerKey` trägt die
  // Anbieter-ID; Arch-Review S4b, m6)
  const usedVenues = new Set([
    ...ctx.catalog.flatMap((p) => (p.role === "anbieter" ? p.venues.map((v) => v.id) : [])),
    ...reservedIds,
  ]);
  const venueId = () => {
    let vid = id;
    for (let i = 2; usedVenues.has(vid); i++) vid = `${id}-${i}`;
    usedVenues.add(vid);
    return vid;
  };
  const homepage = normalizeUrl(a.url) && allowed.has(normalizeUrl(a.url) ?? "") ? a.url : ctx.find.url;
  const entry = {
    id,
    publicId: nextPublicId(id, usedPublic),
    role: "anbieter" as const,
    region: ctx.region,
    name: a.name,
    url: homepage,
    ...(a.age ? { age: a.age } : {}),
    programme: programme.map((g) => ({
      url: g.url,
      kind: g.kind,
      ...(g.render ? { render: g.render } : {}),
      use: g.use,
      // Der Extraktor sieht nur den Katalogauszug: ohne Hint landeten Termine an weggelassenen Orten am ersten Ort
      // (prompt/extract.md, „Hauptort“); wie musikfuechse (Arch-Review S4c, M1)
      ...(outsideHint && g.use === "termine" ? { hint: outsideHint } : {}),
    })),
    availability: { shown: a.availability },
    verified: ctx.today,
    notes: [`Entdeckt ${ctx.today} über ${ctx.find.quelle}: ${ctx.find.url} – ${ctx.grund}`.replaceAll(" | ", " / ")],
    venues: inside.map(({ v, g }) => {
      return {
        id: venueId(),
        name: v.name,
        address: v.address,
        ...(g.district ? { district: g.district } : {}),
        geo: { lat: g.lat, lon: g.lon },
      };
    }),
  };
  const checked = ProviderSchema.safeParse(entry);
  if (!checked.success)
    return {
      ok: false,
      grund: `Katalogeintrag ungültig: ${checked.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
    };
  return checked.data.role === "anbieter"
    ? { ok: true, entry: checked.data, notes }
    : { ok: false, grund: "kein Anbieter" };
}

/**
 * Ertragsbeweis (E7.6, N-D): mindestens ein gültiges Angebot des neuen Anbieters für 0–3 Jahre mit künftigem Termin
 * (nach dem Build, also schon geprüft) UND Baby- oder Kleinkindbezug im abgerufenen Text (`isRelevant`, Review M2).
 */
export function proveYield(
  offers: readonly Offer[],
  providerId: string,
  text: string,
  now: string,
): { ok: true; first: Offer; start: string } | { ok: false; grund: string } {
  const t = Date.parse(now);
  // je Angebot der erste künftige Termin; berichtet wird das Angebot mit dem frühesten (Arch-Review S4, m4)
  const next = offers
    .filter((o) => o.providerId === providerId && (o.age === undefined || o.age.minMonths <= 36))
    .flatMap((o) => {
      const s = o.sessions.find((x) => Date.parse(x.start) >= t);
      return s ? [{ first: o, start: s.start }] : [];
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  if (!next) return { ok: false, grund: "kein Angebot für 0–3 Jahre mit künftigem Termin" };
  if (!isRelevant(text)) return { ok: false, grund: "kein Baby- oder Kleinkindbezug im abgerufenen Text" };
  return { ok: true, ...next };
}

/** Hinweise ohne Aktion (E7): Quellen mit Fehlerserie seit mehr als 14 Tagen. */
export function staleHints(raws: Readonly<Record<string, ProviderRaw>>, today: string): string[] {
  const limit = addDays(today, -STALE_DAYS);
  // nur ganz ausgefallene Anbieter; einzelne Seiten meldet der Wächter (Plan 0048, S2, dann entfällt diese Funktion)
  return Object.entries(raws)
    .map(([id, raw]) => [id, providerStatus(raw)] as const)
    .filter(([, s]) => s.status === "fehler" && s.failingSince !== undefined && berlinIsoDate(s.failingSince) < limit)
    .map(
      ([id, s]) => `${id}: Quelle fehlerhaft seit ${berlinIsoDate(s.failingSince ?? "")} (${s.reason ?? "ohne Grund"})`,
    );
}

/** Aufgenommen (oder im Trockenlauf: würde aufgenommen) */
export interface Adopted {
  id: string;
  name: string;
  region: RegionId;
  find: Find;
  grund: string;
  first: { title: string; start: string; url: string };
  /** Hinweise zum Eintrag (weggelassene Orte und Programmseiten), auch im Commit-Text */
  notes?: string[];
}

export interface RegionReport {
  region: RegionId;
  /** Kandidaten vor dem Vorfilter */
  finds: number;
  dropped: Array<{ find: Find; grund: string }>;
  adopted: Adopted[];
  rejected: Array<{ find: Find; grund: string }>;
  /** nach dem Vorfilter übrig, aber nicht bewertet (G3, Bremse, Zeitbudget, Abbruch) */
  unassessed?: Find[];
  hints: string[];
}

export interface DiscoverReport {
  date: string;
  dryRun: boolean;
  durationMs: number;
  regions: RegionReport[];
  calls: CallRecord[];
  abort?: "auth" | "limit";
  brake?: "aufrufe" | "tokens";
  budgetHit: boolean;
  /** G2 im Trockenlauf verletzt (im Modus live bricht G2 den Lauf ab) */
  gateErrors?: string[];
  /** Entdecken-Eval (`--hide`): was aus den ausgeblendeten Anbietern wurde */
  hidden?: HiddenEval;
}

/** Ausgang eines ausgeblendeten Anbieters im Entdecken-Eval; Vorrang in dieser Reihenfolge */
interface HiddenOutcome {
  id: string;
  name: string;
  ergebnis: "aufgenommen" | "verworfen" | "nicht bewertet" | "vorfilter" | "nicht gefunden";
  /** Fund-URL des passenden Kandidaten */
  url?: string;
  grund?: string;
}

export interface HiddenEval {
  outcomes: HiddenOutcome[];
  /** aufgenommen, aber zu keinem ausgeblendeten passend: neu oder falsch, von Hand zu beurteilen */
  extra: Adopted[];
}

/**
 * Entdecken-Eval (Plan 0032, E9): blendet bekannte Anbieter für einen Trockenlauf aus Katalog und Katalogtext aus,
 * damit Vorfilter, Bewerten und Ertragsbeweis sie wie unbekannte behandeln. Nur `anbieter`; Sammelkalender und
 * Verzeichnisse sind Quellen des Entdeckens selbst.
 */
export function hideProviders(
  catalog: readonly Provider[],
  text: string,
  ids: readonly string[],
): { catalog: Provider[]; text: string; hidden: Provider[] } {
  const wanted = new Set(ids);
  for (const id of wanted) {
    const p = catalog.find((x) => x.id === id);
    if (!p) throw new Error(`${id}: nicht im Katalog`);
    if (p.role !== "anbieter") throw new Error(`${id}: kein Anbieter (${p.role})`);
  }
  return {
    catalog: catalog.filter((p) => !wanted.has(p.id)),
    text: removeEntries(text, [...wanted]),
    hidden: catalog.filter((p) => wanted.has(p.id)),
  };
}

/** Kandidat passt zu einem Anbieter: gleiche URL oder gleicher Host mit ähnlichem Namen (wie der Vorfilter) */
function matchesProvider(find: Find, p: Provider): boolean {
  const n = normalizeUrl(find.url);
  const host = hostOf(find.url);
  if (n && urlsOf(p).some((u) => normalizeUrl(u) === n)) return true;
  return host !== undefined && urlsOf(p).some((u) => hostOf(u) === host) && similarName(find.name, p.name);
}

/** Aufnahme passt über den Fund oder über den Namen des Eintrags (Funde aus Verzeichnissen heißen oft nur „Kinder & Familie“) */
const adoptedMatches = (a: Adopted, p: Provider): boolean =>
  matchesProvider(a.find, p) || matchesProvider({ ...a.find, name: a.name }, p);

/** Wertet einen Lauf mit ausgeblendeten Anbietern aus: je Anbieter der beste Ausgang, dazu fremde Aufnahmen. */
export function hiddenEval(hidden: readonly Provider[], regions: readonly RegionReport[]): HiddenEval {
  const adopted = regions.flatMap((r) => r.adopted);
  const rejected = regions.flatMap((r) => r.rejected);
  const dropped = regions.flatMap((r) => r.dropped);
  const unassessed = regions.flatMap((r) => r.unassessed ?? []);
  const outcomes = [...hidden]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p): HiddenOutcome => {
      const base = { id: p.id, name: p.name };
      const a = adopted.find((x) => adoptedMatches(x, p));
      if (a) return { ...base, ergebnis: "aufgenommen", url: a.find.url };
      const r = rejected.find((x) => matchesProvider(x.find, p));
      if (r) return { ...base, ergebnis: "verworfen", url: r.find.url, grund: r.grund };
      const u = unassessed.find((x) => matchesProvider(x, p));
      if (u)
        return {
          ...base,
          ergebnis: "nicht bewertet",
          url: u.url,
          grund: "Lauf vor dem Bewerten beendet (G3, Bremse, Zeit)",
        };
      const d = dropped.find((x) => matchesProvider(x.find, p));
      if (d) return { ...base, ergebnis: "vorfilter", url: d.find.url, grund: d.grund };
      return { ...base, ergebnis: "nicht gefunden" };
    });
  const extra = adopted.filter((a) => !hidden.some((p) => adoptedMatches(a, p)));
  return { outcomes, extra };
}

/** G4: ein Commit je Anbieter mit Fund-URL, Grund und erstem Angebot */
export function newProviderCommitMessage(a: Adopted): string {
  // Name, Grund und Titel stammen aus Modell bzw. Webtext: einzeilig und gekürzt, sonst könnten sie Felder
  // wie „Fund-URL:“ vortäuschen, die `newProvidersIssue` liest (Arch-Review S4, m3)
  const line = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 200);
  return [
    `data: neuer Anbieter ${a.id} (${a.region})`,
    "",
    `Name: ${line(a.name)}`,
    `Fund-URL: ${line(a.find.url)}`,
    `Quelle: ${line(a.find.quelle)}`,
    `Grund: ${line(a.grund)}`,
    `Erstes Angebot: ${line(a.first.title)} am ${formatGermanDate(berlinIsoDate(a.first.start))} (${line(a.first.url)})`,
    ...(a.notes ?? []).map((n) => `Hinweis: ${line(n)}`),
    "",
    "Plan 0032, E7 (pnpm pipeline discover)",
  ].join("\n");
}

/**
 * Gates im Trockenlauf (Arch-Review S4, m5): G2 (nur die aufgenommenen Einträge neu, in dieser Reihenfolge) und der
 * Katalogteil von G1 (`validateDataset` wie `data:validate`) auf dem Katalog des Laufs. Im Modus live
 * prüfen beides `commitNewProvider` und `data:validate`.
 */
export function dryRunCatalogIssues(
  before: unknown,
  after: unknown,
  added: readonly string[],
  today: string,
): string[] {
  const d = catalogDiff(before, after);
  if (!d.ok) return d.errors.map((e) => `G2: ${e}`);
  if (d.added.join(",") !== added.join(","))
    return [`G2: neue Katalogeinträge ${d.added.join(", ") || "keine"}, erwartet ${added.join(", ") || "keine"}`];
  const check = validateDataset(after, {
    generatedAt: `${today}T00:00:00+00:00`,
    horizon: { from: today, to: today },
    offers: [],
  });
  return check.ok ? [] : check.errors.map((e) => `G1 (Katalog): ${e}`);
}

/** Abbruchgrund für Bericht und `kosten.csv` */
export const abortOf = (r: Pick<DiscoverReport, "abort" | "brake" | "budgetHit">): string =>
  r.abort ?? r.brake ?? (r.budgetHit ? "zeit" : "");

const cell = (s: string) => s.replaceAll("|", "/").replaceAll("\n", " ").slice(0, 200);

/** Markdown für `runs/<datum>/discover/report.md` und `$GITHUB_STEP_SUMMARY` (E10). */
export function renderDiscoverReport(r: DiscoverReport): string {
  const stop = abortOf(r);
  const out = [
    `# Entdecken ${r.date}${r.dryRun ? " (Trockenlauf)" : ""}${stop ? ` – rot: vorzeitig beendet (${stop})` : ""}`,
    "",
    `- Dauer ${Math.round(r.durationMs / 60_000)} Min.`,
    ...(r.gateErrors ?? []).map((e) => `- **rot:** ${cell(e)}`),
  ];
  const results: Record<string, string> = {};
  for (const reg of r.regions) {
    out.push(
      "",
      `## Region ${REGIONS[reg.region].name}: ${reg.adopted.length} ${r.dryRun ? "würden aufgenommen" : "neu"}, ` +
        `${reg.rejected.length} verworfen, ${reg.dropped.length} im Vorfilter (von ${reg.finds} Kandidaten)`,
      "",
      r.dryRun ? "## Würde aufnehmen" : "## Aufgenommen",
      "",
    );
    if (reg.adopted.length === 0) out.push("keine");
    else {
      out.push("| ID | Name | Fund-URL | Grund | erstes Angebot |", "|---|---|---|---|---|");
      for (const a of reg.adopted) {
        results[hostOf(a.find.url) ?? a.find.url] = "aufgenommen";
        out.push(
          `| ${a.id} | ${cell(a.name)} | ${a.find.url} | ${cell(a.grund)} | ` +
            `${cell(a.first.title)}, ${formatGermanDate(berlinIsoDate(a.first.start))} |`,
        );
      }
    }
    out.push("", "## Verworfen", "");
    if (reg.rejected.length === 0) out.push("keine");
    else {
      out.push("| Kandidat | URL | Quelle | Grund |", "|---|---|---|---|");
      for (const x of reg.rejected) {
        results[hostOf(x.find.url) ?? x.find.url] ??= "verworfen";
        out.push(`| ${cell(x.find.name)} | ${x.find.url} | ${x.find.quelle} | ${cell(x.grund)} |`);
      }
    }
    if (reg.dropped.length > 0) {
      out.push("", `<details><summary>Vorfilter (${reg.dropped.length})</summary>`, "");
      for (const d of reg.dropped) out.push(`- ${cell(d.find.name)} (${d.find.url}): ${cell(d.grund)}`);
      out.push("", "</details>");
    }
    out.push("", "## Hinweise ohne Aktion", "");
    out.push(...(reg.hints.length > 0 ? reg.hints.map((h) => `- ${cell(h)}`) : ["keine"]));
  }
  if (r.hidden) out.push("", ...hiddenSection(r.hidden));
  out.push("", ...costSection(summarizeCosts(r.calls, { cached: 0 }), results));
  return `${out.join("\n")}\n`;
}

function hiddenSection(h: HiddenEval): string[] {
  const back = h.outcomes.filter((o) => o.ergebnis === "aufgenommen").length;
  const found = h.outcomes.filter((o) => o.ergebnis !== "nicht gefunden").length;
  return [
    `## Eval: ausgeblendete Anbieter (${back} von ${h.outcomes.length} wiedergefunden, ${found} gefunden)`,
    "",
    "| ID | Ergebnis | Fund-URL | Grund |",
    "|---|---|---|---|",
    ...h.outcomes.map((o) => `| ${o.id} | ${o.ergebnis} | ${o.url ?? ""} | ${cell(o.grund ?? "")} |`),
    "",
    `Zusätzlich aufgenommen (nicht ausgeblendet): ${h.extra.length}`,
    ...h.extra.map((a) => `- ${a.id}: ${cell(a.name)} (${a.find.url})`),
  ];
}

const NEW_PROVIDER_SUBJECT = /^data: neuer Anbieter (\S+) \((\S+)\)$/;

/**
 * Text des Issues „Neue Anbieter <datum>“ (E7.10) aus den gepushten Commits: je neuem Anbieter Commit-Link, Name
 * und Fund-URL aus dem Commit-Text (G4). Ohne neuen Anbieter `undefined` (dann kein Issue).
 */
export function newProvidersIssue(
  commits: ReadonlyArray<{ sha: string; message: string }>,
  o: { repoUrl: string; date: string },
): { title: string; body: string } | undefined {
  const lines = commits.flatMap((c) => {
    const [subject = "", ...rest] = c.message.split("\n");
    const m = NEW_PROVIDER_SUBJECT.exec(subject);
    if (!m) return [];
    // „@“ entschärft: Webtext soll im Issue niemanden erwähnen (Arch-Review S4, m3)
    const field = (name: string) =>
      (rest.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2) ?? "–").replaceAll("@", "(at)");
    return [
      `- [${m[1]}](${o.repoUrl}/commit/${c.sha}) (${m[2]}): ${field("Name")} – Fund-URL ${field("Fund-URL")}; ` +
        `erstes Angebot: ${field("Erstes Angebot")}`,
    ];
  });
  if (lines.length === 0) return undefined;
  return {
    title: `Neue Anbieter ${o.date}`,
    body: [
      `Das Entdecken (Plan 0032, E7) hat ${lines.length} neue Anbieter aufgenommen:`,
      "",
      ...lines,
      "",
      "Falsch aufgenommen? Eintrag in `data/providers.yaml` und `data/raw/<id>.json` entfernen (vor dem ersten " +
        "Nachtlauf geht auch ein Revert des Commits) und URL oder Host mit Grund in " +
        "`data/discover/<region>.json` unter `abgelehnt` eintragen, mit `id` und `publicId` des Eintrags (sie werden nie " +
        "neu vergeben), sonst findet ihn die nächste Woche wieder.",
    ].join("\n"),
  };
}
