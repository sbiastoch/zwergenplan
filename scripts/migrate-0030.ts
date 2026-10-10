/**
 * Einmalige Migration für Plan 0030 (E5): Katalog ohne Facetten, Felder nach Rolle, Notizen als Liste.
 * Aufruf: node scripts/migrate-0030.ts <datei.yaml> … – wird nach dem Lauf gelöscht.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isMap, isSeq, parse, parseDocument, type YAMLMap, YAMLSeq } from "yaml";

const FACETS = ["topics", "formats", "costs", "registrations"];
const KEEP = ["id", "role", "name", "url", "programme", "verified", "coveredBy", "adapter"];

for (const file of process.argv.slice(2)) {
  const text = readFileSync(file, "utf8");
  const before = parse(text) as Array<Record<string, unknown>>;
  const doc = parseDocument(text);
  const root = doc.contents;
  if (!isSeq(root)) throw new Error(`${file}: keine Liste`);
  let parts = 0;
  for (const item of root.items) {
    if (!isMap(item)) throw new Error(`${file}: Eintrag ist keine Map`);
    const entry = item as YAMLMap;
    const role = entry.get("role");
    for (const f of FACETS) entry.delete(f);
    if (role !== "anbieter") {
      entry.delete("age");
      entry.delete("venues");
    }
    const availability = entry.get("availability") as YAMLMap | undefined;
    const how = availability?.get("how");
    if (typeof how === "string" && !/\p{L}/u.test(how)) availability?.delete("how");
    const notes = entry.get("notes");
    if (typeof notes === "string") {
      const list = notes
        .split(" | ")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      parts += list.length;
      const seq = new YAMLSeq();
      for (const n of list) seq.add(doc.createNode(n));
      entry.set("notes", seq);
    }
  }
  const out = doc.toString({ lineWidth: 0 });
  const after = parse(out) as Array<Record<string, unknown>>;
  if (after.length !== before.length) throw new Error(`${file}: Anzahl geändert`);
  after.forEach((a, i) => {
    const b = before[i] ?? {};
    for (const k of KEEP)
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) throw new Error(`${file}: ${a["id"]}.${k} geändert`);
    if (a["role"] === "anbieter" && JSON.stringify(a["venues"]) !== JSON.stringify(b["venues"]))
      throw new Error(`${a["id"]}: Orte`);
    const joined = Array.isArray(a["notes"]) ? (a["notes"] as string[]).join(" | ") : undefined;
    if (
      b["notes"] !== undefined &&
      joined !==
        String(b["notes"])
          .split(" | ")
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" | ")
    )
      throw new Error(`${a["id"]}: Notizen`);
  });
  writeFileSync(file, out);
  console.log(`✓ ${file}: ${after.length} Einträge, ${parts} Notizen`);
}
