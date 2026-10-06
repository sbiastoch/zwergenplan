/** Detail eines Angebots (Plan 0003, E13) – Inhalt des Vollbild-Dialogs. */
import { useState } from "react";
import { assetUrl } from "../data/site.ts";
import { ageCheck } from "../domain/age.ts";
import { referenceSession, sessionOnDay, upcomingSessions } from "../domain/agenda.ts";
import { seriesIcsPath, sessionIcsPath } from "../domain/ics-paths.ts";
import type { Origin, Reach } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { CATEGORY_LABELS, type Category } from "../domain/topics.ts";
import {
  ageRangeLabel,
  availabilityLabel,
  costLabel,
  dayDots,
  longDate,
  plural,
  registrationLabel,
  registrationNote,
  sessionDay,
  shortDate,
  timeRange,
  whenLabels,
} from "./format.ts";
import { Icon, Shape } from "./icons.tsx";
import { DistPending, HeartButton } from "./OfferCard.tsx";
import { ReachLong } from "./ReachLong.tsx";
import { RouteHint, routeLink, Ways } from "./Ways.tsx";

interface DetailProps {
  offer: SiteOffer;
  now: Date;
  /** gewählter Kalendertag, falls aus der Kalender-Agenda geöffnet */
  day: string | undefined;
  birthDate: string | undefined;
  /** Startpunkt und Entfernung zum Ort; beides nur mit Startpunkt (Plan 0004, E6) */
  origin: Origin | undefined;
  reach: Reach | undefined;
  /** Wegzeit lädt: Platzhalter statt Entfernung (Plan 0009, E11) */
  reachPending: boolean;
  /** Leitkategorie, wie auf der Kachel (`CardContext.categoryOf`, Plan 0014, E2) */
  category: Category;
  saved: boolean;
  onToggleSave: (offer: SiteOffer) => void;
  onClose: () => void;
  /**
   * „Mehr von diesem Anbieter“: öffnet das Anbieter-Sheet (Plan 0010, E2, E3). Statt „Alle Angebote dieses Anbieters“
   * aus dem Plan: Das brach bei 320 px mit Icon auf zwei Zeilen um (Text-Gate, kurze Knöpfe einzeilig).
   */
  onProvider: (providerId: string) => void;
  onIcs: (message: string) => void;
}

export function DetailContent({
  offer,
  now,
  day,
  birthDate,
  origin,
  reach,
  reachPending,
  category,
  saved,
  onToggleSave,
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

  return (
    // Hülle als Größen-Container (Plan 0008, E6): Bei wenig Höhe scrollt sie samt ICS-Fuß. Der Toast bleibt
    // außerhalb (Dialog.tsx), denn ein Container ist umgebender Block für feste Nachfahren.
    <div className="detail-body">
      <div className="detail-col dhead">
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Zurück">
          <Icon name="back" />
        </button>
        <HeartButton offer={offer} saved={saved} onToggle={onToggleSave} inline />
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
            {/* Die ganze Kachel öffnet die Route in Google Maps (Plan 0019, E5) */}
            <a className="label full route" {...routeLink(offer.venue.address)}>
              <span className="cap">Wo</span>
              <b>{offer.venue.name}</b>
              <span>{[offer.venue.address, offer.venue.district].filter(Boolean).join(" · ")}</span>
              {origin && reach ? <ReachLong reach={reach} origin={origin} /> : reachPending && <DistPending />}
              <RouteHint />
            </a>
            {origin && reach && <Ways reach={reach} origin={origin} address={offer.venue.address} />}
            <div className="label">
              <span className="cap">Alter</span>
              <b>{ageRangeLabel(offer.age)}</b>
              {check ? (
                <span className={check.fits ? "ok" : undefined}>
                  {check.fits ? "Passt" : "Passt nicht"}: am {shortDate(berlinIsoDate(check.at))}{" "}
                  {plural(check.months, "Monat", "Monate")} alt
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
              <a
                className="btn primary"
                href={assetUrl(seriesIcsPath(offer))}
                onClick={() =>
                  onIcs(`Kalenderdatei mit ${plural(offer.sessions.length, "Termin", "Terminen")} geladen`)
                }
              >
                <Icon name="calendarPlus" size={20} />
                {/* Ohne Zahl (H5): Die Datei enthält auch vergangene Termine, die Zahl nennt der Toast. */}
                Alle Termine
              </a>
            </div>
          ) : (
            <a
              className="btn primary wide"
              href={assetUrl(seriesIcsPath(offer))}
              onClick={() => onIcs(`Kalenderdatei mit ${plural(offer.sessions.length, "Termin", "Terminen")} geladen`)}
            >
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
