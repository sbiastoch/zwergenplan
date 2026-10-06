/**
 * Texte des Push-Teils im Abschnitt „Als App“ (Plan 0017, E6, E7), nicht im Start-Bundle. Die Beschriftungen für
 * Format, Anmeldung und Kosten stehen hier noch einmal statt aus `Sheets.tsx`/`format.ts`: Jeder weitere Import aus dem
 * Start wird ein Export des Einstiegs und kostet Start-JS (E9, Runde 3 M4). `CATEGORY_LABELS` nutzt schon `anbieter/`.
 */
import type { PushProblem } from "../../data/push.ts";
import { filterFromSearch } from "../../domain/filter.ts";
import { CATEGORY_LABELS } from "../../domain/topics.ts";

const FORMAT: Record<string, string> = { kurs: "Kurs", regelmaessig: "Regelmäßig", einmalig: "Einmalig" };
const REGISTRATION: Record<string, string> = { "ohne-anmeldung": "Ohne Anmeldung", "mit-anmeldung": "Mit Anmeldung" };
const COST: Record<string, string> = { kostenlos: "Kostenlos", kostenpflichtig: "Kostenpflichtig" };

/** „Musik & Singen, Natur & Draußen · Kurs · Ohne Anmeldung · Kostenlos · bis 20 Min.“ */
export function searchLabel(search: string): string {
  const f = filterFromSearch(search);
  return [
    f.categories.map((c) => CATEGORY_LABELS[c]).join(", "),
    f.formats.map((x) => FORMAT[x]).join(", "),
    f.registration.map((x) => REGISTRATION[x]).join(", "),
    f.cost.map((x) => COST[x]).join(", "),
    f.reachLimit ? `bis ${f.reachLimit.value} Min.` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export const PUSH_TEXTS = {
  switchLabel: "Wochen-Nachricht",
  switchSub: "Samstags gegen 10 Uhr: was es Neues für euch gibt.",
  switching: "Wird eingeschaltet …",
  switchingOff: "Wird ausgeschaltet …",
  denied: "In den Einstellungen des Geräts erlaubt?",
  current: "Aktuelle Suche",
  subscribe: "Suche abonnieren",
  subscribed: "Abonniert",
  emptyFilter: "Wähle im Filter, was dich interessiert, und abonniere die Suche hier.",
  added: "Abonniert. Kommt in die Nachricht am Samstag.",
  addedOff: "Abonniert. Kommt in die Nachricht, sobald die Wochen-Nachricht an ist.",
  addedNoOrigin: "Abonniert. Die Wegzeit wirkt in der Nachricht ab einem Startpunkt.",
  removed: "Such-Abo entfernt.",
  full: "Höchstens 5 Such-Abos. Erst eins entfernen.",
  listHeading: "Deine Such-Abos",
  noneWithAge: "Noch keine. Bis dahin zählt nur das Alter.",
  noneWithoutAge: "Noch keine. Bis dahin kommen alle neuen Angebote.",
  needsOrigin: "Wegzeit wirkt ab einem Startpunkt",
  needsSwitch: "Kommt erst mit eingeschalteter Wochen-Nachricht.",
  remove: "Entfernen",
  device: "Geräte-Kennung",
  on: "Wochen-Nachricht ist an.",
  off: "Wochen-Nachricht ist aus.",
} as const;

export function problemText(problem: PushProblem): string {
  switch (problem) {
    case "verweigert":
      return "Benachrichtigungen sind nicht erlaubt. In den Einstellungen des Geräts erlauben?";
    case "abo":
      return "Das Gerät konnte die Benachrichtigung nicht einrichten. Später noch einmal versuchen.";
    case "netz":
      return "Kein Netz. Später noch einmal versuchen.";
    case "server":
      return "Der Dienst für die Nachricht antwortet gerade nicht. Später noch einmal versuchen.";
  }
}
