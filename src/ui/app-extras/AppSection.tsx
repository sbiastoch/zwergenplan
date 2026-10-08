/**
 * Abschnitt „Als App“ im Kind-Sheet (Plan 0011, E7; Plan 0017, E7) und der Fuß des Sheets mit dem Installationsknopf
 * über „Fertig“ (`AppFoot`, Plan 0022), Lazy-Chunk `assets/app/` über den Lader
 * `src/ui/AppExtras.tsx`. Den Zustand liefert `src/data/pwa.ts` (Geräte-APIs), die Texte `src/domain/pwa.ts`.
 * Darunter der Push-Teil (`PushControls`) nach der Matrix `pushView`; ohne Hilfe und ohne Push bleibt der Abschnitt leer.
 *
 * Den Installationszustand reicht der Lader als `install` herein, statt ihn hier statisch zu importieren: Ein Lazy-Chunk mit
 * statischem Import eines anderen Lazy-Chunks lässt Vite den Preload-Helfer `__vite__mapDeps` in den Einstieg
 * schreiben (+0,11 kB Start-JS, gemessen in Plan 0011, „Umsetzung“, Schritt 4). Der Push-Code (`push.ts` und was
 * `PushControls` importiert) importiert nur dieser Chunk, also liegt er mit darin (Plan 0017, E9).
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPush } from "../../data/push.ts";
import type { InstallApi } from "../../data/pwa.ts";
import { installFoot, installHelp, type PushSupport, pushView } from "../../domain/pwa.ts";
import { PushControls } from "./PushControls.tsx";

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
  const [push] = useState(() => createPush());
  /** `undefined`, solange `pushSupport()` läuft (sofort, `getRegistration`); so lange steht der Platzhalter */
  const [support, setSupport] = useState<PushSupport>();
  const help = installHelp(state);

  useEffect(() => {
    let live = true;
    void push.support().then((s) => {
      if (live) setSupport(s);
    });
    return () => {
      live = false;
    };
  }, [push]);

  // Wartebedingung für E2E (Request-Zählungen, Mobile-UX-Gates): entschieden ist der Abschnitt in jedem Zweig, auch
  // wenn er leer bleibt. Beim Schließen des Sheets wieder weg, damit ein zweites Öffnen nicht schon „bereit“ ist.
  useEffect(() => {
    if (!support) return;
    const root = document.documentElement;
    root.dataset["push"] = "bereit";
    return () => {
      delete root.dataset["push"];
    };
  }, [support]);

  if (!support) return <div className="app-pending" aria-hidden="true" />;
  const view = pushView(state, support);
  if (!help && view.kind === "nichts") return null;
  return (
    <section className="app-section" aria-labelledby={heading}>
      <h3 id={heading}>Als App</h3>
      {help?.kind === "ios" ? (
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
        help && <p className="app-text">{help.text}</p>
      )}
      {view.kind === "teil" && (support === "ok" || support === "verweigert") && (
        <PushControls push={push} support={support} />
      )}
      {view.kind === "hinweis" && <p className="small">{view.text}</p>}
    </section>
  );
}

/**
 * Fuß des Kind-Sheets (Plan 0022): „Fertig“, darüber im Zustand „angebot“ der Installationsknopf (dann primär, „Fertig“
 * sekundär), auf iOS eine kompakte Zeile mit dem Teilen-Symbol. Bis der Chunk da ist, zeigt `KidSheet` nur „Fertig“.
 */
export function AppFoot({ install, onClose }: { install: InstallApi; onClose: () => void }) {
  const state = useSyncExternalStore(install.subscribe, install.state);
  const done = useRef<HTMLButtonElement>(null);
  const foot = installFoot(state);
  // Nach dem Tipp verschwindet der Knopf mit dem Fokus. Ohne Ziel fiele der Fokus im Modal auf <body>; „Fertig“ steht
  // direkt darunter und bleibt (Arch-Review 0011 Stufe 1; Plan 0022). `preventScroll` wie zuvor im Abschnitt: Ein
  // Scrollen in den Blick verschöbe sonst auch das Sheet selbst (`overflow: hidden`).
  const promptThenFocus = async () => {
    await install.prompt();
    done.current?.focus({ preventScroll: true });
  };
  return (
    <div className="sheetfoot single">
      {foot?.kind === "ios" && (
        <p className="foot-hint">
          {foot.before}{" "}
          <span className="share">
            <ShareIcon />
            {foot.share}
          </span>{" "}
          {foot.after}
        </p>
      )}
      {foot?.kind === "knopf" && (
        <button type="button" className="btn primary wide" onClick={() => void promptThenFocus()}>
          {foot.button}
        </button>
      )}
      <button
        ref={done}
        type="button"
        className={foot?.kind === "knopf" ? "btn wide" : "btn primary wide"}
        onClick={onClose}
      >
        Fertig
      </button>
    </div>
  );
}
