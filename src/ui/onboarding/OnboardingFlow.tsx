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
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  appStepParts,
  ONBOARDING_TEXTS,
  onboardingSteps,
  primaryLabel,
  type StepId,
  stepOf,
  stepText,
  welcomeStats,
} from "../../domain/onboarding.ts";
import type { InstallApi } from "../../domain/pwa.ts";
import { useBirthDateInput } from "../birth-date-input.ts";
import type { OnboardingFlowProps } from "../onboarding-types.ts";
import { StepArt } from "./art.tsx";
import { AgeStep, CityStep, WayStep } from "./steps.tsx";
import "./onboarding.css";

const NO_INSTALL: InstallApi = { state: () => "keine", subscribe: () => () => {}, prompt: async () => {} };

export function OnboardingFlow(props: OnboardingFlowProps) {
  const { offers, now, today, app, finish, onEnd } = props;
  const install = app?.install ?? NO_INSTALL;
  const [push] = useState(() => app?.pushCapability() ?? "nein");
  const [steps] = useState<StepId[]>(() => onboardingSteps(install.state(), push));
  // live: Kommt `beforeinstallprompt` später, wird aus „menue“ der Knopf (E1)
  const installState = useSyncExternalStore(install.subscribe, install.state);
  const parts = appStepParts(installState, push);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // im Flow statt im Schritt: „Weiter“ hält bei ungültigem Datum an, der Text bleibt beim Blättern stehen
  const birth = useBirthDateInput(props.birthDate, today, props.onBirthDate);
  const stats = useMemo(() => offers && welcomeStats(offers, now), [offers, now]);
  const step = steps[index] ?? "stadt";
  const last = index === steps.length - 1;

  useEffect(() => {
    void index;
    const el = heading.current;
    el?.focus({ preventScroll: true });
    const dialog = el?.closest("dialog");
    if (dialog) dialog.scrollTop = 0;
  }, [index]);

  const text = stepText(step, { ...(stats && { stats }), ...(parts && { app: parts }) });
  /** „Später“ überspringt nur diesen Schritt und verwirft nichts; auf dem letzten Schritt endet es wie „Weiter“ */
  const later = () => (last ? onEnd("fertig") : setIndex(index + 1));
  const next = () => {
    // der Hinweis steht schon da (E6)
    if (step === "alter" && birth.invalid) field.current?.focus();
    else later();
  };

  return (
    <div className={`onb-flow onb-k-${step}`}>
      <div className="onb-stage">
        <div className="onb-topbar">
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
      <div className="onb-txt">
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
      <div className="onb-data">
        {step === "stadt" && <CityStep />}
        {step === "alter" && <AgeStep birth={birth} field={field} now={now} offers={offers} />}
        {step === "weg" && <WayStep {...props} />}
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
