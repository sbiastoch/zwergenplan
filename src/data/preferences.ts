/**
 * Alles, was nur auf diesem Gerät bleibt (localStorage): Geburtsdatum, Merkliste, Darstellung,
 * „Nur passende Angebote“, Startpunkt-Stadtteil. Nichts davon gelangt in URL, Logs oder Requests
 * (docs/architecture.md). Jeder Zugriff ist gekapselt: Im privaten Modus o. ä. gilt die Einstellung
 * nur für die Sitzung.
 */
import { districtById } from "../domain/districts.ts";

const KEYS = {
  birthDate: "zwergenplan.geburtsdatum",
  saved: "zwergenplan.merkliste",
  theme: "zwergenplan.darstellung",
  ageOnly: "zwergenplan.nur-passende",
  originDistrict: "zwergenplan.entfernung-ab",
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // privater Modus o. ä.
  }
}

export function loadBirthDate(): string | undefined {
  const value = read(KEYS.birthDate);
  // Beschädigte Werte ignorieren – sonst würfe die Altersprüfung beim Rendern.
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function saveBirthDate(value: string | undefined): void {
  write(KEYS.birthDate, value);
}

export function loadSaved(): string[] {
  try {
    const parsed: unknown = JSON.parse(read(KEYS.saved) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSaved(ids: readonly string[]): void {
  write(KEYS.saved, ids.length > 0 ? JSON.stringify(ids) : undefined);
}

export type ThemeChoice = "hell" | "dunkel" | "auto";

/** Muss zum Inline-Skript in index.html passen (setzt data-theme vor dem ersten Paint). */
export function loadTheme(): ThemeChoice {
  const value = read(KEYS.theme);
  return value === "hell" || value === "dunkel" ? value : "auto";
}

export function saveTheme(choice: ThemeChoice): void {
  write(KEYS.theme, choice === "auto" ? undefined : choice);
}

/** Standard: an. */
export function loadAgeOnly(): boolean {
  return read(KEYS.ageOnly) !== "nein";
}

export function saveAgeOnly(on: boolean): void {
  write(KEYS.ageOnly, on ? undefined : "nein");
}

/**
 * Gespeicherter Startpunkt: nur die ID eines Stadtteils, nie ein Standort (Plan 0004, E3).
 * Eine unbekannte ID zählt als „kein Startpunkt“.
 */
export function loadOriginDistrict(): string | undefined {
  const id = read(KEYS.originDistrict);
  return id && districtById(id) ? id : undefined;
}

export function saveOriginDistrict(id: string | undefined): void {
  write(KEYS.originDistrict, id);
}
