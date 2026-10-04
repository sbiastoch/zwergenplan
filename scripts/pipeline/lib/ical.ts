/** Minimaler VEVENT-Parser für Programm-Feeds (aus fetch_page.parse_ical): entfaltet Zeilen, löst Escapes auf. */

const FIELDS = ["SUMMARY", "DTSTART", "DTEND", "RRULE", "LOCATION", "URL", "DESCRIPTION", "EXDATE", "STATUS"] as const;
type Field = (typeof FIELDS)[number];
export type IcalEvent = Partial<Record<Field, string>>;

const isField = (name: string): name is Field => (FIELDS as readonly string[]).includes(name);

export function parseIcal(text: string): IcalEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: IcalEvent[] = [];
  let current: IcalEvent | undefined;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT" && current) {
      events.push(current);
      current = undefined;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const name = line.slice(0, colon).split(";")[0] ?? "";
      if (!isField(name)) continue;
      const value = line
        .slice(colon + 1)
        .replace(/\\n/gi, " ")
        .replace(/\\([,;\\])/g, "$1");
      current[name] = name === "DESCRIPTION" ? value.slice(0, 300) : value;
    }
  }
  return events;
}
