import { Icon } from "./icons.tsx";

/**
 * Art einer Kurzmeldung (Browser-Review Plan 0028): `ok` mit grünem Häkchen, wenn etwas geklappt hat; `hint` ohne
 * Häkchen, wenn nichts passiert ist (nichts passt, Export nicht ladbar, Angebot weg).
 */
export type ToastTone = "ok" | "hint";

/** Knopf im Toast (Plan 0057, E3), etwa „Rückgängig“ */
interface ToastAction {
  label: string;
  /** schließt den Toast und führt die Aktion aus */
  run: () => void;
  /** Fokus am Knopf: Die Zeit läuft nicht ab (`true`), nach dem Blur beginnt sie neu (`false`) */
  hold: (paused: boolean) => void;
}

export interface ToastMessage {
  /** leer: kein Toast */
  text: string;
  tone: ToastTone;
  action?: ToastAction;
}

export const NO_TOAST: ToastMessage = { text: "", tone: "ok" };

/**
 * Live-Region bleibt immer im DOM, damit Screenreader neue Meldungen ansagen. Ein Hinweis (`hint`) trägt statt des
 * grünen Häkchens ein gelbes Ausrufezeichen: Es ist nichts passiert (Browser-Review Plan 0028).
 * Ein Toast mit Aktion (Plan 0057, E3) steht links und schmaler, nie über der Herz-Spalte; nur sein Knopf fängt Tipps.
 * Der Fokus wird beim Erscheinen nicht verschoben.
 */
export function Toast({ toast }: { toast: ToastMessage }) {
  const hint = toast.tone === "hint";
  const { action } = toast;
  return (
    <div aria-live="polite" aria-atomic="true">
      {toast.text && (
        <div className={`toast${hint ? " hint" : ""}${action ? " has-action" : ""}`}>
          <span className="tk">
            <Icon name={hint ? "alert" : "check"} size={18} />
          </span>
          <span className="toast-text">{toast.text}</span>
          {action && (
            <button
              type="button"
              className="toast-action"
              onClick={action.run}
              onFocus={() => action.hold(true)}
              onBlur={() => action.hold(false)}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
