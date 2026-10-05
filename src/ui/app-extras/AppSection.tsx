/**
 * Abschnitt „Als App“ im Kind-Sheet (Plan 0011, E7), Lazy-Chunk `assets/app/` über den Lader `src/ui/AppExtras.tsx`.
 * Den Zustand liefert `src/data/pwa.ts` (Geräte-APIs), die Texte `src/domain/pwa.ts`. Ohne Hilfe (Desktop ohne
 * Angebot) bleibt der Abschnitt leer. Ab Stufe 2 steht hier der Push-Schalter.
 *
 * Den Installationszustand reicht der Lader als `install` herein, statt ihn hier statisch zu importieren: Ein Lazy-Chunk mit
 * statischem Import eines anderen Lazy-Chunks lässt Vite den Preload-Helfer `__vite__mapDeps` in den Einstieg
 * schreiben (+0,11 kB Start-JS, gemessen in Plan 0011, „Umsetzung“, Schritt 4).
 */
import { useId, useRef, useSyncExternalStore } from "react";
import type { InstallApi } from "../../data/pwa.ts";
import { installHelp } from "../../domain/pwa.ts";

/** Teilen-Symbol von iOS (Kasten mit Pfeil nach oben). Nur hier gebraucht, deshalb nicht in icons.tsx (Start-Bundle). */
function ShareIcon() {
  return (
    <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" />
    </svg>
  );
}

export function AppSection({ install }: { install: InstallApi }) {
  const state = useSyncExternalStore(install.subscribe, install.state);
  const heading = useId();
  const text = useRef<HTMLParagraphElement>(null);
  const help = installHelp(state);
  // Nach dem Tipp verschwindet der Knopf mit dem Fokus. Ohne Ziel fiele der Fokus im Modal auf <body>; die Zeile
  // darüber sagt jetzt, wie es weitergeht (Arch-Review Stufe 1, gefunden mit den Gates für „installiert“).
  // `preventScroll`: Die Zeile steht, wo der Knopf war. Ein Scrollen in den Blick verschöbe sonst auch das Sheet selbst
  // (`overflow: hidden`), und der Kopf des Sheets wäre unerreichbar.
  const promptThenFocus = async () => {
    await install.prompt();
    text.current?.focus({ preventScroll: true });
  };
  if (!help) return null;
  return (
    <section className="app-section" aria-labelledby={heading}>
      <h3 id={heading}>Als App</h3>
      {help.kind === "ios" ? (
        <>
          <p className="app-text">
            {help.before}{" "}
            <span className="share">
              <ShareIcon />
              {help.share}
            </span>{" "}
            {help.after}
          </p>
          <p className="small">{help.note}</p>
        </>
      ) : (
        <p ref={text} className="app-text" tabIndex={-1}>
          {help.text}
        </p>
      )}
      {help.kind === "knopf" && (
        <button type="button" className="btn primary wide" onClick={() => void promptThenFocus()}>
          {help.button}
        </button>
      )}
    </section>
  );
}
