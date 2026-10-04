/** Detail eines Angebots (Plan 0003, E13) – Inhalt des Vollbild-Dialogs. */
import { useState } from "react";
import { assetUrl } from "../data/site.ts";
import { ageCheck } from "../domain/age.ts";
import { rhythm, uniformTimes } from "../domain/agenda.ts";
import { nextSession } from "../domain/filter.ts";
import { seriesIcsPath, sessionIcsPath } from "../domain/ics.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { CATEGORY_LABELS } from "../domain/topics.ts";
import { primaryCategory } from "./categories.ts";
import {
  ageRangeLabel,
  availabilityLabel,
  costLabel,
  dayDots,
  longDate,
  plural,
  registrationLabel,
  sessionDay,
  shortDate,
  timeRange,
  weekdayName,
} from "./format.ts";
import { Icon, Shape } from "./icons.tsx";
import { HeartButton } from "./OfferCard.tsx";

interface DetailProps {
  offer: SiteOffer;
  now: Date;
  /** gewählter Kalendertag, falls aus der Kalender-Agenda geöffnet */
  day: string | undefined;
  birthDate: string | undefined;
  saved: boolean;
  onToggleSave: (offer: SiteOffer) => void;
  onClose: () => void;
  onIcs: (message: string) => void;
}

function whenLabels(offer: SiteOffer, now: Date): { main: string; sub: string } {
  const first = offer.sessions[0];
  const last = offer.sessions.at(-1);
  if (!first || !last) return { main: "", sub: "" };
  if (offer.format === "einmalig") return { main: longDate(sessionDay(first)), sub: `${timeRange(first)} Uhr` };
  if (offer.format === "kurs") {
    const range = `${shortDate(sessionDay(first))} bis ${shortDate(sessionDay(last))}`;
    return {
      main: `Kurs mit ${plural(offer.sessions.length, "Termin", "Terminen")}`,
      sub: uniformTimes(offer.sessions) ? `${range}, jeweils ${timeRange(first)}` : range,
    };
  }
  const r = rhythm(offer, now);
  const next = nextSession(offer, now) ?? first;
  const main = !r
    ? "Regelmäßig"
    : r.weekly
      ? `Jeden ${weekdayName(r.weekday)}, ${timeRange(next)}`
      : `${weekdayName(r.weekday)}s`;
  const upcoming = offer.sessions.filter((s) => Date.parse(s.end) >= now.getTime()).length;
  const sub =
    offer.registration === "ohne-anmeldung"
      ? "Einzeln besuchbar"
      : plural(upcoming, "kommender Termin", "kommende Termine");
  return { main, sub };
}

function registrationNote(offer: SiteOffer): string {
  const { opens, deadline } = offer.registrationWindow ?? {};
  const parts = [opens && `ab ${dayDots(opens)}`, deadline && `bis ${dayDots(deadline)}`].filter(Boolean);
  if (parts.length > 0) return `Anmeldung ${parts.join(", ")}`;
  return offer.registration === "mit-anmeldung" ? "Beim Anbieter" : "Einfach vorbeikommen";
}

export function DetailContent({ offer, now, day, birthDate, saved, onToggleSave, onClose, onIcs }: DetailProps) {
  const [allDates, setAllDates] = useState(false);
  const category = primaryCategory(offer.topics);
  const fromCalendar = day ? offer.sessions.find((s) => sessionDay(s) === day) : undefined;
  const ref = fromCalendar ?? nextSession(offer, now);
  const upcoming = offer.sessions.filter((s) => Date.parse(s.end) >= now.getTime());
  const shown = allDates ? upcoming : upcoming.slice(0, 4);
  const when = whenLabels(offer, now);
  const check = birthDate ? ageCheck(offer, birthDate, now, fromCalendar) : undefined;
  const availability = availabilityLabel(offer);
  const regular = offer.format === "regelmaessig";

  return (
    <>
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
            <div className="label full">
              <span className="cap">Wo</span>
              <b>{offer.venue.name}</b>
              <span>{[offer.venue.address, offer.venue.district].filter(Boolean).join(" · ")}</span>
            </div>
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
              <span>{registrationNote(offer)}</span>
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
                Alle {offer.sessions.length} Termine
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
                ? `Alle ${offer.sessions.length} Kurstermine in den Kalender`
                : "In den Kalender"}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
