/**
 * Gate G2 des Entdeckens (Plan 0032, E7): `discover` darf `data/providers.yaml` nur um neue Einträge am Ende
 * ergänzen. Jede Änderung, Umsortierung oder Entfernung eines bestehenden Eintrags bricht den Lauf ab (Nicht-Ziel:
 * automatische Änderungen an bekannten Anbietern, Review M3). Verglichen wird der geparste Katalog, nicht der Text:
 * Kommentare und Formatierung prüft das Anhängen selbst (`appendEntries`).
 */

export type CatalogDiff = { ok: true; added: string[] } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Tiefer Vergleich geparster YAML-Werte; die Reihenfolge der Schlüssel zählt nicht, die von Listen schon. */
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b))
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  if (isRecord(a) || isRecord(b)) {
    if (!isRecord(a) || !isRecord(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && same(a[k], b[k]));
  }
  return Object.is(a, b);
}

const idOf = (entry: unknown): string | undefined =>
  isRecord(entry) && typeof entry["id"] === "string" ? entry["id"] : undefined;

export function catalogDiff(before: unknown, after: unknown): CatalogDiff {
  if (!Array.isArray(before) || !Array.isArray(after))
    return { ok: false, errors: ["Katalog ist keine Liste von Einträgen"] };
  const errors: string[] = [];
  before.forEach((entry, i) => {
    const id = idOf(entry) ?? `#${i}`;
    if (i >= after.length) errors.push(`${id}: entfernt`);
    else if (!same(entry, after[i]))
      errors.push(
        idOf(after[i]) === idOf(entry) ? `${id}: geändert` : `${id}: an Position ${i} entfernt oder umsortiert`,
      );
  });
  const known = new Set(before.flatMap((e) => idOf(e) ?? []));
  const added: string[] = [];
  for (const entry of after.slice(before.length)) {
    const id = idOf(entry);
    if (id === undefined) errors.push("neuer Eintrag ohne id");
    else if (known.has(id)) errors.push(`${id}: neue ID doppelt`);
    else {
      known.add(id);
      added.push(id);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, added };
}
