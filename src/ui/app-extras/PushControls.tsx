/**
 * Push-Teil im Abschnitt „Als App“ (Plan 0017, E6, E7): Schalter „Wöchentliche Push-Nachricht“ und die Geräte-Kennung.
 * Abonniert wird an den Glocken, verwaltet in `AboList` im Kind-Sheet (Plan 0054, E7). Statisch in `AppSection` (gleicher
 * Lazy-Chunk), ohne Props aus dem Start: Was gespiegelt wird, liest `mirrorData` bei jedem Rendern selbst. `KidSheet`
 * rendert den Abschnitt bei jeder Änderung neu, also spiegelt er ein entferntes Abo im selben Sheet sofort.
 *
 * Gespiegelt und abgeglichen wird nur hier (`usePushSwitch` mit `reconcile: true`), solange das Kind-Sheet offen ist
 * (kein Push-Code beim App-Start, E9).
 * Rückmeldungen stehen in einer Statuszeile statt im Toast der App (E7).
 */
import { useCallback, useEffect, useId, useState } from "react";
import type { PushApi } from "../../data/push.ts";
import type { PushSupport } from "../../domain/pwa.ts";
import { problemText, PUSH_TEXTS as T } from "./push-texts.ts";
import { usePushSwitch } from "./use-push-switch.ts";

export function PushControls({ push, support }: { push: PushApi; support: Extract<PushSupport, "ok" | "verweigert"> }) {
  const switchLabel = useId();
  const { on, busy, result, toggle } = usePushSwitch(push, { reconcile: true });
  const [deviceId, setDeviceId] = useState<string>();
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!on) {
      setDeviceId(undefined);
      return;
    }
    let live = true;
    void push
      .subscription()
      .then((sub) => sub && push.deviceId(sub.endpoint))
      .then((id) => {
        if (live) setDeviceId(id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [on, push]);

  /** Vor jedem neuen Text leeren, damit eine Live-Region denselben Text erneut ansagt (Runde 3 M2) */
  const say = useCallback((text: string) => {
    setStatus("");
    setTimeout(() => setStatus(text), 50);
  }, []);

  useEffect(() => {
    if (result) say(result.kind === "an" ? T.on : result.kind === "aus" ? T.off : problemText(result.kind));
  }, [result, say]);

  const sub =
    busy === "an" ? T.switching : busy === "aus" ? T.switchingOff : support === "verweigert" ? T.denied : T.switchSub;

  return (
    <div className="push-part">
      <div className="swrow">
        <span className="swtext">
          <b id={switchLabel}>{T.switchLabel}</b>
          <small>{sub}</small>
        </span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={on === true}
          aria-labelledby={switchLabel}
          aria-busy={busy !== undefined}
          disabled={busy !== undefined || on === undefined || (support === "verweigert" && !on)}
          onClick={toggle}
        >
          <span className="track">
            <span className="knob" />
          </span>
        </button>
      </div>

      <p role="status" className="small push-status">
        {status}
      </p>
      {on === false && <p className="small">{T.needsSwitch}</p>}
      {on && deviceId && (
        <p className="small">
          {T.device}: <code>{deviceId}</code>
        </p>
      )}
    </div>
  );
}
