/** Katalog-YAML ohne Dateizugriff (Plan 0030): Anhängen mit stabiler Formatierung, Entfernen. */
import { isMap, isPair, isScalar, isSeq, parseDocument, visit } from "yaml";

/** Listen, die als Block stehen bleiben: eine Notiz je Zeile statt einer überlangen Flow-Zeile (Review M4). */
const BLOCK_LISTS = new Set(["notes"]);

/**
 * Hängt Einträge an den Katalog-Text an, ohne Kommentare der übrigen zu ändern: `geo` und Listen aus Skalaren als
 * Flow (`[ a, b ]`, `{ lat, lon }`), wie der Katalog sie von Hand schreibt.
 */
export function appendEntries(text: string, entries: readonly object[]): string {
  const doc = parseDocument(text);
  for (const e of entries) doc.add(doc.createNode(e));
  visit(doc, {
    Pair(_, pair) {
      if (!isPair(pair) || !isScalar(pair.key)) return;
      if (pair.key.value === "geo" && isMap(pair.value)) pair.value.flow = true;
      if (BLOCK_LISTS.has(String(pair.key.value))) return;
      if (isSeq(pair.value) && pair.value.items.every(isScalar)) pair.value.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0 });
}

/**
 * Entfernt Einträge nach `id`, ohne die übrigen umzuformen. Nur für den Katalog eines Trockenlaufs (Entdecken-Eval,
 * Plan 0032, E9); `data/providers.yaml` ändert es nie. Eine unbekannte ID ist ein Fehler.
 */
export function removeEntries(text: string, ids: readonly string[]): string {
  const doc = parseDocument(text);
  const root = doc.contents;
  if (!isSeq(root)) throw new Error("Katalog ist keine Liste");
  for (const id of ids) {
    const index = root.items.findIndex((item) => {
      const key = isMap(item) ? item.get("id", true) : undefined;
      return isScalar(key) && String(key.value) === id;
    });
    if (index < 0) throw new Error(`${id}: nicht im Katalog`);
    root.items.splice(index, 1);
  }
  return doc.toString({ lineWidth: 0 });
}
