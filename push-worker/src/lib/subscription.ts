/**
 * Prüfung eines Push-Abos (Plan 0011, E11; Plan 0017): Schema, Größe und Allowlist der Push-Dienste. Rein.
 * Gespeichert wird nur, was hier durchkommt: endpoint, expirationTime und die beiden Schlüssel.
 */
import { z } from "zod";
import type { PushSubscriptionJson } from "../../../src/domain/push-types.ts";

/** Größte Anfrage an die öffentlichen Routen */
export const MAX_BODY_BYTES = 2048;

/** Exakte Hosts und Suffixe (mit Punkt) der Push-Dienste von Apple, Google, Mozilla und Microsoft */
const EXACT_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com"];
const HOST_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];

export function allowedEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname;
  return EXACT_HOSTS.includes(host) || HOST_SUFFIXES.some((s) => host.endsWith(s));
}

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

const Subscription = z.object({
  endpoint: z.string().max(1500).refine(allowedEndpoint),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(200).regex(BASE64URL),
    auth: z.string().min(1).max(100).regex(BASE64URL),
  }),
});

/** Abo aus dem rohen Body oder `undefined` (kaputt, zu groß, fremder Dienst). */
export function parseSubscription(body: string): PushSubscriptionJson | undefined {
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return undefined;
  }
  const parsed = Subscription.safeParse(raw);
  if (!parsed.success) return undefined;
  const { endpoint, expirationTime, keys } = parsed.data;
  return { endpoint, ...(expirationTime === undefined ? {} : { expirationTime }), keys };
}
