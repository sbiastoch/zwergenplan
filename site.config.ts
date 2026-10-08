/** Einzige Stelle für Pfad/URL der Seite (Vite, Preview, Playwright, Plausibilitätscheck). */
export const BASE = "/";
export const SITE_URL = "https://zwergenplan.app/";
/** Build-Ausgabe je Datenquelle: Testdaten gehen nie nach dist/ (Vite, Kachelbilder in scripts/og-images.ts). */
export const OUT_DIR = { real: "dist", fixture: "dist-e2e" } as const;
/** Push-Worker der Wochen-Nachricht (Plan 0017; ADR 0014): An- und Abmelden, Abos für den Versand. */
export const PUSH_WORKER_URL = "https://zwergenplan-push.sbiastoch.workers.dev";
/** Öffentlicher VAPID-Schlüssel (der private liegt nur im GitHub-Secret VAPID_PRIVATE_KEY und lokal in .push.local.json). */
export const VAPID_PUBLIC_KEY =
  "BL1peSS-5OpJoHQTUGBQVpHcq3mGSq9Quzk5_lt9ski-wx8-t0_SaDi2QgnIzhnd6p3bwyAzkhyjI1w8DH_9y64";
