/**
 * Kind-Sheet (Plan 0003, E11, E15; Plan 0004, E5; Plan 0009, E3): Geburtsdatum, „Nur passende“, Startpunkt mit
 * Quellenhinweis der Wegzeit, Darstellung.
 * Der Fuß steht außerhalb des scrollenden Teils (Plan 0007, H7).
 */
import { useId, useState } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import { ageInMonths } from "../domain/age.ts";
import { formatGermanDate, parseGermanDate } from "../domain/time.ts";
import type { TransitSource } from "../domain/transit-types.ts";
import { plural } from "./format.ts";
import { OriginPicker } from "./OriginPicker.tsx";
import type { OriginApi } from "./use-app-state.ts";
import type { ReachMode } from "./use-transit.ts";

export function KidSheet({
  birthDate,
  onBirthDate,
  ageOnly,
  onAgeOnly,
  theme,
  onTheme,
  today,
  origin,
  reachMode,
  transitSource,
  focusOrigin,
  onClose,
}: {
  birthDate: string | undefined;
  onBirthDate: (iso: string | undefined) => void;
  ageOnly: boolean;
  onAgeOnly: (on: boolean) => void;
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  today: string;
  origin: OriginApi;
  /** Modus ab dem Startpunkt: „außerhalb“ sagt das Sheet selbst (Plan 0009, N3) */
  reachMode: ReachMode | undefined;
  /** Namensnennung der Wegzeit-Tabelle (E3); `undefined`, solange sie nicht geladen ist */
  transitSource: TransitSource | undefined;
  /** geöffnet über „Startpunkt wählen“: die Stadtteil-Auswahl bekommt den Fokus */
  focusOrigin: boolean;
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
      <div className="sheet-scroll">
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
        <OriginPicker api={origin} mode={reachMode} source={transitSource} focus={focusOrigin} />
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
      </div>
      <div className="sheetfoot single">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  );
}
