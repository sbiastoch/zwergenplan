/**
 * „Entdecken“ als Liste (Plan 0003, E7/E8): jedes Angebot einmal am nächsten Termin, nach Tagen gruppiert; mit
 * Zeitraum am Termin darin (Plan 0023, E6). Mit „Neu eingestellt“ nach Wochen gruppiert, die Karten dann mit Datum
 * (Plan 0043, E4).
 */
import type { ReactNode } from "react";
import type { Occurrence } from "../domain/agenda.ts";
import type { ListGroup } from "../domain/listing.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { berlinIsoDate } from "../domain/time.ts";
import { ageEmptyText, listingHeading, NOTHING_NEW } from "./format.ts";
import { Icon } from "./icons.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

interface ListViewProps {
  groups: ListGroup<Occurrence<SiteOffer>>[];
  remaining: number;
  onMore: () => void;
  today: string;
  ctx: CardContext;
  hasData: boolean;
  /** nur mit aktiven URL-Filtern */
  onResetFilter?: (() => void) | undefined;
  /** nur, wenn der Altersfilter etwas ausblendet (Plan 0021, E4) */
  age?: AgeEscape | undefined;
  /** Zeitraum aktiv: Das Detail bezieht sich auf den Termin der Karte, wie im Kalender (Plan 0023, E7) */
  openOnDay: boolean;
}

export function ListView({
  groups,
  remaining,
  onMore,
  today,
  ctx,
  hasData,
  onResetFilter,
  age,
  openOnDay,
}: ListViewProps) {
  if (groups.length === 0) return <NoOffers hasData={hasData} onResetFilter={onResetFilter} age={age} />;
  return (
    <>
      {groups[0]?.kind === "frueher" && <p className="status">{NOTHING_NEW}</p>}
      {groups.map((group) => {
        const { title, sub } = listingHeading(group, today);
        const dated = group.kind !== "termin";
        return (
          <section key={group.key} aria-label={sub ? `${title}, ${sub}` : title}>
            <h2 className={group.kind === "termin" && group.day === today ? "daylabel is-today" : "daylabel"}>
              <span>{title}</span>
              {sub && <small>{sub}</small>}
            </h2>
            {group.items.map((item) => (
              <OfferCard
                key={item.offer.id}
                item={item}
                ctx={ctx}
                dated={dated}
                calendarDay={openOnDay ? berlinIsoDate(item.session.start) : undefined}
              />
            ))}
          </section>
        );
      })}
      {remaining > 0 && (
        <p className="more">
          <button type="button" className="btn" onClick={onMore}>
            Weitere Angebote zeigen (noch {remaining})
          </button>
        </p>
      )}
    </>
  );
}

/**
 * Platzhalter der Liste, solange die Wegzeit zu einer gesetzten Grenze lädt (Plan 0009, E11, M7): so hoch wie zwei
 * Tagesgruppen, danach erscheint die gefilterte Liste, ohne dass Kacheln springen.
 */
export function ListPending() {
  return (
    <div className="list-pending">
      <p>Wegzeiten werden geladen …</p>
    </div>
  );
}

/** Ausweg aus einem Leerzustand, den der Altersfilter verursacht (Plan 0021, E4) */
export interface AgeEscape {
  /** Alter wie im Kopf, z. B. „7 Mon.“ */
  label: string;
  /** Altersfilter aus; der Fokus geht vorher auf die Statuszeile, denn der Leerzustand verschwindet */
  onShow: () => void;
}

/**
 * Leerzustand von Liste, Karte und Anbietern (Plan 0005, E12; Plan 0021, E4): Filter oder Alter blenden alles aus,
 * oder es gibt noch keine Daten. „Auch unpassende zeigen“ steht vor „Filter zurücksetzen“, es ist der direkte Weg.
 */
export function NoOffers({
  hasData,
  onResetFilter,
  age,
}: {
  hasData: boolean;
  /** nur mit aktiven URL-Filtern */
  onResetFilter?: (() => void) | undefined;
  age?: AgeEscape | undefined;
}) {
  if (!hasData) {
    return (
      <EmptyState icon="search" title="Noch keine Angebote">
        Daten folgen.
      </EmptyState>
    );
  }
  const text = age
    ? ageEmptyText(age.label, onResetFilter !== undefined)
    : onResetFilter
      ? "Mit diesen Filtern gibt es keine Angebote."
      : "Mit dieser Auswahl gibt es keine Angebote.";
  return (
    <EmptyState icon="search" title="Diese Seite ist noch leer">
      {text}
      {(age || onResetFilter) && (
        <span className="empty-actions">
          {age && (
            <button type="button" className="linkbtn" onClick={age.onShow}>
              Auch unpassende zeigen
            </button>
          )}
          {onResetFilter && (
            <button type="button" className="linkbtn" onClick={onResetFilter}>
              Filter zurücksetzen
            </button>
          )}
        </span>
      )}
    </EmptyState>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: "search" | "heart" | "swing";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="slot">
        <Icon name={icon} size={40} />
      </div>
      <b>{title}</b>
      {children}
    </div>
  );
}
