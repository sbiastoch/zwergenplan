/**
 * Overlays der App (Plan 0003, E3; ausgelagert mit Plan 0005): Detail, Filter-Sheet, Kind-Sheet als
 * native <dialog>. Das Orts-Sheet gehört zur Karten-Oberfläche (karte/MapScreen.tsx).
 */
import type { ReactNode, RefObject } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import type { FilterState } from "../domain/filter.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { DetailContent } from "./DetailDialog.tsx";
import { Dialog } from "./Dialog.tsx";
import { KidSheet } from "./KidSheet.tsx";
import type { CardContext } from "./OfferCard.tsx";
import { FilterSheet } from "./Sheets.tsx";
import type { OriginApi } from "./use-app-state.ts";
import type { TransitApi } from "./use-transit.ts";

/** „origin“: Kind-Sheet, geöffnet über „Startpunkt wählen“ (Fokus auf die Stadtteil-Auswahl) */
export type SheetKind = "filter" | "kid" | "origin" | null;

interface OverlaysProps {
  toast: string;
  sheet: SheetKind;
  setSheet: (sheet: SheetKind) => void;
  detailOffer: SiteOffer | undefined;
  detailDay: string | undefined;
  closeDetail: () => void;
  /** Merken, Wegzeit und „jetzt“ wie auf den Kacheln */
  ctx: CardContext;
  say: (message: string) => void;
  filter: FilterState;
  setFilter: (filter: FilterState) => void;
  resultCount: number;
  birthDate: string | undefined;
  setBirthDate: (value: string | undefined) => void;
  ageOnly: boolean;
  setAgeOnly: (on: boolean) => void;
  theme: { choice: ThemeChoice; setChoice: (choice: ThemeChoice) => void };
  today: string;
  originApi: OriginApi;
  /** Wegzeit: Modus für die Filtergruppe, Quelle für den Hinweis im Kind-Sheet */
  transit: TransitApi;
  /** Knopf zur Begründung der gesperrten Wegzeit-Grenze (`LimitAction`) */
  limitAction: ReactNode;
  /** Fokus-Rückweg des Kind-Sheets: „Startpunkt wählen“ im Wegzeit-Hinweis verschwindet mit der Wahl. */
  filterButton: RefObject<HTMLButtonElement | null>;
  /**
   * Fokus-Rückweg des Details: der Knopf des aktiven Tabs. Die Kachel, die das Detail geöffnet hat,
   * fehlt nach dem Ablösen in der Merkliste oder bei einem Deep-Link (Plan 0008, E11).
   */
  activeTab: RefObject<HTMLButtonElement | null>;
}

export function Overlays(props: OverlaysProps) {
  const { toast, sheet, setSheet, detailOffer, detailDay, closeDetail, ctx, say, filter, setFilter } = props;
  const { birthDate, setBirthDate, ageOnly, setAgeOnly, theme, today, originApi, filterButton, activeTab } = props;
  const { transit } = props;
  const { origin } = originApi;
  const { now, onToggleSave } = ctx;
  return (
    <>
      <Dialog
        open={detailOffer !== undefined}
        onClose={closeDetail}
        label={detailOffer?.title ?? "Angebot"}
        className="detail"
        toast={toast}
        fallbackFocus={activeTab}
      >
        {detailOffer && (
          <DetailContent
            key={detailOffer.id}
            offer={detailOffer}
            now={now}
            day={detailDay}
            birthDate={birthDate}
            origin={origin}
            reach={ctx.reachOf(detailOffer)}
            reachPending={ctx.reachPending}
            saved={ctx.isSaved(detailOffer.id)}
            onToggleSave={onToggleSave}
            onClose={closeDetail}
            onIcs={say}
          />
        )}
      </Dialog>
      <Dialog open={sheet === "filter"} onClose={() => setSheet(null)} label="Filter" className="sheet" toast={toast}>
        <FilterSheet
          filter={filter}
          onChange={setFilter}
          resultCount={props.resultCount}
          mode={transit.mode}
          limitAction={props.limitAction}
          onClose={() => setSheet(null)}
        />
      </Dialog>
      <Dialog
        open={sheet === "kid" || sheet === "origin"}
        onClose={() => setSheet(null)}
        label="Kind und Einstellungen"
        className="sheet"
        toast={toast}
        fallbackFocus={filterButton}
      >
        <KidSheet
          birthDate={birthDate}
          onBirthDate={setBirthDate}
          ageOnly={ageOnly}
          onAgeOnly={setAgeOnly}
          theme={theme.choice}
          onTheme={theme.setChoice}
          today={today}
          origin={originApi}
          transitSource={transit.source}
          focusOrigin={sheet === "origin"}
          onClose={() => setSheet(null)}
        />
      </Dialog>
    </>
  );
}
