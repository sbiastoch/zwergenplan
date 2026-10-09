/**
 * Entscheidung des CI-Jobs `gates` (Plan 0029, B5, Review 2, M2), rein: der eine Knoten für „alles grün“. Die
 * Eingaben setzt ci.yml über `env`, das CLI scripts/ci-gates.ts liest sie. Nur Node-Builtins
 * (`ci-scope-builtins-only`), der Job läuft ohne `pnpm install`.
 *
 * - `scope` und `check` sind immer `success`.
 * - Doku-Pfad (`full == false`): E2E und Smoke übersprungen (Plan 0027, E10).
 * - Auf `main` sonst: `e2e == full`, E2E und Smoke `success`. Eine Auswahl auf `main` ist immer rot, damit nur voll
 *   geprüfte Stände ausgeliefert werden (ADR 0023, Nr. 7; ADR 0021, Nr. 10).
 * - Auf Branches: Smoke `success`; E2E `success`, übersprungen nur bei `e2e == none` oder `devices == false`
 *   (Review 2, m2).
 */

export interface GatesInput {
  /** `github.ref` */
  ref: string;
  /** Ausgaben von `scope` */
  full: string;
  e2e: string;
  devices: string;
  smoke: string;
  /** `needs.<job>.result`: success, failure, cancelled, skipped */
  results: { scope: string; check: string; e2e: string; smoke: string };
}

const MAIN_REF = "refs/heads/main";

export function decideGates(input: GatesInput): { ok: boolean; message: string } {
  const { ref, full, e2e, devices, results } = input;
  const red = (message: string) => ({ ok: false, message });
  if (results.scope !== "success") return red(`scope ist ${results.scope}`);
  if (results.check !== "success") return red(`check ist ${results.check}`);

  if (full === "false") {
    return results.e2e === "skipped" && results.smoke === "skipped"
      ? { ok: true, message: "Doku-Pfad: nur check, kein E2E, kein Deploy" }
      : red(`Doku-Pfad, aber E2E ${results.e2e}, Smoke ${results.smoke}`);
  }

  if (results.smoke !== "success") return red(`Smoke ist ${results.smoke}`);
  if (ref === MAIN_REF) {
    if (e2e !== "full") return red(`auf main muss die volle Suite laufen, scope meldet e2e=${e2e}`);
    if (results.e2e !== "success") return red(`E2E ist ${results.e2e}`);
    return { ok: true, message: "alle Gates grün, volle Suite" };
  }

  if (results.e2e === "success") return { ok: true, message: `alle Gates grün (e2e=${e2e})` };
  if (results.e2e === "skipped" && (e2e === "none" || devices === "false")) {
    return { ok: true, message: `alle Gates grün, keine Geräte-Specs (e2e=${e2e})` };
  }
  return red(`E2E ist ${results.e2e} bei e2e=${e2e}, devices=${devices}`);
}
