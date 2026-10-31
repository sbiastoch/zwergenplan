/**
 * Overlays der App (Plan 0003, E3; ausgelagert mit Plan 0005): Anbieter-Sheet, Detail, Filter-Sheet, Kind-Sheet als
 * native <dialog>. Das Orts-Sheet gehört zur Karten-Oberfläche (karte/MapScreen.tsx).
 */
import { type RefObject, useState } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import type { FilterState } from "../domain/filter.ts";
import type { SavedFilter } from "../domain/saved.ts";
import { offerSharePath, providerSharePath } from "../domain/share.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { DetailContent } from "./DetailDialog.tsx";
import { Dialog } from "./Dialog.tsx";
import { type AboListProps, KidSheet } from "./KidSheet.tsx";
import type { CardContext } from "./OfferCard.tsx";
import { ProviderSheetLoader } from "./ProviderPanel.tsx";
import { type AgeFilter, FilterSheet, type LimitActionFor, ManualLinkSheet, type SavedSheetParts } from "./Sheets.tsx";
import type { ToastMessage } from "./Toast.tsx";
import { type OriginApi, type Say, useShare } from "./use-app-state.ts";
import type { TransitApi } from "./use-transit.ts";

/**
 * „origin“: Kind-Sheet, geöffnet über „Startpunkt wählen“ (Fokus auf die Stadtteil-Auswahl); „saved-filter“: Filter der
 * Merkliste (Plan 0057, E5)
 */
export type SheetKind = "filter" | "saved-filter" | "kid" | "origin" | null;

/** Filter-Sheet der Merkliste (Plan 0057, E5): eigener Zustand, nie in der URL */
interface SavedFilterSheet {
  filter: SavedFilter;
  onChange: (filter: SavedFilter) => void;
  onReset: () => void;
  /** gemerkte Angebote, die in dieser Darstellung zum Filter passen */
  resultCount: number;
  quick: SavedSheetParts["quick"];
  calendar: boolean;
}

interface OverlaysProps {
  toast: ToastMessage;
  /** Verwaltung der Abos im Kind-Sheet (Plan 0054, E7) */
  abos: AboListProps;
  sheet: SheetKind;
  setSheet: (sheet: SheetKind) => void;
  detailOffer: SiteOffer | undefined;
  detailDay: string | undefined;
  closeDetail: () => void;
  /** offenes Anbieter-Sheet (`anbieter=<id>`, Plan 0010, E3) */
  providerId: string | undefined;
  openProvider: (providerId: string) => void;
  closeProvider: () => void;
  /** abonnierte Anbieter (Plan 0025, E2; Plan 0054, E1): Glocke im Anbieter-Sheet */
  isProviderSaved: (providerId: string) => boolean;
  onToggleProvider: (providerId: string) => void;
  /** Glocken-Tipp schaltet Push ein (Plan 0054, E5) */
  bellBusy: boolean;
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
  say: Say;
  filter: FilterState;
  setFilter: (filter: FilterState) => void;
  resultCount: number;
  birthDate: string | undefined;
  setBirthDate: (value: string | undefined) => void;
  /** Altersschalter im Filter-Sheet (Plan 0021, E2); ohne Geburtsdatum `undefined` */
  filterAge: AgeFilter | undefined;
  /** „Zurücksetzen“ im Filter-Sheet: URL-Filter leeren, Altersfilter wieder an (Plan 0021, E2) */
  resetFilters: () => void;
  savedFilter: SavedFilterSheet;
  theme: { choice: ThemeChoice; setChoice: (choice: ThemeChoice) => void };
  /**
   * Karte groß offen (Plan 0059, E4): Detail, Anbieter-Sheet als Sheet über der Karte, Fokus-Rückweg auf „Karte
   * verkleinern“ statt der verborgenen Tab-Leiste (Review M7)
   */
  overMap: { closeRef: RefObject<HTMLButtonElement | null> } | undefined;
  today: string;
  originApi: OriginApi;
  /** Wegzeit: Modus für die Filtergruppe, Quelle für den Hinweis im Kind-Sheet */
  transit: TransitApi;
  /** Knopf zur Begründung der gesperrten Wegzeit-Grenze (`LimitAction`) */
  limitAction: LimitActionFor;
  /**
   * Fokus-Rückweg des Kind-Sheets: „Startpunkt wählen“ im Wegzeit-Hinweis verschwindet mit der Wahl, dann der
   * Filter-Knopf; aus der Aufforderung „Wovon aus gerechnet?“ die Statuszeile (Plan 0043, E7).
   */
  kidFallback: RefObject<HTMLElement | null>;
  /**
   * Fokus-Rückweg des Details: der Knopf des aktiven Tabs. Die Kachel, die das Detail geöffnet hat,
   * fehlt nach dem Ablösen in der Merkliste oder bei einem Deep-Link (Plan 0008, E11).
   */
  activeTab: RefObject<HTMLButtonElement | null>;
  /** „Einführung ansehen“ im Kind-Sheet (Plan 0033, E12) */
  onIntro: () => void;
}

/** Ab so viel Scrollen im Detail über der großen Karte steht es ganz oben (Plan 0059, E4, Review: Minor) */
const FULL_AFTER_PX = 24;

export function Overlays(props: OverlaysProps) {
  const { toast, sheet, setSheet, detailOffer, detailDay, closeDetail, ctx, say, filter, setFilter } = props;
  const { birthDate, setBirthDate, theme, today, originApi, kidFallback, activeTab } = props;
  const { transit, providerId, openProvider, closeProvider } = props;
  const { origin } = originApi;
  const { now, onCycle, onHold } = ctx;
  // Teilen (Plan 0026, E6): Pfad nur aus der ID, nie aus `location`
  const { share, manualLink, closeManualLink } = useShare(say);
  const shareOffer = (offer: SiteOffer) => share({ title: offer.title, path: offerSharePath(offer.id) });
  const shareProvider = (provider: { id: string; name: string }) =>
    share({ title: provider.name, path: providerSharePath(provider.id) });
  // Das Sheet dieses Anbieters liegt schon unter dem Detail: zurück dorthin, ohne neuen History-Eintrag (E3).
  const onProvider = (id: string) => (id === providerId ? closeDetail() : openProvider(id));
  const { overMap } = props;
  const backFocus = overMap ? overMap.closeRef : activeTab;
  // Detail über der großen Karte: halb oder ganz hochgezogen (E4); je Angebot neu halb
  // gemerkt je Angebots-ID: Ein anderes Angebot beginnt ohne Effekt und ohne Zwischen-Frame wieder halb
  const [fullFor, setFullFor] = useState<string>();
  const full = detailOffer !== undefined && fullFor === detailOffer.id;
  const setFull = (on: boolean) => setFullFor(on ? detailOffer?.id : undefined);
  const detailClass = overMap ? (full ? "detail over-map voll" : "detail over-map") : "detail";
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
        className={overMap ? "sheet over-map" : "sheet"}
        toast={toast}
        fallbackFocus={backFocus}
      >
        {providerId !== undefined && (
          <ProviderSheetLoader
            key={providerId}
            providerId={providerId}
            generatedAt={props.generatedAt}
            offers={props.offers}
            visible={props.visible}
            ctx={ctx}
            saved={props.isProviderSaved(providerId)}
            onToggleSaved={props.onToggleProvider}
            bellBusy={props.bellBusy}
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
        className={detailClass}
        toast={toast}
        fallbackFocus={backFocus}
      >
        {detailOffer && overMap && (
          <button
            type="button"
            className="detail-grab"
            aria-label={full ? "Detail verkleinern" : "Detail ganz zeigen"}
            aria-expanded={full}
            onClick={() => setFull(!full)}
          >
            <span className="grab" />
          </button>
        )}
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
            stage={ctx.stageOf(detailOffer.id)}
            onCycle={onCycle}
            onHold={onHold}
            onShare={shareOffer}
            onClose={closeDetail}
            onProvider={onProvider}
            onIcs={say}
            onScrolled={overMap ? (top) => top > FULL_AFTER_PX && setFull(true) : undefined}
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
        open={sheet === "saved-filter"}
        onClose={() => setSheet(null)}
        label="Merkliste filtern"
        className="sheet"
        toast={toast}
      >
        <SavedFilterContent
          sheet={props.savedFilter}
          transit={transit}
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
        fallbackFocus={kidFallback}
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
          onIntro={props.onIntro}
          onClose={() => setSheet(null)}
          abos={props.abos}
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

/** Inhalt des Merklisten-Filter-Sheets: dasselbe `FilterSheet` mit `saved`, ohne Alter (Plan 0028) */
function SavedFilterContent({
  sheet,
  transit,
  limitAction,
  today,
  onClose,
}: {
  sheet: SavedFilterSheet;
  transit: TransitApi;
  limitAction: LimitActionFor;
  today: string;
  onClose: () => void;
}) {
  const { filter: saved, onChange } = sheet;
  return (
    <FilterSheet
      saved={{
        onlyFixed: saved.onlyFixed,
        onOnlyFixed: (onlyFixed) => onChange({ ...saved, onlyFixed }),
        quick: sheet.quick,
        calendar: sheet.calendar,
      }}
      filter={saved.filter}
      onChange={(filter) => onChange({ ...saved, filter })}
      onReset={sheet.onReset}
      age={undefined}
      resultCount={sheet.resultCount}
      mode={transit.mode}
      limitAction={limitAction}
      today={today}
      onClose={onClose}
    />
  );
}
