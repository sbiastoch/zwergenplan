/**
 * ID-Gate im Nachtlauf (ADR 0041; Plan 0049, Nachtrag 2, B2–B5): nach dem Bearbeiten aller Anbieter und vor dem Build.
 * Baut (a) und (b), bestimmt die Verluste je gated Einheit (`lib/id-gate.ts`) und entscheidet je Einheit:
 * hingenommen (`data/id-hinnehmen.yaml`), Urteil des Richters ohne `unklar` → Übernahme samt `keepIds`, sonst Halten
 * (`holdUnit`, Grund `unklar` oder `grenze`). Danach prüft ein dritter Build das Ergebnis aller Entscheidungen gegen
 * (b) (`recheck`). Gibt die geänderten Zustände zurück; schreiben tut der Nachtlauf.
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

/**
 * Fehler im Gate (Programmfehler, inkonsistenter Zustand) dürfen den Nachtlauf nicht kippen und keine ID kosten
 * (Arch-Review M3): Dann werden alle gated Einheiten mit `grenze` gehalten, der Build danach ist der Stand (b).
 */
export async function runIdGate(o: IdGateOptions): Promise<IdGateResult> {
  const calls: CallRecord[] = [];
  try {
    return await gate(o, calls);
  } catch (e) {
    const why = `ID-Gate: ${e instanceof Error ? e.message : String(e)}`;
    const out: IdGateResult = { raws: {}, entries: [], calls, held: {} };
    try {
      holdAll(o, out, gatedUnits(o.prev, o.next), why);
      return out;
    } catch {
      // auch das Halten scheitert (Arch-Review 2, m2): die gated Einheiten auf den Vorstand zurück, ohne `held`. Die
      // nächste Nacht sieht dieselbe neue Fassung und richtet erneut; keine ID geht verloren
      return revertAll(o, calls, why);
    }
  }
}

/** Letzter Ausweg: alle gated Einheiten im Stand des Vorstands (Stand (b)), ohne Halten und ohne Urteil. */
function revertAll(o: IdGateOptions, calls: CallRecord[], why: string): IdGateResult {
  const out: IdGateResult = { raws: {}, entries: [], calls, held: {} };
  const gated = new Map<string, Set<string>>();
  for (const [id, n] of Object.entries(o.next)) {
    const p = o.prev[id];
    if (!p || !isV2(p) || !isV2(n)) continue;
    // ohne `gatedUnits` (das selbst geworfen haben kann): jede Einheit mit neuem Ergebnis, eine Obermenge der gated
    const units = new Set(
      Object.keys(n.units).filter((u) => {
        const before = p.units[u];
        return before?.inputHash !== undefined && n.units[u]?.inputHash !== before.inputHash;
      }),
    );
    if (units.size > 0) gated.set(id, units);
  }
  for (const [id, raw] of Object.entries(heldBack(o.prev, o.next, gated))) {
    const units = gated.get(id);
    if (!units || !isV2(raw)) continue;
    out.raws[id] = raw;
    out.held[id] = [...units].sort();
    for (const unit of out.held[id] ?? [])
      out.entries.push({ provider: id, unit, outcome: "gehalten", held: "grenze", ids: [], note: why });
  }
  return out;
}

/** Alle noch nicht gehaltenen gated Einheiten mit `grenze` halten (Ergebnis wie Stand (b)). */
function holdAll(o: IdGateOptions, out: IdGateResult, gated: ReturnType<typeof gatedUnits>, why: string): void {
  for (const [providerId, units] of gated)
    for (const unit of [...units].sort())
      if (!out.held[providerId]?.includes(unit))
        holdAfterCheck(o, out, { providerId, unit, lost: [] }, unit, "grenze", why);
}

/** Inkonsistenter Zustand im Gate: nie still durchlassen (Arch-Review m1), sondern über `runIdGate` halten. */
function inconsistent(what: string): never {
  throw new Error(`inkonsistenter Zustand: ${what}`);
}

async function gate(o: IdGateOptions, calls: CallRecord[]): Promise<IdGateResult> {
  const out: IdGateResult = { raws: {}, entries: [], calls, held: {} };
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
  // Ohne gültigen Stand (b) gibt es keinen Vergleich: alle gated Einheiten halten (nächste Nacht erneut). Der Build
  // danach scheitert dann wie (b) und schreibt keine offers.json; die IDs bleiben so sicher (ADR 0041)
  if (!b.file) {
    holdAll(o, out, gated, `Vergleichsstand (b) gescheitert: ${b.report.errors.slice(0, 2).join("; ")}`);
    return out;
  }
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
  /** Verluste, die gehen dürfen: Urteil `fehlerhaft`/`entfallen` oder hingenommen */
  const allowed = new Set<string>();

  for (const loss of losses) {
    const raw = out.raws[loss.providerId] ?? o.next[loss.providerId];
    const prevRaw = o.prev[loss.providerId];
    const provider = byId.get(loss.providerId);
    if (!raw || !isV2(raw) || !prevRaw || !isV2(prevRaw) || provider?.role !== "anbieter")
      inconsistent(`${loss.providerId} ohne Zustand V2 oder nicht im Katalog`);
    const prevUnit = prevRaw.units[loss.unit];
    const nextUnit = raw.units[loss.unit];
    if (!prevUnit || !nextUnit) inconsistent(`${loss.providerId} ${loss.unit} fehlt`);
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
    if (loss.crossUnit) {
      hold("unklar", undefined, "Verlust über eine Einheit ohne neue Fassung (vereinigt), kein Urteil möglich");
      continue;
    }
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
      for (const x of loss.lost) allowed.add(x.id);
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
    // je verlorener ID genau ein Urteil; fehlt eins (Richter ohne `readVerdicts`), ist es unklar
    const given = r.outcome.verdicts;
    const verdicts = loss.lost.map(
      (x): Verdict => given.find((v) => v.id === x.id) ?? { id: x.id, kind: "unklar", reason: "kein Urteil" },
    );
    const decision = decide(verdicts);
    if (!decision.adopt) {
      hold("unklar", verdicts);
      continue;
    }
    for (const v of decision.dropped) allowed.add(v.id);
    set(withKeepIds(nextUnit, decision.keepIds));
    out.entries.push({
      provider: loss.providerId,
      unit: loss.unit,
      outcome: "uebernommen",
      ids: titled(loss, verdicts),
    });
  }
  recheck({ o, out, b: b.file, origins: b.report.origins, unitOf: b.unitOf, gated, allowed, build });
  return out;
}

/**
 * Nachprüfung nach den Urteilen: Der Build mit allen Übernahmen darf keine ID verlieren, die (b) hat, außer der
 * Richter ließ sie gehen (`fehlerhaft`/`entfallen`) oder ein Mensch nahm sie hin (`allowed`). Die Verluste in (a)
 * gelten nur, solange alle gated Einheiten übernommen werden: Hält das Gate eine davon, kann eine andere eine ID
 * kosten, die in (a) die gehaltene trug; ein Erbe (`keepIds`) kann im Build an einer Dublette oder einem Konflikt
 * scheitern. Je solchem Verlust wird erst die Einheit gehalten, aus der das Angebot in (b) stammt, sonst jede
 * übernommene gated Einheit des Anbieters, bis nichts fehlt. Grund `grenze`: Eine so gehaltene Einheit hatte oft gar
 * kein eigenes Urteil (ihr Verlust zeigte sich erst nach dem Halten einer anderen); die nächste Nacht legt sie dem
 * Richter vor. Scheitert dagegen ein Erbe dauerhaft, kostet das einen Aufruf je Nacht, bis ein Mensch eingreift.
 */
function recheck(p: {
  o: IdGateOptions;
  out: IdGateResult;
  b: OffersFile;
  origins: Readonly<Record<string, string>>;
  unitOf: Readonly<Record<string, string>>;
  gated: ReturnType<typeof gatedUnits>;
  allowed: ReadonlySet<string>;
  build: (raws: Readonly<Record<string, ProviderRaw>>) => ReturnType<typeof buildFromState>;
}): void {
  const { o, out } = p;
  const isHeld = (providerId: string, unit: string) => out.held[providerId]?.includes(unit) ?? false;
  for (;;) {
    const c = p.build({ ...o.next, ...out.raws });
    // Scheitert die Mischung aus übernommenen und gehaltenen Einheiten (Arch-Review M3), alles halten: Das ist (b)
    if (!c.file) {
      holdAll(o, out, p.gated, `Build nach den Urteilen gescheitert: ${c.report.errors.slice(0, 2).join("; ")}`);
      return;
    }
    const missing = unitLosses({
      previous: o.previous,
      a: c.file,
      b: p.b,
      origins: p.origins,
      unitOf: p.unitOf,
      gated: p.gated,
      today: o.today,
    })
      .map((loss) => ({ ...loss, lost: loss.lost.filter((x) => !p.allowed.has(x.id)) }))
      .filter((loss) => loss.lost.length > 0);
    let changed = false;
    for (const loss of missing) {
      const units = isHeld(loss.providerId, loss.unit)
        ? [...(p.gated.get(loss.providerId) ?? [])].filter((u) => !isHeld(loss.providerId, u))
        : [loss.unit];
      for (const unit of units) changed = holdAfterCheck(o, out, loss, unit, "grenze") || changed;
    }
    if (!changed) return;
  }
}

/** Halten nach der Nachprüfung (oder ohne Vergleichsstand); ersetzt einen Eintrag der Einheit. */
function holdAfterCheck(
  o: IdGateOptions,
  out: IdGateResult,
  loss: UnitLoss,
  unit: string,
  reason: "unklar" | "grenze",
  note?: string,
): boolean {
  const prevRaw = o.prev[loss.providerId];
  const raw = out.raws[loss.providerId] ?? o.next[loss.providerId];
  const fresh = o.next[loss.providerId];
  if (!prevRaw || !isV2(prevRaw) || !raw || !isV2(raw) || !fresh || !isV2(fresh))
    inconsistent(`${loss.providerId} ohne Zustand V2`);
  const prevUnit = prevRaw.units[unit];
  // das Ergebnis der neuen Fassung ohne `keepIds`: Das Erbe gilt nur mit dem Urteil, das hier nicht trug
  const nextUnit = fresh.units[unit];
  if (!prevUnit || !nextUnit || nextUnit.inputHash === undefined || nextUnit.model === undefined)
    inconsistent(`${loss.providerId} ${unit} ohne alten oder neuen Stand`);
  const ids = loss.lost.map((x) => x.id);
  out.raws[loss.providerId] = {
    ...raw,
    units: { ...raw.units, [unit]: holdUnit(prevUnit, nextUnit, { since: o.now, reason, lost: ids }) },
  };
  out.held[loss.providerId] = [...(out.held[loss.providerId] ?? []), unit];
  const at = out.entries.findIndex((e) => e.provider === loss.providerId && e.unit === unit);
  const entry: IdGateEntry = {
    provider: loss.providerId,
    unit,
    outcome: "gehalten",
    held: reason,
    ids: loss.lost.map((x) => ({ id: x.id, title: x.title })),
    note: note ?? `Nachprüfung: ohne Halten fehlten ${ids.join(", ")}`,
  };
  if (at >= 0) out.entries.splice(at, 1, entry);
  else out.entries.push(entry);
  return true;
}
