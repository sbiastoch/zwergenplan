/**
 * Push-Teil im Abschnitt „Als App“ (Plan 0017, E6, E7): Schalter „Wochen-Nachricht“, „Aktuelle Suche abonnieren“,
 * die Liste der Such-Abos und die Geräte-Kennung. Statisch in `AppSection` (gleicher Lazy-Chunk), ohne Props aus dem
 * Start: Geburtsdatum, Startpunkt und die Suche der Liste liest die Komponente bei jedem Rendern selbst. `KidSheet`
 * rendert den Abschnitt bei jeder Änderung neu, also sieht sie eine Änderung im selben Sheet sofort.
 *
 * Gespiegelt und abgeglichen wird nur hier, solange das Kind-Sheet offen ist (kein Push-Code beim App-Start, E9).
 * Rückmeldungen stehen in einer Statuszeile statt im Toast der App (E7).
 */
import { useEffect, useId, useRef, useState } from "react";
import { loadBirthDate, loadOriginDistrict, loadOriginPoint } from "../../data/preferences.ts";
import { type MirrorData, type PushApi, PushError } from "../../data/push.ts";
import { loadSearchesRaw, saveSearches } from "../../data/searches-store.ts";
import { filterFromSearch, filterToSearch } from "../../domain/filter.ts";
import type { PushSupport } from "../../domain/pwa.ts";
import { addSearch, parseSearches, removeSearch } from "../../domain/searches.ts";
import { problemText, searchLabel, PUSH_TEXTS as T } from "./push-texts.ts";

function mirrorData(): MirrorData {
  return {
    birthDate: loadBirthDate(),
    searches: loadSearchesRaw(),
    origin: loadOriginDistrict() ?? loadOriginPoint(),
  };
}

export function PushControls({ push, support }: { push: PushApi; support: Extract<PushSupport, "ok" | "verweigert"> }) {
  const switchLabel = useId();
  const listHeading = useRef<HTMLHeadingElement>(null);
  /** `undefined`, bis der Abgleich weiß, ob ein Abo läuft */
  const [on, setOn] = useState<boolean>();
  const [busy, setBusy] = useState<"an" | "aus">();
  const [deviceId, setDeviceId] = useState<string>();
  const [list, setList] = useState(() => parseSearches(loadSearchesRaw()));
  const [status, setStatus] = useState("");

  const current = filterToSearch(filterFromSearch(location.search));
  const pressed = current !== "" && list.includes(current);
  const hasOrigin = (loadOriginDistrict() ?? loadOriginPoint()) !== undefined;

  // Abgleich beim Öffnen (Plan 0017, E6): ausgetauschtes Abo neu melden, fehlendes Abo → aus
  useEffect(() => {
    let live = true;
    void push
      .reconcile(mirrorData())
      .catch(() => false)
      .then((isOn) => {
        if (live) setOn(isOn);
      });
    return () => {
      live = false;
    };
  }, [push]);

  // Spiegeln nach jedem Rendern; `mirror` schreibt nur, was sich geändert hat
  useEffect(() => {
    if (on) void push.mirror(mirrorData()).catch(() => undefined);
  });

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
      });
    return () => {
      live = false;
    };
  }, [on, push]);

  /** Vor jedem neuen Text leeren, damit eine Live-Region denselben Text erneut ansagt (Runde 3 M2) */
  const say = (text: string) => {
    setStatus("");
    setTimeout(() => setStatus(text), 50);
  };

  const store = (next: string[]) => {
    saveSearches(next);
    setList(next);
  };

  const toggle = () => {
    if (on) {
      setBusy("aus");
      void push
        .disable()
        .then(() => {
          setOn(false);
          say(T.off);
        })
        .finally(() => setBusy(undefined));
      return;
    }
    setBusy("an");
    // `requestPermission` ist das erste `await` in `enable`, noch im Tipp (iOS, Plan 0011 E12)
    void push
      .enable(mirrorData())
      .then(() => {
        setOn(true);
        say(T.on);
      })
      .catch((error: unknown) => {
        setOn(false);
        say(problemText(error instanceof PushError ? error.problem : "abo"));
      })
      .finally(() => setBusy(undefined));
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
