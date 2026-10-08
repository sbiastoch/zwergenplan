/**
 * Kind-Sheet, Abschnitt „Wegzeit ab“ (Plan 0004, E5; Plan 0009, E1/E3): Startpunkt per Standort oder Stadtteil,
 * darunter der Quellenhinweis der Wegzeit. Ist der Standort aktiv, fehlt die Stadtteil-Auswahl; zurück geht es über
 * „Startpunkt entfernen“ (Plan 0022). Der Zustand kommt aus `useOrigin` (use-app-state.ts); hier wird nur
 * angezeigt und gewählt.
 */
import { useId, useRef } from "react";
import { flushSync } from "react-dom";
import { DISTRICTS } from "../domain/districts.ts";
import type { TransitSource } from "../domain/transit-types.ts";
import { markAutofocus } from "./Dialog.tsx";
import { originHint, transitSourceNote } from "./format.ts";
import { Icon } from "./icons.tsx";
import type { OriginApi } from "./use-app-state.ts";
import type { ReachMode } from "./use-transit.ts";

export function OriginPicker({
  api,
  mode,
  source,
  focus,
}: {
  api: OriginApi;
  /** Modus der Anzeige ab dem Startpunkt (useTransit) */
  mode: ReachMode | undefined;
  source: TransitSource | undefined;
  focus: boolean;
}) {
  const { origin, locating } = api;
  const selectId = useId();
  const hint = originHint(api.problem, origin, mode);
  const located = origin?.source === "standort";
  const select = useRef<HTMLSelectElement>(null);
  // Autofokus beim Öffnen über „Startpunkt wählen“: die Auswahl, bei aktivem Standort der Standort-Knopf, ohne ihn
  // „Startpunkt entfernen“ (Plan 0022). Sonst nähme `showModal()` das erste fokussierbare Element.
  const focusOn = !focus ? undefined : !located ? "select" : api.canLocate ? "locate" : "clear";

  return (
    <section className="origin" aria-labelledby={`${selectId}-h`}>
      <h3 id={`${selectId}-h`}>Wegzeit ab</h3>
      <p className="origin-now">
        {origin ? (
          <>
            Startpunkt: <b>{origin.label}</b>
          </>
        ) : (
          "Noch kein Startpunkt – dann zeigen wir keine Wegzeit."
        )}
      </p>
      {api.canLocate && (
        // `aria-busy` statt `disabled`: Ein gesperrter Knopf verlöre den Fokus an <body>. Ein Tipp während der
        // Suche tut nichts; die Abfrage endet spätestens nach 15 s (geolocation.ts).
        <button
          type="button"
          className="btn wide"
          ref={focusOn === "locate" ? markAutofocus : undefined}
          aria-busy={locating}
          onClick={locating ? undefined : api.locateMe}
        >
          <Icon name="compass" size={20} />
          {locating ? "Suche Standort …" : located ? "Standort aktualisieren" : "Meinen Standort nutzen"}
        </button>
      )}
      {!located && (
        <>
          <label className="field" htmlFor={selectId}>
            Stadtteil
          </label>
          <span className="select">
            <select
              id={selectId}
              ref={(el) => {
                select.current = el;
                if (focusOn === "select") markAutofocus(el);
              }}
              className="input"
              // Bei der Kartenmitte steht die Auswahl auf der leeren Option.
              value={origin?.districtId ?? ""}
              onChange={(e) => api.setDistrict(e.target.value)}
            >
              <option value="" disabled>
                Stadtteil wählen …
              </option>
              {DISTRICTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <Icon name="down" size={20} />
          </span>
        </>
      )}
      {origin && (
        <button
          type="button"
          className="linkbtn"
          ref={focusOn === "clear" ? markAutofocus : undefined}
          // Der Knopf verschwindet mit dem Fokus (im Modal sonst <body>); die Auswahl steht danach wieder da und
          // übernimmt ihn (Plan 0022). `flushSync`, damit sie beim Fokussieren schon im DOM ist.
          onClick={() => {
            flushSync(api.clear);
            select.current?.focus({ preventScroll: true });
          }}
        >
          Startpunkt entfernen
        </button>
      )}
      {/* Eigene Live-Region im Dialog; die einzige role="status" der Seite bleibt die Statuszeile. */}
      <div aria-live="polite">{hint && <p className={hint.cls}>{hint.text}</p>}</div>
      <p className="small source-note">
        {transitSourceNote(source).map((part) =>
          typeof part === "string" ? (
            part
          ) : (
            <a
              key={part.href}
              href={part.href}
              target="_blank"
              rel="noopener"
              className={part.nowrap ? "nowrap" : undefined}
            >
              {part.text}
            </a>
          ),
        )}{" "}
        Dein Startpunkt bleibt nur auf diesem Gerät (ein Standort auf ca. 100 m gerundet). Stadtteile: ©
        OpenStreetMap-Mitwirkende.
      </p>
    </section>
  );
}
