/**
 * Schalter der Samstags-Nachricht (Plan 0033, E8), aus `PushControls` herausgezogen, damit das Onboarding ihn ohne
 * Duplikat nutzt. Texte macht jede Oberfläche selbst aus `result`; `seq` zählt hoch, damit ein wiederholtes Ergebnis
 * erneut angesagt wird.
 *
 * - `reconcile: true` (Kind-Sheet, Plan 0017, E6): Abgleich beim Mount, Spiegeln nach jedem Rendern bei `on`.
 * - `reconcile: false` (Onboarding): Anfangszustand nur aus `push.subscription()` (lokal, kein Request), kein Abgleich,
 *   kein laufendes Spiegeln. Requests entstehen erst nach dem Tipp (ADR 0014, Punkt 4).
 */
import { useEffect, useState } from "react";
import { loadBirthDate, loadOriginDistrict, loadOriginPoint } from "../../data/preferences.ts";
import { type MirrorData, type PushApi, PushError, type PushProblem } from "../../data/push.ts";
import { loadSearchesRaw } from "../../data/searches-store.ts";

export type PushSwitchResult = { kind: "an" | "aus" | PushProblem; seq: number };

/** Angaben aus dem Speicher, wie sie gespiegelt werden; auch für `syncPushMirror` am Ende des Onboardings (Plan 0034, E9) */
export function mirrorData(): MirrorData {
  return {
    birthDate: loadBirthDate(),
    searches: loadSearchesRaw(),
    // Punkt zuerst wie `useOrigin`; gespeichert ist ohnehin höchstens eins (ADR 0017)
    origin: loadOriginPoint() ?? loadOriginDistrict(),
  };
}

export function usePushSwitch(
  push: PushApi,
  { reconcile }: { reconcile: boolean },
): {
  /** `undefined`, bis der Anfangszustand feststeht */
  on: boolean | undefined;
  busy: "an" | "aus" | undefined;
  result: PushSwitchResult | undefined;
  toggle: () => void;
} {
  const [on, setOn] = useState<boolean>();
  const [busy, setBusy] = useState<"an" | "aus">();
  const [result, setResult] = useState<PushSwitchResult>();
  const report = (kind: PushSwitchResult["kind"]) => setResult((prev) => ({ kind, seq: (prev?.seq ?? 0) + 1 }));

  // Abgleich beim Öffnen (Plan 0017, E6): ausgetauschtes Abo neu melden, fehlendes Abo → aus
  useEffect(() => {
    let live = true;
    const initial = reconcile ? push.reconcile(mirrorData()) : push.subscription().then((sub) => sub !== undefined);
    void initial
      .catch(() => false)
      .then((isOn) => {
        if (live) setOn(isOn);
      });
    return () => {
      live = false;
    };
  }, [push, reconcile]);

  // Spiegeln nach jedem Rendern; `mirror` schreibt nur, was sich geändert hat
  useEffect(() => {
    if (reconcile && on) void push.mirror(mirrorData()).catch(() => undefined);
  });

  const toggle = () => {
    if (on) {
      setBusy("aus");
      void push
        .disable()
        .then(() => {
          setOn(false);
          report("aus");
        })
        // Geräte-Speicher kaputt: Der Schalter zeigt, ob noch ein Abo läuft (Arch-Review N2)
        .catch(() =>
          push
            .subscription()
            .then((sub) => setOn(sub !== undefined))
            .catch(() => undefined),
        )
        .finally(() => setBusy(undefined));
      return;
    }
    setBusy("an");
    // `requestPermission` ist das erste `await` in `enable`, noch im Tipp (iOS, Plan 0011 E12)
    void push
      .enable(mirrorData())
      .then(() => {
        setOn(true);
        report("an");
      })
      .catch((error: unknown) => {
        setOn(false);
        report(error instanceof PushError ? error.problem : "abo");
      })
      .finally(() => setBusy(undefined));
  };

  return { on, busy, result, toggle };
}
