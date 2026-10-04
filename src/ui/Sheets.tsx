/** Filter-Sheet (E16) und Kind-Sheet (E11, E15). Inhalte der Dialoge, die Hülle ist Dialog.tsx. */
import { type ReactNode, useId, useState } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import { ageInMonths } from "../domain/age.ts";
import { EMPTY_FILTER, type FilterState, FORMATS, toggleIn } from "../domain/filter.ts";
import type { Cost, Registration } from "../domain/schema.ts";
import { formatGermanDate, parseGermanDate } from "../domain/time.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../domain/topics.ts";
import { plural } from "./format.ts";
import { Shape } from "./icons.tsx";

const FORMAT_CHIPS: Record<(typeof FORMATS)[number], string> = {
  kurs: "Kurs",
  regelmaessig: "Regelmäßig",
  einmalig: "Einmalig",
};
const REGISTRATION_CHIPS: [Registration | undefined, string][] = [
  [undefined, "Egal"],
  ["ohne-anmeldung", "Ohne Anmeldung"],
  ["mit-anmeldung", "Mit Anmeldung"],
];
const COST_CHIPS: [Cost | undefined, string][] = [
  [undefined, "Egal"],
  ["kostenlos", "Kostenlos"],
  ["kostenpflichtig", "Kostenpflichtig"],
];

function Chip({
  on,
  onClick,
  children,
  className = "chip",
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button type="button" className={className} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export function FilterSheet({
  filter,
  onChange,
  resultCount,
  onClose,
}: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
  onClose: () => void;
}) {
  /** Einfachwahl auf einer Listen-Dimension: „Egal“ = leere Liste */
  const single = <T extends string>(selected: readonly T[], value: T | undefined) =>
    value === undefined ? selected.length === 0 : selected.length === 1 && selected[0] === value;
  return (
    <div className="sheet-body">
      <div className="grab" />
      <h2>Filter</h2>
      <h3>Art</h3>
      <div className="wrap">
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            className={`chip cat k-${c}`}
            on={filter.categories.includes(c)}
            onClick={() => onChange(toggleIn(filter, "categories", c))}
          >
            <Shape category={c} ink={false} />
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>
      <h3>Format</h3>
      <div className="wrap">
        {FORMATS.map((f) => (
          <Chip key={f} on={filter.formats.includes(f)} onClick={() => onChange(toggleIn(filter, "formats", f))}>
            {FORMAT_CHIPS[f]}
          </Chip>
        ))}
      </div>
      <h3>Anmeldung</h3>
      <div className="wrap">
        {REGISTRATION_CHIPS.map(([value, label]) => (
          <Chip
            key={label}
            on={single(filter.registration, value)}
            onClick={() => onChange({ ...filter, registration: value ? [value] : [] })}
          >
            {label}
          </Chip>
        ))}
      </div>
      <h3>Kosten</h3>
      <div className="wrap">
        {COST_CHIPS.map(([value, label]) => (
          <Chip
            key={label}
            on={single(filter.cost, value)}
            onClick={() => onChange({ ...filter, cost: value ? [value] : [] })}
          >
            {label}
          </Chip>
        ))}
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn" onClick={() => onChange(EMPTY_FILTER)}>
          Zurücksetzen
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {plural(resultCount, "Angebot", "Angebote")} zeigen
        </button>
      </div>
    </div>
  );
}

export function KidSheet({
  birthDate,
  onBirthDate,
  ageOnly,
  onAgeOnly,
  theme,
  onTheme,
  today,
  onClose,
}: {
  birthDate: string | undefined;
  onBirthDate: (iso: string | undefined) => void;
  ageOnly: boolean;
  onAgeOnly: (on: boolean) => void;
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  today: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(birthDate ? formatGermanDate(birthDate) : "");
  const hintId = useId();
  const parsed = parseGermanDate(text, today);
  const hint = parsed
    ? { cls: "hint ok", text: `Dein Kind ist heute ${plural(ageInMonths(parsed, today), "Monat", "Monate")} alt.` }
    : text.trim()
      ? { cls: "hint bad", text: "Bitte als TT.MM.JJJJ eingeben, z. B. 02.11.2025." }
      : { cls: "hint", text: "Ohne Geburtsdatum zeigen wir alle Angebote." };
  const themes: [ThemeChoice, string][] = [
    ["auto", "Automatisch"],
    ["hell", "Hell"],
    ["dunkel", "Dunkel"],
  ];
  const themeIndex = themes.findIndex(([t]) => t === theme);

  return (
    <div className="sheet-body">
      <div className="grab" />
      <h2>Dein Zwerg</h2>
      <label className="field">
        Geburtsdatum
        <input
          className="input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT.MM.JJJJ"
          aria-describedby={hintId}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            const iso = parseGermanDate(next, today);
            if (iso) onBirthDate(iso);
            else if (!next.trim()) onBirthDate(undefined);
          }}
          onBlur={() => {
            if (parsed) setText(formatGermanDate(parsed));
          }}
        />
      </label>
      <p id={hintId} className={hint.cls}>
        {hint.text}
      </p>
      <p className="small">Bleibt nur auf diesem Gerät.</p>
      <div className="swrow">
        <span className="swtext">
          <b id="age-only-label">Nur passende Angebote</b>
          <small>geprüft zum Kursstart · bleibt auf diesem Gerät</small>
        </span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={ageOnly}
          aria-labelledby="age-only-label"
          onClick={() => onAgeOnly(!ageOnly)}
        >
          <span className="track">
            <span className="knob" />
          </span>
        </button>
      </div>
      <h3>Darstellung</h3>
      <fieldset className="plain">
        <legend className="sr-only">Darstellung</legend>
        <div className="seg seg3">
          <span className="seg-thumb" style={{ transform: `translateX(${themeIndex * 100}%)` }} />
          {themes.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="seg-btn"
              aria-pressed={theme === value}
              onClick={() => onTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sheetfoot single">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  );
}
