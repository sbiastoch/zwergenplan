/**
 * Onboarding beim ersten Öffnen (Plan 0033): Schritte und Reihenfolge (E1), Stadt-Kacheln und Willkommenszahlen (E5),
 * Alterstipp (E6), Wegzeit-Chips (E7), Knopf-Beschriftungen (E9) und Texte (E10). Rein; nur im Lazy-Chunk
 * `assets/onboarding/` (Regel `onboarding-domain-only-lazy`). Ob es erscheint, entscheidet `onboarding-gate.ts` im Start.
 * Aus `pwa.ts` kommen nur Typen, sonst entstünde ein geteilter Chunk mit dem App-Teil (Review M2).
 */
import { ageInMonths, fittingSessions } from "./age.ts";
import { nextSession } from "./agenda.ts";
import { plural } from "./labels.ts";
import { countProviders } from "./provider-count.ts";
import type { InstallState, PushCapability } from "./pwa.ts";
import { LIMIT_MINUTES, type ReachLimit } from "./reach.ts";
import type { Region } from "./regions.ts";
import type { Offer } from "./schema.ts";
import { addMonths, parseIsoDate } from "./time.ts";

export type StepId = "stadt" | "alter" | "weg" | "app";

/** Was der App-Schritt zeigt (E8); `undefined` heißt: dieser Teil fehlt */
export interface AppStepParts {
  install: "knopf" | "ios" | "menue" | "installiert" | undefined;
  push: "schalter" | "nur-in-app" | "verweigert" | undefined;
}

const INSTALL_PART: Record<InstallState, AppStepParts["install"]> = {
  angebot: "knopf",
  ios: "ios",
  menue: "menue",
  installiert: "installiert",
  app: undefined,
  keine: undefined,
};

const PUSH_PART: Record<PushCapability, AppStepParts["push"]> = {
  ja: "schalter",
  verweigert: "verweigert",
  nein: undefined,
};

/**
 * Teile des App-Schritts. Im Safari-Tab gibt es kein Push (ADR 0014), dort nur der Hinweis `nur-in-app`. `undefined`,
 * wenn weder ein Installationsteil noch ein Schalter bzw. Hinweis bleibt; ein reines `verweigert` hält den Schritt nicht.
 */
export function appStepParts(install: InstallState, push: PushCapability): AppStepParts | undefined {
  const parts: AppStepParts = {
    install: INSTALL_PART[install],
    push: install === "ios" ? "nur-in-app" : PUSH_PART[push],
  };
  if (parts.install === undefined && (parts.push === undefined || parts.push === "verweigert")) return undefined;
  return parts;
}

/**
 * Reihenfolge, einmal beim Start des Flows festgelegt (Plan 0033, E1; Plan 0034, E1): Auf dem iPhone im Browser steht
 * „App“ zuerst, weil die installierte App einen eigenen Speicher hat (dort fragt das Onboarding Alter und Weg erneut;
 * Push gibt es nur in ihr). Sonst steht es zuletzt; ohne Teile entfällt es.
 */
export function onboardingSteps(install: InstallState, push: PushCapability): StepId[] {
  if (!appStepParts(install, push)) return ["stadt", "alter", "weg"];
  return install === "ios" ? ["app", "stadt", "alter", "weg"] : ["stadt", "alter", "weg", "app"];
}

/**
 * Stadt-Kacheln (E5): absteigend nach Einwohnern, bei Gleichstand nach Name; die ersten `maxTiles` als Kacheln, der
 * Rest im Dropdown „Weitere Städte“. Generisch, damit Tests eigene Regionen ohne Cast nutzen.
 */
export function cityChoices<K extends string>(
  regions: Readonly<Record<K, Region>>,
  maxTiles = 4,
): { tiles: { id: K; name: string }[]; more: { id: K; name: string }[] } {
  // Cast: `Object.keys` liefert nur `string[]`; die Regionen sind feste Literale (`REGIONS`, Test-Fakes) ohne Fremdschlüssel
  const sorted = (Object.keys(regions) as K[])
    .map((id) => ({ id, ...regions[id] }))
    .sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, "de"))
    .map(({ id, name }) => ({ id, name }));
  return { tiles: sorted.slice(0, maxTiles), more: sorted.slice(maxTiles) };
}

/** Zahlen für den Willkommens-Text (E5): Angebote mit kommendem Termin und deren Anbieter, wie die Statuszeile */
export function welcomeStats(offers: readonly Offer[], now: Date): { offers: number; providers: number } {
  const upcoming = offers.filter((o) => nextSession(o, now) !== undefined);
  return { offers: upcoming.length, providers: countProviders(upcoming) };
}

/**
 * Der Tag, an dem ein Kind `months` Monate alt wird (ISO). Am Monatsende geklemmt wie in `ageInMonths`, also gilt
 * `ageInMonths(b, dateAtAge(b, m)) === m` und am Vortag `m - 1`.
 */
export function dateAtAge(birthDate: string, months: number): string {
  return addMonths(birthDate, months);
}

/**
 * Nächste Altersstufe mit Treffs (E6): das kleinste Mindestalter über dem heutigen Alter unter den regelmäßigen
 * Angeboten, die mindestens einen passenden kommenden Termin haben. Die Liste stellt ein solches Angebot an diesen
 * Termin (Plan 0028). Kurse und Einzeltermine zählen nicht.
 */
export function nextAgeStep(
  offers: readonly Offer[],
  birthDate: string,
  now: Date,
): { months: number; from: string } | undefined {
  const age = ageInMonths(birthDate, now);
  let best: number | undefined;
  for (const offer of offers) {
    const min = offer.age?.minMonths;
    if (offer.format !== "regelmaessig" || min === undefined || min <= age) continue;
    if (best !== undefined && min >= best) continue;
    if (fittingSessions(offer, now, birthDate).length > 0) best = min;
  }
  return best === undefined ? undefined : { months: best, from: dateAtAge(birthDate, best) };
}

/** Hinweis unter dem Geburtsdatum (E10): „5 Monate! …“, Datum wie `dayDots` ohne führende Null */
export function ageHint(months: number, next?: { months: number; from: string }): string {
  const age = months === 0 ? "Neugeboren!" : `${plural(months, "Monat", "Monate")}!`;
  if (!next) return `${age} Ab jetzt siehst du nur, was passt.`;
  const { day, month } = parseIsoDate(next.from);
  return `${age} Treffs ab ${plural(next.months, "Monat", "Monaten")} zeige ich dir mit Terminen ab dem ${day}.${month}.`;
}

/** Chips „Höchstens unterwegs“ (E7); „Egal“ heißt ohne Grenze */
export const LIMIT_CHOICES: readonly { label: string; limit: ReachLimit | undefined }[] = [
  ...LIMIT_MINUTES.map((value) => ({ label: `${value} Min.`, limit: { kind: "minuten" as const, value } })),
  { label: "Egal", limit: undefined },
];

/** Hauptknopf des letzten Schritts (E9); `count` live aus der Liste, `pending` solange die Wegzeit lädt */
export function finishLabel({ count, pending }: { count: number; pending: boolean }): string {
  if (pending) return "Zeig mir die Angebote";
  if (count === 0) return "Zur Liste";
  if (count === 1) return "Zeig mir das eine Angebot";
  return `Zeig mir die ${count} Angebote`;
}

/** Hauptknopf je Schritt (E9) */
export function primaryLabel(index: number, total: number, finish: { count: number; pending: boolean }): string {
  if (index === 0) return "Los geht’s";
  return index === total - 1 ? finishLabel(finish) : "Weiter";
}

interface StepText {
  kicker: string;
  title: string;
  lead: string;
}

const SATURDAY = "gegen 10 Uhr eine Nachricht, was es Neues für euch gibt.";

function appText(app: AppStepParts | undefined): StepText {
  const push = app?.push === "schalter" || app?.push === "nur-in-app";
  if (app?.install === undefined) {
    return { kicker: "Samstags-Nachricht", title: "Neues kommt von selbst", lead: `Samstags ${SATURDAY}` };
  }
  return {
    kicker: "Immer griffbereit",
    title: "Ein Tipp, und ich bin da",
    lead: push
      ? `Auf dem Startbildschirm wie eine App. Und samstags ${SATURDAY}`
      : "Auf dem Startbildschirm wie eine App, mit eigenem Symbol und ohne Browserleiste.",
  };
}

/**
 * Kicker, Überschrift und Lead je Schritt (E10). Ohne Daten oder ohne Angebote steht der Lead ohne Zahlen. `first`:
 * Schritt 1 des Flows. Der Kicker hängt an der Position (Plan 0034, E2): Schritt 1 heißt „Willkommen“; steht Stadt
 * nicht zuerst (iPhone im Safari-Tab), heißt sie „Schön, dass ihr da seid“.
 */
export function stepText(
  step: StepId,
  ctx: { first: boolean; stats?: { offers: number; providers: number }; app?: AppStepParts },
): StepText {
  switch (step) {
    case "stadt": {
      const { stats } = ctx;
      return {
        kicker: ctx.first ? "Willkommen" : "Schön, dass ihr da seid",
        title: "Alles für Kinder unter 3 an einem Ort",
        lead:
          stats && stats.offers > 0
            ? `${stats.offers} Babykurse, Krabbelgruppen, Konzerte und Ausflüge von ${plural(stats.providers, "Anbieter", "Anbietern")}.`
            : "Babykurse, Krabbelgruppen, Konzerte und Ausflüge an einem Ort.",
      };
    }
    case "alter":
      return {
        kicker: "Passt zum Alter",
        title: "Nur, was zu deinem Zwerg passt",
        lead: "Auch bei regelmäßigen Treffs prüfe ich jeden einzelnen Termin.",
      };
    case "weg":
      return {
        kicker: "Gut erreichbar",
        title: "Nur, was ihr mit Bus und Bahn schafft",
        lead: "Fahrzeit nach echtem VGN-Fahrplan, mit höchstens einem Umstieg.",
      };
    case "app": {
      const text = appText(ctx.app);
      return ctx.first ? { ...text, kicker: "Willkommen" } : text;
    }
  }
}

/** Feste Texte des Flows (E3, E5–E7); die Knöpfe nennt `primaryLabel` */
export const ONBOARDING_TEXTS = {
  dialog: "Einführung",
  skip: "Überspringen",
  later: "Später",
  cityLabel: "Eure Stadt",
  cityGroup: "Stadt",
  moreCities: "Weitere Städte",
  moreCitiesEmpty: "Weitere Städte …",
  birthLabel: "Geburtsdatum",
  birthPlaceholder: "TT.MM.JJJJ",
  localOnly: "Bleibt nur auf diesem Gerät.",
  locate: "Standort",
  locating: "Suche …",
  located: "Gefunden",
  district: "Stadtteil",
  districtEmpty: "Stadtteil …",
  limitLabel: "Höchstens unterwegs",
  wayNote: "Bleibt nur auf diesem Gerät. Stadtteile: © OpenStreetMap-Mitwirkende.",
} as const;

/** Vorlesetext vor der Überschrift (E3): „Schritt 2 von 4: “ */
export function stepOf(index: number, total: number): string {
  return `Schritt ${index + 1} von ${total}: `;
}
