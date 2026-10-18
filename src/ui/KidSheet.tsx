/**
 * Kind-Sheet (Plan 0003, E11, E15; Plan 0004, E5; Plan 0009, E3): Geburtsdatum, Stadt (Plan 0039, E8), Startpunkt mit
 * Quellenhinweis der Wegzeit, Darstellung.
 * Der Fuß steht außerhalb des scrollenden Teils (Plan 0007, H7), mit dem Installationsknopf über „Fertig“ (Plan 0022).
 */
import { useId, useRef, useState } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import { ageInMonths } from "../domain/age.ts";
import { byPopulation, REGION_IDS, REGIONS } from "../domain/regions.ts";
import { IMPRINT_PATH } from "../domain/share.ts";
import type { TransitSource } from "../domain/transit-types.ts";
import { useAppExtras } from "./AppExtras.tsx";
import { BIRTH_DATE_INVALID, useBirthDateInput } from "./birth-date-input.ts";
import { markAutofocus } from "./Dialog.tsx";
import { plural } from "./format.ts";
import { Icon } from "./icons.tsx";
import { OriginPicker } from "./OriginPicker.tsx";
import type { CityApi, OriginApi } from "./use-app-state.ts";
import type { ReachMode } from "./use-transit.ts";

export function KidSheet({
  birthDate,
  onBirthDate,
  theme,
  onTheme,
  today,
  origin,
  cityApi,
  reachMode,
  transitSource,
  focusOrigin,
  onIntro,
  onClose,
}: {
  birthDate: string | undefined;
  onBirthDate: (iso: string | undefined) => void;
  theme: ThemeChoice;
  onTheme: (t: ThemeChoice) => void;
  today: string;
  origin: OriginApi;
  /** Stadt: Auswahl „Stadt“ über dem Startpunkt, ein Wechsel nur über `switchCity` (Plan 0039, E8) */
  cityApi: CityApi;
  /** Modus ab dem Startpunkt: „außerhalb“ sagt das Sheet selbst (Plan 0009, N3) */
  reachMode: ReachMode | undefined;
  /** Namensnennung der Wegzeit-Tabelle (E3); `undefined`, solange sie nicht geladen ist */
  transitSource: TransitSource | undefined;
  /** geöffnet über „Startpunkt wählen“: die Stadtteil-Auswahl bekommt den Fokus */
  focusOrigin: boolean;
  /** „Einführung ansehen“: Onboarding erneut (Plan 0033, E12) */
  onIntro: () => void;
  onClose: () => void;
}) {
  const input = useBirthDateInput(birthDate, today, onBirthDate);
  // Plan 0020, E3: Ist das Geburtsdatum schon gesetzt, fokussiert das Öffnen die Überschrift statt des Feldes (iOS
  // öffnete sonst jedes Mal die Tastatur). Nur dann fokussierbar: Ohne Autofokus nähme `showModal()` sonst die
  // Überschrift als erstes fokussierbares Element. Stand beim Öffnen; das Sheet wird je Öffnen neu gemountet.
  const [focusHeading] = useState(() => birthDate !== undefined && !focusOrigin);
  const hintId = useId();
  const hint = input.parsed
    ? {
        cls: "hint ok",
        text: `Dein Kind ist heute ${plural(ageInMonths(input.parsed, today), "Monat", "Monate")} alt.`,
      }
    : input.invalid
      ? { cls: "hint bad", text: BIRTH_DATE_INVALID }
      : { cls: "hint", text: "Ohne Geburtsdatum zeigen wir alle Angebote." };
  const themes: [ThemeChoice, string][] = [
    ["auto", "Automatisch"],
    ["hell", "Hell"],
    ["dunkel", "Dunkel"],
  ];
  const themeIndex = themes.findIndex(([t]) => t === theme);
  // Abschnitt „Als App“ und Fuß (Installationsknopf über „Fertig“, Plan 0022) aus der Lazy-Kette App-Extras
  const done = useRef<HTMLButtonElement>(null);
  const extras = useAppExtras(done);

  return (
    <div className="sheet-body">
      <div className="sheet-scroll">
        <div className="grab" />
        <h2 ref={focusHeading ? markAutofocus : undefined} tabIndex={focusHeading ? -1 : undefined}>
          Dein Zwerg
        </h2>
        <label className="field">
          Geburtsdatum
          <input
            className="input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="TT.MM.JJJJ"
            aria-describedby={hintId}
            value={input.text}
            onChange={input.onChange}
            onBlur={input.onBlur}
          />
        </label>
        <p id={hintId} className={hint.cls}>
          {hint.text}
        </p>
        <p className="small">Bleibt nur auf diesem Gerät. Unpassende Angebote blendet der Filter aus.</p>
        <CityPicker api={cityApi} />
        <OriginPicker
          api={origin}
          city={cityApi.city}
          network={cityApi.network}
          mode={reachMode}
          source={transitSource}
          focus={focusOrigin}
        />
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
        {extras.section}
        <p className="small">
          Alles noch einmal erklärt?{" "}
          <button type="button" className="linkbtn" onClick={onIntro}>
            Einführung ansehen
          </button>
        </p>
        {/* aus jedem Tab und auch im Lade- und Fehlerzustand erreichbar (Plan 0034, E3) */}
        <p className="small imprint">
          <a href={`${import.meta.env.BASE_URL}${IMPRINT_PATH}`}>Impressum und Datenschutz</a>
        </p>
      </div>
      <div className="sheetfoot">
        {extras.foot}
        <button ref={done} type="button" className="btn primary wide" onClick={onClose}>
          Fertig
        </button>
      </div>
    </div>
  );
}

/**
 * Abschnitt „Eure Stadt“ (Plan 0039, E8; Mockup Variante A): natives Auswahlfeld mit den Städten nach Einwohnern wie
 * die Kacheln im Onboarding. Ein Wechsel des Netzes löscht einen unpassenden Startpunkt (`switchCity`); das offene Sheet
 * lädt dann die Wegzeit-Tabelle des neuen Netzes (App.tsx).
 */
function CityPicker({ api }: { api: CityApi }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>Eure Stadt</h3>
      <label className="field" htmlFor={id}>
        Stadt
      </label>
      <span className="select">
        <select
          id={id}
          className="input"
          aria-describedby={`${id}-hint`}
          value={api.city}
          onChange={(e) => {
            const next = REGION_IDS.find((r) => r === e.target.value);
            if (next) api.switchCity(next);
          }}
        >
          {byPopulation(REGIONS).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <Icon name="down" size={20} />
      </span>
      <p id={`${id}-hint`} className="small">
        Zeigt Angebote, Stadtteile und Karte dieser Stadt. Nürnberg und Fürth gehören zusammen.
      </p>
    </section>
  );
}
