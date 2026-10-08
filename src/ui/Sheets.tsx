/**
 * Filter-Sheet (Plan 0003, E16; Plan 0004, E7; Plan 0009, E11; Plan 0021, E2: Altersschalter oben; Plan 0023: Zeitraum). Inhalt des Dialogs, die Hülle ist Dialog.tsx.
 * Kind-Sheet: KidSheet.tsx.
 * Der Fuß steht außerhalb des scrollenden Teils (Plan 0007, H7): So bleibt er sichtbar, ohne Inhalt zu verdecken.
 */
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import { type BoundCheck, type BoundLimits, checkBound, fieldLimits } from "../domain/date-range.ts";
import { type FilterState, FORMATS, toggleIn, withDateRange, withReachLimit } from "../domain/filter.ts";
import { LIMIT_MINUTES, type ReachLimit } from "../domain/reach.ts";
import type { Cost, Registration } from "../domain/schema.ts";
import { CATEGORIES, CATEGORY_LABELS } from "../domain/topics.ts";
import { markAutofocus } from "./Dialog.tsx";
import { ageOnlyNote, limitReason, plural, reachLimitLabel, SHARE_MANUAL_HINT } from "./format.ts";
import { Shape } from "./icons.tsx";
import type { ReachMode } from "./use-transit.ts";

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
  ...LIMIT_MINUTES.map((value): [ReachLimit, string] => {
    const limit: ReachLimit = { kind: "minuten", value };
    return [limit, reachLimitLabel(limit)];
  }),
];

/** Altersfilter im Filter-Sheet (Plan 0021, E2); nur mit Geburtsdatum */
export interface AgeFilter {
  /** Alter wie im Kopf, z. B. „7 Mon.“ */
  label: string;
  on: boolean;
  /** gefilterte Angebote, die nicht zum Kind passen */
  unfitCount: number;
  onChange: (on: boolean) => void;
}

/** `LimitAction` für ein Fokus-Ziel: Statuszeile (App) bzw. Überschrift „Wegzeit“ (Filter-Sheet), N2 */
export type LimitActionFor = (focusTarget: RefObject<HTMLElement | null>) => ReactNode;

/**
 * Knopf zur Begründung, warum die Wegzeit-Grenze nicht wirkt (E11): ohne Startpunkt oder außerhalb „Startpunkt
 * wählen“, bei Fehler „Nochmal laden“ (`want()`; scheitert dabei nur der Chunk, lädt die Seite neu, N1).
 * „Nochmal laden“ verschwindet mit dem Ladezustand: Vorher geht der Fokus auf `focusTarget`, sonst fiele er auf
 * `<body>` (Plan 0009, N2).
 */
export function LimitAction({
  mode,
  focusTarget,
  onPickOrigin,
  onRetry,
}: {
  mode: ReachMode | undefined;
  /** bleibt beim Laden sichtbar und fokussierbar (`tabIndex={-1}`) */
  focusTarget: RefObject<HTMLElement | null>;
  onPickOrigin: () => void;
  onRetry: () => void;
}) {
  if (mode?.kind === "oepnv" || mode?.kind === "laedt") return null;
  const failed = mode?.reason === "fehler";
  const retry = () => {
    focusTarget.current?.focus();
    onRetry();
  };
  return (
    <button type="button" className="linkbtn" onClick={failed ? retry : onPickOrigin}>
      {failed ? "Nochmal laden" : "Startpunkt wählen"}
    </button>
  );
}

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

/** Rückmeldung zu einer nicht übernommenen Eingabe (Arch-Review 0023, m1) */
type BoundHints = Record<Exclude<BoundCheck, "ok">, string>;
const PICK_DATE = "Bitte ein Datum wählen";

/**
 * Natives Datumsfeld einer Zeitraum-Grenze (Plan 0023, E9). Der Text bleibt lokal, bis die Eingabe in die Grenzen
 * passt (`checkBound`); sonst steht eine kurze Zeile darunter. Ändert sich die Grenze von außen (Zurücksetzen), folgt
 * das Feld.
 */
function DateField({
  label,
  value,
  limits,
  hints,
  onCommit,
}: {
  label: string;
  value: string;
  limits: BoundLimits;
  hints: BoundHints;
  onCommit: (value: string) => void;
}) {
  const hintId = useId();
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value);
  }
  const check = text === value ? "ok" : checkBound(text, limits);
  return (
    <div>
      <label className="field">
        {label}
        <input
          className="input date"
          type="date"
          min={limits.min}
          max={limits.max}
          value={text}
          aria-invalid={check !== "ok"}
          aria-describedby={check !== "ok" ? hintId : undefined}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            if (checkBound(next, limits) === "ok") onCommit(next);
          }}
        />
      </label>
      {check !== "ok" && (
        <p id={hintId} className="small bound-hint">
          {hints[check]}
        </p>
      )}
    </div>
  );
}

export function FilterSheet({
  filter,
  onChange,
  onReset,
  age,
  resultCount,
  mode,
  limitAction,
  today,
  onClose,
}: {
  filter: FilterState;
  onChange: (f: FilterState) => void;
  /** „Zurücksetzen“: URL-Filter leeren und Altersfilter wieder an (Plan 0021, E2) */
  onReset: () => void;
  age: AgeFilter | undefined;
  resultCount: number;
  /** nur mit Wegzeit sind die Grenzen bedienbar; sonst steht die Begründung darunter (E11, M6) */
  mode: ReachMode | undefined;
  /** Knopf zur Begründung (`LimitAction`), Fokus-Ziel ist die Überschrift „Wegzeit“ (N2) */
  limitAction: LimitActionFor;
  /** Berliner „heute“: frühester Tag im Zeitraum (außer ein alter Link nennt einen früheren, E4) */
  today: string;
  onClose: () => void;
}) {
  const reachHeading = useRef<HTMLHeadingElement>(null);
  const rangeHeading = useRef<HTMLHeadingElement>(null);
  const rangeHeadingId = useId();
  const limits = fieldLimits(filter.range, today);
  const ageLabelId = useId();
  const ageNoteId = useId();
  const reason = limitReason(mode);
  /** Einfachwahl auf einer Listen-Dimension: „Egal“ = leere Liste */
  const single = <T extends string>(selected: readonly T[], value: T | undefined) =>
    value === undefined ? selected.length === 0 : selected.length === 1 && selected[0] === value;
  return (
    <div className="sheet-body">
      <div className="sheet-scroll">
        <div className="grab" />
        <h2>Filter</h2>
        {age && (
          <>
            <h3>Alter</h3>
            <div className="swrow">
              <span className="swtext">
                <b id={ageLabelId}>Nur passend für {age.label}</b>
                <small id={ageNoteId}>{ageOnlyNote(age.unfitCount, age.on)}</small>
              </span>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={age.on}
                aria-labelledby={ageLabelId}
                aria-describedby={ageNoteId}
                onClick={() => age.onChange(!age.on)}
              >
                <span className="track">
                  <span className="knob" />
                </span>
              </button>
            </div>
          </>
        )}
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
        <h3 ref={rangeHeading} id={rangeHeadingId} tabIndex={-1}>
          Zeitraum
        </h3>
        <fieldset className="plain" aria-labelledby={rangeHeadingId}>
          <div className="daterange">
            <DateField
              label="von"
              value={filter.range?.from ?? ""}
              limits={limits.from}
              hints={{ "zu-frueh": "Frühestens heute", "zu-spaet": "Nicht nach „bis“", ungueltig: PICK_DATE }}
              onCommit={(from) => onChange(withDateRange(filter, from, filter.range?.to))}
            />
            <DateField
              label="bis"
              value={filter.range?.to ?? ""}
              limits={limits.to}
              hints={{
                "zu-frueh": filter.range?.from ? "Nicht vor „von“" : "Frühestens heute",
                "zu-spaet": PICK_DATE,
                ungueltig: PICK_DATE,
              }}
              onCommit={(to) => onChange(withDateRange(filter, filter.range?.from, to))}
            />
          </div>
        </fieldset>
        {filter.range && (
          <button
            type="button"
            className="linkbtn"
            onClick={() => {
              // Der Knopf verschwindet: vorher den Fokus auf die Überschrift, sonst fiele er auf <body> (wie LimitAction)
              rangeHeading.current?.focus();
              onChange(withDateRange(filter, undefined, undefined));
            }}
          >
            Zeitraum entfernen
          </button>
        )}
        <h3 ref={reachHeading} tabIndex={-1}>
          Wegzeit
        </h3>
        <div className="wrap">
          {REACH_CHIPS.map(([limit, label]) => (
            <Chip
              key={label}
              on={limit ? filter.reachLimit?.value === limit.value : !filter.reachLimit}
              // „Egal“ bleibt immer bedienbar: So lässt sich eine gesetzte Grenze jederzeit entfernen.
              disabled={limit !== undefined && reason !== undefined}
              onClick={() => onChange(withReachLimit(filter, limit))}
            >
              {label}
            </Chip>
          ))}
        </div>
        {reason && (
          <p className="small origin-need">
            {reason}
            {limitAction(reachHeading)}
          </p>
        )}
      </div>
      <div className="sheetfoot">
        <button type="button" className="linkbtn" onClick={onReset}>
          Zurücksetzen
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          {plural(resultCount, "Angebot", "Angebote")} zeigen
        </button>
      </div>
    </div>
  );
}

/**
 * „Link zum Teilen“ (Plan 0026, E6, Review M2): Teilen und Kopieren scheiterten. Der Link steht markiert in einem
 * schreibgeschützten Feld; gedrückt halten kopiert ihn auch in der installierten App (ohne Adresszeile).
 */
export function ManualLinkSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null);
  // showModal fokussiert das Feld (autofocus), `onFocus` markiert; der Effekt deckt einen Fokus vor dem Öffnen ab
  useEffect(() => {
    field.current?.select();
  }, []);
  return (
    <div className="sheet-body">
      <div className="sheet-scroll">
        <div className="grab" />
        <h2>Link zum Teilen</h2>
        <label className="field">
          {SHARE_MANUAL_HINT}
          <input
            ref={(el) => {
              field.current = el;
              markAutofocus(el);
            }}
            className="input share-link"
            type="url"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  );
}
