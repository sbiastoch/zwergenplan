/**
 * Kandidat = ein Treffer aus einem Sammelkalender (Stadt, frankenkids, evangelische-termine),
 * bereits auf Baby-/Kleinkindbezug vorgefiltert. Zeiten in Berliner Ortszeit (YYYY-MM-DDTHH:MM).
 * Die Relevanz und die Zuordnung zu einem Katalog-Anbieter entscheidet der Orchestrator.
 */
import { z } from "zod";

export const SOURCES = ["stadt-vk", "frankenkids", "evtermine"] as const;
export const Source = z.enum(SOURCES);
export type Source = z.infer<typeof Source>;

export const LocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "YYYY-MM-DDTHH:MM erwartet");

export const Occurrence = z.strictObject({ start: LocalDateTime, end: LocalDateTime.optional() });
export type Occurrence = z.infer<typeof Occurrence>;

export const Candidate = z.strictObject({
  source: Source,
  sourceId: z.string(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  description: z.string(),
  organizer: z.string().optional(),
  /** Veranstalter-ID der Quelle (evangelische-termine: vid) */
  organizerId: z.string().optional(),
  organizerUrl: z.string().optional(),
  location: z.string().optional(),
  address: z.string().optional(),
  geo: z.strictObject({ lat: z.number(), lon: z.number() }).optional(),
  cost: z.string().optional(),
  detailUrl: z.string(),
  ticketUrl: z.string().optional(),
  cancelled: z.boolean(),
  soldOut: z.boolean(),
  waitlist: z.boolean(),
  registrationRequired: z.boolean().optional(),
  /** wöchentliche Reihe in der Quelle („jeweils“) */
  weekly: z.boolean(),
  occurrences: z.array(Occurrence).min(1),
});
export type Candidate = z.infer<typeof Candidate>;

export const CandidatesFile = z.array(Candidate);

/** Entfernt HTML-Tags und Entities und normalisiert Leerraum. */
export function plainText(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\u00ad/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

/** Optionales Feld nur setzen, wenn es einen Wert hat (exactOptionalPropertyTypes). */
export function opt<K extends string, V>(key: K, value: V | null | undefined | ""): { [P in K]?: V } {
  return value === undefined || value === null || value === "" ? {} : ({ [key]: value } as { [P in K]: V });
}

export function byFirstStart(a: Candidate, b: Candidate): number {
  return (a.occurrences[0]?.start ?? "").localeCompare(b.occurrences[0]?.start ?? "");
}
