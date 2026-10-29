/**
 * Anbieterliste im Tab „Anbieter“ (Plan 0010, E4, E5, E10; Plan 0025, E3): oben die abonnierten Anbieter, darunter die
 * weiteren (aktive, dann blass die ausgeblendeten und die ohne Termine; Plan 0056, E1). Jede Zeile hat eine Glocke (Plan 0054, E1). Das Suchfeld steht im
 * Start (ProviderSearch.tsx), über der Statuszeile. Zählen, Filtern und Sortieren macht `directory.ts`.
 */
import { type MouseEvent, useMemo, useRef } from "react";
import { type ProviderRow, providerRows } from "../../domain/directory.ts";
import { applyFilters, EMPTY_FILTER } from "../../domain/filter.ts";
import { countProviders, viewNarrows } from "../../domain/provider-count.ts";
import { EmptyState, ListPending, NoOffers } from "../ListView.tsx";
import { BellButton } from "../OfferCard.tsx";
import type { ProviderScreenProps } from "../provider-types.ts";
import { ANNOUNCE_DELAY_MS, useSettled } from "../use-settled.ts";
import { idleLine, outsideText, providerCountText, providerLine } from "./provider-format.ts";

export function ProviderScreen({
  directory,
  offers,
  visible,
  now,
  view,
  onShowAll,
  reachOf,
  reachMode,
  query,
  onQuery,
  onOpenProvider,
  onResetFilter,
  age,
  saved: savedIds,
  onToggleSaved,
  bellBusy,
}: ProviderScreenProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const upcoming = useMemo(() => applyFilters(offers, EMPTY_FILTER, { now }), [offers, now]);
  const byReach = reachMode !== undefined && reachMode.kind !== "laedt";
  const { saved, active, idle, outside } = useMemo(
    () =>
      providerRows({
        providers: directory.providers,
        visible,
        upcoming,
        reachOf,
        byReach,
        query,
        saved: savedIds,
        view,
      }),
    [directory.providers, visible, upcoming, reachOf, byReach, query, savedIds, view],
  );
  const searching = query.trim() !== "";
  const matches = saved.length + active.length + idle.length;
  // Nur zur Suche: Ohne Suchtext zählt die Statuszeile (aktive Anbieter), eine zweite Zahl darunter, die auch die
  // blassen Zeilen zählt, widerspräche ihr (Sichtprüfung Integration).
  const announced = useSettled(searching ? providerCountText(matches) : "", ANNOUNCE_DELAY_MS);

  /*
   * Erst fokussieren, dann umschalten (Plan 0021, E3): Die Zeile wandert in den anderen Abschnitt, der Fokus geht auf
   * die nächste Glocke desselben Abschnitts in DOM-Reihenfolge (sonst das vorige, sonst die Liste). So springt die Seite
   * beim Abonnieren nicht nach oben. Beide Abschnitte sind immer gerendert, damit React dabei nichts neu einhängt.
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
        <BellButton
          label={r.provider.name}
          subscribed={isSaved}
          busy={bellBusy}
          onToggle={(event) => toggle(event, r.provider.id)}
        />
      </li>
    );
  };

  const anyActive = active.length > 0 || saved.some((r) => r.state === "aktiv");
  const showAll = (
    <button type="button" className="linkbtn" onClick={onShowAll}>
      Alle zeigen
    </button>
  );
  const empty =
    anyActive || (searching && matches > 0) ? null : searching && outside > 0 ? (
      // alle Treffer außerhalb des Kartenausschnitts (Plan 0055, Review m10)
      <EmptyState icon="search" title={outsideText(outside, false)}>
        {showAll}
      </EmptyState>
    ) : searching ? (
      <EmptyState icon="search" title="Kein Anbieter heißt so.">
        <button type="button" className="linkbtn" onClick={() => onQuery("")}>
          Suche löschen
        </button>
      </EmptyState>
    ) : viewNarrows(view) && countProviders(visible) > 0 ? (
      // Der Ausschnitt blendet aus, nicht Filter oder Alter (Plan 0055, Review 2, M3); blasse stehen darunter. Gibt es
      // auch ohne Ausschnitt keinen aktiven Anbieter, hilft „Filter zurücksetzen“ (NoOffers) mehr (Arch-Review, Minor 6).
      <EmptyState icon="search" title="Im Kartenausschnitt bietet gerade niemand etwas an.">
        {showAll}
      </EmptyState>
    ) : (
      // keine Daten bzw. Filter oder Alter ohne aktiven Anbieter; die Anbieter ohne Termine stehen darunter (E10)
      <NoOffers hasData={upcoming.length > 0} onResetFilter={onResetFilter} age={age} />
    );
  const hasRest = active.length > 0 || idle.length > 0;
  // Ausgeblendete stehen als blasse Zeile; „Auch unpassende zeigen“ bzw. „Filter zurücksetzen“ bringen sie zurück,
  // wie im Leerzustand (NoOffers: erst das Alter, dann die Filter; Plan 0056, E1, Review m4)
  const resetHidden =
    anyActive && (age !== undefined || onResetFilter !== undefined) && idle.some((r) => r.state === "ausgeblendet");

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
                <h2>Deine Anbieter-Abos</h2>
                <ul className="provider-saved">{saved.map((r) => row(r, true))}</ul>
              </>
            )}
          </div>
          <div className="provider-group">
            {saved.length > 0 && hasRest && <h2>Weitere Anbieter</h2>}
            {active.length > 0 && <ul>{active.map((r) => row(r, false))}</ul>}
            {resetHidden && (
              <p className="provider-hidden">
                {age && (
                  <button type="button" className="linkbtn" onClick={age.onShow}>
                    Auch unpassende zeigen
                  </button>
                )}
                {age && onResetFilter && " · "}
                {onResetFilter && (
                  <button type="button" className="linkbtn" onClick={onResetFilter}>
                    Filter zurücksetzen
                  </button>
                )}
              </p>
            )}
            {idle.length > 0 && <ul className="provider-idle">{idle.map((r) => row(r, false))}</ul>}
            {outside > 0 && matches > 0 && (
              <p className="provider-hidden">
                {outsideText(outside, true)} {showAll}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
