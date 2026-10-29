/**
 * Kind-Sheet (Plan 0003, E11, E15; Plan 0004, E5; Plan 0009, E3): Geburtsdatum, Startpunkt mit
 * Quellenhinweis der Wegzeit, Darstellung, Abschnitt „Als App“ und die Verwaltung der Abos (Plan 0054, E7).
 * Der Fuß steht außerhalb des scrollenden Teils (Plan 0007, H7), mit dem Installationsknopf über „Fertig“ (Plan 0022).
 */
import { useId, useRef, useState } from "react";
import type { ThemeChoice } from "../data/preferences.ts";
import { ageInMonths } from "../domain/age.ts";
import { filterFromSearch } from "../domain/filter.ts";
import { IMPRINT_PATH } from "../domain/share.ts";
import type { TransitSource } from "../domain/transit-types.ts";
import { useAppExtras } from "./AppExtras.tsx";
import { BIRTH_DATE_INVALID, useBirthDateInput } from "./birth-date-input.ts";
import { markAutofocus } from "./Dialog.tsx";
import { plural, searchLabel } from "./format.ts";
import { OriginPicker } from "./OriginPicker.tsx";
import type { OriginApi } from "./use-app-state.ts";
import type { ReachMode } from "./use-transit.ts";

/** Abos für die Verwaltung im Kind-Sheet (Plan 0054, E7), aus dem State der App */
export interface AboListProps {
  searches: readonly string[];
  providers: readonly string[];
  /** Name aus den geladenen Angeboten; `undefined`: kein kommendes Angebot */
  providerName: (providerId: string) => string | undefined;
  /** Angebote geladen? Sonst steht kein Name, auch nicht „ohne aktuelle Angebote“ (Review 2, Nr. 3) */
  ready: boolean;
  /** gespeicherter Startpunkt da? Sonst wirkt die Wegzeit eines Such-Abos nicht */
  hasOrigin: boolean;
  removeSearch: (search: string) => void;
  removeProvider: (providerId: string) => void;
}

/**
 * Verwaltung der Abos (Plan 0054, E7): Such- und Anbieter-Abos mit „Entfernen“. Im Start, damit sie auch ohne Push
 * und offline da ist; abonniert wird an der Glocke. Spiegeln braucht es hier nicht, das macht der Push-Teil des
 * Sheets nach jedem Rendern.
 */
function AboList({ abos, birthDate }: { abos: AboListProps; birthDate: string | undefined }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const removed = (action: () => void) => {
    action();
    // Der Knopf verschwindet mit der Zeile; ohne Ziel fiele der Fokus im Modal auf <body>
    heading.current?.focus({ preventScroll: true });
  };
  const empty = abos.searches.length === 0 && abos.providers.length === 0;
  return (
    <section className="abo-list" aria-labelledby="abo-h">
      <h3 id="abo-h" ref={heading} tabIndex={-1}>
        Deine Abos
      </h3>
      {empty ? (
        <p className="small">
          Noch keine. Tippe auf die Glocke bei einem Anbieter oder über der Liste.{" "}
          {birthDate ? "Bis dahin zählt in der Push-Nachricht nur das Alter." : "Bis dahin kommen alle neuen Angebote."}
        </p>
      ) : (
        <ul className="push-list">
          {abos.providers.map((id) => {
            const name = abos.ready ? (abos.providerName(id) ?? "Anbieter ohne aktuelle Angebote") : "Anbieter-Abo";
            return (
              <li key={`a:${id}`}>
                <span className="push-label">
                  {name}
                  <small>Anbieter</small>
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Abo ${name} beenden`}
                  onClick={() => removed(() => abos.removeProvider(id))}
                >
                  Entfernen
                </button>
              </li>
            );
          })}
          {abos.searches.map((search) => {
            const label = searchLabel(search);
            return (
              <li key={`s:${search}`}>
                <span className="push-label">
                  {label}
                  <small>
                    Suche
                    {!abos.hasOrigin && filterFromSearch(search).reachLimit && " · Wegzeit wirkt ab einem Startpunkt"}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Such-Abo ${label} beenden`}
                  onClick={() => removed(() => abos.removeSearch(search))}
                >
                  Entfernen
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function KidSheet({
  abos,
  birthDate,
  onBirthDate,
  theme,
  onTheme,
  today,
  origin,
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
  /** Modus ab dem Startpunkt: „außerhalb“ sagt das Sheet selbst (Plan 0009, N3) */
  reachMode: ReachMode | undefined;
  /** Namensnennung der Wegzeit-Tabelle (E3); `undefined`, solange sie nicht geladen ist */
  transitSource: TransitSource | undefined;
  /** geöffnet über „Startpunkt wählen“: die Stadtteil-Auswahl bekommt den Fokus */
  focusOrigin: boolean;
  /** „Einführung ansehen“: Onboarding erneut (Plan 0033, E12) */
  onIntro: () => void;
  onClose: () => void;
  abos: AboListProps;
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
        {extras.section}
        <AboList abos={abos} birthDate={birthDate} />
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
