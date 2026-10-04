/**
 * Kind-Sheet, Abschnitt „Entfernung ab“ (Plan 0004, E5): Startpunkt per Standort oder Stadtteil.
 * Der Zustand kommt aus `useOrigin` (use-app-state.ts); hier wird nur angezeigt und gewählt.
 */
import { useId } from "react";
import type { PositionProblem } from "../data/geolocation.ts";
import { DISTRICTS } from "../domain/districts.ts";
import { Icon } from "./icons.tsx";
import type { OriginApi } from "./use-app-state.ts";

const UNAVAILABLE = "Standort gerade nicht verfügbar. Wähle stattdessen einen Stadtteil.";
const PROBLEMS: Record<PositionProblem, string> = {
  denied: "Standort nicht freigegeben. Wähle stattdessen einen Stadtteil.",
  unavailable: UNAVAILABLE,
  timeout: UNAVAILABLE,
  outside: "Dein Standort liegt außerhalb von Nürnberg. Wähle einen Stadtteil.",
  // Ohne API erscheint der Knopf gar nicht; der Text ist nur die Rückfallebene.
  unsupported: UNAVAILABLE,
};

/**
 * Setzt das HTML-Attribut `autofocus`: Dann fokussiert `showModal()` die Auswahl selbst. Reacts
 * `autoFocus` hilft hier nicht, es fokussiert vor dem Öffnen des Dialogs und schreibt kein Attribut.
 */
function markAutofocus(el: HTMLSelectElement | null) {
  el?.setAttribute("autofocus", "");
}

export function OriginPicker({ api, focus }: { api: OriginApi; focus: boolean }) {
  const { origin, locating, problem } = api;
  const selectId = useId();
  const hint = problem
    ? { cls: "hint bad", text: PROBLEMS[problem] }
    : origin?.source === "standort"
      ? { cls: "hint ok", text: "Entfernung ab deinem Standort (auf ca. 100 m gerundet)." }
      : undefined;

  return (
    <section className="origin" aria-labelledby={`${selectId}-h`}>
      <h3 id={`${selectId}-h`}>Entfernung ab</h3>
      <p className="origin-now">
        {origin ? (
          <>
            Startpunkt: <b>{origin.label}</b>
          </>
        ) : (
          "Noch kein Startpunkt – dann zeigen wir keine Entfernung."
        )}
      </p>
      {api.canLocate && (
        <button type="button" className="btn wide" disabled={locating} onClick={api.locateMe}>
          <Icon name="compass" size={20} />
          {locating ? "Suche Standort …" : "Meinen Standort nutzen"}
        </button>
      )}
      <label className="field" htmlFor={selectId}>
        Stadtteil
      </label>
      <span className="select">
        <select
          id={selectId}
          ref={focus ? markAutofocus : undefined}
          className="input"
          // Beim Standort steht die Auswahl auf der leeren Option.
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
      {origin && (
        <button type="button" className="linkbtn" onClick={api.clear}>
          Startpunkt entfernen
        </button>
      )}
      {/* Eigene Live-Region im Dialog; die einzige role="status" der Seite bleibt die Statuszeile. */}
      <div aria-live="polite">{hint && <p className={hint.cls}>{hint.text}</p>}</div>
      <p className="small">
        Luftlinie, nicht die Fahrzeit. Dein Standort wird nicht gespeichert, ein Stadtteil bleibt auf diesem Gerät.
        Stadtteile: © OpenStreetMap-Mitwirkende.
      </p>
    </section>
  );
}
