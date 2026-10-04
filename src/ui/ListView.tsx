/** „Entdecken“ als Liste (Plan 0003, E7/E8): jedes Angebot einmal am nächsten Termin, nach Tagen gruppiert. */
import type { ReactNode } from "react";
import type { DayGroup, Occurrence } from "../domain/agenda.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { dayHeading } from "./format.ts";
import { Icon } from "./icons.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

interface ListViewProps {
  groups: DayGroup<Occurrence<SiteOffer>>[];
  remaining: number;
  onMore: () => void;
  today: string;
  ctx: CardContext;
  hasData: boolean;
  onResetFilter: () => void;
}

export function ListView({ groups, remaining, onMore, today, ctx, hasData, onResetFilter }: ListViewProps) {
  if (groups.length === 0) {
    return hasData ? (
      <EmptyState icon="search" title="Diese Seite ist noch leer">
        Mit diesen Filtern gibt es keine Angebote.
        <br />
        <button type="button" className="linkbtn" onClick={onResetFilter}>
          Filter zurücksetzen
        </button>
      </EmptyState>
    ) : (
      <EmptyState icon="search" title="Noch keine Angebote">
        Daten folgen.
      </EmptyState>
    );
  }
  return (
    <>
      {groups.map((group) => {
        const { title, sub } = dayHeading(group.day, today);
        return (
          <section key={group.day} aria-label={`${title}, ${sub}`}>
            <h2 className={group.day === today ? "daylabel is-today" : "daylabel"}>
              <span>{title}</span>
              <small>{sub}</small>
            </h2>
            {group.items.map((item) => (
              <OfferCard key={item.offer.id} item={item} ctx={ctx} />
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
