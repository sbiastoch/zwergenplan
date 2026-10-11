/**
 * Onboarding beim ersten Öffnen (Plan 0033), Einstieg des Lazy-Chunks `assets/onboarding/` über den Lader
 * `../Onboarding.tsx` (`onboarding-ui-entry-only`). Stand S4: Gerüst mit allen Schritten und echten Eingaben, damit
 * Lazy-Kette, Budget und E2E (Tests 10, 12) gegen einen realistischen Chunk laufen. Illustrationen, Gestaltung und
 * die Aufteilung in `steps.tsx`/`art.tsx` kommen in S5.
 *
 * - Reihenfolge einmal beim Start (E1): Der Lader rendert den Flow erst, wenn Chunk, App-Teil und Daten feststehen.
 * - Fokus auf die Überschrift beim Mounten und je Schritt (E3, Review H3), samt `scrollTop = 0` des Dialogs.
 * - Der App-Teil kommt als Prop aus `assets/app/` (kein statischer Import zwischen zwei Lazy-Chunks, E4).
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ageInMonths } from "../../domain/age.ts";
import { DISTRICTS } from "../../domain/districts.ts";
import { withReachLimit } from "../../domain/filter.ts";
import {
  ageHint,
  appStepParts,
  cityChoices,
  LIMIT_CHOICES,
  nextAgeStep,
  ONBOARDING_TEXTS,
  onboardingSteps,
  primaryLabel,
  type StepId,
  stepOf,
  stepText,
  welcomeStats,
} from "../../domain/onboarding.ts";
import type { InstallApi } from "../../domain/pwa.ts";
import { REGIONS } from "../../domain/regions.ts";
import { BIRTH_DATE_INVALID, useBirthDateInput } from "../birth-date-input.ts";
import { limitReason, originHint } from "../format.ts";
import { Icon } from "../icons.tsx";
import type { OnboardingFlowProps } from "../onboarding-types.ts";
import "./onboarding.css";

const NO_INSTALL: InstallApi = { state: () => "keine", subscribe: () => () => {}, prompt: async () => {} };

export function OnboardingFlow(props: OnboardingFlowProps) {
  const { offers, now, app, finish, onEnd } = props;
  const install = app?.install ?? NO_INSTALL;
  const [steps] = useState<StepId[]>(() => onboardingSteps(install.state(), app?.pushCapability() ?? "nein"));
  const [push] = useState(() => app?.pushCapability() ?? "nein");
  // live: Kommt `beforeinstallprompt` später, wird aus „menue“ der Knopf (E1)
  const installState = useSyncExternalStore(install.subscribe, install.state);
  const parts = appStepParts(installState, push);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
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
  const next = () => (last ? onEnd("fertig") : setIndex(index + 1));

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
      </div>
      <div className="onb-txt">
        <p className="onb-kicker">{text.kicker}</p>
        <h2 ref={heading} className="onb-title" tabIndex={-1}>
          <span className="sr-only">{stepOf(index, steps.length)}</span>
          {text.title}
        </h2>
        <p className="onb-lead">{text.lead}</p>
      </div>
      <div className="onb-data">
        {step === "stadt" && <CityStep />}
        {step === "alter" && <AgeStep {...props} />}
        {step === "weg" && <WayStep {...props} />}
        {step === "app" && app && parts && <app.AppStep install={install} parts={parts} heading={heading} />}
      </div>
      <div className="onb-foot">
        <button type="button" className="btn primary wide" onClick={next}>
          {primaryLabel(index, steps.length, finish)}
        </button>
        {index > 0 && (
          <button type="button" className="later" onClick={next}>
            {ONBOARDING_TEXTS.later}
          </button>
        )}
      </div>
    </div>
  );
}

/** Stadt-Kacheln (E5): heute nur Nürnberg, vorgewählt; nichts wird gespeichert */
function CityStep() {
  const { tiles } = cityChoices(REGIONS);
  return (
    <>
      <p className="lbl">{ONBOARDING_TEXTS.cityLabel}</p>
      <fieldset className="onb-tiles" aria-label="Stadt">
        {tiles.map((t) => (
          <button key={t.id} type="button" className="onb-tile" aria-pressed="true">
            {t.name}
          </button>
        ))}
      </fieldset>
    </>
  );
}

/** Geburtsdatum wie im Kind-Sheet (E6) */
function AgeStep({ birthDate, today, now, offers, onBirthDate }: OnboardingFlowProps) {
  const input = useBirthDateInput(birthDate, today, onBirthDate);
  const { parsed } = input;
  const hint = parsed && ageHint(ageInMonths(parsed, now), offers && nextAgeStep(offers, parsed, now));
  return (
    <>
      <label className="lbl" htmlFor="onb-birth">
        {ONBOARDING_TEXTS.birthLabel}
      </label>
      <input
        id="onb-birth"
        className="input"
        inputMode="numeric"
        autoComplete="off"
        placeholder="TT.MM.JJJJ"
        aria-describedby="onb-birth-hint"
        value={input.text}
        onChange={input.onChange}
        onBlur={input.onBlur}
      />
      <p id="onb-birth-hint" className={hint ? "hint ok" : input.invalid ? "hint bad" : "small"}>
        {hint ?? (input.invalid ? BIRTH_DATE_INVALID : ONBOARDING_TEXTS.localOnly)}
      </p>
    </>
  );
}

/** Startpunkt und Wegzeit-Grenze (E7); das Anzeigen ist der Wegzeit-Anlass, nie die Wahl */
function WayStep({ originApi, transit, filter, setFilter }: OnboardingFlowProps) {
  const { want, mode } = transit;
  useEffect(() => want(), [want]);
  const { origin } = originApi;
  const note = originHint(originApi.problem, origin, mode);
  const reason = limitReason(mode);
  return (
    <>
      <div className="onb-row">
        {originApi.canLocate && (
          <button type="button" className="btn" aria-busy={originApi.locating} onClick={originApi.locateMe}>
            <Icon name="compass" size={20} />
            Standort
          </button>
        )}
        <select
          className="input"
          aria-label="Stadtteil"
          value={origin?.districtId ?? ""}
          onChange={(e) => originApi.setDistrict(e.target.value)}
        >
          <option value="" disabled>
            Stadtteil …
          </option>
          {DISTRICTS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <p aria-live="polite" className={note?.cls ?? "small"}>
        {note?.text}
      </p>
      <p className="lbl">{ONBOARDING_TEXTS.limitLabel}</p>
      <div className="onb-chips">
        {LIMIT_CHOICES.map(({ label, limit }) => (
          <button
            key={label}
            type="button"
            className="chip"
            aria-pressed={limit ? filter.reachLimit?.value === limit.value : !filter.reachLimit}
            disabled={limit !== undefined && reason !== undefined}
            onClick={() => setFilter(withReachLimit(filter, limit))}
          >
            {label}
          </button>
        ))}
      </div>
      {reason && <p className="small">{reason}</p>}
      <p className="small">{ONBOARDING_TEXTS.wayNote}</p>
    </>
  );
}
