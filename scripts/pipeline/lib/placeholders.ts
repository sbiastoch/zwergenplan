/**
 * Platzhalter `{von}` und `{bis}` in Programm-URLs und POST-Bodies (Plan 0031, E3; Plan 0015, E4). Das Fenster reicht
 * vom Monatsanfang bis zum Monatsanfang 13 Monate später: So ändert sich die Eingabe höchstens einmal im Monat, und
 * der Cache des Nachtlaufs trifft. Rein; `today` ist ein Berliner Kalendertag (YYYY-MM-DD).
 */

export function placeholderWindow(today: string): { von: string; bis: string } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)); // 1–12
  const end = month - 1 + 13; // Monatsindex ab Januar des Jahres
  const bisYear = year + Math.floor(end / 12);
  const bisMonth = (end % 12) + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  return { von: `${year}-${pad(month)}-01`, bis: `${bisYear}-${pad(bisMonth)}-01` };
}

export function fillPlaceholders(text: string, today: string): string {
  const { von, bis } = placeholderWindow(today);
  return text.replaceAll("{von}", von).replaceAll("{bis}", bis);
}
