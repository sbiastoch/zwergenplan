/**
 * Alles, was nur auf diesem Gerät bleibt (localStorage): Geburtsdatum, Merkliste (samt Vorgemerktem), gemerkte Anbieter,
 * Darstellung, Startpunkt (Stadtteil-ID oder gerundeter Punkt, ADR 0017), dazu das Flag „Onboarding erledigt“ (ohne Personenbezug,
 * Plan 0033, E2; versioniert seit Plan 0035, E4). Die Such-Abos liegen in `searches-store.ts`. Nichts davon gelangt in URL,
 * Logs oder Requests (docs/architecture.md). Jeder Zugriff ist gekapselt: Im privaten Modus o. ä. gilt die
 * Einstellung nur für die Sitzung.
 */
const KEYS = {
  birthDate: "zwergenplan.geburtsdatum",
  saved: "zwergenplan.merkliste",
  /** nur vorgemerkte IDs, Teilmenge der Merkliste (Plan 0057, E1; ADR 0040) */
  tentative: "zwergenplan.merkliste-vorgemerkt",
  savedProviders: "zwergenplan.anbieter-merkliste",
  theme: "zwergenplan.darstellung",
  originDistrict: "zwergenplan.entfernung-ab",
  originPoint: "zwergenplan.startpunkt",
  onboarding: "zwergenplan.einfuehrung",
} as const;

/**
 * Version des Flags „Onboarding erledigt“ (Plan 0035, E4). `"1"` wurde ab ecfccfb auch still an Bestandsnutzer vergeben
 * (Plan 0033, Gate „still-erledigt“); erst `"2"` heißt „gesehen oder übersprungen“. Eine Erhöhung zeigt das Onboarding
 * allen einmal erneut. E2E und Screenshots nutzen denselben Wert (`e2e/onboarding-flag.ts`, gekoppelt per Unit-Test).
 */
const ONBOARDING_VERSION = "2";

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

/** Liste von IDs als JSON-Array; geprüft werden nur JSON und Typen, eine leere Liste entfernt den Schlüssel */
function loadIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(read(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveIds(key: string, ids: readonly string[]): void {
  write(key, ids.length > 0 ? JSON.stringify(ids) : undefined);
}

export function loadSaved(): string[] {
  return loadIds(KEYS.saved);
}

export function saveSaved(ids: readonly string[]): void {
  saveIds(KEYS.saved, ids);
}

/**
 * Nur vorgemerkte Angebote (Plan 0057, E1), gebaut wie `loadSaved`. Ob sie zur Merkliste gehören, prüft
 * `cleanSavedState` in der Hook-Schicht.
 */
export function loadTentative(): string[] {
  return loadIds(KEYS.tentative);
}

export function saveTentative(ids: readonly string[]): void {
  saveIds(KEYS.tentative, ids);
}

/**
 * Gemerkte Anbieter in der Rohform (Plan 0025, E1), gebaut wie `loadSaved`: geprüft werden nur JSON und Typen. Ob die
 * ID gültig ist, prüft `cleanSavedProviders` in der Domäne (ADR 0010: src/data importiert dafür nichts aus src/domain).
 */
export function loadSavedProviders(): string[] {
  return loadIds(KEYS.savedProviders);
}

export function saveSavedProviders(ids: readonly string[]): void {
  saveIds(KEYS.savedProviders, ids);
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

/** Onboarding erledigt? Nur die aktuelle Version zählt, exakt verglichen (Plan 0035, E4). */
export function loadOnboardingDone(): boolean {
  return read(KEYS.onboarding) === ONBOARDING_VERSION;
}

export function saveOnboardingDone(): void {
  write(KEYS.onboarding, ONBOARDING_VERSION);
}

/** Schreib- und Leseprobe (E2, Arch-Review m3): Ohne nutzbaren Speicher käme das Onboarding bei jedem Besuch. */
export function storageUsable(): boolean {
  const probe = "zwergenplan.probe";
  try {
    localStorage.setItem(probe, "1");
    const ok = localStorage.getItem(probe) === "1";
    localStorage.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}
