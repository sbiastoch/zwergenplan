/**
 * Entscheidung des Stop-Gates über grüne Stempel (Plan 0027, E5.2/E5.3), rein.
 * Ein Stempel gilt für eine Tree-ID, also für einen Inhalt. Frisch ist er, solange der letzte Lauf der Stufe C,
 * der diesen Inhalt abdeckt (`cAt`), keine 12 h zurückliegt. Ein Doku-Lauf (Stufe 0) erbt `cAt` seiner Basis.
 * So verlängert eine Kette reiner Doku-Turns die Frist nicht (Review 2, M-B). Die 12 h kommen daher, dass
 * validate-data am Datum hängt (Warnung zum Fahrplanwechsel).
 */
import type { Tier } from "./change-class.ts";

export interface Stamp {
  tier: Tier;
  at: number;
  cAt: number;
}

export const FRESH_MS = 12 * 60 * 60 * 1000;

export function isFresh(stamp: Stamp, now: number): boolean {
  const age = now - stamp.cAt;
  return age >= 0 && age < FRESH_MS;
}

export interface StopInput {
  now: number;
  /** Stempel für den aktuellen Baum, falls vorhanden */
  stamp?: Stamp | undefined;
  /** letzter grüner Baum dieses Worktrees mit seinem Stempel; `exists`: Tree-Objekt noch im Repo */
  base?: { tree: string; stamp?: Stamp | undefined; exists: boolean } | undefined;
}

export type StopDecision = { action: "pass" } | { action: "check"; base?: string };

export function decide({ now, stamp, base }: StopInput): StopDecision {
  if (stamp !== undefined && isFresh(stamp, now)) return { action: "pass" };
  if (base?.exists && base.stamp !== undefined && isFresh(base.stamp, now)) return { action: "check", base: base.tree };
  return { action: "check" };
}

/** Stempel nach einem grünen Lauf; Stufe 0 nur mit Basis-Stempel, dessen `cAt` sie erbt. */
export function nextStamp(tier: Tier, now: number, baseStamp?: Stamp): Stamp | undefined {
  if (tier === "C") return { tier, at: now, cAt: now };
  return baseStamp === undefined ? undefined : { tier, at: now, cAt: baseStamp.cAt };
}

/** Liest einen Stempel aus JSON; alles Unerwartete gilt als kein Stempel. */
export function parseStamp(raw: string | undefined): Stamp | undefined {
  if (raw === undefined) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || !("tier" in v) || !("at" in v) || !("cAt" in v)) return undefined;
    const { tier, at, cAt } = v;
    if ((tier !== "0" && tier !== "C") || typeof at !== "number" || typeof cAt !== "number") return undefined;
    return { tier, at, cAt };
  } catch {
    return undefined;
  }
}
