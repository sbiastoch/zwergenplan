import { useEffect, useMemo, useState } from "react";
import { assetUrl, loadBirthDate, loadSiteData, saveBirthDate } from "../data/site.ts";
import {
  applyFilters,
  type FilterState,
  FORMATS,
  filterFromSearch,
  filterToSearch,
  nextSession,
} from "../domain/filter.ts";
import { seriesIcsPath } from "../domain/ics.ts";
import type { SiteData, SiteOffer } from "../domain/site-data.ts";
import { CATEGORY_LABELS, categoriesOf } from "../domain/topics.ts";
import { FORMAT_LABELS, facts, formatSession } from "./format.ts";

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: SiteData };

function useUrlFilter(): [FilterState, (next: FilterState) => void] {
  const [state, setState] = useState(() => filterFromSearch(window.location.search));
  const update = (next: FilterState) => {
    setState(next);
    const search = filterToSearch(next);
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  };
  return [state, update];
}

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useUrlFilter();
  const [birthDate, setBirthDate] = useState(loadBirthDate);

  useEffect(() => {
    loadSiteData().then(
      (data) => setLoad({ kind: "ready", data }),
      (e: unknown) => setLoad({ kind: "error", message: e instanceof Error ? e.message : String(e) }),
    );
  }, []);

  const now = useMemo(() => new Date(), []);
  const offers = useMemo(
    () => (load.kind === "ready" ? (applyFilters(load.data.offers, filter, { now, birthDate }) as SiteOffer[]) : []),
    [load, filter, now, birthDate],
  );

  const toggleFormat = (f: (typeof FORMATS)[number]) =>
    setFilter({
      ...filter,
      formats: filter.formats.includes(f) ? filter.formats.filter((x) => x !== f) : [...filter.formats, f],
    });

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16">
      <header className="pt-6 pb-4">
        <h1 className="font-bold text-3xl">Zwergenplan</h1>
        <p className="text-(--color-muted)">Angebote für Kinder unter 3 in Nürnberg · Vorschau, Design folgt</p>
      </header>

      <section aria-label="Filter" className="flex flex-col gap-4 pb-4">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 font-semibold">Art des Angebots</legend>
          {FORMATS.map((f) => {
            const active = filter.formats.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => toggleFormat(f)}
                className={`min-h-11 rounded-full border px-4 ${
                  active
                    ? "border-(--color-accent) bg-(--color-accent) text-(--color-accent-ink)"
                    : "border-(--color-line) bg-(--color-surface)"
                }`}
              >
                {FORMAT_LABELS[f]}
              </button>
            );
          })}
        </fieldset>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Geburtsdatum des Kindes</span>
          <input
            type="date"
            value={birthDate ?? ""}
            onChange={(e) => {
              const value = e.target.value || undefined;
              setBirthDate(value);
              saveBirthDate(value);
            }}
            className="min-h-11 rounded-lg border border-(--color-line) bg-(--color-surface) px-3 text-base"
          />
          <span className="text-(--color-muted) text-sm">Bleibt nur auf diesem Gerät.</span>
        </label>
      </section>

      {load.kind === "loading" && <p role="status">Lade Angebote …</p>}
      {load.kind === "error" && <p role="alert">{load.message}</p>}
      {load.kind === "ready" && (
        <>
          <p role="status" className="pb-2 text-(--color-muted)">
            {offers.length === 0 ? "Noch keine passenden Angebote – Daten folgen." : `${offers.length} Angebote`}
          </p>
          <ul className="flex flex-col gap-3">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} now={now} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function OfferCard({ offer, now }: { offer: SiteOffer; now: Date }) {
  const next = nextSession(offer, now);
  const icsLabel =
    offer.format === "einmalig" ? "In den Kalender" : `Alle ${offer.sessions.length} Termine in den Kalender`;
  return (
    <li className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4" data-testid="offer">
      <h2 className="font-semibold text-lg">{offer.title}</h2>
      <p className="text-(--color-muted)">
        {offer.providerName} · {offer.venue.district ?? offer.venue.name}
      </p>
      {next && <p className="pt-1">Nächster Termin: {formatSession(next)}</p>}
      <p className="pt-1 text-sm">{facts(offer).join(" · ")}</p>
      <p className="pt-1 text-(--color-muted) text-sm">
        {categoriesOf(offer.topics)
          .map((c) => CATEGORY_LABELS[c])
          .join(" · ")}
      </p>
      <div className="flex flex-wrap gap-2 pt-3">
        <a
          href={assetUrl(seriesIcsPath(offer))}
          className="inline-flex min-h-11 items-center rounded-full bg-(--color-accent) px-4 font-semibold text-(--color-accent-ink)"
        >
          {icsLabel}
        </a>
        <a
          href={offer.url}
          rel="noopener"
          target="_blank"
          className="inline-flex min-h-11 items-center rounded-full border border-(--color-line) px-4"
        >
          Zum Anbieter
        </a>
      </div>
    </li>
  );
}
