/**
 * IDs (ADR 0022). Angebote und Anbieter haben eine gespeicherte Kurz-ID aus 8 Zeichen: Angebote in
 * data/offers.json (vergeben von `pipeline build`, gehalten über die Zuordnung gegen den Vorstand), Anbieter als
 * `publicId` im Katalog. Die alte lange Angebots-ID lebt als Zuordnungsschlüssel `offerKey` weiter; eine alte ID
 * oder Katalog-ID wird mit `shortId(alt, 0)` zur neuen (Rechenregel statt Alias-Liste). Eine geänderte ID bricht
 * Links, Merklisten und Kalender-UIDs – Regeln hier nur per ADR ändern.
 */
import { berlinKey } from "./time.ts";

/**
 * Form jeder Angebots-ID und jeder `publicId` eines Anbieters: 8 Zeichen [0-9a-z] (ADR 0022). Einzige Definition –
 * Schema, Route, Merkliste und Pfade der Vorschauseiten prüfen damit.
 */
export const SHORT_ID_PATTERN = /^[0-9a-z]{8}$/;

/**
 * Alte Form der Angebots-ID bis 2026-10 (ADR 0006): drei kebab-Teile, getrennt durch „--“. Nur noch für alte Links
 * und gespeicherte Werte (`resolveOfferId`, `404.html`); dieselbe Form hat der Zuordnungsschlüssel `offerKey`.
 */
export const LEGACY_OFFER_ID_PATTERN = /^[a-z0-9-]+--[a-z0-9-]+--[a-z0-9-]+$/;

/**
 * Form jeder Katalog-ID (Anbieter, Ort): kebab-case ohne doppelte oder randständige Bindestriche. Einzige
 * Definition – das Schema prüft damit den Katalog, die Route damit den `anbieter`-Parameter (Plan 0010, E2).
 */
export const KEBAB_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Höchstlängen der IDs (Plan 0026, Arch-Review M1): Sie stehen in geteilten Links und in Pfaden der Vorschauseiten,
 * deshalb prüft sie das Schema, nicht erst der Build. Katalog-IDs: längste echte 38 Zeichen (2026-10-08), die Route
 * nahm schon seit Plan 0010 höchstens 80. Alte Offer-IDs: zwei Katalog-IDs, Titel-Slug (60) mit Beginn (14) und zwei
 * Trenner ergeben höchstens 238; längste echte 167. `MAX_KEBAB_ID` gilt auch für gemerkte Anbieter im Speicher
 * (`cleanSavedProviders`, Plan 0025, E1).
 */
export const MAX_KEBAB_ID = 80;
export const MAX_LEGACY_OFFER_ID = 240;

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

export interface OfferKeyInput {
  providerId: string;
  venueId: string;
  title: string;
  /**
   * Das `Format` aus schema.ts, hier ausgeschrieben: schema.ts importiert `SHORT_ID_PATTERN`, ein
   * Import zurück wäre ein Zyklus. Dass beide gleich bleiben, prüft ids.test.ts per Typtest.
   */
  format: "kurs" | "regelmaessig" | "einmalig";
  /** Beginn des ersten Termins (mit Offset) */
  firstStart: string;
}

/**
 * Zuordnungsschlüssel `providerId--slug(title)--venueId`, die alte Angebots-ID (ADR 0006). Kurse und Einzeltermine
 * hängen den Berliner Beginn des ersten Termins an, sonst kollidieren parallele Kurse und mehrere Vorstellungen.
 * Nie gespeichert: Die Pipeline nutzt ihn für Dubletten, für Stufe 0 der Zuordnung und als Saat neuer IDs (ADR 0022).
 */
export function offerKey(o: OfferKeyInput): string {
  const title = slug(o.title);
  const middle = o.format === "regelmaessig" ? title : `${title}-${berlinKey(o.firstStart).toLowerCase()}`;
  return `${o.providerId}--${middle}--${o.venueId}`;
}

/** cyrb53 (bryc, Public Domain) in genau dieser Fassung – die Testvektoren in ids.test.ts hängen daran (ADR 0022). */
function cyrb53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 8 Zeichen [0-9a-z] (41 Bit) aus einem Text; ein anderer `seed` weicht bei Kollisionen aus. */
export const shortId = (text: string, seed = 0): string => (cyrb53(text, seed) % 36 ** 8).toString(36).padStart(8, "0");

/** Angebots-ID aus Link oder Speicher: neue Form bleibt, alte Form wird `shortId(alt, 0)`, sonst `undefined`. */
export function resolveOfferId(id: string): string | undefined {
  if (SHORT_ID_PATTERN.test(id)) return id;
  if (id.length <= MAX_LEGACY_OFFER_ID && LEGACY_OFFER_ID_PATTERN.test(id)) return shortId(id, 0);
  return undefined;
}

/**
 * Anbieter-ID aus Link oder Speicher: `publicId` bleibt, eine Katalog-ID wird `shortId(id, 0)` – genau das hat die
 * Migration jedem Anbieter gegeben (ADR 0022). Anbieter, die erst danach kamen, hatten nie einen Link mit Katalog-ID.
 */
export function resolveProviderId(id: string): string | undefined {
  if (SHORT_ID_PATTERN.test(id)) return id;
  if (id.length <= MAX_KEBAB_ID && KEBAB_ID_PATTERN.test(id)) return shortId(id, 0);
  return undefined;
}

/** Höchster `seed` einer `publicId`; das Schema prüft `publicId === shortId(id, s)` für genau diese `s`. */
export const MAX_PUBLIC_ID_SEED = 9;

/** `publicId` für einen neuen Katalog-Eintrag: `shortId(id, s)` mit dem kleinsten freien `s` (ADR 0022). */
export function nextPublicId(id: string, used: ReadonlySet<string>): string {
  for (let seed = 0; seed <= MAX_PUBLIC_ID_SEED; seed++) {
    const candidate = shortId(id, seed);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Keine freie publicId für ${id} (seed 0–${MAX_PUBLIC_ID_SEED} belegt)`);
}
