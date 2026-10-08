/**
 * Wächter gegen lokale E2E-Läufe ohne maschinenweite Sperre (Plan 0027, E4, E7).
 * Mehrere Worktrees fuhren am 2026-10-08 gleichzeitig die volle Suite. Die Last stieg auf 46–116 bei 16 Kernen,
 * und Tests flackerten. Lokal läuft E2E deshalb nur über `pnpm e2e:local <spec …>` oder `pnpm e2e`, beide unter
 * `scripts/heavy.ts`, das ZP_HEAVY_LOCK=1 setzt. In CI (CI=true) gibt es keine fremde Last und keine Sperre.
 *
 * Das ist bewusst ein globalSetup und kein Wurf beim Laden der Konfiguration: knip lädt playwright.config.ts, und
 * `--list` muss ohne Sperre gehen (Review B1). globalSetup läuft nur beim echten Testlauf.
 */
export default function globalSetup(): void {
  if (process.env["CI"] || process.env["ZP_HEAVY_LOCK"] === "1") return;
  throw new Error(
    "E2E lokal nur unter der maschinenweiten Sperre: `pnpm e2e:local <spec …>` (gezielt, pixel-7) oder `pnpm e2e` " +
      "(alles). Direkt `playwright test` geht nur mit CI=true (Plan 0027, E4).",
  );
}
