/**
 * Filter-Sheet (Plan 0003, E16; Plan 0004, E7). Inhalt des Dialogs, die Hülle ist Dialog.tsx. Kind-Sheet: KidSheet.tsx.
 * Der Fuß steht außerhalb des scrollenden Teils (Plan 0007, H7): So bleibt er sichtbar, ohne Inhalt zu verdecken.
 */
import type { ReactNode } from "react";
import { EMPTY_FILTER, type FilterState, FORMATS, toggleIn, withReachLimit } from "../domain/filter.ts";
import { RADII_KM, type ReachLimit } from "../domain/reach.ts";
import type { Cost, Registration } from "../domain/schema.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../domain/topics.ts";
import { plural, reachLimitLabel } from "./format.ts";
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
const REACH_CHIPS: [ReachLimit | undefined, string][] = [
  [undefined, "Egal"],
  ...RADII_KM.map((value): [ReachLimit, string] => {
    const limit: ReachLimit = { kind: "km", value };
    return [limit, reachLimitLabel(limit)];
  }),
];

function Chip({
  on,
  onClick,
  children,
  className = "chip",
  disabled = false,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button type="button" className={className} aria-pressed={on} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function FilterSheet({
  filter,
  onChange,
  resultCount,
  hasOrigin,
  onPickOrigin,
  onClose,
}: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  resultCount: number;
  /** ohne Startpunkt sind die Umkreise gesperrt (Plan 0004, E7) */
  hasOrigin: boolean;
  /** schließt das Filter-Sheet und öffnet das Kind-Sheet bei „Entfernung ab“ */
  onPickOrigin: () => void;
  onClose: () => void;
}) {
  /** Einfachwahl auf einer Listen-Dimension: „Egal“ = leere Liste */
  const single = <T extends string>(selected: readonly T[], value: T | undefined) =>
    value === undefined ? selected.length === 0 : selected.length === 1 && selected[0] === value;
  return (
    <div className="sheet-body">
      <div className="sheet-scroll">
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
        <h3>Entfernung</h3>
        <div className="wrap">
          {REACH_CHIPS.map(([limit, label]) => (
            <Chip
              key={label}
              on={limit ? filter.reachLimit?.value === limit.value : !filter.reachLimit}
              disabled={limit !== undefined && !hasOrigin}
              onClick={() => onChange(withReachLimit(filter, limit))}
            >
              {label}
            </Chip>
          ))}
        </div>
        {!hasOrigin && (
          <p className="small origin-need">
            Erst einen Startpunkt wählen.
            <button type="button" className="linkbtn" onClick={onPickOrigin}>
              Startpunkt wählen
            </button>
          </p>
        )}
      </div>
      <div className="sheetfoot">
        <button type="button" className="linkbtn" onClick={() => onChange(EMPTY_FILTER)}>
          Zurücksetzen
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {plural(resultCount, "Angebot", "Angebote")} zeigen
        </button>
      </div>
    </div>
  );
}
