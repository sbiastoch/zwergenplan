/** Kopf, Kategorie-Sticker, Schnellfilter und Tab-Leiste (Plan 0003, E10, E15, E16). */
import { activeFilterCount, type FilterState, toggleIn } from "../domain/filter.ts";
import type { Tab } from "../domain/route.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../domain/topics.ts";
import { CATEGORY_UI } from "./categories.ts";
import { Icon, Logo } from "./icons.tsx";

export function Header({
  ageLabel,
  dark,
  onKid,
  onToggleTheme,
}: {
  ageLabel: string;
  dark: boolean;
  onKid: () => void;
  onToggleTheme: () => void;
}) {
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
      <button
        type="button"
        className="iconbtn"
        onClick={onToggleTheme}
        aria-label={dark ? "Helle Darstellung" : "Dunkle Darstellung"}
      >
        <Icon name={dark ? "sun" : "moon"} />
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
  hasOrigin,
  onChange,
  onOpenSheet,
}: {
  filter: FilterState;
  /** ohne Startpunkt zählt der Umkreis nicht mit (Plan 0004, E7) */
  hasOrigin: boolean;
  onChange: (f: FilterState) => void;
  onOpenSheet: () => void;
}) {
  const count = activeFilterCount(filter, { hasOrigin });
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
  { tab: "merkliste", label: "Merkliste", icon: "heart" },
] as const;

export function TabBar({ tab, savedCount, onTab }: { tab: Tab; savedCount: number; onTab: (t: Tab) => void }) {
  const index = TAB_ITEMS.findIndex((t) => t.tab === tab);
  return (
    <nav className="tabs" aria-label="Hauptnavigation">
      <span className="tab-thumb" style={{ transform: `translateX(${index * 100}%)` }} />
      {TAB_ITEMS.map((t) => (
        <button
          key={t.tab}
          type="button"
          className="tab"
          aria-current={t.tab === tab ? "page" : undefined}
          onClick={() => onTab(t.tab)}
        >
          <Icon name={t.icon} size={24} />
          {t.label}
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
