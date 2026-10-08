/** Kopf, Kategorie-Sticker, Schnellfilter und Tab-Leiste (Plan 0003, E10, E15, E16). */
import type { CSSProperties, Ref } from "react";
import { activeFilterCount, type FilterState, toggleIn } from "../domain/filter.ts";
import type { Section, Tab } from "../domain/route.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../domain/topics.ts";
import { CATEGORY_UI } from "./categories.ts";
import { Icon, Logo } from "./icons.tsx";

/** Kopf: Marke und Kind-Knopf. Die Darstellung (hell/dunkel) steht nur im Kind-Sheet (Plan 0020, E2). */
export function Header({ ageLabel, onKid }: { ageLabel: string; onKid: () => void }) {
  return (
    <header className="hdr">
      <h1 className="brand">
        <Logo />
        <span>Zwergenplan</span>
      </h1>
      <button type="button" className="kid" onClick={onKid} aria-label={`Kind und Einstellungen, Alter ${ageLabel}`}>
        <span className="face">
          <Icon name="face" size={20} />
        </span>
        <span>{ageLabel}</span>
      </button>
    </header>
  );
}

export function Stickers({ filter, onChange }: { filter: FilterState; onChange: (f: FilterState) => void }) {
  return (
    <fieldset className="plain">
      <legend className="sr-only">Kategorien</legend>
      <div className={filter.categories.length > 0 ? "stickers has-on" : "stickers"}>
        {CATEGORIES.map((c) => {
          const on = filter.categories.includes(c);
          return (
            <button
              key={c}
              type="button"
              className={`stk k-${c}`}
              aria-pressed={on}
              // Sichtbares Kurzlabel muss im Namen stecken (WCAG 2.5.3), das volle Label erklärt es.
              aria-label={
                CATEGORY_UI[c].short === CATEGORY_LABELS[c]
                  ? CATEGORY_LABELS[c]
                  : `${CATEGORY_UI[c].short}: ${CATEGORY_LABELS[c]}`
              }
              onClick={() => onChange(toggleIn(filter, "categories", c))}
            >
              <span className="disc">
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path className="shape-ink" d={CATEGORY_UI[c].shape} />
                </svg>
                {on && (
                  <span className="tick">
                    <Icon name="check" size={12} />
                  </span>
                )}
              </span>
              <span aria-hidden="true">{CATEGORY_UI[c].short}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QuickFilters({
  filter,
  limitActive,
  onChange,
  onOpenSheet,
  sheetButton,
}: {
  filter: FilterState;
  /** die Wegzeit-Grenze zählt nur, wenn sie wirkt (Plan 0009, E8) */
  limitActive: boolean;
  onChange: (f: FilterState) => void;
  onOpenSheet: () => void;
  /** der Knopf „Alle Filter“, Fokus-Rückweg für das Kind-Sheet */
  sheetButton?: Ref<HTMLButtonElement>;
}) {
  const count = activeFilterCount(filter, { limitActive });
  const chips = [
    { label: "Kostenlos", on: filter.cost.includes("kostenlos"), next: () => toggleIn(filter, "cost", "kostenlos") },
    {
      label: "Ohne Anmeldung",
      on: filter.registration.includes("ohne-anmeldung"),
      next: () => toggleIn(filter, "registration", "ohne-anmeldung"),
    },
    { label: "Kurse", on: filter.formats.includes("kurs"), next: () => toggleIn(filter, "formats", "kurs") },
    {
      label: "Regelmäßig",
      on: filter.formats.includes("regelmaessig"),
      next: () => toggleIn(filter, "formats", "regelmaessig"),
    },
    { label: "Einmalig", on: filter.formats.includes("einmalig"), next: () => toggleIn(filter, "formats", "einmalig") },
  ];
  return (
    <fieldset className="plain">
      <legend className="sr-only">Schnellfilter</legend>
      <div className="chips">
        <button
          ref={sheetButton}
          type="button"
          className={count > 0 ? "chip on" : "chip"}
          onClick={onOpenSheet}
          aria-label={`Alle Filter, ${count} aktiv`}
        >
          <Icon name="sliders" size={20} />
          Filter
          {count > 0 && <span className="badge">{count}</span>}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="chip"
            aria-pressed={chip.on}
            onClick={() => onChange(chip.next())}
          >
            {chip.on && <Icon name="check" size={18} />}
            {chip.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const TAB_ITEMS = [
  { tab: "entdecken", label: "Entdecken", icon: "compass" },
  { tab: "kalender", label: "Kalender", icon: "calendar" },
  // Plan 0010, E2: vor der Merkliste, die bleibt ganz rechts
  { tab: "anbieter", label: "Anbieter", icon: "store" },
  { tab: "merkliste", label: "Merkliste", icon: "heart" },
] as const;

export function TabBar({
  tab,
  savedCount,
  onTab,
  currentRef,
}: {
  tab: Section;
  savedCount: number;
  onTab: (t: Tab) => void;
  /** hängt nur am Knopf des aktiven Tabs: Fokus-Rückweg des Details (Plan 0008, E11) */
  currentRef?: Ref<HTMLButtonElement> | undefined;
}) {
  const index = TAB_ITEMS.findIndex((t) => t.tab === tab);
  return (
    <nav className="tabs" aria-label="Hauptnavigation">
      {/* Position per Klasse statt Inline-transform: unten waagrecht, im Querformat senkrecht (tabs.css). */}
      <span className={`tab-thumb at-${index}`} />
      {TAB_ITEMS.map((t) => (
        <button
          key={t.tab}
          type="button"
          ref={t.tab === tab ? currentRef : undefined}
          className="tab"
          aria-current={t.tab === tab ? "page" : undefined}
          onClick={() => onTab(t.tab)}
        >
          <Icon name={t.icon} size={24} />
          {/* eigenes Element: bei zu schmaler Spalte nur für Screenreader (Container-Query in tabs.css) */}
          <span className="tab-label">{t.label}</span>
          {t.tab === "merkliste" && savedCount > 0 && (
            <span className="badge" role="img" aria-label={`${savedCount} gemerkt`}>
              {savedCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** Eine Darstellung im Umschalter */
export interface ViewOption<V extends string> {
  value: V;
  label: string;
}

/**
 * Umschalter der Darstellung (Plan 0005, E5; allgemein seit Plan 0025, E4): Liste | Karte in „Entdecken“ neben der
 * Statuszeile, auf der Merkliste mit `full` allein über die ganze Breite. Der Daumen ist `1 / --n` breit (map.css).
 * Beim Wechsel bleibt der Umschalter dasselbe Element, der Fokus bleibt auf dem gedrückten Segment.
 */
export function ViewToggle<V extends string>({
  options,
  current,
  onChange,
  legend,
  full = false,
}: {
  options: readonly ViewOption<V>[];
  current: V;
  onChange: (value: V) => void;
  legend: string;
  full?: boolean;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );
  // Zahl der Segmente als CSS-Variable: Spalten und Daumenbreite (chrome.css, map.css); ohne Typ-Cast
  const segments: CSSProperties & { "--n": number } = { "--n": options.length };
  return (
    <fieldset className={full ? "plain view-toggle full" : "plain view-toggle"}>
      <legend className="sr-only">{legend}</legend>
      <div className="seg" style={segments}>
        <span className="seg-thumb" style={{ transform: `translateX(${index * 100}%)` }} />
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className="seg-btn"
            aria-pressed={option.value === current}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
