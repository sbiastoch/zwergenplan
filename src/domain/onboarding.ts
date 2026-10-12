/**
 * Onboarding beim ersten Öffnen (Plan 0033): Schritte und Reihenfolge (E1), Stadt-Kacheln und Willkommenszahlen (E5),
 * Altershinweis (E6), Wegzeit-Chips (E7), Knopf-Beschriftungen (E9) und Texte (E10). Rein; nur im Lazy-Chunk
 * `assets/onboarding/` (Regel `onboarding-domain-only-lazy`). Ob es erscheint, entscheidet `onboarding-gate.ts` im Start.
 * Aus `pwa.ts` kommen nur Typen, sonst entstünde ein geteilter Chunk mit dem App-Teil (Review M2).
 */
import { nextSession } from "./agenda.ts";
import { plural } from "./labels.ts";
import { countProviders } from "./provider-count.ts";
import type { InstallState, PushCapability } from "./pwa.ts";
import { LIMIT_MINUTES, type ReachLimit } from "./reach.ts";
import { byPopulation, type Region } from "./regions.ts";
import type { Offer } from "./schema.ts";

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
 * Reihenfolge, einmal beim Start des Flows festgelegt (Plan 0033, E1; Plan 0035, E1): Auf dem iPhone im Browser steht
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
  const sorted = byPopulation(regions).map(({ id, name }) => ({ id, name }));
  return { tiles: sorted.slice(0, maxTiles), more: sorted.slice(maxTiles) };
}

/** Zahlen für den Willkommens-Text (E5): Angebote mit kommendem Termin und deren Anbieter, wie die Statuszeile */
export function welcomeStats(offers: readonly Offer[], now: Date): { offers: number; providers: number } {
  const upcoming = offers.filter((o) => nextSession(o, now) !== undefined);
  return { offers: upcoming.length, providers: countProviders(upcoming) };
}

/**
 * Hinweis unter dem Geburtsdatum (E10; Nachtrag Plan 0035, 2026-10-11): kurz und herzlich je Alter statt einer
 * Rechnung. Ab 3 Jahren ehrlich: Der Zwergenplan ist für Kinder unter 3.
 */
export function ageHint(months: number): string {
  if (months < 1) return "Willkommen auf der Welt!";
  if (months < 3) return "Ganz frisch dabei!";
  if (months === 6) return "Schon ein halbes Jahr!";
  if (months < 10) return `Schon ${months} Monate!`;
  if (months < 12) return "Bald ein Jahr!";
  if (months === 12) return "Ein ganzes Jahr – Glückwunsch!";
  if (months < 18) return "Schon über ein Jahr!";
  if (months === 18) return "Anderthalb Jahre!";
  if (months < 24) return "Bald zwei!";
  if (months < 30) return "Schon zwei!";
  if (months < 33) return "Zweieinhalb!";
  if (months < 36) return "Bald drei!";
  return "Schon drei! Hier gibt’s vor allem Angebote bis 3.";
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

const WEEKLY = "einmal pro Woche eine Push-Nachricht, was es Neues für euch gibt.";

function appText(app: AppStepParts | undefined): StepText {
  const push = app?.push === "schalter" || app?.push === "nur-in-app";
  if (app?.install === undefined) {
    return {
      kicker: "Einmal pro Woche",
      title: "Neues kommt von selbst",
      lead: "Einmal pro Woche eine Push-Nachricht, was es Neues für euch gibt.",
    };
  }
  return {
    kicker: "Immer griffbereit",
    title: "Ein Tipp, und ich bin da",
    lead: push
      ? `Auf dem Startbildschirm wie eine App. Und ${WEEKLY}`
      : "Auf dem Startbildschirm wie eine App, mit eigenem Symbol und ohne Browserleiste.",
  };
}

/**
 * Kicker, Überschrift und Lead je Schritt (E10). Ohne Daten oder ohne Angebote steht der Lead ohne Zahlen. `first`:
 * Schritt 1 des Flows. Der Kicker hängt an der Position (Plan 0035, E2): Schritt 1 heißt „Willkommen“; steht Stadt
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
        lead: "Schluss mit dem Rechnen: Ich prüfe für jeden Termin, ob oder ab wann das Alter passt.",
      };
    case "weg":
      return {
        kicker: "Gut erreichbar",
        title: "Nur, was ihr mit Bus und Bahn schafft",
        lead: "Ich zeige, wie lange ihr mit Bus und Bahn braucht – mit höchstens einem Umstieg.",
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
  back: "Zurück",
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
  locatedLabel: "Dein Standort",
  clearLocation: "Standort entfernen",
  district: "Stadtteil",
  districtEmpty: "Stadtteil …",
  limitLabel: "Höchstens unterwegs",
  wayNote: "Bleibt nur auf diesem Gerät. Stadtteile: © OpenStreetMap-Mitwirkende.",
} as const;

/** Vorlesetext vor der Überschrift (E3): „Schritt 2 von 4: “ */
export function stepOf(index: number, total: number): string {
  return `Schritt ${index + 1} von ${total}: `;
}

/** Richtung einer Wischgeste zwischen den Schritten (Plan 0035, E10) */
export type SwipeStep = "weiter" | "zurueck";

/** Mindestweg, Randbreite (Systemgesten) und größte Steigung dy/dx (≈ 27°) einer Wischgeste */
export const SWIPE = { minDistance: 56, edge: 24, maxSlope: 0.5 } as const;

/**
 * Klassifiziert eine abgeschlossene Geste (E10); `width` ist die Breite des Viewports in CSS-Pixeln. Am Rand beginnende
 * Gesten gehören dem System (Android-Zurück, Safari-Zurück/Vor), zu kurze oder eher vertikale zählen nicht.
 */
export function swipeStep(g: { x0: number; y0: number; x1: number; y1: number; width: number }): SwipeStep | undefined {
  if (g.x0 < SWIPE.edge || g.x0 > g.width - SWIPE.edge) return undefined;
  const dx = g.x1 - g.x0;
  const dy = g.y1 - g.y0;
  if (Math.abs(dx) < SWIPE.minDistance || Math.abs(dy) > Math.abs(dx) * SWIPE.maxSlope) return undefined;
  return dx < 0 ? "weiter" : "zurueck";
}
