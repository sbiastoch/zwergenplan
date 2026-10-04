/** Dateien eines Laufs (runs/<from>/): geprüft beim Lesen, damit kaputte Zwischenstände laut scheitern. */
import { z } from "zod";
import { SOURCES } from "./candidate.ts";

export const RunMeta = z.object({ from: z.iso.date(), to: z.iso.date(), startedAt: z.string() });
export type RunMeta = z.infer<typeof RunMeta>;

export const SourceStatus = z.object({
  status: z.enum(["ok", "keine-termine", "fehler"]),
  count: z.number().optional(),
  reason: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  fetchedAt: z.string(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;
export const SourceStatusFile = z.partialRecord(z.enum(SOURCES), SourceStatus);
