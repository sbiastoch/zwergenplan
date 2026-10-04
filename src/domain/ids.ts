/**
 * Deterministische IDs (ADR 0003, ADR 0006). Die Pipeline vergibt sie, das Schema prüft Präfix und Suffix.
 * Eine geänderte ID erzeugt im Kalender der Nutzer ein Duplikat – Regeln hier nur per ADR ändern.
 */
import type { Format } from "./schema.ts";
import { berlinKey } from "./time.ts";

const TRANSLIT: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** kebab-case aus Freitext: Umlaute transliteriert, höchstens `max` Zeichen, an Wortgrenze gekürzt. */
export function slug(text: string, max = 60): string {
  const full = text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => TRANSLIT[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length === 0) return "x";
  if (full.length <= max) return full;
  const cut = full.slice(0, max + 1);
  const atWord = cut.lastIndexOf("-");
  return (atWord > 0 ? cut.slice(0, atWord) : full.slice(0, max)).replace(/-+$/, "");
}

export interface OfferIdInput {
  providerId: string;
  venueId: string;
  title: string;
  format: Format;
  /** Beginn des ersten Termins (mit Offset) */
  firstStart: string;
}

/**
 * `providerId--slug(title)--venueId`. Kurse und Einzeltermine hängen den Berliner Beginn des
 * ersten Termins an, sonst kollidieren parallele Kurse und mehrere Vorstellungen (ADR 0006).
 */
export function offerId(o: OfferIdInput): string {
  const title = slug(o.title);
  const middle = o.format === "regelmaessig" ? title : `${title}-${berlinKey(o.firstStart).toLowerCase()}`;
  return `${o.providerId}--${middle}--${o.venueId}`;
}
