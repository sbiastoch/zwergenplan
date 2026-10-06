/**
 * Anbieterliste im Tab „Anbieter“ (Plan 0010, E4, E5, E10): Suche nach Namen, aktive Anbieter, Hinweis auf
 * ausgeblendete, blasse Anbieter ohne Termine am Ende. Zählen, Filtern und Sortieren macht `directory.ts`.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { type ProviderRow, providerRows } from "../../domain/directory.ts";
import { applyFilters, EMPTY_FILTER } from "../../domain/filter.ts";
import { EmptyState, ListPending, NoOffers } from "../ListView.tsx";
import type { ProviderScreenProps } from "../provider-types.ts";
import { hiddenProvidersText, idleLine, providerCountText, providerLine } from "./provider-format.ts";

/** Screenreader sagen die Zahl erst nach einer Tipp-Pause an, nicht bei jedem Buchstaben (E5) */
const ANNOUNCE_DELAY_MS = 500;

function useSettled(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export function ProviderScreen({
  directory,
  offers,
  visible,
  now,
  reachOf,
  reachMode,
  query,
  onQuery,
  onOpenProvider,
  onResetFilter,
  age,
}: ProviderScreenProps) {
  const inputId = useId();
  const upcoming = useMemo(() => applyFilters(offers, EMPTY_FILTER, { now }), [offers, now]);
  const byReach = reachMode !== undefined && reachMode.kind !== "laedt";
  const { active, hiddenCount, idle } = useMemo(
    () => providerRows({ providers: directory.providers, visible, upcoming, reachOf, byReach, query }),
    [directory.providers, visible, upcoming, reachOf, byReach, query],
  );
  const searching = query.trim() !== "";
  // Nur zur Suche: Ohne Suchtext zählt die Statuszeile (aktive Anbieter), eine zweite Zahl darunter, die auch die
  // blassen Zeilen zählt, widerspräche ihr (Sichtprüfung Integration).
  const announced = useSettled(searching ? providerCountText(active.length + idle.length) : "", ANNOUNCE_DELAY_MS);

  const row = (r: ProviderRow, idleRow: boolean) => (
    <li key={r.provider.id}>
      <button type="button" className={idleRow ? "place idle" : "place"} onClick={() => onOpenProvider(r.provider.id)}>
        <b className="provider-name" lang="de">
          {r.provider.name}
        </b>
        <span>{idleRow ? idleLine(r) : providerLine(r, reachMode)}</span>
      </button>
    </li>
  );

  const empty =
    active.length > 0 || (searching && idle.length > 0) ? null : searching ? (
      <EmptyState icon="search" title="Kein Anbieter heißt so.">
        <button type="button" className="linkbtn" onClick={() => onQuery("")}>
          Suche löschen
        </button>
      </EmptyState>
    ) : (
      // keine Daten bzw. Filter oder Alter ohne aktiven Anbieter; die Anbieter ohne Termine stehen darunter (E10)
      <NoOffers hasData={upcoming.length > 0} onResetFilter={onResetFilter} age={age} />
    );

  return (
    <section className="places providers" aria-label="Anbieter">
      <div className="provider-search">
        <label htmlFor={inputId}>Anbieter suchen</label>
        <input
          id={inputId}
          type="search"
          placeholder="z. B. Bibliothek"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
        <p className="small" aria-live="polite">
          {announced}
        </p>
      </div>
      {reachMode?.kind === "laedt" ? (
        // Reihenfolge hängt an der Wegzeit: erst nach dem Laden Zeilen, sonst sprängen sie (E5)
        <ListPending />
      ) : (
        <>
          {empty}
          {active.length > 0 && <ul>{active.map((r) => row(r, false))}</ul>}
          {hiddenCount > 0 && active.length > 0 && (
            <p className="provider-hidden">
              {hiddenProvidersText(hiddenCount)}
              {onResetFilter && (
                <>
                  {" "}
                  <button type="button" className="linkbtn" onClick={onResetFilter}>
                    Filter zurücksetzen
                  </button>
                </>
              )}
            </p>
          )}
          {idle.length > 0 && <ul className="provider-idle">{idle.map((r) => row(r, true))}</ul>}
        </>
      )}
    </section>
  );
}
