/** Textähnlichkeit für Deduplizierung und Zuordnung (aus enrich.same_event). */

const GENERIC = new Set([
  "kinder",
  "kind",
  "eltern",
  "gruppe",
  "miniclub",
  "mini",
  "club",
  "krabbelgruppe",
  "baby",
  "babys",
  "offene",
  "offener",
  "treff",
  "jahre",
  "jahren",
  "monate",
  "monaten",
  "warteliste",
  "nürnberg",
  "nuernberg",
  "kurs",
  "termin",
  "eltern-kind-gruppe",
  "familien",
  "familie",
]);

/** Bedeutungstragende Wörter (≥ 4 Buchstaben, ohne Füllwörter). */
export function keywords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-zäöüß]{4,}/g) ?? []).filter((w) => !GENERIC.has(w)));
}

/** Ähnlichkeit 0…1 wie difflib.ratio: 2·LCS / (|a| + |b|). */
export function ratio(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      row[j] = a[i - 1] === b[j - 1] ? (prev[j - 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, row[j - 1] ?? 0);
    }
    prev = row;
  }
  return (2 * (prev[b.length] ?? 0)) / (a.length + b.length);
}

/** Gleicher Termin? Gemeinsame Schlüsselwörter oder Ähnlichkeit ≥ 0,6. */
export function similarTitle(a: string, b: string): boolean {
  const ka = keywords(a);
  for (const w of keywords(b)) if (ka.has(w)) return true;
  return ratio(a.toLowerCase(), b.toLowerCase()) >= 0.6;
}
