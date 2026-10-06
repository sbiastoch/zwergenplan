/**
 * Ablauf der Wochen-Nachricht (Plan 0017, E1, E2), ohne Netz und git testbar: `scripts/push-weekly.ts` verdrahtet
 * nur git, Dateien, Worker und `web-push`.
 *
 * 1. Zeitplan-Lauf: nur samstags 10–14 Uhr Berlin (`shouldSendNow`); Testversand (`--force`) ohne Wächter.
 * 2. Zahlen aus den Daten im Repo: neu seit dem Stand vor 7 × 24 h, Angebote der nächsten 7 Tage.
 * 3. Payload bauen und mit Zod prüfen (ungültig = Programmierfehler, rot).
 * 4. Erst die Abos lesen, dann die Versand-Marke setzen (ein Lesefehler kostet die Woche nicht), dann senden.
 *    404/410 → beim Worker löschen. Fehler beim Senden sind Warnungen. Ausgabe nur als Zahlen.
 */
import { newOfferIds, offersInWeek } from "../../src/domain/news.ts";
import { weeklyPayload } from "../../src/domain/push-payload.ts";
import type { PushSubscriptionJson } from "../../src/domain/push-types.ts";
import type { SiteOffer } from "../../src/domain/site-data.ts";
import { PushPayloadSchema } from "./push-payload-schema.ts";
import { berlinDay, shouldSendNow } from "./push-schedule.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklyArgs {
  /** Testversand: ohne Wächter und Versand-Marke, Payload mit `data.test` */
  force: boolean;
  /** nur Abos zählen */
  dryRun: boolean;
  /** nur Abos, deren Hash so beginnt (Geräte-Kennung) */
  only?: string;
}

export function parseWeeklyArgs(argv: readonly string[]): WeeklyArgs {
  const args: WeeklyArgs = { force: false, dryRun: false };
  for (const arg of argv) {
    if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--only=")) args.only = arg.slice("--only=".length);
    else throw new Error(`Argument unbekannt: ${arg}`);
  }
  if (args.only === "") delete args.only;
  // Ein kurzer Präfix träfe viele Geräte (`a`: jedes 16.); die Geräte-Kennung hat 8 Zeichen (Arch-Review N11)
  if (args.only !== undefined && !/^[0-9a-f]{8,64}$/.test(args.only))
    throw new Error("--only braucht die Geräte-Kennung (8 Hex-Zeichen)");
  // Ein Testversand geht nie an alle (Plan 0011, E11)
  if (args.force && !args.dryRun && args.only === undefined)
    throw new Error("Testversand nur mit --only=<Geräte-Kennung>");
  return args;
}

export interface WeeklyDeps {
  now: Date;
  siteUrl: string;
  /** Angebote des Checkouts (`toSiteData(loadDataset())`) */
  current: readonly SiteOffer[];
  /** Angebots-IDs aus dem letzten Commit vor `before`; `undefined`, wenn es keinen gibt */
  previousIds(before: Date): Promise<string[] | undefined>;
  worker: {
    list(): Promise<{ hash: string; subscription: PushSubscriptionJson }[]>;
    /** Versand-Marke `POST /versand/<tag>`: „schon“ bei 409 */
    mark(day: string): Promise<"neu" | "schon">;
    remove(hashes: string[]): Promise<void>;
  };
  /** HTTP-Status des Push-Dienstes; wirft bei Netzfehlern */
  send(subscription: PushSubscriptionJson, payload: string): Promise<number>;
  log(line: string): void;
  warn(line: string): void;
}

export type WeeklyResult =
  | { status: "ausserhalb" }
  | { status: "schon-gesendet"; news: number; week: number }
  | { status: "trocken"; news: number; week: number; subscriptions: number }
  | { status: "gesendet"; news: number; week: number; sent: number; removed: number; failed: number };

export async function runWeekly(deps: WeeklyDeps, args: WeeklyArgs): Promise<WeeklyResult> {
  const { now } = deps;
  if (!args.force && !shouldSendNow(now)) {
    deps.log("Nicht Samstag 10–14 Uhr (Berlin): kein Versand.");
    return { status: "ausserhalb" };
  }
  const before = await deps.previousIds(new Date(now.getTime() - WEEK_MS));
  if (!before) deps.warn("Der alte Stand vor 7 Tagen fehlt: neu = 0.");
  const news = before ? newOfferIds(before, deps.current, now).length : 0;
  const week = offersInWeek(deps.current, now).length;
  const payload = PushPayloadSchema.parse(
    weeklyPayload({ news, week, siteUrl: deps.siteUrl, sentAt: now, ...(args.force ? { test: true as const } : {}) }),
  );
  deps.log(`Neu: ${news}, nächste 7 Tage: ${week}`);

  const all = await deps.worker.list();
  const targets = args.only === undefined ? all : all.filter((a) => a.hash.startsWith(args.only ?? ""));
  if (args.dryRun) {
    deps.log(`${targets.length} Abos (Trockenlauf, nichts gesendet)`);
    return { status: "trocken", news, week, subscriptions: targets.length };
  }
  if (!args.force && (await deps.worker.mark(berlinDay(now))) === "schon") {
    deps.log("Versand-Marke für heute ist schon gesetzt: kein zweiter Versand.");
    return { status: "schon-gesendet", news, week };
  }

  const text = JSON.stringify(payload);
  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  for (const { hash, subscription } of targets) {
    try {
      const status = await deps.send(subscription, text);
      if (status === 404 || status === 410) gone.push(hash);
      else if (status >= 200 && status < 300) sent++;
      else {
        failed++;
        deps.warn(`Push-Dienst antwortete ${status}`);
      }
    } catch (error) {
      failed++;
      deps.warn(`Senden gescheitert: ${(error as Error).message}`);
    }
  }
  if (gone.length > 0) await deps.worker.remove(gone);
  deps.log(`Gesendet: ${sent}, entfernt: ${gone.length}, Fehler: ${failed}`);
  return { status: "gesendet", news, week, sent, removed: gone.length, failed };
}
