/**
 * Die allgemeine Push-Nachricht, die die CI an alle Abos schickt (Plan 0011, E9 und E11). Sie nennt nur die Zahl
 * neuer Angebote – den Zuschnitt aufs Kind macht der Service Worker auf dem Gerät (`news.ts`, ADR 0014).
 */
import type { DeclarativePushPayload } from "./push-types.ts";
import { toBerlinIso } from "./time.ts";

/** Tag der Nachricht; ersetzt auf iOS keine ältere, mehrere Pushes stapeln sich (Spike). */
export const PUSH_TAG = "neue-angebote";

/**
 * Topic des Push-Dienstes: Ein noch nicht zugestelltes Push wird ersetzt. Muss Base64url sein, mit einer Länge,
 * die ein Vielfaches von 4 ist – Apple lehnt „neue-angebote“ mit 400 `BadWebPushTopic` ab (Spike).
 */
export const PUSH_TOPIC = "neueangebote";

/** Wie lange der Push-Dienst ein Push für ein offline Gerät aufhebt: 2 Tage. */
export const PUSH_TTL_SECONDS = 172_800;

/** Fester Text, wenn die Payload kaputt ist: Chrome verlangt bei jedem Push eine sichtbare Nachricht (E10). */
export const FALLBACK_TITLE = "Neues im Zwergenplan";

/** Ziel eines Tipps auf die Nachricht: die App mit dem Block „Neu“ (E13). */
export function newsUrl(siteUrl: string): string {
  return new URL("?neu", siteUrl).href;
}

export function generalBody(count: number): string {
  return count === 1 ? "1 neues Angebot im Zwergenplan" : `${count} neue Angebote im Zwergenplan`;
}

export function declarativePayload({
  count,
  siteUrl,
  sentAt,
}: {
  count: number;
  siteUrl: string;
  sentAt: Date;
}): DeclarativePushPayload {
  // Ohne neue Angebote gibt es keine Nachricht (Job `notify` läuft dann nicht); alles andere ist ein Programmierfehler.
  if (!Number.isInteger(count) || count < 1) throw new RangeError(`Keine Nachricht für ${count} neue Angebote`);
  return {
    web_push: 8030,
    notification: {
      title: "Zwergenplan",
      body: generalBody(count),
      navigate: newsUrl(siteUrl),
      tag: PUSH_TAG,
      lang: "de",
      app_badge: count,
      data: { sentAt: toBerlinIso(sentAt) },
    },
    mutable: true,
  };
}
