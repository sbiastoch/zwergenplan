/** Angebots-Kachel (Plan 0003, E9): Kopfzeile mit Kategorie-Pille und Zeit, Titel, Meta, Fakten, Herz. */
import { useState } from "react";
import type { Occurrence } from "../domain/agenda.ts";
import type { Reach } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { CATEGORY_LABELS } from "../domain/topics.ts";
import { primaryCategory } from "./categories.ts";
import {
  ageRangeLabel,
  availabilityLabel,
  clock,
  costLabel,
  formatFact,
  reachShort,
  registrationLabel,
  sessionDay,
  shortDate,
  timeRange,
} from "./format.ts";
import { Icon, Shape } from "./icons.tsx";

/** Was jede Kachel von außen braucht – von allen Ansichten gemeinsam genutzt. */
export interface CardContext {
  now: Date;
  isSaved: (id: string) => boolean;
  isUnfit: (id: string) => boolean;
  onToggleSave: (offer: SiteOffer) => void;
  /** Detail öffnen; `day` = gewählter Kalendertag (Termin im Kalender) */
  onOpen: (offer: SiteOffer, day?: string) => void;
  /** neu eingefügte Kacheln dürfen sich einkleben (nicht beim ersten Rendern, wegen LCP) */
  animate: boolean;
  /** Entfernung zum Ort, nur mit Startpunkt (Plan 0004, E6); je Koordinate zwischengespeichert */
  reachOf: (offer: SiteOffer) => Reach | undefined;
  /** Wegzeit lädt: Platzhalter statt Entfernung, ohne Layoutsprung (Plan 0009, E11) */
  reachPending: boolean;
}

interface OfferCardProps {
  item: Occurrence<SiteOffer>;
  ctx: CardContext;
  /** Datum mit anzeigen (Merkliste) statt nur der Uhrzeit (Liste/Agenda unter Tagesüberschrift) */
  dated?: boolean;
  /** Termin gehört zu einem gewählten Kalendertag */
  calendarDay?: string;
  /** im Orts-Sheet: Kopf nennt Ort und Entfernung schon, die Meta-Zeile nur den Anbieter (Plan 0008, E19) */
  atPlace?: boolean;
}

export function OfferCard({ item, ctx, dated = false, calendarDay, atPlace = false }: OfferCardProps) {
  const { offer, session } = item;
  const [fresh] = useState(ctx.animate);
  const category = primaryCategory(offer.topics);
  const unfit = ctx.isUnfit(offer.id);
  const saved = ctx.isSaved(offer.id);
  const availability = availabilityLabel(offer);
  const reach = atPlace ? undefined : ctx.reachOf(offer);
  const when = dated ? `${shortDate(sessionDay(session))} · ${clock(session.start)} Uhr` : `${timeRange(session)} Uhr`;

  return (
    <article className={`card k-${category}${unfit ? " unfit" : ""}${fresh ? " fresh" : ""}`} data-testid="offer">
      <div className="card-body">
        <div className="card-top">
          <span className="pill">
            <Shape category={category} />
            {CATEGORY_LABELS[category]}
          </span>
          <span className="when">{when}</span>
        </div>
        <h3 className="ctitle">
          <button type="button" className="card-open" onClick={() => ctx.onOpen(offer, calendarDay)}>
            {offer.title}
          </button>
        </h3>
        <p className="meta">
          {offer.providerName}
          {!atPlace && ` · ${offer.venue.district ?? offer.venue.name}`}
          {reach ? (
            <>
              {" · "}
              <span className="dist">{reachShort(reach)}</span>
            </>
          ) : (
            ctx.reachPending &&
            !atPlace && (
              <>
                {" · "}
                <DistPending />
              </>
            )
          )}
        </p>
        <div className="facts">
          <span className="fact">{formatFact(offer, ctx.now)}</span>
          <span className="fact">{costLabel(offer)}</span>
          <span className={offer.registration === "mit-anmeldung" ? "fact reg" : "fact"}>
            {registrationLabel(offer)}
          </span>
          {availability && <span className={`fact avail-${offer.availability.status}`}>{availability}</span>}
          {unfit && <span className="fact warn">{ageRangeLabel(offer.age)}</span>}
        </div>
      </div>
      <HeartButton offer={offer} saved={saved} onToggle={ctx.onToggleSave} />
    </article>
  );
}

/** Platzhalter der Entfernung mit reservierter Breite und Zeilenhöhe, solange die Wegzeit lädt (E11) */
export function DistPending() {
  return (
    <span className="dist pending" aria-hidden="true">
      {"\u00a0"}
    </span>
  );
}

export function HeartButton({
  offer,
  saved,
  onToggle,
  inline = false,
}: {
  offer: SiteOffer;
  saved: boolean;
  onToggle: (offer: SiteOffer) => void;
  inline?: boolean;
}) {
  return (
    <button
      type="button"
      className={inline ? "heart inline" : "heart"}
      aria-pressed={saved}
      aria-label={`${offer.title} merken`}
      onClick={() => onToggle(offer)}
    >
      <span className="hs">
        <Icon name="heart" size={20} />
      </span>
    </button>
  );
}
