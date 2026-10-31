/**
 * Kalender der Merkliste (Plan 0025, E5; bis dahin der Tab „Kalender“, Plan 0003, E14; Plan 0007, E2, E5): Wochenleiste,
 * aufklappbares Monatsraster und darunter die gemerkten Termine der Auswahl. Tag, Woche oder Monat sind der Filter der
 * Liste. Beendete Termine fallen weg (`rangeAgenda`), bei offenem Monat ist die Woche aus. In der Woche stehen auch die
 * freien Tage ab heute (Plan 0057, E9).
 */
import { Fragment, type MouseEvent, type ReactNode, useLayoutEffect, useRef } from "react";
import { monthDays, type Occurrence, type RangeAgenda, rangeAgenda } from "../domain/agenda.ts";
import {
  type CalendarNav,
  type CalendarSelection,
  calendarNav,
  clampDay,
  selectionRange,
  type WeekRow,
  weekRows,
} from "../domain/calendar.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { parseIsoDate } from "../domain/time.ts";
import type { Category } from "../domain/topics.ts";
import {
  longDate,
  monthTitle,
  plural,
  rangeEmptyTexts,
  savedHiddenNote,
  selectionHeading,
  shortDate,
  weekdayShort,
  weekTitle,
} from "./format.ts";
import { Icon, Shape } from "./icons.tsx";
import { EmptyState } from "./ListView.tsx";
import { type CardContext, OfferCard } from "./OfferCard.tsx";
import type { SavedCalendarData } from "./use-offer-views.ts";

interface SavedCalendarProps {
  calendar: SavedCalendarData;
  now: Date;
  today: string;
  ctx: CardContext;
  /** zu „Angebote“ mit Auswahl, Tag oder Wochenende als Zeitraum (Plan 0025, E5, Fall 4; Plan 0057, E9) */
  onDiscover: (range: { from: string; to: string }) => void;
  /** nur mit aktivem Merklisten-Filter (Etappe 4): Knopf „Filter zurücksetzen“, wenn er Termine ausblendet */
  onResetFilter?: (() => void) | undefined;
}

/** Wo der Monatsknopf vor dem Umschalten stand, damit er danach an derselben Stelle bleibt (Plan 0007, E5). */
interface MonthAnchor {
  open: boolean;
  top: number;
}

const termine = (n: number) => plural(n, "Termin", "Termine");

/** Form eines Termins in Woche und Monat: vorgemerkt nur als Umriss in der Textfarbe (Plan 0057, E4) */
const dotClass = (category: Category, tentative: boolean) => `k-${category}${tentative ? " tentative" : ""}`;

export function SavedCalendar({ calendar, now, today, ctx, onDiscover, onResetFilter }: SavedCalendarProps) {
  const { index, allIndex, ageIndex, dataEnd, endedToday, selection, setSelection, monthOpen, setMonthOpen } = calendar;
  const context = { dataEnd, endedToday, allIndex, ageIndex };
  const agendaOf = (sel: CalendarSelection) => rangeAgenda(index, selectionRange(sel, today), now, context);
  // Je Render einmal je Tag: Label und Formpunkte fragen denselben Tag mehrfach ab.
  const days = new Map<string, Occurrence<SiteOffer>[]>();
  const itemsOf = (d: string) => {
    const cached = days.get(d);
    if (cached) return cached;
    const fresh = rangeAgenda(index, { from: d, to: d }, now, context).groups[0]?.items ?? [];
    days.set(d, fresh);
    return fresh;
  };
  const range = selectionRange(selection, today);
  const agenda = agendaOf(selection);
  // Grenze der Pfeile ist der ganze Datenstand, nicht der letzte gemerkte Termin: auch leere Wochen sind erreichbar.
  const nav = calendarNav(selection.day, today, dataEnd);
  const select = (unit: CalendarSelection["unit"], day: string) => setSelection({ unit, day: clampDay(day, today) });
  const go = (unit: CalendarSelection["unit"], target: string | undefined) => () => {
    if (target) setSelection({ unit, day: target });
  };
  const label = (d: string) => `${longDate(d)}, ${termine(itemsOf(d).length)}`;
  // Vorgemerktes zeigt die Form nur als Umriss (Plan 0057, E4)
  const tentative = (id: string) => ctx.stageOf(id) === "vorgemerkt";

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
    // Auf: der Monat des Ankers; zu: die Woche um ihn (Interaktionstabelle E5)
    select(monthOpen ? "woche" : "monat", selection.day);
    setMonthOpen(!monthOpen);
  };

  // Das offene Raster schiebt die Liste unter den Falz (Review M3): Nach dem Tipp auf einen Tag im Monat rückt die
  // Überschrift ins Bild. Ohne `smooth`, damit gilt die reduzierte Bewegung von selbst; der Fokus bleibt auf dem Tag.
  const dayLabel = useRef<HTMLHeadingElement>(null);
  const reveal = useRef(false);
  useLayoutEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    dayLabel.current?.scrollIntoView({ block: "nearest" });
    // nach jedem Render geprüft: Die Marke setzt nur `onPick`, gleich danach ist sie wieder aus
  });

  const todayPicked = selection.unit === "tag" && selection.day === today;
  // Nach dem Datenstand bleibt der Leerzustand „Weiter reicht der Plan noch nicht“
  const rows =
    selection.unit === "woche" && !agenda.afterData
      ? weekRows(agenda.groups, agenda.hiddenDays, nav.week, today, agenda.ended)
      : undefined;
  return (
    <>
      {!monthOpen && (
        <WeekStrip
          tentative={tentative}
          nav={nav}
          selection={selection}
          today={today}
          count={agendaOf({ unit: "woche", day: selection.day }).count}
          itemsOf={itemsOf}
          label={label}
          select={select}
          go={go}
        />
      )}
      <button ref={monthButton} type="button" className="monthbtn" aria-expanded={monthOpen} onClick={toggleMonth}>
        {monthOpen ? "Monat zuklappen" : "Ganzen Monat zeigen"}
        <Icon name="down" size={18} />
      </button>
      {monthOpen && (
        <MonthGrid
          tentative={tentative}
          nav={nav}
          selection={selection}
          today={today}
          count={agendaOf({ unit: "monat", day: selection.day }).count}
          itemsOf={itemsOf}
          label={label}
          select={select}
          onPick={(d) => {
            reveal.current = true;
            select("tag", d);
          }}
          go={go}
        />
      )}
      {/* Die Statuszeile zählt nicht die Auswahl: Überschrift und Zahl sagen sie an, nur sie (E5, M3) */}
      <h2 ref={dayLabel} className={todayPicked ? "daylabel is-today" : "daylabel"} aria-live="polite">
        <span>{selectionHeading(selection, today)}</span>
        <small>{termine(agenda.count)}</small>
      </h2>
      {rows ? (
        // Woche: alle Tage ab heute, auch leere, verdeckte und das freie Wochenende (Plan 0057, E9)
        rows.map((row) => (
          <WeekRowView
            key={row.kind === "wochenende" ? row.from : row.day}
            row={row}
            today={today}
            ctx={ctx}
            onDiscover={onDiscover}
            onResetFilter={onResetFilter}
          />
        ))
      ) : (
        <>
          {agenda.groups.map((group) => (
            <Fragment key={group.day}>
              {selection.unit !== "tag" && <h3 className="dayh">{shortDate(group.day)}</h3>}
              <DayCards items={group.items} day={group.day} ctx={ctx} />
            </Fragment>
          ))}
          <RangeEmpty
            agenda={agenda}
            unit={selection.unit}
            dataEnd={dataEnd}
            onResetFilter={onResetFilter}
            onDiscover={() => onDiscover(range)}
          />
        </>
      )}
    </>
  );
}

function DayCards({ items, day, ctx }: { items: readonly Occurrence<SiteOffer>[]; day: string; ctx: CardContext }) {
  return items.map((item) => (
    <OfferCard
      key={`${item.offer.id}-${item.session.start}`}
      item={item}
      ctx={ctx}
      numbered
      markTentative
      calendarDay={day}
    />
  ));
}

/** Text einer freien Zeile je Grund (`weekRows`) */
const FREE_TEXT = { leer: "Nichts eingeplant", vorbei: "Heute schon vorbei", alter: "Passt nicht zum Alter" } as const;

/**
 * Eine Zeile der Wochenansicht (Plan 0057, E9): Tag mit Karten, sonst eine schmale gestrichelte Zeile mit dem Weg zu
 * „Angebote“ für diesen Tag bzw. das Wochenende oder, wenn nur der Filter verdeckt, mit „Filter zurücksetzen“.
 */
function WeekRowView({
  row,
  today,
  ctx,
  onDiscover,
  onResetFilter,
}: {
  row: WeekRow<Occurrence<SiteOffer>>;
  today: string;
  ctx: CardContext;
  onDiscover: (range: { from: string; to: string }) => void;
  onResetFilter: (() => void) | undefined;
}) {
  if (row.kind === "wochenende") {
    return (
      <>
        <h3 className="dayh">{`${shortDate(row.from)} – ${shortDate(row.to)}`}</h3>
        <FreeRow text="Wochenende · Noch frei">
          <DiscoverLink onClick={() => onDiscover({ from: row.from, to: row.to })}>Angebote am Wochenende</DiscoverLink>
        </FreeRow>
      </>
    );
  }
  const { day } = row;
  return (
    <>
      <h3 className="dayh">{shortDate(day)}</h3>
      {row.kind === "termine" && <DayCards items={row.items} day={day} ctx={ctx} />}
      {row.kind === "verdeckt" && (
        <FreeRow text="Ausgeblendet durch Filter">
          {onResetFilter && (
            <button type="button" className="linkbtn" onClick={onResetFilter}>
              Filter zurücksetzen
            </button>
          )}
        </FreeRow>
      )}
      {row.kind === "frei" && (
        <FreeRow text={FREE_TEXT[row.why]}>
          <DiscoverLink onClick={() => onDiscover({ from: day, to: day })}>
            {day === today ? "Angebote für heute" : `Angebote am ${weekdayShort(day)}`}
          </DiscoverLink>
        </FreeRow>
      )}
    </>
  );
}

function FreeRow({ text, children }: { text: string; children: ReactNode }) {
  return (
    <p className="free">
      <span>{text}</span>
      {children}
    </p>
  );
}

function DiscoverLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="linkbtn" onClick={onClick}>
      {children}
      <Icon name="next" size={16} />
    </button>
  );
}

/**
 * Leerzustände der Auswahl, in dieser Reihenfolge (Plan 0025, E5; Muster aus Plan 0008, E12). Ausgeblendetes zuerst:
 * Heute kann Passendes vorbei sein, während Ausgeblendetes noch kommt – „alles vorbei“ wäre dann falsch.
 */
function RangeEmpty({
  agenda,
  unit,
  dataEnd,
  onResetFilter,
  onDiscover,
}: {
  agenda: RangeAgenda<SiteOffer>;
  unit: CalendarSelection["unit"];
  dataEnd: string | undefined;
  onResetFilter: (() => void) | undefined;
  onDiscover: () => void;
}) {
  if (agenda.count > 0) return null;
  const empty = rangeEmptyTexts(unit);
  const discover = (
    <button type="button" className="linkbtn" onClick={onDiscover}>
      {empty.action}
    </button>
  );
  if (agenda.hidden > 0) {
    return (
      <EmptyState icon="search" title="Nichts, was zu deinem Filter passt">
        {savedHiddenNote(agenda.hidden)}
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
    // Auch in Woche und Monat (Abweichung vom Plan, „Stand Etappe 3“): „nichts gemerkt“ wäre dort falsch.
    return (
      <EmptyState icon="swing" title="Für heute ist alles vorbei">
        {unit === "tag" ? (
          "Die Termine von heute sind schon zu Ende. Die nächsten Tage stehen oben in der Woche."
        ) : (
          <>
            Die Termine von heute sind schon zu Ende, danach hast du hier nichts gemerkt.
            <br />
            {discover}
          </>
        )}
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
  if (agenda.ageHidden > 0) {
    // Gemerktes gäbe es, nur passt es nicht zum Alter: „nichts gemerkt“ wäre falsch (Browser-Review 0025)
    return (
      <EmptyState icon="heart" title="Nichts passt zum Alter">
        {empty.ageText}
        <br />
        {discover}
      </EmptyState>
    );
  }
  return (
    <EmptyState icon="heart" title="Nichts gemerkt">
      {empty.text}
      <br />
      {discover}
    </EmptyState>
  );
}

interface StripProps {
  /** nur vorgemerkt: Form als Umriss */
  tentative: (id: string) => boolean;
  nav: CalendarNav;
  selection: CalendarSelection;
  today: string;
  /** Termine der ganzen Woche bzw. des ganzen Monats ab heute, für den Namen des Titelknopfs */
  count: number;
  itemsOf: (d: string) => Occurrence<SiteOffer>[];
  label: (d: string) => string;
  select: (unit: CalendarSelection["unit"], day: string) => void;
  go: (unit: CalendarSelection["unit"], target: string | undefined) => () => void;
}

/** Titel als Knopf: Der sichtbare Text steht am Anfang des Namens, der Zusatz nur für Screenreader (WCAG 2.5.3). */
function TitleButton({
  pressed,
  onClick,
  text,
  extra,
}: {
  pressed: boolean;
  onClick: () => void;
  text: string;
  extra: string;
}) {
  return (
    <button type="button" className="cal-title" aria-pressed={pressed} onClick={onClick}>
      {text}
      <span className="sr-only">{` · ${extra}`}</span>
    </button>
  );
}

function WeekStrip({ tentative, nav, selection, today, count, itemsOf, label, select, go }: StripProps) {
  return (
    <>
      <div className="cal-nav">
        <button
          type="button"
          className="iconbtn"
          onClick={go("woche", nav.prevWeek)}
          disabled={!nav.prevWeek}
          aria-label="Vorherige Woche"
        >
          <Icon name="back" />
        </button>
        <TitleButton
          pressed={selection.unit === "woche"}
          onClick={() => select("woche", selection.day)}
          text={weekTitle(nav.week)}
          extra={`ganze Woche, ${termine(count)}`}
        />
        <button
          type="button"
          className="iconbtn"
          onClick={go("woche", nav.nextWeek)}
          disabled={!nav.nextWeek}
          aria-label="Nächste Woche"
        >
          <Icon name="next" />
        </button>
      </div>
      <fieldset className="plain">
        <legend className="sr-only">Woche</legend>
        <div className={selection.unit === "woche" ? "week inweek" : "week"}>
          {nav.week.map((d) => (
            <button
              key={d}
              type="button"
              className={d === today ? "day today" : "day"}
              aria-pressed={selection.unit === "tag" && d === selection.day}
              aria-label={label(d)}
              disabled={d < today}
              onClick={() => select("tag", d)}
            >
              <span className="wd">{weekdayShort(d)}</span>
              <span className="num">{parseIsoDate(d).day}</span>
              <span className="dots">
                {itemsOf(d)
                  .slice(0, 3)
                  .map((o) => {
                    const c = o.offer.category;
                    return (
                      <span key={`${o.offer.id}-${o.session.start}`} className={dotClass(c, tentative(o.offer.id))}>
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
  tentative,
  nav,
  selection,
  today,
  count,
  itemsOf,
  label,
  select,
  onPick,
  go,
}: StripProps & { onPick: (d: string) => void }) {
  const month = monthDays(selection.day);
  return (
    <div className="month">
      <div className="cal-nav">
        <button
          type="button"
          className="iconbtn"
          onClick={go("monat", nav.prevMonth)}
          disabled={!nav.prevMonth}
          aria-label="Vorheriger Monat"
        >
          <Icon name="back" />
        </button>
        <TitleButton
          pressed={selection.unit === "monat"}
          onClick={() => select("monat", selection.day)}
          text={monthTitle(selection.day)}
          extra={`ganzer Monat, ${termine(count)}`}
        />
        <button
          type="button"
          className="iconbtn"
          onClick={go("monat", nav.nextMonth)}
          disabled={!nav.nextMonth}
          aria-label="Nächster Monat"
        >
          <Icon name="next" />
        </button>
      </div>
      <div className={selection.unit === "monat" ? "mgrid inmonth" : "mgrid"}>
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((h) => (
          <span key={h} className="h" aria-hidden="true">
            {h}
          </span>
        ))}
        {month.days.map((d, i) => {
          const [first] = itemsOf(d);
          const c = first?.offer.category;
          return (
            <button
              key={d}
              type="button"
              className="mday"
              // Der 1. rückt in seine Wochentagsspalte, statt Leerzellen zu rendern.
              style={i === 0 ? { gridColumnStart: month.lead + 1 } : undefined}
              aria-pressed={selection.unit === "tag" && d === selection.day}
              aria-label={label(d)}
              disabled={d < today}
              onClick={() => onPick(d)}
            >
              {parseIsoDate(d).day}
              {c && first && (
                <span className={dotClass(c, tentative(first.offer.id))}>
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
