/**
 * Schnittstellen der lazy geladenen Anbieterübersicht (Plan 0010, E7). Liegen außerhalb von src/ui/anbieter/, weil von
 * außen nichts statisch dorthin greifen darf, auch kein Typ (`anbieter-ui-only-lazy`). Ladekette: ProviderPanel (Start:
 * Lader, anbieter.json, Datenstand-Abgleich) → anbieter/entry.ts (Liste und Sheet, ein Chunk).
 */
import type { ComponentType } from "react";
import type { Reach } from "../domain/reach.ts";
import type { ProviderDirectoryData, SiteOffer } from "../domain/site-data.ts";
import type { AgeEscape } from "./ListView.tsx";
import type { CardContext } from "./OfferCard.tsx";
import type { ReachMode } from "./use-transit.ts";

/** Props der Anbieterliste im Tab „Anbieter“ */
export interface ProviderScreenProps {
  /** Katalog, schon mit dem Datenstand von site.json abgeglichen (`ensureFresh` im ProviderPanel, E6) */
  directory: ProviderDirectoryData;
  /** alle Angebote aus site.json; „kommend“ rechnet der Chunk (`applyFilters` ohne Filter, E4), Rückfall-Zeilen auch */
  offers: readonly SiteOffer[];
  /** sichtbare Angebote wie in „Entdecken“: Filter, Sticker, Wegzeit-Grenze, Alter (E4) */
  visible: readonly SiteOffer[];
  now: Date;
  /** Wegzeit bzw. Luftlinie zum Ort eines Angebots; `undefined` ohne Startpunkt */
  reachOf: (offer: SiteOffer) => Reach | undefined;
  /** `undefined` ohne Startpunkt; „laedt“ zeigt den Platzhalter-Block statt der Zeilen (E5, E10) */
  reachMode: ReachMode | undefined;
  /** Suchtext; lebt im Start (App.tsx), damit er einen Tab-Wechsel übersteht, nie in der URL (E5) */
  query: string;
  onQuery: (query: string) => void;
  /** öffnet das Anbieter-Sheet (`anbieter=<id>`, E3) */
  onOpenProvider: (providerId: string) => void;
  /** nur mit aktivem Filter: Textknopf „Filter zurücksetzen“ (E4) */
  onResetFilter: (() => void) | undefined;
  /** nur, wenn der Altersfilter etwas ausblendet: „Auch unpassende zeigen“ (Plan 0021, E4) */
  age: AgeEscape | undefined;
  /** IDs der gemerkten Anbieter: stehen oben, Herz gedrückt (Plan 0025, E3) */
  saved: readonly string[];
  /** merkt bzw. entfernt einen Anbieter, mit Toast */
  onToggleSaved: (providerId: string) => void;
}

/** Props des Anbieter-Sheets. Den Dialog rendert Overlays.tsx immer, diesen Inhalt nur bei offenem Dialog (E3). */
export interface ProviderSheetProps {
  directory: ProviderDirectoryData;
  providerId: string;
  /** alle Angebote; das Sheet zeigt alle kommenden des Anbieters, unabhängig von Filtern und Alter (E4) */
  offers: readonly SiteOffer[];
  /** für den Hinweis „Alle Angebote, auch die außerhalb deiner Auswahl.“ (E4) */
  visible: readonly SiteOffer[];
  /** Kacheln: merken, Detail über dem Sheet öffnen, unpassende markieren (E3, E4) */
  ctx: CardContext;
  /** Herz im Kopf (Plan 0025, E2): Anbieter gemerkt? */
  saved: boolean;
  /** merkt bzw. entfernt den Anbieter, mit Toast */
  onToggleSaved: (providerId: string) => void;
  /** Teilen per Link (Plan 0026, E6): synchron im Tipp */
  onShare: (provider: { id: string; name: string }) => void;
  onClose: () => void;
}

/** Was anbieter/entry.ts exportiert: Liste und Sheet in einem Chunk */
export interface ProviderUiModule {
  ProviderScreen: ComponentType<ProviderScreenProps>;
  ProviderSheet: ComponentType<ProviderSheetProps>;
}
