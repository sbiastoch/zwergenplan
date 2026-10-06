/**
 * Zod-Schema der Wochen-Nachricht (Plan 0011, E9; Plan 0017, E5). Liegt nicht in src/domain: Zod gehört dort nur in
 * den Datenvertrag (`no-zod-in-client-transitive`). `push-weekly-core.ts` prüft jede Payload vor dem Versand; eine
 * ungültige ist ein Programmierfehler und macht den Lauf rot.
 */
import { z } from "zod";
import { PUSH_TAG } from "../../src/domain/push-payload.ts";

const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

export const PushPayloadSchema = z
  .object({
    web_push: z.literal(8030),
    notification: z
      .object({
        title: z.string().min(1).max(80),
        body: z.string().min(1).max(200),
        navigate: z.url({ protocol: /^https?$/ }),
        tag: z.literal(PUSH_TAG),
        lang: z.literal("de"),
        data: z.object({ sentAt: z.string().regex(OFFSET_ISO), test: z.literal(true).optional() }).strict(),
      })
      .strict(),
    mutable: z.literal(true),
  })
  .strict();
