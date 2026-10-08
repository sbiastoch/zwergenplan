/**
 * Deterministische IDs (ADR 0003, ADR 0006). Die Pipeline vergibt sie, das Schema prüft Präfix und Suffix.
 * Eine geänderte ID erzeugt im Kalender der Nutzer ein Duplikat – Regeln hier nur per ADR ändern.
 */
import { berlinKey } from "./time.ts";

/**
 * Form jeder Offer-ID: drei kebab-Teile, getrennt durch „--“. Einzige Definition – das Schema
 * prüft damit die Daten, die Route damit den `angebot`-Parameter aus der URL.
 */
export const OFFER_ID_PATTERN = /^[a-z0-9-]+--[a-z0-9-]+--[a-z0-9-]+$/;

/**
 * Form jeder Katalog-ID (Anbieter, Ort): kebab-case ohne doppelte oder randständige Bindestriche. Einzige
 * Definition – das Schema prüft damit den Katalog, die Route damit den `anbieter`-Parameter (Plan 0010, E2).
 */
export const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Längste zulässige Anbieter-ID von außen: Die längste echte hat 47 Zeichen (Plan 0010, E2). Gilt für `anbieter=` in
 * der URL und für gemerkte Anbieter aus dem Speicher (Plan 0025, E1).
 */
export const MAX_PROVIDER_ID = 80;

/** Anbieter-ID von außen (URL `anbieter=`, gemerkte Anbieter): Katalog-Form, höchstens `MAX_PROVIDER_ID` Zeichen */
export function isProviderId(id: string): boolean {
  return id.length <= MAX_PROVIDER_ID && KEBAB_ID_PATTERN.test(id);
}

const TRANSLIT: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** kebab-case aus Freitext: Umlaute transliteriert, höchstens `max` Zeichen, an Wortgrenze gekürzt. */
export function slug(text: string, max = 60): string {
  const full = text
    .normalize("NFC") // „a“ + kombinierendes Trema → „ä“, sonst entstünde eine andere ID
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
  /**
   * Das `Format` aus schema.ts, hier ausgeschrieben: schema.ts importiert `OFFER_ID_PATTERN`, ein
   * Import zurück wäre ein Zyklus. Dass beide gleich bleiben, prüft ids.test.ts per Typtest.
   */
  format: "kurs" | "regelmaessig" | "einmalig";
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
