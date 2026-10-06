/**
 * Was beim Push angezeigt wird (Plan 0011, E10; Plan 0017, E10), rein. `sw.ts` liest Event und Payload,
 * `push-tailor.ts` schneidet zu, hier fällt die Entscheidung.
 *
 * - Zuschnitt da: ihn zeigen.
 * - Sonst deklarativ (`event.notification`, iOS): nichts zeigen, das System zeigt die allgemeine Fassung (Spike e, f).
 * - Sonst klassisch (Chromium, Firefox): die vorgeschlagene Nachricht selbst zeigen, kaputt der feste Ersatztitel.
 *
 * `navigate` steht in jeder Nachricht (ohne lehnt iOS `showNotification` ab, Spike j) und ist immer die Startseite.
 * Kein Badge (Spike g).
 */
import { FALLBACK_TITLE, PUSH_TAG } from "../domain/push-payload.ts";
import type { TailorOutcome } from "./push-tailor.ts";

export interface Proposed {
  title: string;
  body: string;
  sentAt?: string;
  test: boolean;
}

/** Vorgeschlagene Nachricht aus `event.notification` bzw. `payload.notification`; kaputt → `undefined` */
export function readProposed(raw: unknown): Proposed | undefined {
  const { title, body, data } = Object(raw) as { title?: unknown; body?: unknown; data?: unknown };
  if (typeof title !== "string" || typeof body !== "string") return undefined;
  const { sentAt, test } = Object(data) as { sentAt?: unknown; test?: unknown };
  return { title, body, ...(typeof sentAt === "string" ? { sentAt } : {}), test: test === true };
}

export interface Shown {
  title: string;
  options: {
    body: string;
    tag: string;
    lang: "de";
    icon: string;
    navigate: string;
    data: { navigate: string };
  };
}

export function decidePush({
  proposed,
  declarative,
  outcome,
  scope,
}: {
  proposed: Proposed | undefined;
  /** `event.notification` war da (Declarative Web Push) */
  declarative: boolean;
  outcome: TailorOutcome;
  scope: string;
}): { show: Shown | null } {
  const show = (title: string, body: string): { show: Shown } => ({
    show: {
      title,
      options: {
        body,
        tag: PUSH_TAG,
        lang: "de",
        icon: new URL("icons/icon-192.png", scope).href,
        navigate: scope,
        data: { navigate: scope },
      },
    },
  });
  if (outcome.kind === "text") return show(outcome.text.title, outcome.text.body);
  if (declarative) return { show: null };
  return proposed ? show(proposed.title, proposed.body) : show(FALLBACK_TITLE, "");
}
