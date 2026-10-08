/**
 * Overlays der App (Plan 0003, E3; ausgelagert mit Plan 0005): Anbieter-Sheet, Detail, Filter-Sheet, Kind-Sheet als
 * native <dialog>. Das Orts-Sheet gehört zur Karten-Oberfläche (karte/MapScreen.tsx).
 */
import type { RefObject } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import type { FilterState } from "../domain/filter.ts";
import { offerSharePath, providerSharePath } from "../domain/share.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { DetailContent } from "./DetailDialog.tsx";
import { Dialog } from "./Dialog.tsx";
import { KidSheet } from "./KidSheet.tsx";
import type { CardContext } from "./OfferCard.tsx";
import { ProviderSheetLoader } from "./ProviderPanel.tsx";
import { type AgeFilter, FilterSheet, type LimitActionFor, ManualLinkSheet } from "./Sheets.tsx";
import { type OriginApi, useShare } from "./use-app-state.ts";
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
  /** offenes Anbieter-Sheet (`anbieter=<id>`, Plan 0010, E3) */
  providerId: string | undefined;
  openProvider: (providerId: string) => void;
  closeProvider: () => void;
  /** ID weder im Katalog noch in den Angeboten: `anbieter=` entfernen */
  onUnknownProvider: () => void;
  /** Datenstand von site.json; `undefined`, solange sie lädt */
  generatedAt: string | undefined;
  /** alle Angebote und die sichtbaren (Filter, Alter) für das Anbieter-Sheet */
  offers: readonly SiteOffer[];
  visible: readonly SiteOffer[];
  /** Merken, Wegzeit und „jetzt“ wie auf den Kacheln */
  ctx: CardContext;
  /** Toast; `ms` für lange Meldungen (Plan 0018, E4) */
  say: (message: string, ms?: number) => void;
  filter: FilterState;
  setFilter: (filter: FilterState) => void;
  resultCount: number;
  birthDate: string | undefined;
  setBirthDate: (value: string | undefined) => void;
  /** Altersschalter im Filter-Sheet (Plan 0021, E2); ohne Geburtsdatum `undefined` */
  filterAge: AgeFilter | undefined;
  /** „Zurücksetzen“ im Filter-Sheet: URL-Filter leeren, Altersfilter wieder an (Plan 0021, E2) */
  resetFilters: () => void;
  theme: { choice: ThemeChoice; setChoice: (choice: ThemeChoice) => void };
  today: string;
  originApi: OriginApi;
  /** Wegzeit: Modus für die Filtergruppe, Quelle für den Hinweis im Kind-Sheet */
  transit: TransitApi;
  /** Knopf zur Begründung der gesperrten Wegzeit-Grenze (`LimitAction`) */
  limitAction: LimitActionFor;
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
  const { birthDate, setBirthDate, theme, today, originApi, filterButton, activeTab } = props;
  const { transit, providerId, openProvider, closeProvider } = props;
  const { origin } = originApi;
  const { now, onToggleSave } = ctx;
  // Teilen (Plan 0026, E6): Pfad nur aus der ID, nie aus `location`
  const { share, manualLink, closeManualLink } = useShare(say);
  const shareOffer = (offer: SiteOffer) => share({ title: offer.title, path: offerSharePath(offer.id) });
  const shareProvider = (provider: { id: string; name: string }) =>
    share({ title: provider.name, path: providerSharePath(provider.id) });
  // Das Sheet dieses Anbieters liegt schon unter dem Detail: zurück dorthin, ohne neuen History-Eintrag (E3).
  const onProvider = (id: string) => (id === providerId ? closeDetail() : openProvider(id));
  return (
    <>
      {/*
        Vor dem Detail und immer gemountet (Plan 0010, E3): React ruft die Effekte in Baumreihenfolge, öffnen beide im
        selben Commit (Deep-Link, Zurück), ruft das Sheet zuerst showModal() und das Detail liegt oben.
      */}
      <Dialog
        open={providerId !== undefined}
        onClose={closeProvider}
        label="Anbieter"
        className="sheet"
        toast={toast}
        fallbackFocus={activeTab}
      >
        {providerId !== undefined && (
          <ProviderSheetLoader
            key={providerId}
            providerId={providerId}
            generatedAt={props.generatedAt}
            offers={props.offers}
            visible={props.visible}
            ctx={ctx}
            onUnknown={props.onUnknownProvider}
            onShare={shareProvider}
            onClose={closeProvider}
          />
        )}
      </Dialog>
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
            generatedAt={props.generatedAt}
            origin={origin}
            reach={ctx.reachOf(detailOffer)}
            reachPending={ctx.reachPending}
            category={ctx.categoryOf(detailOffer)}
            saved={ctx.isSaved(detailOffer.id)}
            onToggleSave={onToggleSave}
            onShare={shareOffer}
            onClose={closeDetail}
            onProvider={onProvider}
            onIcs={say}
          />
        )}
      </Dialog>
      <Dialog open={sheet === "filter"} onClose={() => setSheet(null)} label="Filter" className="sheet" toast={toast}>
        <FilterSheet
          filter={filter}
          onChange={setFilter}
          onReset={props.resetFilters}
          age={props.filterAge}
          resultCount={props.resultCount}
          mode={transit.mode}
          limitAction={props.limitAction}
          today={today}
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
          theme={theme.choice}
          onTheme={theme.setChoice}
          today={today}
          origin={originApi}
          reachMode={transit.mode}
          transitSource={transit.source}
          focusOrigin={sheet === "origin"}
          onClose={() => setSheet(null)}
        />
      </Dialog>
      {/* Zuletzt: liegt über Detail bzw. Anbieter-Sheet (späteres showModal oben, Plan 0026, E6) */}
      <Dialog
        open={manualLink !== undefined}
        onClose={closeManualLink}
        label="Link zum Teilen"
        className="sheet"
        toast={toast}
        fallbackFocus={activeTab}
      >
        {manualLink !== undefined && <ManualLinkSheet url={manualLink} onClose={closeManualLink} />}
      </Dialog>
    </>
  );
}
