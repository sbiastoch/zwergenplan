/** Kalender (Plan 0003, E14): Wochenleiste, aufklappbares Monatsraster, Agenda des gewählten Tages. */
import { monthDays, type Occurrence, weekDays } from "../domain/agenda.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { addDays, addMonths, parseIsoDate } from "../domain/time.ts";
import { primaryCategory } from "./categories.ts";
import { agendaHeading, longDate, monthTitle, plural, weekdayShort, weekTitle } from "./format.ts";
import { Icon, Shape } from "./icons.tsx";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

interface CalendarViewProps {
  index: Map<string, Occurrence<SiteOffer>[]>;
  today: string;
  /** letzter Tag mit Terminen im Datenstand (Grenze für „vor“) */
  lastDay: string | undefined;
  day: string;
  onDay: (day: string) => void;
  monthOpen: boolean;
  onMonthOpen: (open: boolean) => void;
  ctx: CardContext;
}

const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`;

export function CalendarView({ index, today, lastDay, day, onDay, monthOpen, onMonthOpen, ctx }: CalendarViewProps) {
  const week = weekDays(day);
  const thisWeek = weekDays(today);
  const end = lastDay ?? today;
  const agenda = index.get(day) ?? [];
  const pick = (d: string) => onDay(d < today ? today : d);
  const label = (d: string) => `${longDate(d)}, ${plural(index.get(d)?.length ?? 0, "Angebot", "Angebote")}`;

  return (
    <>
      <div className="cal-nav">
        <button
          type="button"
          className="iconbtn"
          onClick={() => pick(addDays(day, -7))}
          disabled={week[0] === thisWeek[0]}
          aria-label="Vorherige Woche"
        >
          <Icon name="back" />
        </button>
        <b>{weekTitle(week)}</b>
        <button
          type="button"
          className="iconbtn"
          onClick={() => pick(addDays(week[0] ?? day, 7))}
          disabled={addDays(week[0] ?? day, 7) > end}
          aria-label="Nächste Woche"
        >
          <Icon name="next" />
        </button>
      </div>
      <fieldset className="plain">
        <legend className="sr-only">Woche</legend>
        <div className="week">
          {week.map((d) => (
            <button
              key={d}
              type="button"
              className={d === today ? "day today" : "day"}
              aria-pressed={d === day}
              aria-label={label(d)}
              disabled={d < today}
              onClick={() => pick(d)}
            >
              <span className="wd">{weekdayShort(d)}</span>
              <span className="num">{parseIsoDate(d).day}</span>
              <span className="dots">
                {(index.get(d) ?? []).slice(0, 3).map((o) => {
                  const c = primaryCategory(o.offer.topics);
                  return (
                    <span key={`${o.offer.id}-${o.session.start}`} className={`k-${c}`}>
                      <Shape category={c} ink={false} />
                    </span>
                  );
                })}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <button type="button" className="monthbtn" aria-expanded={monthOpen} onClick={() => onMonthOpen(!monthOpen)}>
        {monthOpen ? "Monat zuklappen" : "Ganzen Monat zeigen"}
        <Icon name="down" size={18} />
      </button>
      {monthOpen && (
        <MonthGrid
          day={day}
          today={today}
          end={end}
          index={index}
          label={label}
          onPick={(d) => {
            pick(d);
            onMonthOpen(false);
          }}
          onDay={pick}
        />
      )}
      <h2 className="daylabel">
        <span>{agendaHeading(day, today)}</span>
        <small>{plural(agenda.length, "Angebot", "Angebote")}</small>
      </h2>
      {agenda.map((item) => (
        <OfferCard key={`${item.offer.id}-${item.session.start}`} item={item} ctx={ctx} calendarDay={day} />
      ))}
      {agenda.length === 0 && (
        <EmptyState icon="swing" title="Freier Tag">
          Kein Sticker für diesen Tag – Zeit für den Spielplatz.
        </EmptyState>
      )}
    </>
  );
}

function MonthGrid({
  day,
  today,
  end,
  index,
  label,
  onPick,
  onDay,
}: {
  day: string;
  today: string;
  end: string;
  index: Map<string, Occurrence<SiteOffer>[]>;
  label: (d: string) => string;
  onPick: (d: string) => void;
  onDay: (d: string) => void;
}) {
  const first = firstOfMonth(day);
  const month = monthDays(day);
  return (
    <div className="month">
      <div className="cal-nav">
        <button
          type="button"
          className="iconbtn"
          onClick={() => onDay(addMonths(first, -1))}
          disabled={first <= firstOfMonth(today)}
          aria-label="Vorheriger Monat"
        >
          <Icon name="back" />
        </button>
        <b>{monthTitle(day)}</b>
        <button
          type="button"
          className="iconbtn"
          onClick={() => onDay(addMonths(first, 1))}
          disabled={addMonths(first, 1) > end}
          aria-label="Nächster Monat"
        >
          <Icon name="next" />
        </button>
      </div>
      <div className="mgrid">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((h) => (
          <span key={h} className="h" aria-hidden="true">
            {h}
          </span>
        ))}
        {month.days.map((d, i) => {
          const first = index.get(d)?.[0];
          const c = first && primaryCategory(first.offer.topics);
          return (
            <button
              key={d}
              type="button"
              className="mday"
              // Der 1. rückt in seine Wochentagsspalte, statt Leerzellen zu rendern.
              style={i === 0 ? { gridColumnStart: month.lead + 1 } : undefined}
              aria-pressed={d === day}
              aria-label={label(d)}
              disabled={d < today}
              onClick={() => onPick(d)}
            >
              {parseIsoDate(d).day}
              {c && (
                <span className={`k-${c}`}>
                  <Shape category={c} ink={false} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
