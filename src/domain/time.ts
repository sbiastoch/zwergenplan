/** Alle Kalenderrechnungen laufen in Europe/Berlin – unabhängig von der Zeitzone des Geräts oder CI-Runners. */
export const TIME_ZONE = "Europe/Berlin";

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number;
}

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Kalenderdatum eines Zeitpunkts in Berlin. */
export function berlinDate(instant: string | Date): CivilDate {
  const parts = dateFmt.formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function parseIsoDate(iso: string): CivilDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Kein ISO-Datum: ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** UTC-Stempel für ICS: 20261013T073000Z */
export function toIcsUtc(instant: string | Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Lokaler Berliner Schlüssel eines Zeitpunkts: 20261013T0930 (für stabile IDs/Dateinamen). */
export function berlinKey(instant: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}`;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function offsetString(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Berliner Ortszeit „2026-10-13T09:30“ → Zeitpunkt mit Offset „2026-10-13T09:30:00+02:00“.
 * Doppelte Stunde (Ende der Sommerzeit): die frühere Variante. Fehlende Stunde (Beginn): Fehler.
 */
export function fromBerlinLocal(local: string): string {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error(`Keine lokale Zeit (YYYY-MM-DDTHH:MM): ${local}`);
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const key = `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}`;
  // Berlin ist UTC+1 oder UTC+2; die frühere Variante (+2) zuerst prüfen.
  for (const offset of [120, 60]) {
    const instant = new Date(Date.UTC(y, mo - 1, d, h, mi) - offset * 60_000);
    if (berlinKey(instant.toISOString()) === key) return `${local}:00${offsetString(offset)}`;
  }
  throw new Error(`Die Ortszeit ${local} gibt es in Berlin nicht (Zeitumstellung)`);
}

function fromUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Kalendertag + n Tage (ISO-Datum, ohne Zeitzonenbezug). */
export function addDays(isoDate: string, days: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Kalendertag + n Monate; der Tag wird aufs Monatsende gekappt (31.10. + 4 → 28.2.). */
export function addMonths(isoDate: string, months: number): string {
  const { year, month, day } = parseIsoDate(isoDate);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return fromUtcDate(new Date(Date.UTC(y, mo - 1, Math.min(day, daysInMonth(y, mo)))));
}

/** ISO-Wochentag eines Kalendertags: 1 = Montag … 7 = Sonntag. */
export function isoWeekday(isoDate: string): number {
  const { year, month, day } = parseIsoDate(isoDate);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}
