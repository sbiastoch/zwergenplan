/** frankenkids.de (WordPress „The Events Calendar“-API), aus frankenkids.py. Wiederkehrende Termine werden gebündelt. */
import { z } from "zod";
import { byFirstStart, type Candidate, opt, plainText } from "../candidate.ts";
import { isRelevant } from "../relevance.ts";

export const FRANKENKIDS_API = "https://www.frankenkids.de/wp-json/tribe/events/v1/events";

const Venue = z
  .object({
    venue: z.string().nullish(),
    address: z.string().nullish(),
    zip: z.string().nullish(),
    city: z.string().nullish(),
  })
  .loose();
const Event = z
  .object({
    id: z.number(),
    title: z.string(),
    description: z.string().nullish(),
    excerpt: z.string().nullish(),
    start_date: z.string(),
    end_date: z.string(),
    cost: z.string().nullish(),
    url: z.string(),
    website: z.string().nullish(),
    venue: z.union([Venue, z.array(z.unknown())]).nullish(),
    organizer: z.array(z.object({ organizer: z.string().nullish() }).loose()).nullish(),
  })
  .loose();
export const FrankenkidsPage = z
  .object({ events: z.array(Event).default([]), total_pages: z.number().default(1) })
  .loose();
type Event = z.infer<typeof Event>;

const local = (s: string) => s.slice(0, 16).replace(" ", "T");

export function normalizeFrankenkids(events: readonly Event[]): Candidate[] {
  const groups = new Map<string, Candidate>();
  for (const e of events) {
    const title = plainText(e.title);
    const description = plainText(e.description);
    if (!isRelevant(title, description, plainText(e.excerpt))) continue;
    const venue = e.venue && !Array.isArray(e.venue) ? e.venue : undefined;
    if (venue?.city && !venue.city.toLowerCase().includes("nürnberg")) continue;
    const key = `${title}|${venue?.venue ?? ""}`;
    const occurrence = { start: local(e.start_date), end: local(e.end_date) };
    const group = groups.get(key);
    if (group) {
      group.occurrences.push(occurrence);
      continue;
    }
    const street = venue?.address?.trim();
    groups.set(key, {
      source: "frankenkids",
      sourceId: String(e.id),
      title,
      description: description.slice(0, 600),
      ...opt("organizer", plainText(e.organizer?.[0]?.organizer)),
      ...opt("location", plainText(venue?.venue)),
      ...opt("address", street ? `${street}, ${venue?.zip ?? ""} ${venue?.city ?? ""}`.trim() : undefined),
      ...opt("cost", plainText(e.cost)),
      detailUrl: e.url,
      ...opt("organizerUrl", e.website),
      cancelled: false,
      soldOut: false,
      waitlist: false,
      weekly: false,
      occurrences: [occurrence],
    });
  }
  for (const g of groups.values()) g.occurrences.sort((a, b) => a.start.localeCompare(b.start));
  return [...groups.values()].sort(byFirstStart);
}
