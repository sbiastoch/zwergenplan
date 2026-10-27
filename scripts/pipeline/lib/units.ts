/**
 * Die Programmseite als Einheit der Extraktion (Plan 0048, E1, E3, E12; ADR 0033, Punkt 2), rein: welche Einheiten ein
 * Anbieter hat, welcher Katalogauszug zu einer Einheit gehört und wie die Events der Einheiten eines Anbieters vor
 * `mergeParts` gegeneinander abgeglichen werden.
 */
import { createHash } from "node:crypto";
import type { Anbieter, Offer } from "../../../src/domain/schema.ts";
import { expansionWindow, type RawEvent } from "./raw.ts";
import { type ExpandWindow, expandSchedule } from "./schedule.ts";
import { compatibleAge, conflictingLabels, sameCoreTitle, similarTitle } from "./similar.ts";

type Programme = Anbieter["programme"][number];

/** Kennung der Einheit der Sammelkalender (E1). */
export const KANDIDATEN = "kandidaten";

/**
 * Kennung einer Seite (E1): die URL-**Vorlage** aus dem Katalog, nicht die ausgefüllte URL, damit sie über die Nächte
 * gleich bleibt; bei `request` dazu die ersten 8 Zeichen des SHA-256 des Bodys der Vorlage.
 */
export function unitIdOf(g: Pick<Programme, "url" | "request">): string {
  const body = g.request ? `#${createHash("sha256").update(g.request.body).digest("hex").slice(0, 8)}` : "";
  return `seite:${g.url}${body}`;
}

/** Seiten, die Abruf und Auszug kennen (wie `planFetch`): ohne `use: info` und ohne `blocked`. */
const active = (g: Programme) => g.use !== "info" && g.blocked === undefined;

export interface UnitDef {
  id: string;
  /** Index der eigenen Seite in `programme`; fehlt bei `kandidaten` */
  own?: number;
  /** Indizes der Beilagen (`use: verfuegbarkeit`) in `programme` */
  beilagen: number[];
}

/**
 * Einheiten eines Anbieters in Katalogreihenfolge, `kandidaten` zuletzt (E1). Wer nur über Kandidaten läuft
 * (`coveredBy`, `skipCrawl`), hat nur `kandidaten`. Sonst gibt es `kandidaten`, wenn der Anbieter in dieser Nacht
 * Kandidaten hat oder der Vorzustand die Einheit hat (`hadKandidaten`); ohne Kandidaten gilt sie dann als leere
 * Eingabe mit Einbruchschutz (E5).
 */
export function unitsOf(p: Anbieter, opts: { candidates: boolean; hadKandidaten: boolean }): UnitDef[] {
  const kandidaten: UnitDef = { id: KANDIDATEN, beilagen: [] };
  if (p.coveredBy || p.skipCrawl) return [kandidaten];
  const beilagen = p.programme.flatMap((g, i) => (active(g) && g.use === "verfuegbarkeit" ? [i] : []));
  const pages = p.programme.flatMap((g, i): UnitDef[] =>
    active(g) && g.use === "termine" ? [{ id: unitIdOf(g), own: i, beilagen }] : [],
  );
  return opts.candidates || opts.hadKandidaten ? [...pages, kandidaten] : pages;
}

/**
 * Katalogauszug einer Einheit für Schlüssel und Nachricht (E3, Nachtrag 1): der Eintrag ohne `notes`; `programme` nennt
 * alle Seiten außer `use: info` und `blocked`, `hint` aber nur bei den Seiten der Einheit (eigene Seite und Beilagen),
 * bei `kandidaten` bei keiner. So extrahiert eine geänderte `hint` nur ihre Einheit neu; eine neue oder gestrichene
 * Seite ändert den Auszug aller Einheiten (bewusst, Review 3, M3).
 * Kein gültiger Katalogeintrag: Bei `coveredBy` kann `programme` leer sein. Geprüft wird gegen den vollen Eintrag.
 */
export function unitExcerpt(p: Anbieter, unit: UnitDef): Anbieter {
  const own = new Set([...(unit.own === undefined ? [] : [unit.own]), ...unit.beilagen]);
  const { notes: _notes, ...rest } = p;
  const programme = p.programme.flatMap((g, i) => {
    if (!active(g)) return [];
    if (own.has(i) || g.hint === undefined) return [g];
    const { hint: _hint, ...withoutHint } = g;
    return [withoutHint];
  });
  return { ...rest, programme };
}

/**
 * Mindestanteil der künftigen Beginnzeiten des kleineren Zwillings, die im größeren stehen (E12; ADR 0004). Wie
 * `SAME_SOURCE_SESSIONS` 0,8: Bei derselben Quelle sind bis zu 20 % Abweichung fast immer herausgenommene Ferientage.
 * Bewusst eigene Konstante, damit eine Änderung der Dubletten im Build den Abgleich nicht still mitändert.
 */
const SAME_UNIT_SESSIONS = 0.8;

export interface UnitEvents {
  id: string;
  /** Einheit im Fehler: ihre Events stammen aus einer früheren Nacht und verdrängen nie die einer Einheit mit `ok` */
  failed: boolean;
  events: readonly RawEvent[];
}

export interface MatchWindow {
  /** Vorstand (`data/offers.json`); fehlt im Eval, dann entscheidet nur die Zahl der Termine */
  previous?: readonly Offer[] | undefined;
  horizon: { from: string; to: string };
  freeDays: ExpandWindow["freeDays"];
}

/**
 * Abgleich zwischen Einheiten eines Anbieters (E12): Zwei Events aus verschiedenen Einheiten mit gleichem Ort, gleichem
 * Kerntitel ohne widersprechende Kennungen, verträglichem Alter, ≥ 80 % der künftigen Beginnzeiten des kleineren im
 * größeren **und** verschiedenem Format, Alter oder Terminart sind dasselbe Angebot. Gleich gebaute Fassungen bleiben
 * `mergeParts`, das ihre Termine vereinigt. Die Einheit `kandidaten` nimmt nicht teil (der Build regelt sie nach Rang).
 *
 * Reihenfolge: zuerst Einheiten mit `ok`, dann solche im Fehler, jeweils in der übergebenen (Katalog-)Reihenfolge; das
 * Ergebnis kommt in derselben Reihenfolge zurück, die `mergeParts` braucht (E6). Jedes Event wird gegen die bisher
 * behaltenen Events früherer Einheiten geprüft, der erste Treffer ist sein Zwilling. Es bleibt die Fassung mit der
 * höheren `passung` (Anteil der künftigen Termine in Angeboten des Vorstands mit ähnlichem Titel, + 0,5 bei gleichem
 * Format dort), dann die mit mehr künftigen Terminen, dann die frühere. Ein Event einer Einheit im Fehler gewinnt nie
 * gegen eines einer Einheit mit `ok`.
 */
export function matchUnits(
  units: readonly UnitEvents[],
  w: MatchWindow,
): { units: Array<{ id: string; failed: boolean; events: RawEvent[] }>; notes: string[] } {
  const ordered = [...units.filter((u) => !u.failed), ...units.filter((u) => u.failed)];
  const starts = (e: RawEvent) =>
    new Set(
      expandSchedule(e.schedule, { to: expansionWindow(e, w.horizon.to), freeDays: w.freeDays, from: w.horizon.from })
        .filter((o) => o.start.slice(0, 10) >= w.horizon.from)
        .map((o) => Date.parse(o.start)),
    );
  const passung = (e: RawEvent, s: ReadonlySet<number>) => {
    const olds = (w.previous ?? []).filter(
      (o) => o.providerId === e.providerId && o.venueId === e.venueId && similarTitle(o.title, e.title),
    );
    const known = new Set(olds.flatMap((o) => o.sessions.map((q) => Date.parse(q.start))));
    let both = 0;
    for (const v of s) if (known.has(v)) both++;
    return (s.size === 0 ? 0 : both / s.size) + (olds.some((o) => o.format === e.format) ? 0.5 : 0);
  };
  const sameShape = (a: RawEvent, b: RawEvent) =>
    a.format === b.format &&
    JSON.stringify(a.age ?? null) === JSON.stringify(b.age ?? null) &&
    a.schedule.kind === b.schedule.kind;

  interface Kept {
    e: RawEvent;
    s: Set<number>;
    unit: number;
    failed: boolean;
  }
  const kept: Kept[] = [];
  const dropped = new Set<RawEvent>();
  const notes: string[] = [];
  const label = (k: { e: RawEvent; s: ReadonlySet<number> }) => `„${k.e.title}“ (${k.e.format}, ${k.s.size} Termine)`;

  ordered.forEach((u, ui) => {
    if (u.id === KANDIDATEN) return;
    for (const e of u.events) {
      const s = starts(e);
      const twin = kept.find((x) => {
        if (dropped.has(x.e) || x.unit === ui || x.e.venueId !== e.venueId || sameShape(x.e, e)) return false;
        if (!sameCoreTitle(x.e.title, e.title) || conflictingLabels(x.e.title, e.title)) return false;
        if (!compatibleAge(x.e.age, e.age)) return false;
        const small = Math.min(x.s.size, s.size);
        if (small === 0) return false;
        let both = 0;
        for (const v of s) if (x.s.has(v)) both++;
        return both / small >= SAME_UNIT_SESSIONS;
      });
      const me: Kept = { e, s, unit: ui, failed: u.failed };
      if (twin) {
        const [a, b] = [passung(e, s), passung(twin.e, twin.s)];
        const wins = !(u.failed && !twin.failed) && (a > b || (a === b && s.size > twin.s.size));
        const [loser, winner] = wins ? [twin, me] : [me, twin];
        dropped.add(loser.e);
        notes.push(`${label(loser)} entfällt, gleich ${label(winner)} aus ${ordered[winner.unit]?.id}`);
        if (!wins) continue;
      }
      kept.push(me);
    }
  });
  return {
    units: ordered.map((u) => ({ id: u.id, failed: u.failed, events: u.events.filter((e) => !dropped.has(e)) })),
    notes,
  };
}
