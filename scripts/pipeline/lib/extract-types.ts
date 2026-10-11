/**
 * Schnittstelle der Extraktion (Plan 0032, E2/E4), nur Typen. Die Umsetzung (`io/extract.ts`, `io/llm.ts`) liefert
 * Teil A von Stufe 2; `io/refresh.ts` und `io/nightly.ts` kennen nur diese Typen und bekommen den Extraktor
 * übergeben, Tests einen Fake.
 *
 * Vorläufig hier: Beim Zusammenführen mit Teil A werden die Typen aus `io/extract.ts` importiert bzw. dorthin
 * verschoben; die Formen sind identisch abgestimmt.
 */
import type { Provider } from "../../../src/domain/schema.ts";
import type { Candidate } from "./candidate.ts";
import type { RawEvent } from "./raw.ts";

export interface ExtractInput {
  provider: Provider;
  /** Eingabetext aller Seiten und Kandidaten (nur Leerraum normalisiert) */
  text: string;
  candidates: readonly Candidate[];
  /** abgerufene URLs, ihre Redirect-Ziele und die Kandidaten-URLs: nur diese sind als `sourceUrl` erlaubt (E4) */
  allowedUrls: readonly string[];
  /** YYYY-MM-DD, Europe/Berlin */
  today: string;
}

/** Eine Zeile je Modellaufruf (E8). */
export interface CallRecord {
  step: "extract" | "fallback";
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  webSearchRequests: number;
  turns: number;
  durationMs: number;
  costUsd: number | null;
  result: "ok" | "invalid" | "truncated" | "abort" | "error";
}

export type ExtractOutcome =
  | { kind: "ok"; events: RawEvent[]; model: string }
  | { kind: "fehler"; reason: string }
  | { kind: "abort"; abort: "auth" | "limit" };

export interface ExtractResult {
  outcome: ExtractOutcome;
  calls: CallRecord[];
}

export type Extractor = (input: ExtractInput, signal: AbortSignal) => Promise<ExtractResult>;

/**
 * Was außer der Eingabe in den Cache-Schlüssel geht (E4): Prompt, Antwort-Schema (Teil A: `EXTRACT_KEY_PARTS`)
 * und das konfigurierte Extraktionsmodell (N3: Ein Modellwechsel extrahiert einmal alles neu).
 */
export interface ExtractKeyParts {
  prompt: string;
  schema: string;
  model: string;
}
