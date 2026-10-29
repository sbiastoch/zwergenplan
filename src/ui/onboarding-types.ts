/**
 * Schnittstelle zwischen App, Lader `Onboarding.tsx` (Start), dem Flow `onboarding/OnboardingFlow.tsx` (Lazy-Chunk
 * `assets/onboarding/`) und dem App-Schritt in `app-extras/AppSection.tsx` (Lazy-Chunk `assets/app/`), Plan 0033, E4.
 * Nur Typen: Von außen erreicht man beide Chunks nur per `import()`, auch Typen nicht statisch
 * (`onboarding-ui-only-lazy`, `app-extras-ui-only-lazy`).
 */
import type { ComponentType, RefObject } from "react";
import type { FilterState } from "../domain/filter.ts";
import type { AppStepParts } from "../domain/onboarding.ts";
import type { InstallApi, PushCapability } from "../domain/pwa.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import type { OriginApi } from "./use-app-state.ts";
import type { TransitApi } from "./use-transit.ts";

/**
 * Wie das Onboarding endet (E2, E3, E9): „fertig“ nach dem letzten Schritt, „abbruch“ nach „Überspringen“ oder
 * Esc/Zurück (beide setzen das Flag), „spaeter“ nur, wenn der Chunk nicht lädt (Flag bleibt leer).
 */
export type OnboardingEnd = "fertig" | "abbruch" | "spaeter";

/** Was die App dem Lader gibt. Der Lader reicht alles außer `data` an den Flow weiter. */
export interface OnboardingProps {
  /**
   * Angebote aus `site.json`, sonst `load.kind` der App. Der Flow startet erst, wenn sie geladen oder gescheitert ist
   * (E5); so kompakt, weil jedes Byte in `App.tsx` ins Startbudget zählt (E13).
   */
  data: readonly SiteOffer[] | "loading" | "error";
  now: Date;
  /** Berliner Tag zu `now` (Geburtsdatum prüfen) */
  today: string;
  birthDate: string | undefined;
  /** wie im Kind-Sheet: speichert und schaltet den Altersfilter wieder an (E6) */
  onBirthDate: (iso: string | undefined) => void;
  /** Startpunkt wie im Kind-Sheet (ADR 0017) */
  originApi: OriginApi;
  /** `want()` beim Anzeigen des Schritts „Weg“, `mode` für Hinweis und gesperrte Chips (E7) */
  transit: TransitApi;
  /** Filter der Startseite: nur `reachLimit` (`wegzeit=`) ändert der Flow (E7) */
  filter: FilterState;
  setFilter: (filter: FilterState) => void;
  /** Zahl der Angebote für „Zeig mir die N Angebote“; `pending`, solange die Wegzeit zur Grenze lädt (E9) */
  finish: { count: number; pending: boolean };
  onEnd: (kind: OnboardingEnd) => void;
}

/** Der App-Schritt aus `assets/app/` (E8); ohne ihn (Chunk nicht ladbar) entfällt der Schritt „App“ (Review H5). */
export interface AppStepModule {
  AppStep: ComponentType<AppStepProps>;
  install: InstallApi;
  pushCapability: () => PushCapability;
  /** am Ende des Onboardings einmal spiegeln, falls ein Abo läuft (Plan 0035, E9) */
  syncPush: () => Promise<"an" | "aus" | "nein">;
}

export interface AppStepProps {
  install: InstallApi;
  parts: AppStepParts;
  /** Überschrift des Schritts: Fokusziel, wenn der Installationsknopf mit dem Fokus verschwindet */
  heading: RefObject<HTMLHeadingElement | null>;
}

/** Props des Flows im Chunk: alles vom Lader, `offers` erst nach dem Laden (`undefined` = Ladefehler), App-Teil */
export interface OnboardingFlowProps extends Omit<OnboardingProps, "data"> {
  offers: readonly SiteOffer[] | undefined;
  app: AppStepModule | undefined;
}
