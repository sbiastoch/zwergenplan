/**
 * Wochen-Nachricht versenden (Plan 0017, E1, E2; ADR 0014). Verdrahtet nur git, Dateien, Worker und `web-push`;
 * der Ablauf steht testbar in `scripts/lib/push-weekly-core.ts`. Einziger Ort für `web-push`
 * (`web-push-only-in-push-weekly`).
 *
 *   node scripts/push-weekly.ts                      Zeitplan-Lauf (nur Samstag 10–14 Uhr Berlin, Versand-Marke)
 *   node scripts/push-weekly.ts --force --dry-run    Abos zählen
 *   node scripts/push-weekly.ts --force --only=<id>  Testversand an ein Gerät (Geräte-Kennung im Kind-Sheet)
 *
 * Secrets: `VAPID_PRIVATE_KEY` und `PUSH_ADMIN_TOKEN` aus der Umgebung (GitHub-Secrets), lokal ersatzweise aus der
 * gitignorierten `.push.local.json`. Sie werden nie ausgegeben. Ausgabe nur als Zahlen. Fehler beim Senden oder am
 * Worker sind Warnungen (Exit 0); rot wird der Lauf nur bei einer ungültigen Payload (Programmierfehler).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import webpush from "web-push";
import { ZodError } from "zod";
import { PUSH_WORKER_URL, SITE_URL, VAPID_PUBLIC_KEY } from "../site.config.ts";
import { PUSH_TOPIC, PUSH_TTL_SECONDS } from "../src/domain/push-payload.ts";
import type { PushSubscriptionJson } from "../src/domain/push-types.ts";
import { toSiteData } from "../src/domain/site-data.ts";
import { loadDataset, ROOT } from "./lib/load-data.ts";
import { parseWeeklyArgs, runWeekly, WORKER_SOURCES, workerVersionWarning } from "./lib/push-weekly-core.ts";

const inActions = process.env["GITHUB_ACTIONS"] === "true";
const warn = (line: string) => console.log(inActions ? `::warning::${line}` : `Warnung: ${line}`);

function secrets(): { vapidPrivateKey: string; adminToken: string } {
  const local = new URL(".push.local.json", ROOT);
  const file = existsSync(local)
    ? (JSON.parse(readFileSync(local, "utf8")) as { vapidPrivateKey?: string; adminToken?: string })
    : {};
  const vapidPrivateKey = process.env["VAPID_PRIVATE_KEY"] || file.vapidPrivateKey;
  const adminToken = process.env["PUSH_ADMIN_TOKEN"] || file.adminToken;
  if (!vapidPrivateKey || !adminToken) {
    throw new Error("VAPID_PRIVATE_KEY und PUSH_ADMIN_TOKEN fehlen (Umgebung oder .push.local.json)");
  }
  return { vapidPrivateKey, adminToken };
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", cwd: ROOT }).trim();

/** Worker-Code beim Commit `version` gleich HEAD? `git diff --quiet`: 0 gleich, 1 verschieden, sonst unbekannt */
function sameWorkerCode(version: string): boolean | undefined {
  try {
    execFileSync("git", ["diff", "--quiet", version, "HEAD", "--", ...WORKER_SOURCES], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch (error) {
    return error instanceof Error && "status" in error && error.status === 1 ? false : undefined;
  }
}

/** Angebots-IDs aus `data/offers.json` im letzten Commit vor `before` (Checkout mit `fetch-depth: 0`) */
async function previousIds(before: Date): Promise<string[] | undefined> {
  try {
    const sha = git("rev-list", "-1", `--before=${before.toISOString()}`, "HEAD", "--", "data/offers.json");
    if (!sha) return undefined;
    const file = JSON.parse(git("show", `${sha}:data/offers.json`)) as { offers?: { id: string }[] };
    return file.offers?.map((o) => o.id);
  } catch {
    return undefined;
  }
}

async function main() {
  const args = parseWeeklyArgs(process.argv.slice(2));
  const { vapidPrivateKey, adminToken } = secrets();
  const data = loadDataset("real");
  if (!data.ok) throw new Error(`Daten ungültig: ${data.errors.join("; ")}`);
  const auth = { authorization: `Bearer ${adminToken}`, "content-type": "application/json" };
  const worker = async (path: string, init: { method: string; body?: unknown } = { method: "GET" }) => {
    const response = await fetch(`${PUSH_WORKER_URL}${path}`, {
      method: init.method,
      headers: auth,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    return response;
  };

  // Der Worker wird von Hand deployt; weicht sein Code vom Repo ab, eine Warnung (Plan 0011, E11)
  try {
    const { version } = (await (await fetch(`${PUSH_WORKER_URL}/version`)).json()) as { version?: string };
    const warning = workerVersionWarning(version, sameWorkerCode);
    if (warning) warn(warning);
  } catch {
    warn("Version des Push-Workers nicht lesbar");
  }

  const result = await runWeekly(
    {
      now: new Date(),
      siteUrl: SITE_URL,
      current: toSiteData(data.providers, data.offers).offers,
      previousIds,
      worker: {
        list: async () => {
          const response = await worker("/abos");
          if (!response.ok) throw new Error(`GET /abos: ${response.status}`);
          return ((await response.json()) as { abos: { hash: string; subscription: PushSubscriptionJson }[] }).abos;
        },
        mark: async (day) => {
          const response = await worker(`/versand/${day}`, { method: "POST" });
          if (response.status === 409) return "schon";
          if (!response.ok) throw new Error(`POST /versand: ${response.status}`);
          return "neu";
        },
        remove: async (hashes) => {
          const response = await worker("/abos/loeschen", { method: "POST", body: { hashes } });
          if (!response.ok) warn(`POST /abos/loeschen: ${response.status}`);
        },
      },
      send: async (subscription, payload) => {
        try {
          const response = await webpush.sendNotification(subscription, payload, {
            TTL: PUSH_TTL_SECONDS,
            urgency: "normal",
            topic: PUSH_TOPIC,
            vapidDetails: { subject: SITE_URL, publicKey: VAPID_PUBLIC_KEY, privateKey: vapidPrivateKey },
          });
          return response.statusCode;
        } catch (error) {
          if (error instanceof webpush.WebPushError) return error.statusCode;
          throw error;
        }
      },
      log: (line) => console.log(line),
      warn,
    },
    args,
  );
  console.log(`Ergebnis: ${result.status}`);
}

try {
  await main();
} catch (error) {
  // Eine ungültige Payload ist ein Programmierfehler: rot. Alles andere (Worker, Netz) ist eine Warnung.
  if (error instanceof ZodError) {
    console.error(`Payload ungültig: ${error.message}`);
    process.exit(1);
  }
  if (error instanceof Error && /Argument|--only|fehlen/.test(error.message)) {
    console.error(error.message);
    process.exit(1);
  }
  warn(`Kein Versand: ${error instanceof Error ? error.message : String(error)}`);
}
