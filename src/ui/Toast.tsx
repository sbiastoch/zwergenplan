import { Icon } from "./icons.tsx";

/** Live-Region bleibt immer im DOM, damit Screenreader neue Meldungen ansagen. */
export function Toast({ message }: { message: string }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {message && (
        <div className="toast">
          <span className="tk">
            <Icon name="check" size={18} />
          </span>
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
