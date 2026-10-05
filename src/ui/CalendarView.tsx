/**
 * Kalender (Plan 0003, E14; Plan 0007, E2, E5): Wochenleiste, aufklappbares Monatsraster, Agenda des
 * gewählten Tages. Beendete Termine fallen weg (`dayAgenda`), bei offenem Monat ist die Woche aus.
 */
import { type MouseEvent, useLayoutEffect, useRef } from "react";
import { type DayAgenda, dayAgenda, monthDays, type Occurrence } from "../domain/agenda.ts";
import { type CalendarNav, calendarNav, clampDay } from "../domain/calendar.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { parseIsoDate } from "../domain/time.ts";
import { primaryCategory } from "./categories.ts";
import { agendaHeading, hiddenNote, longDate, monthTitle, plural, weekdayShort, weekTitle } from "./format.ts";
import { Icon, Shape } from "./icons.tsx";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

interface CalendarViewProps {
  index: Map<string, Occurrence<SiteOffer>[]>;
  /** alle kommenden Angebote ohne Filter, Alter und Umkreis: Was fehlt, blendet die Auswahl aus (Plan 0008, E12) */
  allIndex: Map<string, Occurrence<SiteOffer>[]>;
  now: Date;
  today: string;
  /** letzter Tag mit passenden Terminen (Grenze für „vor“) */
  lastDay: string | undefined;
  /** letzter Tag mit Terminen im ganzen Datenstand, ohne Filter (B8) */
  dataEnd: string | undefined;
  /** heute schon beendete Termine aller filterpassenden Angebote (B2) */
  endedToday: number;
  day: string;
  onDay: (day: string) => void;
  monthOpen: boolean;
  onMonthOpen: (open: boolean) => void;
  ctx: CardContext;
  /** nur bei aktivem Filter: Knopf „Filter zurücksetzen“ im Leerzustand ausgeblendeter Angebote */
  onResetFilter?: (() => void) | undefined;
}

/** Wo der Monatsknopf vor dem Umschalten stand, damit er danach an derselben Stelle bleibt (E5). */
interface MonthAnchor {
  open: boolean;
  top: number;
}

export function CalendarView({
  index,
  allIndex,
  now,
  today,
  lastDay,
  dataEnd,
  endedToday,
  day,
  onDay,
  monthOpen,
  onMonthOpen,
  ctx,
  onResetFilter,
}: CalendarViewProps) {
  const nav = calendarNav(day, today, lastDay);
  // Je Render einmal je Tag: Label, Formpunkte und Agenda fragen denselben Tag mehrfach ab.
  const agendas = new Map<string, DayAgenda<SiteOffer>>();
  const agendaOf = (d: string) => {
    const cached = agendas.get(d);
    if (cached) return cached;
    const fresh = dayAgenda(index, d, now, { dataEnd, endedToday, allIndex });
    agendas.set(d, fresh);
    return fresh;
  };
  const agenda = agendaOf(day);
  const pick = (d: string) => onDay(clampDay(d, today));
  const go = (target: string | undefined) => () => {
    if (target) onDay(target);
  };
  const label = (d: string) => `${longDate(d)}, ${plural(agendaOf(d).items.length, "Angebot", "Angebote")}`;

  // Die Woche verschwindet beim Aufklappen (≈ 130 px). Der Knopf bleibt dasselbe Element (Fokus),
  // und die Seite scrollt vor dem Zeichnen so nach, dass er unter dem Finger bleibt.
  const monthButton = useRef<HTMLButtonElement>(null);
  const anchor = useRef<MonthAnchor | undefined>(undefined);
  useLayoutEffect(() => {
    const before = anchor.current;
    const button = monthButton.current;
    anchor.current = undefined;
    if (!before || before.open !== monthOpen || !button) return;
    const shift = button.getBoundingClientRect().top - before.top;
    if (shift === 0) return;
    window.scrollBy(0, shift);
    // Ganz oben kann die Seite nicht weit genug scrollen: dann wenigstens sichtbar halten.
    if (Math.abs(button.getBoundingClientRect().top - before.top) > 1) button.scrollIntoView({ block: "nearest" });
  }, [monthOpen]);
  const toggleMonth = (event: MouseEvent<HTMLButtonElement>) => {
    anchor.current = { open: !monthOpen, top: event.currentTarget.getBoundingClientRect().top };
    onMonthOpen(!monthOpen);
  };

  return (
    <>
      {!monthOpen && (
        <WeekStrip nav={nav} day={day} today={today} agendaOf={agendaOf} label={label} pick={pick} go={go} />
      )}
      <button ref={monthButton} type="button" className="monthbtn" aria-expanded={monthOpen} onClick={toggleMonth}>
        {monthOpen ? "Monat zuklappen" : "Ganzen Monat zeigen"}
        <Icon name="down" size={18} />
      </button>
      {monthOpen && (
        <MonthGrid
          day={day}
          today={today}
          nav={nav}
          agendaOf={agendaOf}
          label={label}
          onPick={(d) => {
            pick(d);
            onMonthOpen(false);
          }}
          go={go}
        />
      )}
      <h2 className="daylabel">
        <span>{agendaHeading(day, today)}</span>
        <small>{plural(agenda.items.length, "Angebot", "Angebote")}</small>
      </h2>
      {agenda.items.map((item) => (
        <OfferCard key={`${item.offer.id}-${item.session.start}`} item={item} ctx={ctx} calendarDay={day} />
      ))}
      <AgendaEmpty agenda={agenda} dataEnd={dataEnd} onResetFilter={onResetFilter} />
    </>
  );
}

/**
 * Leerzustände der Agenda, in dieser Reihenfolge (Plan 0007, E2; Plan 0008, E12). Ausgeblendetes zuerst:
 * Heute kann Passendes vorbei sein, während Ausgeblendetes noch kommt – „alles vorbei“ wäre dann falsch.
 */
function AgendaEmpty({
  agenda,
  dataEnd,
  onResetFilter,
}: {
  agenda: DayAgenda<SiteOffer>;
  dataEnd: string | undefined;
  onResetFilter: (() => void) | undefined;
}) {
  if (agenda.items.length > 0) return null;
  if (agenda.hidden > 0) {
    return (
      <EmptyState icon="search" title="Nichts, was zu deiner Auswahl passt">
        {hiddenNote(agenda.hidden, agenda.ended)}
        {onResetFilter && (
          <>
            <br />
            <button type="button" className="linkbtn" onClick={onResetFilter}>
              Filter zurücksetzen
            </button>
          </>
        )}
      </EmptyState>
    );
  }
  if (agenda.ended > 0) {
    return (
      <EmptyState icon="swing" title="Für heute ist alles vorbei">
        Die Termine von heute sind schon zu Ende. Die nächsten Tage stehen oben in der Woche.
      </EmptyState>
    );
  }
  if (agenda.afterData && dataEnd) {
    return (
      <EmptyState icon="search" title="Weiter reicht der Plan noch nicht">
        Termine sind bis {longDate(dataEnd)} eingetragen. Neue kommen mit dem nächsten Datenstand.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon="swing" title="Freier Tag">
      Kein Sticker für diesen Tag – Zeit für den Spielplatz.
    </EmptyState>
  );
}

function WeekStrip({
  nav,
  day,
  today,
  agendaOf,
  label,
  pick,
  go,
}: {
  nav: CalendarNav;
  day: string;
  today: string;
  agendaOf: (d: string) => DayAgenda<SiteOffer>;
  label: (d: string) => string;
  pick: (d: string) => void;
  go: (target: string | undefined) => () => void;
}) {
  return (
    <>
      <div className="cal-nav">
        <button
          type="button"
          className="iconbtn"
          onClick={go(nav.prevWeek)}
          disabled={!nav.prevWeek}
          aria-label="Vorherige Woche"
        >
          <Icon name="back" />
        </button>
        <b>{weekTitle(nav.week)}</b>
        <button
          type="button"
          className="iconbtn"
          onClick={go(nav.nextWeek)}
          disabled={!nav.nextWeek}
          aria-label="Nächste Woche"
        >
          <Icon name="next" />
        </button>
      </div>
      <fieldset className="plain">
        <legend className="sr-only">Woche</legend>
        <div className="week">
          {nav.week.map((d) => (
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
                {agendaOf(d)
                  .items.slice(0, 3)
                  .map((o) => {
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
    </>
  );
}

function MonthGrid({
  day,
  today,
  nav,
  agendaOf,
  label,
  onPick,
  go,
}: {
  day: string;
  today: string;
  nav: CalendarNav;
  agendaOf: (d: string) => DayAgenda<SiteOffer>;
  label: (d: string) => string;
  onPick: (d: string) => void;
  go: (target: string | undefined) => () => void;
}) {
  const month = monthDays(day);
  return (
    <div className="month">
      <div className="cal-nav">
        <button
          type="button"
          className="iconbtn"
          onClick={go(nav.prevMonth)}
          disabled={!nav.prevMonth}
          aria-label="Vorheriger Monat"
        >
          <Icon name="back" />
        </button>
        <b>{monthTitle(day)}</b>
        <button
          type="button"
          className="iconbtn"
          onClick={go(nav.nextMonth)}
          disabled={!nav.nextMonth}
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
          const [first] = agendaOf(d).items;
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
