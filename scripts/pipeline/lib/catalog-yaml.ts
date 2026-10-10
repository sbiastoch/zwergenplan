/** Katalog-YAML ohne Dateizugriff (Plan 0030): Anhängen mit stabiler Formatierung, Paket-IDs lesen. */
import { isMap, isPair, isScalar, isSeq, parseDocument, visit } from "yaml";
import { z } from "zod";

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
 * Anbieter-IDs eines Pakets (batch-<n>.json). Nur die IDs: Ein Paket aus einem Lauf vor einer Katalogänderung bleibt
 * so lesbar (Review M5).
 */
export function providerIdsOf(batch: unknown): string[] {
  return z
    .array(z.looseObject({ id: z.string().min(1) }))
    .parse(batch)
    .map((p) => p.id);
}
