/**
 * Anbieterliste im Tab „Anbieter“ (Plan 0010, E4, E5, E10; Plan 0025, E3): oben die gemerkten Anbieter, darunter die
 * weiteren (aktive, Hinweis auf ausgeblendete, blasse ohne Termine). Jede Zeile hat ein Herz. Das Suchfeld steht im
 * Start (ProviderSearch.tsx), über der Statuszeile. Zählen, Filtern und Sortieren macht `directory.ts`.
 */
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { type ProviderRow, providerRows } from "../../domain/directory.ts";
import { applyFilters, EMPTY_FILTER } from "../../domain/filter.ts";
import { Icon } from "../icons.tsx";
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
  saved: savedIds,
  onToggleSaved,
}: ProviderScreenProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const upcoming = useMemo(() => applyFilters(offers, EMPTY_FILTER, { now }), [offers, now]);
  const byReach = reachMode !== undefined && reachMode.kind !== "laedt";
  const { saved, active, hiddenCount, idle } = useMemo(
    () => providerRows({ providers: directory.providers, visible, upcoming, reachOf, byReach, query, saved: savedIds }),
    [directory.providers, visible, upcoming, reachOf, byReach, query, savedIds],
  );
  const searching = query.trim() !== "";
  const matches = saved.length + active.length + idle.length;
  // Nur zur Suche: Ohne Suchtext zählt die Statuszeile (aktive Anbieter), eine zweite Zahl darunter, die auch die
  // blassen Zeilen zählt, widerspräche ihr (Sichtprüfung Integration).
  const announced = useSettled(searching ? providerCountText(matches) : "", ANNOUNCE_DELAY_MS);

  /*
   * Erst fokussieren, dann umschalten (Plan 0021, E3): Die Zeile wandert in den anderen Abschnitt, der Fokus geht auf
   * das nächste Herz desselben Abschnitts in DOM-Reihenfolge (sonst das vorige, sonst die Liste). So springt die Seite
   * beim Merken nicht nach oben. Beide Abschnitte sind immer gerendert, damit React dabei nichts neu einhängt.
   */
  const toggle = (event: MouseEvent<HTMLButtonElement>, providerId: string) => {
    const hearts = [...(event.currentTarget.closest(".provider-group")?.querySelectorAll("button.heart") ?? [])];
    const index = hearts.indexOf(event.currentTarget);
    const target = hearts[index + 1] ?? hearts[index - 1];
    (target instanceof HTMLElement ? target : sectionRef.current)?.focus();
    onToggleSaved(providerId);
  };

  const row = (r: ProviderRow, isSaved: boolean) => {
    const idleRow = r.state !== "aktiv";
    return (
      <li key={r.provider.id} className="provider-row">
        <button
          type="button"
          className={idleRow ? "place idle" : "place"}
          onClick={() => onOpenProvider(r.provider.id)}
        >
          <b className="provider-name" lang="de">
            {r.provider.name}
          </b>
          <span>{idleRow ? idleLine(r) : providerLine(r, reachMode)}</span>
        </button>
        <button
          type="button"
          className="heart"
          aria-pressed={isSaved}
          aria-label={`${r.provider.name} merken`}
          onClick={(event) => toggle(event, r.provider.id)}
        >
          <span className="hs">
            <Icon name="heart" size={20} />
          </span>
        </button>
      </li>
    );
  };

  const anyActive = active.length > 0 || saved.some((r) => r.state === "aktiv");
  const empty =
    anyActive || (searching && matches > 0) ? null : searching ? (
      <EmptyState icon="search" title="Kein Anbieter heißt so.">
        <button type="button" className="linkbtn" onClick={() => onQuery("")}>
          Suche löschen
        </button>
      </EmptyState>
    ) : (
      // keine Daten bzw. Filter oder Alter ohne aktiven Anbieter; die Anbieter ohne Termine stehen darunter (E10)
      <NoOffers hasData={upcoming.length > 0} onResetFilter={onResetFilter} age={age} />
    );
  const showHidden = hiddenCount > 0 && anyActive;
  const hasRest = active.length > 0 || showHidden || idle.length > 0;

  return (
    <section ref={sectionRef} className="places providers" aria-label="Anbieter" tabIndex={-1}>
      <p className="sr-only provider-announce" aria-live="polite">
        {announced}
      </p>
      {reachMode?.kind === "laedt" ? (
        // Reihenfolge hängt an der Wegzeit: erst nach dem Laden Zeilen, sonst sprängen sie (E5)
        <ListPending />
      ) : (
        <>
          {/* Leerzustand über beiden Abschnitten: Er erklärt auch blasse gemerkte Zeilen (Review M2) */}
          {empty}
          <div className="provider-group">
            {saved.length > 0 && (
              <>
                <h2>Gemerkte Anbieter</h2>
                <ul className="provider-saved">{saved.map((r) => row(r, true))}</ul>
              </>
            )}
          </div>
          <div className="provider-group">
            {saved.length > 0 && hasRest && <h2>Weitere Anbieter</h2>}
            {active.length > 0 && <ul>{active.map((r) => row(r, false))}</ul>}
            {showHidden && (
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
            {idle.length > 0 && <ul className="provider-idle">{idle.map((r) => row(r, false))}</ul>}
          </div>
        </>
      )}
    </section>
  );
}
