// Versand für den Spike: node src/send.ts <variante> [--only=<kennung>] [--base=<worker-url>]
// Liest .spike.json (gitignored): { base, token, vapidPublic, vapidPrivate }.

import { readFileSync } from "node:fs";
import webpush from "web-push";

const VARIANTS = [
  "nichts",
  "ersetzen",
  "warten-5",
  "warten-10",
  "warten-20",
  "warten-30",
  "werfen-sync",
  "werfen-async",
  "site-json",
  "badge",
  "badge-sw",
  "navigate-sw",
  "klick",
  "fest",
] as const;

const config = JSON.parse(readFileSync(new URL("../.spike.json", import.meta.url), "utf8")) as {
  base: string;
  token: string;
  vapidPublic: string;
  vapidPrivate: string;
};

const args = process.argv.slice(2);
const variant = args.find((a) => !a.startsWith("--"));
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const topic = args.find((a) => a.startsWith("--topic="))?.slice(8);
if (!variant || !(VARIANTS as readonly string[]).includes(variant)) {
  process.stderr.write(`Variante fehlt. Erlaubt: ${VARIANTS.join(", ")}` + "\n");
  process.exit(1);
}
if (!only) {
  process.stderr.write("--only=<kennung> ist Pflicht (nie an alle)." + "\n");
  process.exit(1);
}

webpush.setVapidDetails("https://zwergenplan.app/", config.vapidPublic, config.vapidPrivate);

const res = await fetch(`${config.base}/spike/abos`, { headers: { authorization: `Bearer ${config.token}` } });
const abos = (await res.json()) as { kennung: string; ctx: string; subscription: webpush.PushSubscription }[];
const targets = abos.filter((a) => a.kennung.startsWith(only));
if (targets.length === 0) {
  process.stderr.write(
    `Kein Abo mit Kennung ${only}. Vorhanden: ${abos.map((a) => `${a.kennung} (${a.ctx})`).join(", ")}\n`,
  );
  process.exit(1);
}

const sentAt = new Date().toISOString();
const notification: Record<string, unknown> = {
  title: `Spike: ${variant}`,
  body: `Deklarativ (allgemein), ${new Date().toLocaleTimeString("de-DE")}`,
  navigate: `${config.base}/spike/?ziel=deklarativ-${variant}`,
  tag: `spike-${variant}`,
  lang: "de",
  data: { variant, sentAt },
};
if (variant === "badge") notification.app_badge = 5;
const payload = { web_push: 8030, notification, mutable: variant !== "fest" };

for (const target of targets) {
  try {
    const r = await webpush.sendNotification(target.subscription, JSON.stringify(payload), {
      TTL: 600,
      urgency: "high",
      ...(topic ? { topic } : {}),
    });
    process.stdout.write(`${target.kennung} (${target.ctx}): ${r.statusCode}` + "\n");
  } catch (e) {
    const err = e as { statusCode?: number; body?: string };
    process.stdout.write(
      `${target.kennung} (${target.ctx}): FEHLER ${err.statusCode ?? ""} ${err.body ?? String(e)}` + "\n",
    );
  }
}
