import type { SiteOffer } from "../domain/site-data.ts";
import { TIME_ZONE } from "../domain/time.ts";

const dayFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("de-DE", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function formatSession(session: { start: string; end: string }): string {
  const start = new Date(session.start);
  return `${dayFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(new Date(session.end))} Uhr`;
}

export const FORMAT_LABELS: Record<SiteOffer["format"], string> = {
  kurs: "Kurs",
  regelmaessig: "Regelmäßig",
  einmalig: "Einmalig",
};

export function facts(offer: SiteOffer): string[] {
  return [
    FORMAT_LABELS[offer.format],
    offer.cost === "kostenlos" ? "kostenlos" : (offer.price ?? "kostenpflichtig"),
    offer.registration === "mit-anmeldung" ? "mit Anmeldung" : "ohne Anmeldung",
  ];
}
