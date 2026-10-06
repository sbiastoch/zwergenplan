/**
 * Lange Wegzeit im Detail und im Orts-Sheet (Plan 0012, E10): „ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“. Der Pfeil
 * ist für Screenreader verborgen und durch „, dann“ ersetzt („mit Bus 37, dann U1“). Vor dem Pfeil steht U+00A0,
 * damit keine Zeile mit „→“ beginnt. Keine Logik außer den Teilen aus `reachLong`.
 */
import type { Origin, Reach } from "../domain/reach.ts";
import type { TransitLineNames } from "../domain/transit-types.ts";
import { reachLong } from "./format.ts";

export function ReachLong({ reach, origin }: { reach: Reach; origin: Origin }) {
  const { before, lines, after } = reachLong(reach, origin);
  return (
    <span className="reach-long">
      {before}
      {lines && <LineChain lines={lines} />}
      {after}
    </span>
  );
}

/** Linien mit Pfeil, vorgelesen mit „, dann“; auch in der Karte „Wege ab …“ (Plan 0019, E6) */
export function LineChain({ lines: [first, second] }: { lines: TransitLineNames }) {
  return (
    <>
      {first}
      {second !== undefined && (
        <>
          <span aria-hidden="true">{" → "}</span>
          <span className="sr-only">, dann </span>
          {second}
        </>
      )}
    </>
  );
}
