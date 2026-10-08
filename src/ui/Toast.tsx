import { Icon } from "./icons.tsx";

/**
 * Art einer Kurzmeldung (Browser-Review Plan 0028): `ok` mit grünem Häkchen, wenn etwas geklappt hat; `hint` ohne
 * Häkchen, wenn nichts passiert ist (nichts passt, Export nicht ladbar, Angebot weg).
 */
export type ToastTone = "ok" | "hint";

export interface ToastMessage {
  /** leer: kein Toast */
  text: string;
  tone: ToastTone;
}

export const NO_TOAST: ToastMessage = { text: "", tone: "ok" };

/**
 * Live-Region bleibt immer im DOM, damit Screenreader neue Meldungen ansagen. Ein Hinweis (`hint`) trägt statt des
 * grünen Häkchens ein gelbes Ausrufezeichen: Es ist nichts passiert (Browser-Review Plan 0028).
 */
export function Toast({ toast }: { toast: ToastMessage }) {
  const hint = toast.tone === "hint";
  return (
    <div aria-live="polite" aria-atomic="true">
      {toast.text && (
        <div className={hint ? "toast hint" : "toast"}>
          <span className="tk">
            <Icon name={hint ? "alert" : "check"} size={18} />
          </span>
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
