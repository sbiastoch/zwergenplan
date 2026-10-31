/**
 * ID-Gate im Nachtlauf (ADR 0041; Plan 0049, Nachtrag 2, B2–B5): nach dem Bearbeiten aller Anbieter und vor dem Build.
 * Baut (a) und (b), bestimmt die Verluste je gated Einheit (`lib/id-gate.ts`) und entscheidet je Einheit:
 * hingenommen (`data/id-hinnehmen.yaml`), Urteil des Richters ohne `unklar` → Übernahme samt `keepIds`, sonst Halten
 * (`holdUnit`, Grund `unklar` oder `grenze`). Gibt die geänderten Zustände zurück; schreiben tut der Nachtlauf.
 */
import type { OffersFile, Provider } from "../../../src/domain/schema.ts";
import { type BuildInput, buildFromState, nightlyWindow } from "../lib/build-offers.ts";
import type { CallRecord } from "../lib/extract.ts";
import { gatedUnits, heldBack, judgeInputOf, type UnitLoss, unitLosses, withKeepIds } from "../lib/id-gate.ts";
import { decide, type Judge, type Verdict } from "../lib/judge.ts";
import { isV2, type ProviderRaw, type ProviderRawV2, type UnitState } from "../lib/raw.ts";
import { type FetchedProvider, holdUnit } from "../lib/refresh.ts";
import type { IdGateEntry } from "../lib/report.ts";
import { type UnitDef, unitExcerpt, unitsOf } from "../lib/units.ts";

export interface IdGateOptions {
  /** Zustand vor dem Lauf (`data/raw`) */
  prev: Readonly<Record<string, ProviderRaw>>;
  /** Zustand nach dem Bearbeiten aller Anbieter */
  next: Readonly<Record<string, ProviderRaw>>;
  catalog: readonly Provider[];
  previous: OffersFile | undefined;
  today: string;
  /** Abrufzeit des Laufs: `since` beim Halten */
  now: string;
  generatedAt: string;
  freeDays: Readonly<Record<string, string>>;
  sources: BuildInput["sources"];
  /** Abruf je Anbieter: Eingabetext der Einheit für den Richter */
  inputs: Readonly<Record<string, FetchedProvider>>;
  judge: Judge;
  signal: AbortSignal;
  /** vor jedem Aufruf des Richters: eigene Bremse und Zeitbudget (`JUDGE_BRAKES`, `JUDGE_BUDGET_MIN`) */
  mayJudge: (calls: readonly CallRecord[]) => boolean;
  /** Eintrag in `data/id-hinnehmen.yaml` für Anbieter und Beginn des Haltens (`acceptanceFor`) */
  accepted: (providerId: string, heldSince: string) => { grund: string } | undefined;
}

export interface IdGateResult {
  /** geänderte Zustände je Anbieter (nur die mit gerichteten Einheiten) */
  raws: Record<string, ProviderRawV2>;
  entries: IdGateEntry[];
  calls: CallRecord[];
  /** Einheiten, die gehalten wurden (Ergebnis `gehalten` im Bericht) */
  held: Record<string, string[]>;
}

const titled = (loss: UnitLoss, verdicts?: readonly Verdict[]) =>
  loss.lost.map((offer) => {
    const v = verdicts?.find((x) => x.id === offer.id);
    const reason = v && "reason" in v ? v.reason : undefined;
    return { id: offer.id, title: offer.title, ...(v ? { kind: v.kind } : {}), ...(reason ? { reason } : {}) };
  });

export async function runIdGate(o: IdGateOptions): Promise<IdGateResult> {
  const out: IdGateResult = { raws: {}, entries: [], calls: [], held: {} };
  const gated = gatedUnits(o.prev, o.next);
  if (gated.size === 0) return out;
  const build = (raws: Readonly<Record<string, ProviderRaw>>) =>
    buildFromState({
      raws,
      catalog: o.catalog,
      previous: o.previous,
      today: o.today,
      freeDays: o.freeDays,
      generatedAt: o.generatedAt,
      sources: o.sources,
    });
  const b = build(heldBack(o.prev, o.next, gated));
  // Ohne gültigen Stand (b) gibt es keinen Vergleich; der Build danach scheitert genauso und schreibt nichts
  if (!b.file) return out;
  const a = build(o.next);
  const losses: UnitLoss[] = a.file
    ? unitLosses({
        previous: o.previous,
        a: a.file,
        b: b.file,
        origins: b.report.origins,
        unitOf: b.unitOf,
        gated,
        today: o.today,
      })
    : // (a) scheitert nur an den neuen Ergebnissen: alle gated Einheiten halten, nächste Nacht erneut
      [...gated].flatMap(([providerId, units]) => [...units].map((unit) => ({ providerId, unit, lost: [] })));
  const byId = new Map(o.catalog.map((p) => [p.id, p] as const));
  const window = { from: o.today, to: nightlyWindow(o.today).horizon.to, freeDays: o.freeDays };
  let stopped = false;

  for (const loss of losses) {
    const raw = out.raws[loss.providerId] ?? o.next[loss.providerId];
    const prevRaw = o.prev[loss.providerId];
    const provider = byId.get(loss.providerId);
    if (!raw || !isV2(raw) || !prevRaw || !isV2(prevRaw) || provider?.role !== "anbieter") continue;
    const prevUnit = prevRaw.units[loss.unit];
    const nextUnit = raw.units[loss.unit];
    if (!prevUnit || !nextUnit) continue;
    const set = (state: UnitState) => {
      out.raws[loss.providerId] = { ...raw, units: { ...raw.units, [loss.unit]: state } };
    };
    const hold = (reason: "unklar" | "grenze", verdicts?: readonly Verdict[], note?: string) => {
      set(holdUnit(prevUnit, nextUnit, { since: o.now, reason, lost: loss.lost.map((x) => x.id) }));
      out.held[loss.providerId] = [...(out.held[loss.providerId] ?? []), loss.unit];
      out.entries.push({
        provider: loss.providerId,
        unit: loss.unit,
        outcome: "gehalten",
        held: reason,
        ids: titled(loss, verdicts),
        ...(note ? { note } : {}),
      });
    };
    if (!a.file) {
      hold(
        "grenze",
        undefined,
        `Build mit den neuen Ergebnissen gescheitert: ${a.report.errors.slice(0, 2).join("; ")}`,
      );
      continue;
    }
    // Hinnehmen deckt nur die Verluste, die beim Halten feststanden: Kostet eine neue Extraktion (geänderte Seite)
    // weitere IDs, hat die niemand hingenommen, und der Richter urteilt
    const covered = new Set(prevUnit.held?.lost ?? []);
    const acceptance =
      prevUnit.held && loss.lost.every((x) => covered.has(x.id))
        ? o.accepted(loss.providerId, prevUnit.held.since)
        : undefined;
    if (acceptance) {
      out.raws[loss.providerId] = raw;
      out.entries.push({
        provider: loss.providerId,
        unit: loss.unit,
        outcome: "hingenommen",
        ids: titled(loss),
        note: acceptance.grund,
      });
      continue;
    }
    const unit = o.inputs[loss.providerId]?.units.find((u) => u.id === loss.unit);
    if (stopped || !unit || o.signal.aborted || !o.mayJudge(out.calls)) {
      hold("grenze", undefined, unit ? "Richter nicht gelaufen (Bremse, Zeit oder Abbruch)" : "Eingabe fehlt");
      continue;
    }
    const def = unitsOf(provider, { candidates: true, hadKandidaten: true }).find((d) => d.id === loss.unit);
    const input = judgeInputOf({
      excerpt: unitExcerpt(provider, def ?? ({ id: loss.unit, beilagen: [] } satisfies UnitDef)),
      unit: loss.unit,
      text: unit.text,
      layout: { pageUrls: unit.pages.map((p) => p.url), candidates: unit.candidates.length },
      lost: loss.lost,
      events: nextUnit.events,
      a: a.file,
      previous: o.previous,
      window,
    });
    let r: Awaited<ReturnType<Judge>>;
    try {
      r = await o.judge(input, o.signal);
    } catch (e) {
      // Ein Programmfehler oder Abbruch im Richter darf den Lauf nicht kippen: Halten wie bei jedem anderen Fehler
      r = { outcome: { kind: "fehler", reason: `Richter: ${e instanceof Error ? e.message : String(e)}` }, calls: [] };
    }
    out.calls.push(...r.calls);
    if (r.outcome.kind !== "ok") {
      if (r.outcome.kind === "abort") stopped = true;
      hold("grenze", undefined, r.outcome.kind === "abort" ? `Richter: ${r.outcome.abort}` : r.outcome.reason);
      continue;
    }
    const decision = decide(r.outcome.verdicts);
    if (!decision.adopt) {
      hold("unklar", r.outcome.verdicts);
      continue;
    }
    set(withKeepIds(nextUnit, decision.keepIds));
    out.entries.push({
      provider: loss.providerId,
      unit: loss.unit,
      outcome: "uebernommen",
      ids: titled(loss, r.outcome.verdicts),
    });
  }
  return out;
}
