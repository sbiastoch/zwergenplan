/**
 * Schlüssel und Wert des Flags „Onboarding erledigt“ (Plan 0034, E6). Eine Quelle für E2E und `scripts/screenshots.ts`:
 * `e2e/` darf nichts aus `src/` importieren (`e2e-black-box`), `scripts/` nichts aus `src/data/` (`scripts-not-ui`).
 * Gekoppelt an `src/data/preferences.ts` über einen Unit-Test in `src/data/preferences.test.ts`.
 */
export const ONBOARDING_FLAG = { key: "zwergenplan.einfuehrung", value: "2" } as const;
