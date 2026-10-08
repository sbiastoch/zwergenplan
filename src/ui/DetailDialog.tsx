/** Detail eines Angebots (Plan 0003, E13) – Inhalt des Vollbild-Dialogs. */
import { type MouseEvent, useState } from "react";
import { assetUrl } from "../data/site.ts";
import { ageCheck } from "../domain/age.ts";
import { referenceSession, sessionOnDay, upcomingSessions } from "../domain/agenda.ts";
import { seriesIcsFileName, seriesIcsPath, sessionIcsPath } from "../domain/ics-paths.ts";
import type { Origin, Reach } from "../domain/reach.ts";
import { type ExportSelection, exportSessions, seriesExport } from "../domain/saved.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { CATEGORY_LABELS, type Category } from "../domain/topics.ts";
import {
  ageRangeLabel,
  ageWindowLabel,
  availabilityLabel,
  calendarLoaded,
  costLabel,
  dayDots,
  EXPORT_UNAVAILABLE,
  longDate,
  plural,
  registrationLabel,
  registrationNote,
  seriesToast,
  sessionDay,
  shortDate,
  timeRange,
  whenLabels,
} from "./format.ts";
import { Icon, Shape } from "./icons.tsx";
import { download, type IcsExport, loadExport } from "./ics-export.ts";
import { DistPending, HeartButton } from "./OfferCard.tsx";
import { ReachLong } from "./ReachLong.tsx";
import { LONG_TOAST_MS } from "./use-app-state.ts";
import { WhereTile } from "./Ways.tsx";

interface DetailProps {
  offer: SiteOffer;
  now: Date;
  /** gewählter Kalendertag, falls aus der Kalender-Agenda geöffnet */
  day: string | undefined;
  birthDate: string | undefined;
  /** Datenstand für den ICS-Kontext (`DTSTAMP` wie in den statischen Dateien); ohne ihn nur die statische Datei */
  generatedAt: string | undefined;
  /** Startpunkt und Entfernung zum Ort; beides nur mit Startpunkt (Plan 0004, E6) */
  origin: Origin | undefined;
  reach: Reach | undefined;
  /** Wegzeit lädt: Platzhalter statt Entfernung (Plan 0009, E11) */
  reachPending: boolean;
  /** Leitkategorie, wie auf der Kachel (`CardContext.categoryOf`, Plan 0014, E2) */
  category: Category;
  saved: boolean;
  onToggleSave: (offer: SiteOffer) => void;
  /** Teilen per Link (Plan 0026, E6): synchron im Tipp */
  onShare: (offer: SiteOffer) => void;
  onClose: () => void;
  /**
   * „Mehr von diesem Anbieter“: öffnet das Anbieter-Sheet (Plan 0010, E2, E3). Statt „Alle Angebote dieses Anbieters“
   * aus dem Plan: Das brach bei 320 px mit Icon auf zwei Zeilen um (Text-Gate, kurze Knöpfe einzeilig).
   */
  onProvider: (providerId: string) => void;
  /** Toast nach dem Tipp auf einen ICS-Knopf; `ms` für lange Meldungen (Plan 0018, E4) */
  onIcs: (message: string, ms?: number) => void;
}

export function DetailContent({
  offer,
  now,
  day,
  birthDate,
  generatedAt,
  origin,
  reach,
  reachPending,
  category,
  saved,
  onToggleSave,
  onShare,
  onClose,
  onProvider,
  onIcs,
}: DetailProps) {
  const [allDates, setAllDates] = useState(false);
  const fromCalendar = day ? sessionOnDay(offer, day) : undefined;
  const ref = referenceSession(offer, now, day);
  const upcoming = upcomingSessions(offer, now);
  const shown = allDates ? upcoming : upcoming.slice(0, 4);
  const when = whenLabels(offer, now);
  const check = birthDate ? ageCheck(offer, birthDate, now, fromCalendar) : undefined;
  const availability = availabilityLabel(offer);
  const regular = offer.format === "regelmaessig";
  // Altersgrenze dauerhaft sichtbar (Plan 0018, E4): In der iOS-App verdeckt der Kalender-Dialog den Toast sofort.
  const ageWindow = regular && birthDate ? ageWindowLabel(exportSessions(offer, now, birthDate), now) : undefined;

  /** Datei aus dem Browser (Plan 0018, E2): gleiche VEVENTs und gleicher Name wie die statische Datei (ADR 0018) */
  const exportSeries = async (selection: ExportSelection, stamp: string, container: HTMLElement | undefined) => {
    let ics: IcsExport;
    try {
      ics = await loadExport();
    } catch {
      onIcs(EXPORT_UNAVAILABLE);
      return;
    }
    const item = { offer, sessions: selection.sessions, ctx: ics.icsContextFor(offer, stamp) };
    download(ics.icsForCollection([item], offer.title), seriesIcsFileName(offer), container);
    onIcs(seriesToast(selection, now), selection.from || selection.until ? LONG_TOAST_MS : undefined);
  };

  /**
   * „Alle Termine“ bzw. „In den Kalender“ (Plan 0018, E2): entscheidet synchron. Statisch läuft der Link; sonst lädt
   * nichts („keiner passt“) oder eine Datei aus dem Browser, für Kurse und Einzeltermine immer statisch.
   */
  const onSeries = (e: MouseEvent<HTMLAnchorElement>) => {
    const plan = seriesExport(offer, now, birthDate);
    if (plan.kind === "static") {
      onIcs(calendarLoaded(offer.sessions.length));
      return;
    }
    // Ab hier nie die statische Datei: kein stiller Rückfall auf die ungekürzte Reihe (ADR 0018)
    e.preventDefault();
    if (plan.kind === "none") {
      // Chunk trotzdem anfordern: Sein Request soll nicht verraten, ob ein Termin zum Alter passt (ADR 0018)
      void loadExport().catch(() => {});
      onIcs("Keiner der kommenden Termine passt zum Alter.", LONG_TOAST_MS);
      return;
    }
    // Ohne Datenstand fehlt der ICS-Kontext. Das Detail öffnet nur mit geladenen Daten, der Typ belegt es aber nicht.
    if (generatedAt === undefined) {
      onIcs(EXPORT_UNAVAILABLE);
      return;
    }
    // vor dem ersten `await`: Danach ist `currentTarget` null. Im Dialog, denn `body` ist dann inert (E2).
    const container = e.currentTarget.parentElement ?? undefined;
    void exportSeries(plan.selection, generatedAt, container);
  };

  return (
    // Hülle als Größen-Container (Plan 0008, E6): Bei wenig Höhe scrollt sie samt ICS-Fuß. Der Toast bleibt
    // außerhalb (Dialog.tsx), denn ein Container ist umgebender Block für feste Nachfahren.
    <div className="detail-body">
      <div className="detail-col dhead">
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Zurück">
          <Icon name="back" />
        </button>
        <div className="dhead-actions">
          <button type="button" className="iconbtn" onClick={() => onShare(offer)} aria-label="Teilen">
            <Icon name="share" />
          </button>
          <HeartButton offer={offer} saved={saved} onToggle={onToggleSave} inline />
        </div>
      </div>
      <div className="dscroll">
        <div className="detail-col">
          <div className={`hero k-${category}`}>
            <span className="bigsticker">
              <Shape category={category} />
            </span>
            <div>
              <span className="catname">{CATEGORY_LABELS[category]}</span>
              <p className="meta">{offer.providerName}</p>
            </div>
          </div>
          <h2 className="dtitle">{offer.title}</h2>
          <p className="summary">{offer.summary}</p>
          <div className="labels">
            <div className="label full">
              <span className="cap">Wann</span>
              <b>{when.main}</b>
              <span>{when.sub}</span>
            </div>
            {/* Die ganze Kachel öffnet die Wege bzw. die Route in Google Maps (Plan 0019, E5, E10) */}
            <WhereTile reach={reach} origin={origin} address={offer.venue.address}>
              <span className="cap">Wo</span>
              <b>{offer.venue.name}</b>
              <span>{[offer.venue.address, offer.venue.district].filter(Boolean).join(" · ")}</span>
              {origin && reach ? <ReachLong reach={reach} origin={origin} /> : reachPending && <DistPending />}
            </WhereTile>
            <div className="label">
              <span className="cap">Alter</span>
              <b>{ageRangeLabel(offer.age)}</b>
              {check ? (
                <span className={check.fits ? "ok" : undefined}>
                  {check.fits ? "Passt" : "Passt nicht"}: am {shortDate(berlinIsoDate(check.at))}{" "}
                  {plural(check.months, "Monat", "Monate")} alt{ageWindow && ` · ${ageWindow}`}
                </span>
              ) : (
                <span>Geburtsdatum eintragen, dann prüfen wir das</span>
              )}
            </div>
            <div className="label">
              <span className="cap">Kosten</span>
              <b>{costLabel(offer)}</b>
            </div>
            <div className="label full">
              <span className="cap">Anmeldung</span>
              <b>{registrationLabel(offer)}</b>
              <span>{registrationNote(offer, now)}</span>
            </div>
          </div>
          {availability && (
            <div className={`stamp stamp-${offer.availability.status}`}>
              <b>{availability}</b>
              {offer.availability.note && <span>{offer.availability.note}</span>}
              <span>Momentaufnahme vom {dayDots(offer.availability.checkedAt)} – kann sich geändert haben.</span>
              <a className="linkbtn" href={offer.url} target="_blank" rel="noopener">
                Beim Anbieter prüfen
              </a>
            </div>
          )}
          <h3 className="h3">Termine</h3>
          <ol className="dates">
            {shown.map((s) => (
              <li key={s.start} className={regular && s.start === ref?.start ? "sel" : undefined}>
                {longDate(sessionDay(s))}
                <span>{timeRange(s)}</span>
              </li>
            ))}
          </ol>
          {!allDates && upcoming.length > 4 && (
            <button type="button" className="linkbtn" onClick={() => setAllDates(true)}>
              Alle {upcoming.length} Termine zeigen
            </button>
          )}
          <p className="provider-link">
            <button type="button" className="btn wide" onClick={() => onProvider(offer.providerId)}>
              <Icon name="store" size={20} />
              Mehr von diesem Anbieter
            </button>
            <a className="btn wide" href={offer.url} target="_blank" rel="noopener">
              <Icon name="external" size={20} />
              Website von {offer.providerName}
            </a>
          </p>
        </div>
      </div>
      <div className="dfoot">
        <div className="detail-col">
          <span className="lbl">In den Kalender holen (.ics)</span>
          {regular && ref ? (
            <div className="two">
              <a
                className="btn"
                href={assetUrl(sessionIcsPath(offer, ref))}
                onClick={() => onIcs(`Kalenderdatei für ${longDate(sessionDay(ref))} geladen`)}
              >
                Nur {shortDate(sessionDay(ref))}
              </a>
              <a className="btn primary" href={assetUrl(seriesIcsPath(offer))} onClick={onSeries}>
                <Icon name="calendarPlus" size={20} />
                {/* Ohne Zahl (H5): Die Zahl nennt der Toast. Die statische Datei (ohne Geburtsdatum) enthält auch
                    vergangene Termine, die aus dem Browser nur kommende, passend zum Alter (Plan 0018). */}
                Alle Termine
              </a>
            </div>
          ) : (
            <a className="btn primary wide" href={assetUrl(seriesIcsPath(offer))} onClick={onSeries}>
              <Icon name="calendarPlus" size={20} />
              {offer.format === "kurs" && offer.sessions.length > 1
                ? `Alle ${offer.sessions.length} Kurstermine`
                : "In den Kalender"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
