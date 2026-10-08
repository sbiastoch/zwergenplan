/**
 * Filterzeile der Merkliste (Plan 0025, E6, E7): Chips wie die Schnellfilter, ohne Sheet. Format (Mehrfachwahl),
 * Anmeldung (Einfachwahl) und in Liste und Karte die Schnellwahlen „ab …“. Was ein Tipp bewirkt, entscheidet
 * `toggleSavedFilter` in der Domäne.
 */
import type { DateRange } from "../domain/date-range.ts";
import { type SavedFilter, type SavedFilterChip, toggleSavedFilter } from "../domain/saved.ts";
import type { Format, Registration } from "../domain/schema.ts";
import { quickRangeLabel } from "./format.ts";
import { Icon } from "./icons.tsx";

const FORMAT_CHIPS = [
  ["kurs", "Kurse"],
  ["regelmaessig", "Regelmäßig"],
  ["einmalig", "Einmalig"],
] as const satisfies readonly (readonly [Format, string])[];
const REGISTRATION_CHIPS = [
  ["mit-anmeldung", "Mit Anmeldung"],
  ["ohne-anmeldung", "Ohne Anmeldung"],
] as const satisfies readonly (readonly [Registration, string])[];

interface Chip {
  label: string;
  on: boolean;
  chip: SavedFilterChip;
}

export function SavedFilters({
  filter,
  quick,
  showRange,
  onChange,
  onReset,
}: {
  filter: SavedFilter;
  /** Schnellwahlen „ab …“ (`quickRanges`) */
  quick: readonly { month: string; range: DateRange }[];
  /** im Kalender aus: Dort ist die Auswahl der Zeitraum (E5); der Wert bleibt erhalten */
  showRange: boolean;
  onChange: (filter: SavedFilter) => void;
  /** „Zurücksetzen“, nur wenn in dieser Darstellung ein Filter wirkt; setzt den ganzen Filter zurück (E6) */
  onReset: (() => void) | undefined;
}) {
  const chips: Chip[] = [
    ...FORMAT_CHIPS.map(
      ([value, label]): Chip => ({ label, on: filter.formats.includes(value), chip: { kind: "format", value } }),
    ),
    ...REGISTRATION_CHIPS.map(
      ([value, label]): Chip => ({
        label,
        on: filter.registration.includes(value),
        chip: { kind: "registration", value },
      }),
    ),
    ...(showRange
      ? quick.map(
          ({ month, range }): Chip => ({
            label: quickRangeLabel(month),
            on: filter.range?.from === range.from,
            chip: { kind: "range", range },
          }),
        )
      : []),
  ];
  return (
    <fieldset className="plain saved-filters">
      <legend className="sr-only">Merkliste filtern</legend>
      <div className="chips">
        {chips.map(({ label, on, chip }) => (
          <button
            key={label}
            type="button"
            className="chip"
            aria-pressed={on}
            onClick={() => onChange(toggleSavedFilter(filter, chip))}
          >
            {on && <Icon name="check" size={18} />}
            {label}
          </button>
        ))}
        {onReset && (
          <button type="button" className="chip" onClick={onReset}>
            Zurücksetzen
          </button>
        )}
      </div>
    </fieldset>
  );
}
