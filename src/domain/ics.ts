/**
 * RFC-5545-Export. Jeder Termin wird ein eigenes VEVENT mit stabiler UID (ADR 0003):
 * keine RRULE/RDATE, weil Ausfälle/Ferien sonst falsch wären und Google RDATE ignoriert.
 * Zeiten in UTC (…Z) – eindeutig über die Zeitumstellung, kein VTIMEZONE nötig.
 */
import type { Offer, Session, Venue } from "./schema.ts";
import { berlinKey, toIcsUtc } from "./time.ts";

export interface IcsContext {
  providerName: string;
  venue: Pick<Venue, "name" | "address" | "geo">;
  /** DTSTAMP – aus generatedAt, damit die Ausgabe deterministisch ist. */
  stamp: string;
}

const PRODID = "-//Zwergenplan//Babyangebote Nürnberg//DE";

function sessionKey(session: Session): string {
  return berlinKey(session.start);
}

function sessionUid(offer: Offer, session: Session): string {
  return `${offer.id}--${sessionKey(session)}@zwergenplan`;
}

/** Pfade relativ zur Site-Basis. */
export function seriesIcsPath(offer: Offer): string {
  return `ics/${offer.id}.ics`;
}
export function sessionIcsPath(offer: Offer, session: Session): string {
  return `ics/${offer.id}/${sessionKey(session)}.ics`;
}

export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Faltet eine Inhaltszeile auf max. 75 Oktette, ohne UTF-8-Zeichen zu zerteilen. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // Folgezeilen beginnen mit einem Leerzeichen
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

const FORMAT_TEXT: Record<Offer["format"], string> = {
  kurs: "Kurs",
  regelmaessig: "Regelmäßiger Termin",
  einmalig: "Einzeltermin",
};

function description(offer: Offer, ctx: IcsContext): string {
  const lines = [
    offer.summary,
    "",
    `Anbieter: ${ctx.providerName}`,
    `Art: ${FORMAT_TEXT[offer.format]}`,
    offer.registration === "mit-anmeldung" ? "Anmeldung erforderlich" : "Ohne Anmeldung",
    offer.cost === "kostenlos" ? "Kostenlos" : `Kostenpflichtig${offer.price ? `: ${offer.price}` : ""}`,
    `Infos: ${offer.url}`,
  ];
  return lines.join("\n");
}

function vevent(offer: Offer, session: Session, index: number, ctx: IcsContext): string[] {
  const numbered = offer.format === "kurs" && offer.sessions.length > 1;
  const title = numbered ? `${offer.title} (${index + 1}/${offer.sessions.length})` : offer.title;
  return [
    "BEGIN:VEVENT",
    `UID:${sessionUid(offer, session)}`,
    `DTSTAMP:${toIcsUtc(ctx.stamp)}`,
    `DTSTART:${toIcsUtc(session.start)}`,
    `DTEND:${toIcsUtc(session.end)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description(offer, ctx))}`,
    `LOCATION:${escapeText(`${ctx.venue.name}, ${ctx.venue.address}`)}`,
    `GEO:${ctx.venue.geo.lat};${ctx.venue.geo.lon}`,
    `URL:${offer.url}`,
    "END:VEVENT",
  ];
}

function calendar(events: string[][], name: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Ganze Reihe (Kurs, alle Termine einer regelmäßigen Reihe) bzw. der eine Einzeltermin. */
export function icsForSeries(offer: Offer, ctx: IcsContext): string {
  return calendar(
    offer.sessions.map((s, i) => vevent(offer, s, i, ctx)),
    offer.title,
  );
}

/** Ein einzelner Termin einer regelmäßigen Reihe. */
export function icsForSession(offer: Offer, session: Session, ctx: IcsContext): string {
  const index = offer.sessions.findIndex((s) => s.start === session.start);
  if (index < 0) throw new Error(`Termin ${session.start} gehört nicht zu ${offer.id}`);
  return calendar([vevent(offer, session, index, ctx)], offer.title);
}
