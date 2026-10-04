/**
 * Anmeldefenster relativ zu „jetzt“ (Plan 0007, E3). Eigenes Modul statt agenda.ts, weil es nicht
 * um Termine geht. „Jetzt“ wird hineingegeben, nie hier erzeugt.
 */
import type { Offer } from "./schema.ts";

export type RegistrationPhase = "bald" | "offen" | "vorbei";

/** undefined = kein Fenster bekannt. Grenzen: opens ≤ now ist offen, now > deadline ist vorbei. */
export function registrationPhase(
  registrationWindow: Offer["registrationWindow"],
  now: Date,
): RegistrationPhase | undefined {
  const { opens, deadline } = registrationWindow ?? {};
  if (opens === undefined && deadline === undefined) return undefined;
  const t = now.getTime();
  if (deadline !== undefined && t > Date.parse(deadline)) return "vorbei";
  if (opens !== undefined && t < Date.parse(opens)) return "bald";
  return "offen";
}
