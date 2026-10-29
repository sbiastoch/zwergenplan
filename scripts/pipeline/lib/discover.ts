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
import { haversineMeters, inBounds } from "../../../src/domain/geo.ts";
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
import {
  type EvalOutcome,
  forUnderThree,
  type Kennzahlen,
  kennzahlen,
  quellenZahlen,
  resultsRow,
  STUFEN,
  type Stufe,
  type Urteile,
} from "./eval-discover.ts";
import type { CallRecord } from "./extract.ts";
import { matchCandidate } from "./match.ts";
import { isInternalHost } from "./redirect.ts";
import { isRelevant } from "./relevance.ts";
import { costSection } from "./report.ts";
import { ratio } from "./similar.ts";

/** G3: höchstens so viele neue Anbieter je Lauf und Region (mit `--bootstrap` gilt `MAX_NEW`) */
export const MAX_NEW_PER_RUN = 10;
/** Wiedervorlage eines Kandidaten ohne Ertrag (E7.6): 8 Wochen */
const WIEDERVORLAGE_DAYS = 56;
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
 * Vorfilter (E7.3): bekannte URL, bekannter Host mit ähnlichem Namen, `abgelehnt`, noch zurückgestellt, ausgesetzter
 * Klärfall (Plan 0050, E5). Bekannte und abgelehnte tragen `bekannt` (beendet ihren Klärfall). `abgelehnt`
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
): { keep: Find[]; dropped: Array<{ find: Find; grund: string; bekannt?: true }> } {
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

  const suspended = new Map(
    ctx.state.klaerfaelle.flatMap((k) => {
      const n = normalizeUrl(k.url);
      return n && k.aussetzenBis !== undefined && k.aussetzenBis > ctx.today ? [[n, k.aussetzenBis] as const] : [];
    }),
  );

  const keep: Find[] = [];
  const dropped: Array<{ find: Find; grund: string; bekannt?: true }> = [];
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
    // bekannt: ein offener Klärfall mit dieser URL endet damit (Plan 0050, E5)
    const dropKnown = (grund: string) => dropped.push({ find, grund, bekannt: true });
    const known = byUrl.get(n);
    const twin = (byHost.get(host) ?? []).find((p) => similarName(find.name, p.name));
    // ein abgelehnter Host gilt auch für seine Subdomains
    const rejected = rejectedUrls.get(n) ?? [...rejectedHosts].find(([h]) => host === h || host.endsWith(`.${h}`))?.[1];
    const waiting = postponed.get(n);
    const pause = suspended.get(n);
    if (FOREIGN_HOSTS.test(host)) drop("keine eigene Website (Netzwerk oder Suchdienst)");
    else if (known) dropKnown(`steht im Katalog (${known})`);
    else if (twin) dropKnown(`Host und Name wie ${twin.id}`);
    else if (rejected) dropKnown(`abgelehnt: ${rejected}`);
    else if (waiting && waiting.wiedervorlage > ctx.today)
      drop(`zurückgestellt bis ${waiting.wiedervorlage}: ${waiting.grund}`);
    else if (pause) drop(`Klärfall ausgesetzt bis ${pause}`);
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
 * keiner vom Modell erfundenen Adresse). Die Orte kommen mit Koordinaten aus dem Geocoder (`geos`, gleiche Reihenfolge;
 * `null` = kein Treffer).
 *
 * Plan 0050, E5: Orte außerhalb und ohne Treffer fallen weg, die Terminseiten bekommen einen `hint`, der nur sie nennt.
 * Verworfen wird nur, wenn alle Orte außerhalb liegen; bleibt sonst keiner übrig, passt der `hint` nicht in 200
 * Zeichen oder steht eine Programmseite schon im Katalog (E4.6), wird der Kandidat ein Klärfall.
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
    geos: ReadonlyArray<{ lat: number; lon: number; district?: string | undefined } | null>;
    allowedUrls: readonly string[];
  },
): { ok: true; entry: Anbieter; notes: string[] } | { ok: false; grund: string; klaerfall?: true; dublette?: true } {
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
  if (owner)
    return { ok: false, grund: `Dublette von ${owner}? (gleiche Programmseite)`, klaerfall: true, dublette: true };
  const { bbox } = REGIONS[ctx.region];
  if (ctx.geos.length !== a.venues.length) return { ok: false, grund: "Orte ohne Koordinaten" };
  // Orte außerhalb der Region fallen weg (Nutzerentscheid 2026-10-11, wie „musikfuechse nur Nürnberg“), ebenso Orte
  // ohne Treffer (Plan 0050, E5); verworfen wird nur, wenn alle außerhalb liegen
  const located = a.venues.map((v, i) => ({ v, g: ctx.geos[i] ?? null }));
  const inside = located.flatMap((x) => (x.g && inBounds(x.g, bbox) ? [{ v: x.v, g: x.g }] : []));
  const outside = located.filter((x) => x.g && !inBounds(x.g, bbox));
  const missing = located.filter((x) => x.g === null);
  if (inside.length === 0 && missing.length === 0)
    return {
      ok: false,
      grund: `kein Ort in der Region ${REGIONS[ctx.region].name} (außerhalb: ${outside.map((x) => x.v.address).join("; ")})`,
    };
  if (inside.length === 0)
    return {
      ok: false,
      grund: `Geocoder ohne Treffer für ${missing.map((x) => x.v.address).join("; ")}${outside.length > 0 ? ", übrige Orte außerhalb" : ""}`,
      klaerfall: true,
    };
  for (const x of outside) notes.push(`Ort außerhalb der Region weggelassen: ${x.v.name}, ${x.v.address}`);
  for (const x of missing) notes.push(`Ort ohne Treffer im Geocoder weggelassen: ${x.v.name}, ${x.v.address}`);
  const omitted = located.filter((x) => !inside.some((i) => i.v === x.v)).map((x) => x.v.name);
  // nennt nur die weggelassenen Orte, sonst landeten deren Termine am ersten Ort (prompt/extract.md, „Hauptort“)
  const omittedHint =
    omitted.length > 0
      ? `Termine an ${omitted.join(", ")} weglassen (Ort nicht im Eintrag)`.replace(/\d{1,2}\.\d{1,2}\./g, "")
      : undefined;
  if (omittedHint && omittedHint.length > 200)
    return {
      ok: false,
      grund: `hint für weggelassene Orte über 200 Zeichen (${omitted.length} Orte)`,
      klaerfall: true,
    };

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
      ...(omittedHint && g.use === "termine" ? { hint: omittedHint } : {}),
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

/** Umkreis, in dem ein Ort mit ähnlichem Anbieternamen eine mögliche Dublette ist (Plan 0050, E4.6) */
const DUPLICATE_RADIUS_M = 100;

/**
 * Mögliche Dublette (Plan 0050, E4.6): ähnlicher Anbietername und ein Ort im Umkreis von 100 m um einen Ort eines
 * Katalog-Anbieters. Gastanbieter in einem Familienzentrum haben andere Namen und bleiben so Kandidaten. Ergebnis ist
 * ein Klärfall, keine Verwerfung („lieber Dublette als verschluckter Anbieter“).
 */
export function possibleDuplicate(
  entry: { name: string; venues: ReadonlyArray<{ geo: { lat: number; lon: number } }> },
  catalog: readonly Provider[],
): string | undefined {
  const twin = catalog.find(
    (p) =>
      p.role === "anbieter" &&
      similarName(entry.name, p.name) &&
      p.venues.some((v) => entry.venues.some((e) => haversineMeters(v.geo, e.geo) <= DUPLICATE_RADIUS_M)),
  );
  return twin ? `Dublette von ${twin.id}? (ähnlicher Name, Ort ≤ ${DUPLICATE_RADIUS_M} m)` : undefined;
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
    .filter((o) => o.providerId === providerId && forUnderThree(o))
    .flatMap((o) => {
      const s = o.sessions.find((x) => Date.parse(x.start) >= t);
      return s ? [{ first: o, start: s.start }] : [];
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  if (!next) return { ok: false, grund: "kein Angebot für 0–3 Jahre mit künftigem Termin" };
  if (!isRelevant(text)) return { ok: false, grund: "kein Baby- oder Kleinkindbezug im abgerufenen Text" };
  return { ok: true, ...next };
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
  /** Lage der Orte des Eintrags: Zuordnung über Ortsnähe im Eval (Plan 0050, E6) */
  orte?: Array<{ lat: number; lon: number }>;
}

export interface RegionReport {
  region: RegionId;
  /** Kandidaten vor dem Vorfilter */
  finds: number;
  dropped: Array<{ find: Find; grund: string; bekannt?: true }>;
  adopted: Adopted[];
  /** `stufe`: die letzte bestandene (Plan 0050, E6); ohne Angabe gilt „vorfilter“ */
  rejected: Array<{ find: Find; grund: string; stufe?: Stufe }>;
  /** aufgehalten aus technischem Grund oder als mögliche Dublette (Plan 0050, E5) */
  klaerfaelle: Array<{ find: Find; grund: string; stufe?: Stufe; dublette?: true }>;
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
  /** Anfragen an Nominatim und Wartezeit nach der Rate (Plan 0050, E5) */
  geocoder?: { requests: number; waitMs: number };
  /** G2 im Trockenlauf verletzt (im Modus live bricht G2 den Lauf ab) */
  gateErrors?: string[];
  /** Modell und Effort je Schritt („Suche/Bewerten opus/high, Beweis opus/high“), für Bericht und results.md */
  modelle?: string;
  /** Entdecken-Eval (`--eval`): was aus den ausgeblendeten Anbietern wurde */
  hidden?: HiddenEval;
}

export interface HiddenEval {
  outcomes: EvalOutcome[];
  /** aufgenommen, aber zu keinem ausgeblendeten passend: neu oder falsch, Urteil aus `evals/discover-urteile.json` */
  extra: Array<Adopted & { urteil?: Urteile[string] }>;
  /** zweite Aufnahme eines schon zugeordneten Anbieters: zählt als falsch (Ziel 3) */
  doppelt: Adopted[];
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

/**
 * Wie gut eine Aufnahme zu einem ausgeblendeten Anbieter passt (Plan 0050, E6): 3 gleiche URL, 2 gleicher Host mit
 * ähnlichem Namen, 1 ähnlicher Name mit Ort ≤ 100 m, 0 gar nicht. Der Host allein genügt nie: Auf geteilten Websites
 * (Gemeinden auf stadtkirche-nuernberg.de) stehen viele Anbieter.
 */
function matchScore(a: Adopted, p: Provider): number {
  const n = normalizeUrl(a.find.url);
  if (n && urlsOf(p).some((u) => normalizeUrl(u) === n)) return 3;
  if (adoptedMatches(a, p)) return 2;
  const near =
    p.role === "anbieter" &&
    (a.orte ?? []).some((g) => p.venues.some((v) => haversineMeters(v.geo, g) <= DUPLICATE_RADIUS_M));
  return near && similarName(a.name, p.name) ? 1 : 0;
}

const quelleArt = (f: Find) => f.quelle.split(":")[0] ?? f.quelle;

/**
 * Wertet einen Lauf mit ausgeblendeten Anbietern aus: Aufnahmen 1:1 zugeordnet (beste Passung zuerst), je Anbieter
 * der beste Ausgang, die weiteste Stufe und die Quellen; dazu fremde und doppelte Aufnahmen.
 */
export function hiddenEval(
  hidden: readonly Provider[],
  regions: readonly RegionReport[],
  o: { alt?: ReadonlySet<string>; urteile?: Urteile } = {},
): HiddenEval {
  const adopted = regions.flatMap((r) => r.adopted);
  const rejected = regions.flatMap((r) => r.rejected);
  const klaerfaelle = regions.flatMap((r) => r.klaerfaelle);
  const dropped = regions.flatMap((r) => r.dropped);
  const unassessed = regions.flatMap((r) => r.unassessed ?? []);
  const sorted = [...hidden].sort((a, b) => a.id.localeCompare(b.id));

  const pairs = adopted
    .flatMap((a, ai) => sorted.map((p, pi) => ({ ai, pi, score: matchScore(a, p) })))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.pi - y.pi || x.ai - y.ai);
  const byProvider = new Map<number, number>();
  const assigned = new Set<number>();
  for (const { ai, pi } of pairs)
    if (!byProvider.has(pi) && !assigned.has(ai)) {
      byProvider.set(pi, ai);
      assigned.add(ai);
    }

  const outcomes = sorted.map((p, pi): EvalOutcome => {
    const ai = byProvider.get(pi);
    const a = ai === undefined ? undefined : adopted[ai];
    const touched: Array<{ find: Find; stufe: Stufe }> = [
      ...(a ? [{ find: a.find, stufe: "beweis" as const }] : []),
      ...[...rejected, ...klaerfaelle]
        .filter((x) => matchesProvider(x.find, p))
        .map((x) => ({ find: x.find, stufe: x.stufe ?? ("vorfilter" as const) })),
      ...unassessed.filter((f) => matchesProvider(f, p)).map((find) => ({ find, stufe: "vorfilter" as const })),
      ...dropped.filter((x) => matchesProvider(x.find, p)).map((x) => ({ find: x.find, stufe: "gefunden" as const })),
    ];
    const stufe = touched.reduce<Stufe | undefined>(
      (best, t) => (best === undefined || STUFEN.indexOf(t.stufe) > STUFEN.indexOf(best) ? t.stufe : best),
      undefined,
    );
    const base = {
      id: p.id,
      name: p.name,
      ...(o.alt?.has(p.id) ? { alt: true as const } : {}),
      ...(stufe ? { stufe } : {}),
      quellen: [...new Set(touched.map((t) => quelleArt(t.find)))].sort(),
      ...(p.role === "anbieter" && p.coveredBy !== undefined ? { ziel4: false as const } : {}),
    };
    if (a) return { ...base, ergebnis: "aufgenommen", url: a.find.url, adoptedId: a.id };
    const r = rejected.find((x) => matchesProvider(x.find, p));
    if (r) return { ...base, ergebnis: "verworfen", url: r.find.url, grund: r.grund };
    const k = klaerfaelle.find((x) => matchesProvider(x.find, p));
    if (k) return { ...base, ergebnis: "klärfall", url: k.find.url, grund: k.grund };
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
  const urteile = new Map(Object.entries(o.urteile ?? {}).map(([url, u]) => [normalizeUrl(url) ?? url, u]));
  const free = adopted.filter((_, ai) => !assigned.has(ai));
  const doppelt = free.filter((a) => sorted.some((p) => matchScore(a, p) > 0));
  const extra = free
    .filter((a) => !doppelt.includes(a))
    .map((a) => {
      const urteil = urteile.get(normalizeUrl(a.find.url) ?? a.find.url);
      return urteil ? { ...a, urteil } : a;
    });
  return { outcomes, extra, doppelt };
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
    ...(r.geocoder
      ? [
          `- Geocoder: ${r.geocoder.requests} Anfragen an Nominatim, ${Math.round(r.geocoder.waitMs / 60_000)} Min. Wartezeit`,
        ]
      : []),
    ...(r.gateErrors ?? []).map((e) => `- **rot:** ${cell(e)}`),
  ];
  const results: Record<string, string> = {};
  for (const reg of r.regions) {
    out.push(
      "",
      `## Region ${REGIONS[reg.region].name}: ${reg.adopted.length} ${r.dryRun ? "würden aufgenommen" : "neu"}, ` +
        `${reg.rejected.length} verworfen, ${reg.klaerfaelle.length} Klärfälle, ${reg.dropped.length} im Vorfilter ` +
        `(von ${reg.finds} Kandidaten)`,
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
    if (reg.klaerfaelle.length > 0) {
      out.push(
        "",
        `## Klärfälle${r.dryRun ? " (Trockenlauf: nicht im Zustand)" : ""}`,
        "",
        "| Kandidat | URL | Quelle | Grund |",
        "|---|---|---|---|",
      );
      for (const x of reg.klaerfaelle) {
        results[hostOf(x.find.url) ?? x.find.url] ??= "klärfall";
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
  if (r.hidden) out.push("", ...hiddenSection(r, r.hidden));
  out.push("", ...costSection(summarizeCosts(r.calls, { cached: 0 }), results));
  return `${out.join("\n")}\n`;
}

/** Ein Lauf, den Abbruch, Bremse oder Zeitbudget beendet hat, zählt im Eval nicht (Plan 0050, Ziel) */
function validity(r: DiscoverReport): string {
  const why = [
    ...(r.abort ? [`Abbruch ${r.abort}`] : []),
    ...(r.brake ? [`Bremse ${r.brake}`] : []),
    ...(r.budgetHit ? ["Zeitbudget"] : []),
  ];
  return why.length === 0 ? "ja" : `nein (${why.join(", ")})`;
}

const ertragText = (o: EvalOutcome): string =>
  o.ziel4 === false
    ? "zählt nicht (coveredBy)"
    : o.ertrag
      ? `${o.ertrag.treffer} von ${o.ertrag.referenz}${o.ertrag.grund ? ` (${o.ertrag.grund})` : ""}`
      : "";

function hiddenSection(r: DiscoverReport, h: HiddenEval): string[] {
  const back = h.outcomes.filter((o) => o.ergebnis === "aufgenommen").length;
  const found = h.outcomes.filter((o) => o.ergebnis !== "nicht gefunden").length;
  const k = kennzahlen(h.outcomes);
  const stufen: Array<[string, Exclude<keyof Kennzahlen, "ertrag" | "ertragN">]> = [
    ["Ausgeblendet", "n"],
    ["Gefunden", "gefunden"],
    ["Nach Vorfilter", "vorfilter"],
    ["Seite abgerufen", "abgerufen"],
    ["Bewertet „aufnehmen“", "aufnehmen"],
    ["Orte aufgelöst", "orte"],
    ["Ertragsbeweis", "wiedergefunden"],
  ];
  const urteil = (u: string) => h.extra.filter((a) => a.urteil?.urteil === u);
  const falschUrteil = [...urteil("falsch"), ...urteil("dublette")];
  const unbeurteilt = h.extra.filter((a) => !a.urteil);
  const klaer = r.regions.flatMap((x) => x.klaerfaelle);
  const quellen = quellenZahlen(h.outcomes);
  const pct = (x: number | undefined) => (x === undefined ? "–" : `${Math.round(x * 100)} %`);
  return [
    `## Eval: ausgeblendete Anbieter (${back} von ${h.outcomes.length} wiedergefunden, ${found} gefunden)`,
    "",
    `Lauf gültig: ${validity(r)}${r.modelle ? `; Modelle: ${r.modelle}` : ""}`,
    "",
    "| Stufe | alle | alt | neu |",
    "|---|---|---|---|",
    ...stufen.map(([label, f]) => `| ${label} | ${k.alle[f]} | ${k.alt[f]} | ${k.neu[f]} |`),
    `| Ertrag (Ziel 4) | ${pct(k.alle.ertrag)} | ${pct(k.alt.ertrag)} | ${pct(k.neu.ertrag)} |`,
    "",
    `Gefunden je Quelle: ${
      Object.entries(quellen)
        .map(([q, n]) => `${q} ${n}`)
        .join(", ") || "–"
    }`,
    "",
    "| ID | alt | Ergebnis | Stufe | Quellen | Ertrag | Fund-URL | Grund |",
    "|---|---|---|---|---|---|---|---|",
    ...h.outcomes.map(
      (o) =>
        `| ${o.id} | ${o.alt ? "ja" : ""} | ${o.ergebnis} | ${o.stufe ?? ""} | ${o.quellen.join(", ")} | ` +
        `${ertragText(o)} | ${o.url ?? ""} | ${cell(o.grund ?? "")} |`,
    ),
    "",
    `Zusätzlich aufgenommen (nicht ausgeblendet): ${h.extra.length}`,
    ...h.extra.map((a) => `- ${a.id}: ${cell(a.name)} (${a.find.url}) – Urteil: ${a.urteil?.urteil ?? "offen"}`),
    ...h.doppelt.map((a) => `- ${a.id}: ${cell(a.name)} (${a.find.url}) – doppelt`),
    "",
    `Falsch aufgenommen: ${h.doppelt.length + falschUrteil.length} (${h.doppelt.length} doppelt, ` +
      `${falschUrteil.length} nach Urteil), ${unbeurteilt.length} unbeurteilt` +
      (unbeurteilt.length > 0 ? " – Urteil je URL in evals/discover-urteile.json" : ""),
    "",
    "Zeile für `evals/results.md`:",
    "",
    "```",
    resultsRow({
      date: r.date,
      modelle: r.modelle ?? "–",
      gueltig: validity(r) === "ja",
      kennzahlen: k,
      quellen,
      klaerfaelle: klaer.length,
      dubletten: klaer.filter((x) => x.dublette).length,
      falsch: h.doppelt.length + falschUrteil.length,
      unbeurteilt: unbeurteilt.length,
      neu: urteil("passend").map((a) => a.id),
      aufrufe: r.calls.length,
      kostenUsd: summarizeCosts(r.calls, { cached: 0 }).total.costUsd,
      dauerMin: Math.round(r.durationMs / 60_000),
      jeAnbieter: h.outcomes
        .map((o) => `${o.id} ${o.ergebnis}${o.grund ? ` (${o.grund.replace(/\s+/g, " ").slice(0, 80)})` : ""}`)
        .join("; "),
    }),
    "```",
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
