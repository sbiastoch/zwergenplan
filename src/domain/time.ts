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
