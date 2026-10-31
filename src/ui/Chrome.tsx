/** Kopf, Kategorie-Sticker, Schnellfilter und Tab-Leiste (Plan 0003, E10, E15, E16). */
import type { CSSProperties, Ref } from "react";
import { type FilterState, toggleIn } from "../domain/filter.ts";
import type { Section, Tab } from "../domain/route.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../domain/topics.ts";
import { CATEGORY_UI } from "./categories.ts";
import { Icon, Logo } from "./icons.tsx";
import { BellButton } from "./OfferCard.tsx";

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

/** Ein Chip der Schnellfilter-Zeile (Plan 0057, E5): Startseite und Merkliste geben ihre eigenen. */
export interface QuickChip {
  label: string;
  on: boolean;
  toggle: () => void;
}

/** Die fünf Chips der Startseite (Plan 0003, E16) */
export function startQuickChips(filter: FilterState, onChange: (f: FilterState) => void): QuickChip[] {
  const chip = (label: string, on: boolean, next: () => FilterState): QuickChip => ({
    label,
    on,
    toggle: () => onChange(next()),
  });
  return [
    chip("Kostenlos", filter.cost.includes("kostenlos"), () => toggleIn(filter, "cost", "kostenlos")),
    chip("Ohne Anmeldung", filter.registration.includes("ohne-anmeldung"), () =>
      toggleIn(filter, "registration", "ohne-anmeldung"),
    ),
    chip("Kurse", filter.formats.includes("kurs"), () => toggleIn(filter, "formats", "kurs")),
    chip("Regelmäßig", filter.formats.includes("regelmaessig"), () => toggleIn(filter, "formats", "regelmaessig")),
    chip("Einmalig", filter.formats.includes("einmalig"), () => toggleIn(filter, "formats", "einmalig")),
  ];
}

/**
 * Knopf „Filter“ mit Badge und Chips, waagrecht scrollend (Plan 0003, E16). Startseite und Merkliste (Plan 0057, E5)
 * geben Chips, Zahl im Badge und Namen der Gruppe; die Glocke gibt es nur auf der Startseite.
 */
export function QuickFilters({
  chips,
  count,
  legend = "Schnellfilter",
  onOpenSheet,
  sheetButton,
  bell,
}: {
  chips: readonly QuickChip[];
  /** Zahl im Badge (`activeFilterCount`; die Wegzeit-Grenze zählt nur, wenn sie wirkt, Plan 0009, E8) */
  count: number;
  /** Name der Gruppe für Screenreader */
  legend?: string;
  onOpenSheet: () => void;
  /** der Knopf „Alle Filter“, Fokus-Rückweg für das Kind-Sheet */
  sheetButton?: Ref<HTMLButtonElement>;
  /** Glocke der Suche (Plan 0054, E6): nur im Tab „Angebote“ und nur mit einem Filter außer Zeitraum und Tageszeit */
  bell?: { label: string; subscribed: boolean; busy: boolean; onToggle: () => void } | undefined;
}) {
  return (
    // Die Glocke ist kein Filter: rechts neben der scrollenden Gruppe, nicht darin (Plan 0054, E6)
    <div className="quickbar">
      <fieldset className="plain">
        <legend className="sr-only">{legend}</legend>
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
            <button key={chip.label} type="button" className="chip" aria-pressed={chip.on} onClick={chip.toggle}>
              {chip.on && <Icon name="check" size={18} />}
              {chip.label}
            </button>
          ))}
        </div>
      </fieldset>
      {bell && (
        <BellButton
          inline
          className="quick-bell"
          label={`Suche „${bell.label}“`}
          subscribed={bell.subscribed}
          busy={bell.busy}
          onToggle={bell.onToggle}
        />
      )}
    </div>
  );
}

/**
 * Drei Tabs (Plan 0025, E8): „Entdecken“ heißt „Angebote“, nur die Beschriftung, der Routenwert bleibt. Den Tab
 * „Kalender“ gibt es nicht mehr, der Kalender ist eine Darstellung der Merkliste.
 */
const TAB_ITEMS = [
  { tab: "entdecken", label: "Angebote", icon: "compass" },
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
