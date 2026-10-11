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
import { type RefObject, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPush } from "../../data/push.ts";
import { type InstallApi, installFoot, installHelp, type PushSupport, pushView } from "../../domain/pwa.ts";
import type { AppStepProps } from "../onboarding-types.ts";
import { PushControls } from "./PushControls.tsx";
import { APP_STEP_TEXTS, problemText, PUSH_TEXTS as T } from "./push-texts.ts";
import { mirrorData, usePushSwitch } from "./use-push-switch.ts";

/** Für den Flow des Onboardings (Plan 0033, E4): Der Lader reicht es als Prop weiter, kein Import aus dem Chunk. */
export { pushCapability } from "../../data/push.ts";

/** Ende des Onboardings (Plan 0034, E9): mit Abo einmal spiegeln, lokal und ohne Request */
export function syncPushMirror(): Promise<void> {
  return createPush().mirrorIfSubscribed(mirrorData());
}

/** Teilen-Symbol von iOS (Kasten mit Pfeil nach oben). Nur hier gebraucht, deshalb nicht in icons.tsx (Start-Bundle). */
function ShareIcon() {
  return (
    <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12M8 7l4-4 4 4M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10H16" />
    </svg>
  );
}

export function AppSection({
  install,
  done,
  retried,
}: {
  install: InstallApi;
  /** „Fertig“ im Fuß: Fokus-Ziel nach einem geglückten neuen Versuch, wenn der Abschnitt leer bleibt */
  done: RefObject<HTMLButtonElement | null>;
  /** geladen erst nach „Nochmal versuchen“: Der Knopf ist mit dem Fokus verschwunden (Arch-Review 0022, m1) */
  retried: boolean;
}) {
  const state = useSyncExternalStore(install.subscribe, install.state);
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
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

  useEffect(() => {
    if (retried && support) (title.current ?? done.current)?.focus({ preventScroll: true });
  }, [retried, support, done]);

  if (!support) return <div className="app-pending" aria-hidden="true" />;
  const view = pushView(state, support);
  if (!help && view.kind === "nichts") return null;
  return (
    <section className="app-section" aria-labelledby={heading}>
      <h3 id={heading} ref={title} tabIndex={-1}>
        Als App
      </h3>
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
 * Zusatz im Fuß des Kind-Sheets vor „Fertig“ (Plan 0022): im Zustand „angebot“ der Installationsknopf (dann primär,
 * „Fertig“ per CSS sekundär, `sheet.css`), auf iOS eine kompakte Zeile mit dem Teilen-Symbol, sonst nichts.
 */
export function AppFoot({ install, done }: { install: InstallApi; done: RefObject<HTMLButtonElement | null> }) {
  const foot = installFoot(useSyncExternalStore(install.subscribe, install.state));
  const kind = foot?.kind;
  // Verschwindet der Knopf mit dem Fokus (Tipp, aber auch `appinstalled` über das Browser-Menü), fiele der Fokus im
  // Modal auf <body>; „Fertig“ steht direkt darunter und bleibt (Arch-Review 0011 Stufe 1; Plan 0022, m6).
  // `preventScroll` wie zuvor im Abschnitt: Ein Scrollen in den Blick verschöbe sonst auch das Sheet selbst.
  const hadButton = useRef(false);
  useEffect(() => {
    if (hadButton.current && kind !== "knopf" && document.activeElement === document.body) {
      done.current?.focus({ preventScroll: true });
    }
    hadButton.current = kind === "knopf";
  }, [kind, done]);
  if (foot?.kind === "knopf") {
    return (
      <button type="button" className="btn primary wide foot-install" onClick={() => void install.prompt()}>
        {foot.button}
      </button>
    );
  }
  if (foot?.kind !== "ios") return null;
  // Pfeil verborgen und als „, dann“ vorgelesen wie in ReachLong.tsx (Arch-Review 0022, m2)
  return (
    <p className="foot-hint">
      {foot.before}{" "}
      <span className="share">
        <ShareIcon />
        {foot.share}
      </span>
      <span aria-hidden="true">{" → "}</span>
      <span className="sr-only">, dann </span>
      {foot.after}
    </p>
  );
}

/** Handy-Symbol am Installationsknopf des Onboardings (Mockup); nur hier gebraucht wie `ShareIcon` */
function PhoneIcon() {
  return (
    <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2" />
    </svg>
  );
}

/**
 * App-Schritt des Onboardings (Plan 0033, E8): Installation nach `parts.install` und Schalter „Wöchentliche Push-Nachricht“
 * nach `parts.push`. Die Teile rechnet der Flow live, aus „menue“ wird also der Knopf, sobald `beforeinstallprompt`
 * kommt. Gestaltet in der Chunk-CSS des Onboardings (`.onb-note`, `.onb .swrow`).
 */
export function AppStep({ install, parts, heading }: AppStepProps) {
  const kind = parts.install;
  // Verschwindet der Knopf mit dem Fokus (Tipp, `appinstalled`), fiele er im Modal auf <body>: dann die Überschrift
  const hadButton = useRef(false);
  useEffect(() => {
    if (hadButton.current && kind !== "knopf" && document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true });
    }
    hadButton.current = kind === "knopf";
  }, [kind, heading]);
  const foot = installFoot("angebot");
  const menu = installHelp("menue");
  const ios = installHelp("ios");
  return (
    <>
      {kind === "knopf" && foot?.kind === "knopf" && (
        <button type="button" className="btn wide" onClick={() => void install.prompt()}>
          <PhoneIcon />
          {foot.button}
        </button>
      )}
      {kind === "installiert" && <p className="hint ok">{APP_STEP_TEXTS.installed}</p>}
      {kind === "menue" && menu?.kind === "text" && <p>{menu.text}</p>}
      {kind === "ios" && ios?.kind === "ios" && (
        <p className="onb-note">
          {ios.before}{" "}
          <span className="share">
            <ShareIcon />
            {ios.share}
          </span>{" "}
          {ios.after}
        </p>
      )}
      {parts.push === "schalter" && <PushSwitch />}
      {parts.push === "nur-in-app" && <p className="small">{APP_STEP_TEXTS.iosNote}</p>}
      {parts.push === "verweigert" && <p className="small">{problemText("verweigert")}</p>}
    </>
  );
}

/**
 * Schalter im Onboarding: ohne Abgleich und ohne laufendes Spiegeln, Requests erst nach dem Tipp (ADR 0014, Punkt 4).
 * Ergebnisse in einer Statuszeile; „an“/„aus“ steht schon sichtbar im Untertitel und wird dort nur vorgelesen.
 */
function PushSwitch() {
  const [push] = useState(() => createPush());
  const { on, busy, result, toggle } = usePushSwitch(push, { reconcile: false });
  const label = useId();
  const sub =
    busy === "an" ? T.switching : busy === "aus" ? T.switchingOff : on ? APP_STEP_TEXTS.on : APP_STEP_TEXTS.off;
  const said = result && (result.kind === "an" || result.kind === "aus");
  return (
    <>
      <div className="swrow">
        <span className="swtext">
          <b id={label}>{T.switchLabel}</b>
          <small>{sub}</small>
        </span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={on === true}
          aria-labelledby={label}
          aria-busy={busy !== undefined}
          disabled={busy !== undefined || on === undefined}
          onClick={toggle}
        >
          <span className="track">
            <span className="knob" />
          </span>
        </button>
      </div>
      <p role="status" className="small">
        {result && (
          // `key`: neuer Textknoten je Ergebnis, damit ein wiederholtes Ergebnis erneut angesagt wird
          <span key={result.seq} className={said ? "sr-only" : undefined}>
            {result.kind === "an"
              ? APP_STEP_TEXTS.on
              : result.kind === "aus"
                ? APP_STEP_TEXTS.off
                : problemText(result.kind)}
          </span>
        )}
      </p>
    </>
  );
}
