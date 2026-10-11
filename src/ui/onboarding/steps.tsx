/**
 * Eingaben der Schritte „Stadt“, „Alter“ und „Weg“ (Plan 0033, E5–E7). Den Schritt „App“ bringt der App-Chunk als
 * Prop (`AppStep`, E8). Gespeichert wird über dieselben Wege wie im Kind-Sheet; hier wird nur angezeigt und gewählt.
 */
import { type RefObject, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ageInMonths } from "../../domain/age.ts";
import { DISTRICTS, nearestDistrictLabel } from "../../domain/districts.ts";
import { withReachLimit } from "../../domain/filter.ts";
import { ageHint, cityChoices, LIMIT_CHOICES, ONBOARDING_TEXTS as T } from "../../domain/onboarding.ts";
import { REGIONS } from "../../domain/regions.ts";
import { BIRTH_DATE_INVALID, type useBirthDateInput } from "../birth-date-input.ts";
import { limitReason, originHint } from "../format.ts";
import { Icon } from "../icons.tsx";
import type { OnboardingFlowProps } from "../onboarding-types.ts";

const DOTS = ["c1", "c2", "c3", "c4"];

/**
 * Stadt-Kacheln, sortiert nach Einwohnern, der Rest im Dropdown (E5). Heute nur Nürnberg, vorgewählt. Die Wahl lebt
 * nur hier; gespeichert wird sie erst mit einer zweiten Region.
 */
export function CityStep() {
  const { tiles, more } = cityChoices(REGIONS);
  const [city, setCity] = useState<string>(tiles[0]?.id ?? "");
  return (
    <>
      <p className="lbl">{T.cityLabel}</p>
      <fieldset className="onb-tiles" aria-label={T.cityGroup}>
        {tiles.map((t, i) => (
          <button
            key={t.id}
            type="button"
            className="onb-tile"
            aria-pressed={city === t.id}
            onClick={() => setCity(t.id)}
          >
            <span className={`dot ${DOTS[i]}`}>{city === t.id && <Icon name="check" size={16} />}</span>
            {t.name}
          </button>
        ))}
      </fieldset>
      {more.length > 0 && (
        <span className="select">
          <select
            className="input"
            aria-label={T.moreCities}
            value={more.some((m) => m.id === city) ? city : ""}
            onChange={(e) => setCity(e.target.value || (tiles[0]?.id ?? ""))}
          >
            <option value="">{T.moreCitiesEmpty}</option>
            {more.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Icon name="down" size={20} />
        </span>
      )}
    </>
  );
}

/** Geburtsdatum wie im Kind-Sheet (E6); den Zustand hält der Flow, damit „Weiter“ ein ungültiges Datum anhält */
export function AgeStep({
  birth,
  field,
  now,
}: {
  birth: ReturnType<typeof useBirthDateInput>;
  field: RefObject<HTMLInputElement | null>;
  now: Date;
}) {
  const { parsed } = birth;
  const hint = parsed && ageHint(ageInMonths(parsed, now));
  return (
    <>
      <label className="lbl" htmlFor="onb-birth">
        {T.birthLabel}
      </label>
      <input
        ref={field}
        id="onb-birth"
        className="input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={T.birthPlaceholder}
        aria-describedby="onb-birth-hint"
        value={birth.text}
        onChange={birth.onChange}
        onBlur={birth.onBlur}
      />
      <p id="onb-birth-hint" className={hint ? "hint ok" : birth.invalid ? "hint bad" : "small"}>
        {hint ?? (birth.invalid ? BIRTH_DATE_INVALID : T.localOnly)}
      </p>
    </>
  );
}

/**
 * Startpunkt und Wegzeit-Grenze (E7). Das Anzeigen des Schritts ist der Wegzeit-Anlass (`want()`), nie die Wahl. Die
 * Minuten-Chips sind gesperrt, solange die Wegzeit nicht wirkt (wie im Filter-Sheet); „Egal“ geht immer.
 * Wirkt ein gefundener Standort, steht statt Knopf und Stadtteil-Auswahl „Dein Standort“ mit „Standort entfernen“
 * (Nachtrag Plan 0035, 2026-10-11); dieselbe Regel wie `OriginPicker` im Kind-Sheet (Plan 0022).
 */
export function WayStep({ originApi, transit, filter, setFilter }: OnboardingFlowProps) {
  const { want, mode } = transit;
  useEffect(() => {
    want();
  }, [want]);
  const { origin, locating } = originApi;
  const located = origin?.source === "standort";
  const outside = mode?.kind === "luftlinie" && mode.reason === "ausserhalb";
  const showLocated = located && !originApi.problem && !outside;
  const select = useRef<HTMLSelectElement>(null);
  const note = originHint(originApi.problem, origin, mode);
  const reason = limitReason(mode);
  return (
    <>
      {showLocated ? (
        <div className="onb-row">
          <p className="onb-origin">
            <Icon name="compass" size={20} />
            <span>
              <b>{T.locatedLabel}</b>
              {/* offline aus den Stadtteil-Punkten: Die Koordinate verlässt das Gerät nicht (ADR 0017) */}
              {origin && <small>{nearestDistrictLabel(origin.point)}</small>}
            </span>
          </p>
          <button
            type="button"
            className="btn"
            // Der Knopf verschwindet mit dem Fokus; die Auswahl steht danach da und übernimmt ihn (wie im Kind-Sheet)
            onClick={() => {
              flushSync(originApi.clear);
              select.current?.focus({ preventScroll: true });
            }}
          >
            {T.clearLocation}
          </button>
        </div>
      ) : (
        <div className="onb-row">
          {originApi.canLocate && (
            // `aria-busy` statt `disabled` wie im Kind-Sheet: Ein gesperrter Knopf verlöre den Fokus an <body>
            <button
              type="button"
              className={located ? "btn on" : "btn"}
              aria-busy={locating}
              onClick={locating ? undefined : originApi.locateMe}
            >
              <Icon name="compass" size={20} />
              {locating ? T.locating : located ? T.located : T.locate}
            </button>
          )}
          <span className="select">
            <select
              ref={select}
              className="input"
              aria-label={T.district}
              value={origin?.districtId ?? ""}
              onChange={(e) => originApi.setDistrict(e.target.value)}
            >
              <option value="" disabled>
                {T.districtEmpty}
              </option>
              {DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Icon name="down" size={20} />
          </span>
        </div>
      )}
      {/* eigene Live-Region im Dialog wie im Kind-Sheet */}
      <div aria-live="polite">{note && <p className={note.cls}>{note.text}</p>}</div>
      <p className="lbl">{T.limitLabel}</p>
      <fieldset className="onb-chips" aria-label={T.limitLabel}>
        {LIMIT_CHOICES.map(({ label, limit }) => (
          <button
            key={label}
            type="button"
            className="chip"
            aria-pressed={limit ? filter.reachLimit?.value === limit.value : !filter.reachLimit}
            disabled={limit !== undefined && reason !== undefined}
            onClick={() => setFilter(withReachLimit(filter, limit))}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {reason && <p className="small">{reason}</p>}
      <p className="small">{T.wayNote}</p>
    </>
  );
}
