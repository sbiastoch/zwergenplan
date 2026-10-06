/**
 * Alles, was nur auf diesem Gerät bleibt (localStorage): Geburtsdatum, Merkliste, Darstellung,
 * „Nur passende Angebote“, Startpunkt (Stadtteil-ID oder gerundeter Punkt, ADR 0017). Nichts davon gelangt in URL,
 * Logs oder Requests (docs/architecture.md). Jeder Zugriff ist gekapselt: Im privaten Modus o. ä. gilt die
 * Einstellung nur für die Sitzung.
 */
const KEYS = {
  birthDate: "zwergenplan.geburtsdatum",
  saved: "zwergenplan.merkliste",
  theme: "zwergenplan.darstellung",
  ageOnly: "zwergenplan.nur-passende",
  originDistrict: "zwergenplan.entfernung-ab",
  originPoint: "zwergenplan.startpunkt",
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
 * Gespeicherter Stadtteil als ID (Plan 0004, E3). Geliefert wird der rohe Wert; ob es den Stadtteil gibt, prüft
 * `useOrigin` (eine unbekannte ID zählt dort als „kein Startpunkt“). Gespeichert ist höchstens eins: Stadtteil
 * oder Punkt (Plan 0016, E2).
 */
export function loadOriginDistrict(): string | undefined {
  return read(KEYS.originDistrict) || undefined;
}

/** Standort oder Kartenmitte, schon gerundet (`coarsen`); nie eine Rohkoordinate (ADR 0017) */
export interface StoredOriginPoint {
  source: "standort" | "karte";
  lat: number;
  lon: number;
}

/**
 * Gespeicherter Punkt (Plan 0016, E1). Geprüft wird nur die Form; erneut runden und die Stadtgrenze prüft
 * `useOrigin`. Ohne `Number.isFinite`: `inBounds` verwirft auch `Infinity` (etwa aus `1e999`).
 */
export function loadOriginPoint(): StoredOriginPoint | undefined {
  try {
    // `Object(…)` macht aus `null`, Zahlen usw. ein Objekt ohne diese Felder (Start-Budget statt `in`-Prüfungen)
    const { source, lat, lon } = Object(JSON.parse(read(KEYS.originPoint) ?? "0"));
    return (source === "standort" || source === "karte") && typeof lat === "number" && typeof lon === "number"
      ? { source, lat, lon }
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Startpunkt speichern (Plan 0016, E2): eine ID als Stadtteil, ein Punkt als Standort bzw. Kartenmitte, nie beides;
 * `undefined` löscht. Der Punkt wird neu gebaut, damit nur diese drei Felder im Speicher landen.
 */
export function saveOrigin(value: string | StoredOriginPoint | undefined): void {
  write(KEYS.originDistrict, typeof value === "string" ? value : undefined);
  write(
    KEYS.originPoint,
    typeof value === "object" ? JSON.stringify({ source: value.source, lat: value.lat, lon: value.lon }) : undefined,
  );
}
