/**
 * Geteilte Typen für Push (Plan 0011, E9; ADR 0014): Service Worker, Cloudflare Worker (`push-worker/`) und die
 * CI-Skripte nutzen dieselben Formen. Rein, ohne Zod – geprüft wird in `scripts/lib/push-payload-schema.ts` und
 * `push-worker/src/lib/subscription.ts`.
 */

/** Die vorgeschlagene Nachricht einer Declarative-Web-Push-Payload. */
export interface PushNotificationFields {
  title: string;
  body: string;
  /** absolute URL, Pflicht: ohne `navigate` lehnt iOS `showNotification` im `push`-Event ab (Spike j) */
  navigate: string;
  tag: string;
  lang: "de";
  /** wirkt auf iOS 26.5 nicht (Spike g), bleibt laut Spec drin */
  app_badge: number;
  /** Versandzeitpunkt, ISO mit Offset: das `now` des Zuschnitts im Service Worker (E10) */
  data: { sentAt: string };
}

/** Declarative Web Push (`"web_push": 8030`); `mutable` erlaubt dem Service Worker den Zuschnitt. */
export interface DeclarativePushPayload {
  web_push: 8030;
  notification: PushNotificationFields;
  mutable: true;
}

/** `PushSubscription.toJSON()`: das Einzige, was der Worker über ein Gerät speichert (ADR 0014). */
export interface PushSubscriptionJson {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}
