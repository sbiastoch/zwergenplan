/**
 * ID-Gate (ADR 0041; Plan 0049, Nachtrag 2, B2/B3), rein: welche Einheiten eine neue Fassung der Pipeline übernehmen
 * (gated), welche Angebots-IDs das kostet, die Eingabe des Richters und das Ergebnis je Einheit. Den Richter rufen,
 * bauen und schreiben macht `io/id-gate.ts`.
 *
 * Verlust: eine ID mit künftigem Termin im Vorstand, die im Build mit allen neuen Ergebnissen (a) fehlt, im Build mit
 * dem alten Stand der gated Einheiten (b) aber vorkommt. Nur die Einheit, aus der das Angebot in (b) stammt, wird
 * gerichtet; zeigt der Ursprung auf eine Einheit ohne neue Fassung, ist der Verlust erlaubt (geänderte Seite, ADR 0022).
 */
import type { Anbieter, Offer, OffersFile } from "../../../src/domain/schema.ts";
import { berlinIsoDate, fromBerlinLocal } from "../../../src/domain/time.ts";
import type { Decision, FreshEvent, JudgeInput, LostOffer } from "./judge.ts";
import { expansionWindow, isV2, type ProviderRaw, type RawEvent, type UnitState } from "./raw.ts";
import { isGated, mergeUnitStates } from "./refresh.ts";
import { type ExpandWindow, expandSchedule } from "./schedule.ts";
import { similarTitle } from "./similar.ts";
import type { InputLayout } from "./split.ts";

/** Anbieter → Einheiten mit neuer Fassung */
export type GatedUnits = ReadonlyMap<string, ReadonlySet<string>>;

/** Einheiten, deren neuer Zustand ein Ergebnis einer anderen Fassung übernimmt (`isGated`), je Anbieter. */
export function gatedUnits(
  prev: Readonly<Record<string, ProviderRaw>>,
  next: Readonly<Record<string, ProviderRaw>>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const [id, n] of Object.entries(next).sort(([a], [b]) => a.localeCompare(b))) {
    const p = prev[id];
    if (!p || !isV2(p) || !isV2(n)) continue;
    const units = Object.entries(n.units)
      .filter(([u, state]) => isGated(p.units[u], state))
      .map(([u]) => u);
    if (units.length > 0) out.set(id, new Set(units));
  }
  return out;
}

/** Stand (b): neue Zustände, die gated Einheiten aber im Stand des Vorstands. */
export function heldBack(
  prev: Readonly<Record<string, ProviderRaw>>,
  next: Readonly<Record<string, ProviderRaw>>,
  gated: GatedUnits,
): Record<string, ProviderRaw> {
  const out: Record<string, ProviderRaw> = { ...next };
  for (const [id, units] of gated) {
    const p = prev[id];
    const n = next[id];
    if (p && n && isV2(p) && isV2(n)) out[id] = mergeUnitStates(p, n, units);
  }
  return out;
}

const hasFutureSession = (o: Offer, today: string) => o.sessions.some((s) => berlinIsoDate(s.end ?? s.start) >= today);

export interface UnitLoss {
  providerId: string;
  unit: string;
  /** verlorene Angebote aus dem Vorstand, nach ID */
  lost: Offer[];
}

/** Verluste je gated Einheit (siehe Kopf); Reihenfolge nach Anbieter, Einheit. */
export function unitLosses(o: {
  previous: OffersFile | undefined;
  a: OffersFile;
  b: OffersFile;
  /** `report.origins` aus Build (b): ID → Batch */
  origins: Readonly<Record<string, string>>;
  /** `unitOf` aus Build (b): Batch → Einheit */
  unitOf: Readonly<Record<string, string>>;
  gated: GatedUnits;
  today: string;
}): UnitLoss[] {
  const inA = new Set(o.a.offers.map((x) => x.id));
  const inB = new Set(o.b.offers.map((x) => x.id));
  const groups = new Map<string, UnitLoss>();
  const old = [...(o.previous?.offers ?? [])].sort((x, y) => x.id.localeCompare(y.id));
  for (const offer of old) {
    if (inA.has(offer.id) || !inB.has(offer.id) || !hasFutureSession(offer, o.today)) continue;
    const batch = o.origins[offer.id];
    const unit = batch === undefined ? undefined : o.unitOf[batch];
    if (unit === undefined || !o.gated.get(offer.providerId)?.has(unit)) continue;
    const key = `${offer.providerId}\u0000${unit}`;
    const g = groups.get(key) ?? { providerId: offer.providerId, unit, lost: [] };
    g.lost.push(offer);
    groups.set(key, g);
  }
  return [...groups.values()].sort((x, y) => x.providerId.localeCompare(y.providerId) || x.unit.localeCompare(y.unit));
}

/**
 * Beginne eines Events ab `from` bis `to` als ISO mit Offset, wie `Session.start` im Build. Der Tag des Beginns muss im
 * Fenster liegen, auch bei Einzelterminen (`expandSchedule` filtert `dates` nicht): Ein vergangener Termin entsteht im
 * Build nicht, ein `gleich` darauf ginge ins Leere und die ID verloren.
 */
function eventStarts(e: RawEvent, w: { from: string; to: string; freeDays: ExpandWindow["freeDays"] }): string[] {
  return expandSchedule(e.schedule, { to: expansionWindow(e, w.to), freeDays: w.freeDays, from: w.from }).flatMap(
    (occ) => {
      const day = occ.start.slice(0, 10);
      if (day < w.from || day > w.to) return [];
      try {
        return [fromBerlinLocal(occ.start)];
      } catch {
        return [];
      }
    },
  );
}

/**
 * Eingabe des Richters für eine Einheit. `taken`: Das Event hat im Build (a) schon eine alte ID behalten (gleicher
 * Anbieter, ähnlicher Titel, gemeinsamer Beginn mit einem Angebot, dessen ID im Vorstand steht und nicht verloren ist);
 * es ist kein zulässiges Ziel für `gleich` (Review N2-2, M2).
 */
export function judgeInputOf(o: {
  excerpt: Anbieter;
  unit: string;
  text: string;
  layout: InputLayout;
  lost: readonly Offer[];
  events: readonly RawEvent[];
  a: OffersFile;
  previous: OffersFile | undefined;
  window: { from: string; to: string; freeDays: ExpandWindow["freeDays"] };
}): JudgeInput {
  const lostIds = new Set(o.lost.map((x) => x.id));
  const kept = new Set((o.previous?.offers ?? []).map((x) => x.id).filter((id) => !lostIds.has(id)));
  const keepers = o.a.offers.filter((x) => x.providerId === o.excerpt.id && kept.has(x.id));
  const fresh: FreshEvent[] = o.events.map((event, index) => {
    const starts = eventStarts(event, o.window);
    const times = new Set(starts.map((s) => Date.parse(s)));
    const taken = keepers.some(
      (k) => similarTitle(k.title, event.title) && k.sessions.some((s) => times.has(Date.parse(s.start))),
    );
    return { index, event, starts, taken };
  });
  const lost: LostOffer[] = o.lost.map((x) => ({
    id: x.id,
    title: x.title,
    venueId: x.venueId,
    ...(x.summary ? { summary: x.summary } : {}),
    starts: x.sessions.filter((s) => berlinIsoDate(s.end ?? s.start) >= o.window.from).map((s) => s.start),
  }));
  return {
    providerId: o.excerpt.id,
    unit: o.unit,
    text: o.text,
    excerpt: o.excerpt,
    lost,
    fresh,
    layout: o.layout,
  };
}

/** Übernahme nach dem Urteil: Jedes `gleich` wird `keepIds` am Event (Beginn → alte ID). */
export function withKeepIds(next: UnitState, keepIds: Decision["keepIds"]): UnitState {
  if (keepIds.length === 0) return next;
  const events = next.events.map((e, i) => {
    const own = keepIds.filter((k) => k.index === i);
    if (own.length === 0) return e;
    return { ...e, keepIds: { ...e.keepIds, ...Object.fromEntries(own.map((k) => [k.start, k.id])) } };
  });
  return { ...next, events };
}
