/**
 * Onboarding beim ersten Öffnen (Plan 0033), Einstieg des Lazy-Chunks `assets/onboarding/` über den Lader
 * `../Onboarding.tsx` (`onboarding-ui-entry-only`). Vollbild mit einem Punkt je Schritt: Bühne mit Illustration
 * (`art.tsx`), Kicker, Überschrift, Lead, Eingabe (`steps.tsx` bzw. `AppStep` aus dem App-Chunk), unten Hauptknopf und
 * „Später“. Gestaltung und Texte nach dem freigegebenen Mockup `docs/design/onboarding-mockup.html`.
 *
 * - Reihenfolge einmal beim Start (E1): Der Lader rendert den Flow erst, wenn Chunk, App-Teil und Daten feststehen.
 * - Fokus auf die Überschrift beim Mounten und je Schritt (E3, Review H3), samt `scrollTop = 0` des Dialogs. Zusätzlich
 *   `autofocus` für den Modus „manuell“, in dem der Flow vor `showModal()` montiert (Review 2, M-1).
 * - Der App-Teil kommt als Prop aus `assets/app/` (kein statischer Import zwischen zwei Lazy-Chunks, E4).
 * - Beim Unmount einmal `app.syncPush()`: Ein laufendes Abo bekommt die im Onboarding geänderten Angaben (Plan 0035, E9).
 * - Wischen (Plan 0035, E10): Pointer Events auf `.onb-flow`, nur Touch und Stift; nach links wie der Hauptknopf (außer
 *   auf dem letzten Schritt), nach rechts zurück. Danach gleitet der neue Schritt aus der Wischrichtung herein.
 * - Zurück ohne Geste: ab Schritt 2 der Knopf „Zurück“ links in der Kopfzeile; die Punkte sind reine Anzeige
 *   (Nachtrag Plan 0035, 2026-10-11, ersetzt die Punkt-Knöpfe aus E11).
 */
import { type PointerEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  appStepParts,
  ONBOARDING_TEXTS,
  onboardingSteps,
  primaryLabel,
  type StepId,
  type SwipeStep,
  stepOf,
  stepText,
  swipeStep,
  welcomeStats,
} from "../../domain/onboarding.ts";
import type { InstallApi } from "../../domain/pwa.ts";
import { networkOf, type RegionId } from "../../domain/regions.ts";
import { offersInNetwork } from "../../domain/site-data.ts";
import { useBirthDateInput } from "../birth-date-input.ts";
import { Icon } from "../icons.tsx";
import type { OnboardingFlowProps } from "../onboarding-types.ts";
import { StepArt } from "./art.tsx";
import { AgeStep, CityStep, WayStep } from "./steps.tsx";
import "./onboarding.css";

const NO_INSTALL: InstallApi = { state: () => "keine", subscribe: () => () => {}, prompt: async () => {} };

/** Gesten, die in Eingaben, Schaltern oder horizontal scrollbaren Bereichen beginnen, gehören diesen (E10) */
function ownsGesture(target: EventTarget, root: Element): boolean {
  if (!(target instanceof Element) || target.closest("input, select, textarea, [role='switch']")) return true;
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    const { overflowX } = getComputedStyle(el);
    if ((overflowX === "auto" || overflowX === "scroll") && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

export function OnboardingFlow(props: OnboardingFlowProps) {
  const { offers, now, today, app, finish, onEnd, cityApi } = props;
  const install = app?.install ?? NO_INSTALL;
  const [push] = useState(() => app?.pushCapability() ?? "nein");
  const [steps] = useState<StepId[]>(() => onboardingSteps(install.state(), push));
  // live: Kommt `beforeinstallprompt` später, wird aus „menue“ der Knopf (E1)
  const installState = useSyncExternalStore(install.subscribe, install.state);
  const parts = appStepParts(installState, push);
  const [index, setIndex] = useState(0);
  // Stadtwahl (Plan 0039, E8): Vorauswahl die gespeicherte Stadt, ohne sie Nürnberg (`cityFrom`), nicht die größte
  // Kachel. Gespeichert wird beim Weitergehen über `switchCity`, auch im erneut gestarteten Onboarding.
  const [city, setCity] = useState<RegionId>(cityApi.city);
  // Schritt, auf den gewischt wurde, und die Richtung: nur dort gleitet er herein (E10)
  const [slide, setSlide] = useState<{ at: number; dir: SwipeStep }>();
  const touch = useRef<{ id: number; x: number; y: number }>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // im Flow statt im Schritt: „Weiter“ hält bei ungültigem Datum an, der Text bleibt beim Blättern stehen
  const birth = useBirthDateInput(props.birthDate, today, props.onBirthDate);
  // Willkommenszahl über alle Angebote, gefiltert auf das Netz der angetippten Kachel (Plan 0039, E7; Review 2, m5)
  const stats = useMemo(() => {
    const network = networkOf(city);
    return offers && welcomeStats(offersInNetwork(offers, network), now);
  }, [offers, now, city]);
  const step = steps[index] ?? "stadt";
  // Ende des Onboardings (jede Art: fertig, Überspringen, Esc, erneuter Aufruf): einmal spiegeln (Plan 0035, E9)
  const appRef = useRef(app);
  useEffect(() => () => void appRef.current?.syncPush().catch(() => {}), []);
  const last = index === steps.length - 1;

  useEffect(() => {
    void index;
    const el = heading.current;
    el?.focus({ preventScroll: true });
    const dialog = el?.closest("dialog");
    if (dialog) dialog.scrollTop = 0;
  }, [index]);

  const textOf = (s: StepId, i: number) =>
    stepText(s, { first: i === 0, ...(stats && { stats }), ...(parts && { app: parts }) });
  const text = textOf(step, index);
  /** Knöpfe und Punkte: ohne Gleiten */
  const go = (i: number) => {
    setSlide(undefined);
    setIndex(i);
  };
  /**
   * „Später“ überspringt nur diesen Schritt und verwirft nichts; auf dem letzten Schritt endet es wie „Weiter“. Jeder
   * Weg vorwärts (Knopf, „Später“, Wischen) aus dem Schritt „Stadt“ speichert die Wahl (Plan 0039, E8); der Schritt
   * „Weg“ zeigt danach Stadtteile und Wegzeit des neuen Netzes.
   */
  const later = () => {
    if (step === "stadt" && city !== cityApi.city) cityApi.switchCity(city);
    if (last) onEnd("fertig");
    else go(index + 1);
  };
  // der Hinweis steht schon da (E6)
  const blocked = step === "alter" && birth.invalid;
  const next = () => (blocked ? field.current?.focus() : later());

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    touch.current = undefined;
    // Maus nicht: Ziehen markiert dort Text, und der Desktop hat die Knöpfe
    if ((e.pointerType !== "touch" && e.pointerType !== "pen") || !e.isPrimary) return;
    if (!ownsGesture(e.target, e.currentTarget)) touch.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = touch.current;
    touch.current = undefined;
    if (start?.id !== e.pointerId) return;
    const dir = swipeStep({ x0: start.x, y0: start.y, x1: e.clientX, y1: e.clientY, width: window.innerWidth });
    // Wischen beendet nie: Der Abschluss bleibt ein bewusster Tipp
    if (dir === "weiter" && !last) {
      next();
      if (!blocked) setSlide({ at: index + 1, dir });
    } else if (dir === "zurueck" && index > 0) {
      setIndex(index - 1);
      setSlide({ at: index - 1, dir });
    }
  };
  // `key={index}` baut Text und Eingabe je Schritt neu, sonst liefe die Animation beim zweiten Wischer nicht erneut
  const slideClass = slide?.at === index ? ` onb-in-${slide.dir === "weiter" ? "vor" : "zurueck"}` : "";

  return (
    <div
      className={`onb-flow onb-k-${step}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        // der Browser hat die Geste übernommen (vertikales Scrollen)
        touch.current = undefined;
      }}
    >
      <div className="onb-stage">
        <div className="onb-topbar">
          {index > 0 ? (
            <button type="button" className="onb-back" onClick={() => go(index - 1)}>
              <Icon name="back" size={20} />
              {ONBOARDING_TEXTS.back}
            </button>
          ) : (
            // Platzhalter gleicher Breite: Die Punkte bleiben auf jedem Schritt an ihrer Stelle
            <span className="onb-back" aria-hidden="true">
              <Icon name="back" size={20} />
              {ONBOARDING_TEXTS.back}
            </span>
          )}
          <div className="onb-dots" aria-hidden="true">
            {steps.map((s, i) => (
              <i key={s} className={i === index ? "on" : i < index ? "done" : undefined} />
            ))}
          </div>
          <button type="button" className="onb-skip" onClick={() => onEnd("abbruch")}>
            {ONBOARDING_TEXTS.skip}
          </button>
        </div>
        <StepArt key={step} step={step} />
      </div>
      <div key={`t${index}`} className={`onb-txt${slideClass}`}>
        <p className="onb-kicker">{text.kicker}</p>
        <h2
          ref={(el) => {
            heading.current = el;
            // wie `markAutofocus` (Dialog.tsx), ohne weiteren Export aus dem Start
            el?.setAttribute("autofocus", "");
          }}
          className="onb-title"
          tabIndex={-1}
        >
          <span className="sr-only">{stepOf(index, steps.length)}</span>
          {text.title}
        </h2>
        <p className="onb-lead">{text.lead}</p>
      </div>
      <div key={`d${index}`} className={`onb-data${slideClass}`}>
        {step === "stadt" && <CityStep city={city} onCity={setCity} />}
        {step === "alter" && <AgeStep birth={birth} field={field} now={now} />}
        {step === "weg" && <WayStep {...props} city={city} />}
        {step === "app" && app && parts && <app.AppStep install={install} parts={parts} heading={heading} />}
      </div>
      <div className="onb-foot">
        <button type="button" className="btn primary wide" onClick={next}>
          {primaryLabel(index, steps.length, finish)}
        </button>
        {index > 0 && (
          <button type="button" className="later" onClick={later}>
            {ONBOARDING_TEXTS.later}
          </button>
        )}
      </div>
    </div>
  );
}
