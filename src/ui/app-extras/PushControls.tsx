/**
 * Push-Teil im Abschnitt „Als App“ (Plan 0017, E6, E7): Schalter „Wochen-Nachricht“, „Aktuelle Suche abonnieren“,
 * die Liste der Such-Abos und die Geräte-Kennung. Statisch in `AppSection` (gleicher Lazy-Chunk), ohne Props aus dem
 * Start: Geburtsdatum, Startpunkt und die Suche der Liste liest die Komponente bei jedem Rendern selbst. `KidSheet`
 * rendert den Abschnitt bei jeder Änderung neu, also sieht sie eine Änderung im selben Sheet sofort.
 *
 * Gespiegelt und abgeglichen wird nur hier (`usePushSwitch` mit `reconcile: true`), solange das Kind-Sheet offen ist
 * (kein Push-Code beim App-Start, E9).
 * Rückmeldungen stehen in einer Statuszeile statt im Toast der App (E7).
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { loadBirthDate, loadOriginDistrict, loadOriginPoint } from "../../data/preferences.ts";
import type { PushApi } from "../../data/push.ts";
import { loadSearchesRaw, saveSearches } from "../../data/searches-store.ts";
import { filterFromSearch } from "../../domain/filter.ts";
import type { PushSupport } from "../../domain/pwa.ts";
import { addSearch, parseSearches, removeSearch, searchOf } from "../../domain/searches.ts";
import { originFromStored } from "../../domain/stored-origin.ts";
import { problemText, searchLabel, PUSH_TEXTS as T } from "./push-texts.ts";
import { usePushSwitch } from "./use-push-switch.ts";

export function PushControls({ push, support }: { push: PushApi; support: Extract<PushSupport, "ok" | "verweigert"> }) {
  const switchLabel = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  const { on, busy, result, toggle } = usePushSwitch(push, { reconcile: true });
  const [deviceId, setDeviceId] = useState<string>();
  const [list, setList] = useState(() => parseSearches(loadSearchesRaw()));
  const [status, setStatus] = useState("");

  // ohne Zeitraum: Such-Abos lassen ihn weg (Plan 0023, E12)
  const current = searchOf(filterFromSearch(location.search));
  const pressed = current !== "" && list.includes(current);
  // dieselbe Prüfung wie im Service Worker: ein Punkt außerhalb der Stadt zählt nicht (Arch-Review N1)
  const hasOrigin = originFromStored(loadOriginPoint() ?? loadOriginDistrict()) !== undefined;

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

  const store = (next: string[]) => {
    saveSearches(next);
    setList(next);
  };

  const toggleCurrent = () => {
    if (pressed) {
      store(removeSearch(list, current));
      say(T.removed);
      return;
    }
    const filter = filterFromSearch(current);
    const result = addSearch(list, filter);
    if (result.outcome === "voll") return say(T.full);
    if (result.outcome !== "neu") return;
    store(result.list);
    say(filter.reachLimit && !hasOrigin ? T.addedNoOrigin : on ? T.added : T.addedOff);
  };

  const remove = (search: string) => {
    store(removeSearch(list, search));
    say(T.removed);
    // Der Knopf verschwindet mit der Zeile; ohne Ziel fiele der Fokus im Modal auf <body> (wie in AppSection)
    listHeading.current?.focus({ preventScroll: true });
  };

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

      <h4 className="push-h">{T.current}</h4>
      {current ? (
        <div className="push-current">
          <p className="push-label">{searchLabel(current)}</p>
          <div className="push-row">
            <button type="button" className="btn" aria-pressed={pressed} onClick={toggleCurrent}>
              {T.subscribe}
            </button>
            {pressed && <span className="push-done">{T.subscribed}</span>}
          </div>
        </div>
      ) : (
        <p className="small">{T.emptyFilter}</p>
      )}
      <p role="status" className="small push-status">
        {status}
      </p>

      <h4 className="push-h" ref={listHeading} tabIndex={-1}>
        {T.listHeading}
      </h4>
      {list.length === 0 ? (
        <p className="small">{loadBirthDate() ? T.noneWithAge : T.noneWithoutAge}</p>
      ) : (
        <ul className="push-list">
          {list.map((search) => {
            const label = searchLabel(search);
            return (
              <li key={search}>
                <span className="push-label">
                  {label}
                  {!hasOrigin && filterFromSearch(search).reachLimit && <small>{T.needsOrigin}</small>}
                </span>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Such-Abo ${label} entfernen`}
                  onClick={() => remove(search)}
                >
                  {T.remove}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!on && list.length > 0 && <p className="small">{T.needsSwitch}</p>}
      {on && deviceId && (
        <p className="small">
          {T.device}: <code>{deviceId}</code>
        </p>
      )}
    </div>
  );
}
