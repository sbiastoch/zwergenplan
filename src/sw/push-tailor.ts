/**
 * Zuschnitt der Wochen-Nachricht im Service Worker (Plan 0017, E10; ADR 0014). Die Umgebung (Netz, Cache,
 * Geräte-Speicher) kommt herein, damit alles ohne Browser testbar ist; `sw.ts` verdrahtet nur.
 *
 * Bei **jedem** Push: genau einmal `site.json` (für alle gleich, Privatsphäre), dazu Geburtsdatum, Anbieter-Abos und
 * gesehene IDs aus dem Geräte-Speicher. Alles in höchstens `timeoutMs` (iOS beendet den Service Worker nach ≈ 10 s,
 * Spike); nach Ablauf wird nichts mehr geschrieben. Seit Plan 0054, Nachtrag A (ADR 0042) ohne Wegzeit und Startpunkt.
 */
import { newOfferIds, offersInWeek, type WeeklyText, weeklyText } from "../domain/news.ts";
import type { SiteOffer } from "../domain/site-data.ts";

export type TailorOutcome =
  | { kind: "text"; text: WeeklyText }
  /** kein Zuschnitt möglich (gesehene IDs fehlten und kein Angebot hat `listedAt`): das System bzw. der allgemeine Text */
  | { kind: "nichts" }
  | { kind: "zeit" }
  | { kind: "fehler" };

type StoreKey = "birthDate" | "providers" | "seenIds";
/**
 * Altlast (Plan 0054, Nachtrag A, Review M1): Startpunkt und Such-Abos lagen bis ADR 0042 im Geräte-Speicher. Jeder
 * Push löscht sie, wenn sie noch da sind; Entfernen nach einem halben Jahr (`docs/ideas.md`).
 */
const LEGACY_KEYS = ["origin", "searches"] as const;
type LegacyKey = (typeof LEGACY_KEYS)[number];

export interface TailorEnv {
  timeoutMs: number;
  /** Netz am HTTP-Cache vorbei (bedingt); wirft bei Netz- oder Serverfehler */
  fetchJson(path: "data/site.json"): Promise<unknown>;
  store: {
    get(key: StoreKey | LegacyKey): Promise<unknown>;
    set(key: "seenIds", value: string[]): Promise<void>;
    /** `undefined` löscht (Altlast) */
    set(key: LegacyKey, value: undefined): Promise<void>;
  };
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");

export async function tailorPush({
  now,
  test,
  env,
}: {
  now: Date;
  /** Testversand (`data.test`): nichts schreiben (E3), außer dem Löschen der Altlast `origin`/`searches` (ADR 0042) */
  test: boolean;
  env: TailorEnv;
}): Promise<TailorOutcome> {
  let late = false;
  const write = async (ids: string[]) => {
    if (test || late) return;
    await env.store.set("seenIds", ids).catch(() => undefined);
  };

  const work = async (): Promise<TailorOutcome> => {
    const [site, seen, birthDate, providers, ...legacy] = await Promise.all([
      env.fetchJson("data/site.json").catch(() => undefined),
      env.store.get("seenIds"),
      env.store.get("birthDate"),
      env.store.get("providers"),
      ...LEGACY_KEYS.map((key) => env.store.get(key)),
    ]);
    // Aufräumen ist keine Nutzerangabe: auch beim Testversand, aber nicht nach dem Zeitlimit
    for (const [index, key] of LEGACY_KEYS.entries()) {
      if (legacy[index] !== undefined && !late) await env.store.set(key, undefined).catch(() => undefined);
    }
    const offers = (site as { offers?: unknown } | undefined)?.offers;
    if (!Array.isArray(offers)) return { kind: "fehler" };
    // site.json entsteht zur Build-Zeit aus Zod-geprüften Daten; ein Formfehler wirft unten und endet als „fehler“, dann
    // zeigt das System die allgemeine Fassung (Arch-Review N9)
    const siteOffers = offers as SiteOffer[];
    const ids = siteOffers.map((o) => o.id);
    // Ohne gesehene IDs entscheidet `listedAt` (Plan 0043, E3); hat noch kein Angebot eins (Übergang), kein Zuschnitt
    const known = isStringArray(seen) ? seen : undefined;
    if (known === undefined && !siteOffers.some((o) => o.listedAt !== undefined)) {
      await write(ids);
      return { kind: "nichts" };
    }
    const freshIds = new Set(newOfferIds(known, siteOffers, now));
    const text = weeklyText({
      fresh: siteOffers.filter((o) => freshIds.has(o.id)),
      week: offersInWeek(siteOffers, now),
      providers: isStringArray(providers) ? providers : undefined,
      birthDate: typeof birthDate === "string" ? birthDate : undefined,
      now,
    });
    await write(ids);
    return { kind: "text", text };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<TailorOutcome>((resolve) => {
    timer = setTimeout(() => {
      late = true;
      resolve({ kind: "zeit" });
    }, env.timeoutMs);
  });
  try {
    return await Promise.race([work().catch((): TailorOutcome => ({ kind: "fehler" })), limit]);
  } finally {
    clearTimeout(timer);
  }
}
