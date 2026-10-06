/**
 * Geteilte Typen für Push (Plan 0011, E9; Plan 0017, E5; ADR 0014): Service Worker, Cloudflare Worker (`push-worker/`) und die
 * CI-Skripte nutzen dieselben Formen. Rein, ohne Zod – geprüft wird in `scripts/lib/push-payload-schema.ts` und
 * `push-worker/src/lib/subscription.ts`.
 */

/** Die vorgeschlagene Nachricht einer Declarative-Web-Push-Payload. */
interface PushNotificationFields {
  title: string;
  body: string;
  /** absolute URL, Pflicht: ohne `navigate` lehnt iOS `showNotification` im `push`-Event ab (Spike j) */
  navigate: string;
  tag: string;
  lang: "de";
  /**
   * Versandzeitpunkt, ISO mit Offset: das `now` des Zuschnitts im Service Worker (Plan 0017, E10). `test` markiert
   * einen Testversand; der Service Worker schreibt dann nichts in den Geräte-Speicher (E3). Kein `app_badge`: wirkt
   * auf iOS nicht (Spike g).
   */
  data: { sentAt: string; test?: true };
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
