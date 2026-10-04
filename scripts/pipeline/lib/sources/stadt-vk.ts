/**
 * Veranstaltungskalender der Stadt Nürnberg (ajax_vk.pl), aus stadt_vk.py.
 * Dieselbe Datenbank speist KUF/Kulturläden, Stadtbibliothek, viele Museen und Theater.
 * SUCHTEXT darf nur EIN Wort sein – mit Leerzeichen ignoriert die API den Filter stillschweigend.
 */
import { z } from "zod";
import { byFirstStart, type Candidate, type Occurrence, opt, plainText } from "../candidate.ts";
import { isRelevant } from "../relevance.ts";

export const STADT_VK_API = "https://www.nuernberg.de/cgi-bin/ajax_vk.pl";
export const STADT_VK_FIELDS =
  "TITEL,UNTERTITEL,BESCHREIBUNG,DATUM,ALLETERMINE,ORT,VVKLINK,ABGESAGT,AUSVERKAUFT,VERANSTALTERNAME,ANMELDUNG";
export const STADT_VK_KEYWORDS = [
  "Baby",
  "Babys",
  "Krabbel",
  "Krabbelgruppe",
  "Kleinkind",
  "Kleinkinder",
  "Eltern-Kind",
  "Kinderwagen",
  "Stillcafé",
  "Stilltreff",
  "PEKiP",
  "Bücherzwerge",
  "Krabbelkonzert",
  "Allerkleinsten",
  "Minis",
  "Familiencafé",
  "Elterncafé",
  "Spielgruppe",
  "Bilderbuchkino",
  "Fingerspiele",
];

/** Je Termin ein Objekt mit Ende „E“ – oder [] bzw. null, wenn die Quelle nichts weiter weiß. */
const Dates = z.record(
  z.string(),
  z.union([z.object({ E: z.string().optional() }).loose(), z.array(z.unknown()), z.null()]),
);
const Veranstaltung = z
  .object({
    VERANSTALTUNGID: z.union([z.number(), z.string()]),
    TITEL: z.string().nullish(),
    UNTERTITEL: z.string().nullish(),
    BESCHREIBUNG: z.string().nullish(),
    ALLETERMINE: z.union([Dates, z.string(), z.array(z.unknown())]).nullish(),
    ORT: z.string().nullish(),
    ORTSNAMEKOMPLETT: z.string().nullish(),
    ORTSSTRASSENR: z.string().nullish(),
    ORTSPLZ: z.union([z.string(), z.number()]).nullish(),
    ORTSORT: z.string().nullish(),
    ORTSLAT: z.union([z.string(), z.number()]).nullish(),
    ORTSLNG: z.union([z.string(), z.number()]).nullish(),
    VVKLINK: z.string().nullish(),
    VERANSTALTERNAME: z.string().nullish(),
    ABGESAGT: z.unknown().optional(),
    AUSVERKAUFT: z.unknown().optional(),
    ANMELDUNG: z.unknown().optional(),
  })
  .loose();
export const StadtVkResponse = z.object({ VERANSTALTUNGEN: z.array(Veranstaltung).nullish() }).loose();
type Veranstaltung = z.infer<typeof Veranstaltung>;

/** ALLETERMINE kommt als Objekt, ältere Antworten als Python-artiger String. */
function dates(v: Veranstaltung): z.infer<typeof Dates> {
  const raw = v.ALLETERMINE;
  if (typeof raw === "string") {
    try {
      return Dates.parse(JSON.parse(raw.replace(/'/g, '"').replace(/\bNone\b/g, "null")));
    } catch {
      return {};
    }
  }
  return raw && !Array.isArray(raw) ? raw : {};
}

const truthy = (x: unknown) => x !== undefined && x !== null && x !== "" && x !== 0 && x !== "0" && x !== false;

function num(x: string | number | null | undefined): number | undefined {
  const n = typeof x === "number" ? x : Number.parseFloat(x ?? "");
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

export function normalizeStadtVk(veranstaltungen: readonly Veranstaltung[], from: string, to: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const v of veranstaltungen) {
    const id = String(v.VERANSTALTUNGID);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!isRelevant(v.TITEL, v.UNTERTITEL, v.BESCHREIBUNG)) continue;
    const occurrences: Occurrence[] = Object.entries(dates(v))
      .filter(([start]) => start.slice(0, 10) >= from && start.slice(0, 10) <= to)
      .map(([start, info]) => {
        const end = info && !Array.isArray(info) ? info.E?.slice(0, 16).replace(" ", "T") : undefined;
        return { start: start.slice(0, 16), ...opt("end", end) };
      })
      .sort((a, b) => a.start.localeCompare(b.start));
    if (occurrences.length === 0 || !v.TITEL) continue;
    const lat = num(v.ORTSLAT);
    const lon = num(v.ORTSLNG);
    const street = v.ORTSSTRASSENR?.trim();
    out.push({
      source: "stadt-vk",
      sourceId: id,
      title: plainText(v.TITEL),
      ...opt("subtitle", plainText(v.UNTERTITEL)),
      description: plainText(v.BESCHREIBUNG).slice(0, 600),
      ...opt("organizer", v.VERANSTALTERNAME?.trim()),
      ...opt("location", (v.ORTSNAMEKOMPLETT ?? v.ORT)?.trim()),
      ...opt("address", street ? `${street}, ${v.ORTSPLZ ?? ""} ${v.ORTSORT ?? ""}`.trim() : undefined),
      ...(lat !== undefined && lon !== undefined ? { geo: { lat, lon } } : {}),
      detailUrl: `https://www.nuernberg.de/internet/stadtportal/veranstaltung.html?vid=${id}`,
      ...opt("ticketUrl", v.VVKLINK?.trim()),
      cancelled: truthy(v.ABGESAGT),
      soldOut: truthy(v.AUSVERKAUFT),
      waitlist: false,
      registrationRequired: truthy(v.ANMELDUNG),
      weekly: false,
      occurrences,
    });
  }
  return out.sort(byFirstStart);
}
