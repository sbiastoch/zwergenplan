/**
 * evangelische-termine.de, Dekanat Nürnberg (region 507), aus evtermine.py.
 * - highlight=all ist Pflicht, sonst kommen nur hervorgehobene Termine.
 * - q= verknüpft per ODER und durchsucht Beschreibungen → stichwortweise abfragen.
 * - region 507 enthält Röthenbach/Schwaig/Heroldsberg → auf Nürnberg filtern.
 * - MODE „jeweils“ = ein Eintrag für eine wöchentliche Reihe (START…UNTIL, gleicher Wochentag).
 *   Der iCal-Feed kodiert diese Reihen fälschlich als FREQ=DAILY – daher die JSON-API.
 */
import { z } from "zod";
import { addDays } from "../../../../src/domain/time.ts";
import { byFirstStart, type Candidate, type Occurrence, opt, plainText } from "../candidate.ts";
import { isRelevant } from "../relevance.ts";

export const EVTERMINE_API = "https://www.evangelische-termine.de/json";
export const EVTERMINE_KEYWORDS = [
  "krabbel",
  "miniclub",
  "mini-club",
  "mutter-kind",
  "eltern-kind",
  "minigottesdienst",
  "minikirche",
  "krabbelgottesdienst",
  "baby",
  "kleinkind",
  "spielgruppe",
  "pekip",
  "zwerge",
];

const s = z.string().nullish();
const Veranstaltung = z
  .object({
    ID: z.string(),
    START: z.string(),
    END: s,
    MODE: s,
    UNTIL: s,
    SUBTITLE: s,
    _event_TITLE: s,
    _event_LONG_DESCRIPTION: s,
    _event_SHORT_DESCRIPTION: s,
    _event_LINK: s,
    _user_ID: s,
    _user_REALNAME: s,
    _user_URL: s,
    _place_ID: s,
    _place_NAME: s,
    _place_STREET_NR: s,
    _place_ZIP: s,
    _place_CITY: s,
    _place_GLAT: s,
    _place_GLONG: s,
  })
  .loose();
export const EvtermineResponse = z.array(z.object({ Veranstaltung: Veranstaltung.optional() }).loose());
type Veranstaltung = z.infer<typeof Veranstaltung>;

/** Endzeit „HH:MM“ aus END (Datum ist bei Einzelterminen oft 0000-00-00); 00:00 gilt als unbekannt. */
function endTime(v: Veranstaltung): string | undefined {
  const t = v.END?.slice(11, 16);
  return t && t !== "00:00" ? t : undefined;
}

function occurrences(v: Veranstaltung, from: string, to: string): Occurrence[] {
  const start = v.START.slice(0, 16).replace(" ", "T");
  const time = start.slice(11, 16);
  const end = endTime(v);
  const at = (day: string): Occurrence => ({ start: `${day}T${time}`, ...opt("end", end && `${day}T${end}`) });
  if (v.MODE === "jeweils" && v.UNTIL) {
    const until = v.UNTIL.slice(0, 10);
    const out: Occurrence[] = [];
    for (let day = start.slice(0, 10); day <= until; day = addDays(day, 7)) {
      if (day >= from && day <= to) out.push(at(day));
    }
    return out;
  }
  const day = start.slice(0, 10);
  return day >= from && day <= to ? [at(day)] : [];
}

export function normalizeEvtermine(
  entries: readonly Veranstaltung[],
  from: string,
  to: string,
  opts: { filter: boolean } = { filter: true },
): Candidate[] {
  const groups = new Map<string, Candidate>();
  const seen = new Set<string>();
  for (const v of entries) {
    if (seen.has(v.ID)) continue;
    seen.add(v.ID);
    const city = v._place_CITY ?? "";
    if (city && !city.toLowerCase().startsWith("nü")) continue;
    const title = plainText(v._event_TITLE);
    const description = plainText(v._event_LONG_DESCRIPTION || v._event_SHORT_DESCRIPTION);
    if (opts.filter && !isRelevant(title, v.SUBTITLE, description)) continue;
    const occ = occurrences(v, from, to);
    if (occ.length === 0 || !title) continue;
    const key = `${title}|${v._user_ID ?? ""}|${v._place_ID ?? ""}`;
    const group = groups.get(key);
    if (group) {
      group.occurrences.push(...occ);
      continue;
    }
    const lat = Number.parseFloat(v._place_GLAT ?? "");
    const lon = Number.parseFloat(v._place_GLONG ?? "");
    const street = v._place_STREET_NR?.trim();
    groups.set(key, {
      source: "evtermine",
      sourceId: v.ID,
      title,
      ...opt("subtitle", plainText(v.SUBTITLE)),
      description: description.slice(0, 600),
      ...opt("organizer", v._user_REALNAME?.trim()),
      ...opt("organizerId", v._user_ID),
      ...opt("organizerUrl", v._user_URL),
      ...opt("location", plainText(v._place_NAME)),
      ...opt("address", street ? `${street}, ${v._place_ZIP ?? ""} ${city}`.trim() : undefined),
      ...(Number.isFinite(lat) && Number.isFinite(lon) ? { geo: { lat, lon } } : {}),
      detailUrl: v._event_LINK || `https://www.evangelische-termine.de/detail-bt?ID=${v.ID}`,
      cancelled: /abgesagt|entfällt|fällt aus/i.test(title),
      soldOut: false,
      waitlist: title.toLowerCase().includes("warteliste"),
      weekly: v.MODE === "jeweils",
      occurrences: occ,
    });
  }
  for (const g of groups.values()) g.occurrences.sort((a, b) => a.start.localeCompare(b.start));
  return [...groups.values()].sort(byFirstStart);
}
