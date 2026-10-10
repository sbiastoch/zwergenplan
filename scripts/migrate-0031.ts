/**
 * Einmalige Migration für Plan 0031 (E6). Wird nach Plan 0031 gelöscht.
 * - Phase a, deterministisch: `region: nuernberg` nach `role`, `ring` aus allen Orten, `kind: js` → `kind: html` +
 *   `render: browser`. Aufruf: `node scripts/migrate-0031.ts <yaml> …`
 * - Phase b: `--extract <yaml> <dir>` schreibt Auszüge für die Subagenten, `--apply <yaml> <in-dir> <out-dir>` setzt
 *   deren Ergebnis ein und bricht bei jedem Verdacht auf Datenverlust ab (Review 2, M4).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isSeq, parse, parseDocument, type YAMLMap } from "yaml";
import { z } from "zod";
import { Programme } from "../src/domain/schema.ts";

export function migrateText(text: string): string {
  const doc = parseDocument(text);
  const root = doc.contents;
  if (!isSeq(root)) throw new Error("keine Liste");
  for (const item of root.items) {
    if (!isMap(item)) throw new Error("Eintrag ist keine Map");
    const entry = item as YAMLMap;
    if (!entry.has("region")) {
      const at = entry.items.findIndex((pair) => String((pair.key as { value?: unknown }).value) === "role");
      entry.items.splice(at + 1, 0, doc.createPair("region", "nuernberg"));
    }
    const venues = entry.get("venues");
    if (isSeq(venues)) for (const v of venues.items) if (isMap(v)) v.delete("ring");
    const programme = entry.get("programme");
    if (isSeq(programme))
      for (const p of programme.items) {
        if (!isMap(p) || p.get("kind") !== "js") continue;
        p.set("kind", "html");
        const at = p.items.findIndex((pair) => String((pair.key as { value?: unknown }).value) === "kind");
        p.items.splice(at + 1, 0, doc.createPair("render", "browser"));
      }
  }
  return doc.toString({ lineWidth: 0 });
}

type Entry = Record<string, unknown> & {
  id: string;
  role: string;
  coveredBy?: string;
  programme: Array<Record<string, unknown> & { url: string; kind: string; render?: string; note?: string }>;
  venues?: Array<{ id: string; name: string }>;
  notes?: string[];
};

/** Diese Einträge baut der Umsetzer von Hand (Review 2, M3); sie fehlen im Auszug, nicht in der Prüfung */
export const MANUAL = new Set(["nuebad-flipper", "schwimmschule-wassermaeuse-nuernberg"]);

export function extractInputs(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const e of parse(text) as Entry[]) {
    if (MANUAL.has(e.id)) continue;
    const pick = (k: string) => (e[k] === undefined ? {} : { [k]: e[k] });
    out[e.id] = {
      id: e.id,
      role: e.role,
      ...pick("coveredBy"),
      ...pick("adapter"),
      verified: e["verified"],
      availability: e["availability"],
      programme: e.programme,
      ...(e.venues ? { venues: e.venues.map(({ id, name }) => ({ id, name })) } : {}),
      notes: e.notes ?? [],
    };
  }
  return out;
}

export const Out = z.strictObject({
  programme: z.array(Programme).min(1),
  notes: z.array(z.string().min(1)),
  venueHints: z.record(z.string(), z.string().min(1)),
  placeholders: z.record(z.string(), z.string()),
});
export type Out = z.infer<typeof Out>;

/** Teile einer alten `note`: nur an „; “ und „ – “, Teile unter 6 Zeichen zählen nicht (Review 2, M4) */
export const noteParts = (note: string) =>
  note
    .split(/; | – /)
    .map((t) => t.trim())
    .filter((t) => t.length >= 6);

/** Alle Abbruchgründe für einen Eintrag; leer heißt einsetzbar. */
export function problemsOf(old: Entry, raw: unknown): string[] {
  const parsed = Out.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => `${old.id}: out ${i.path.join(".")}: ${i.message}`);
  const out = parsed.data;
  const errs: string[] = [];
  const byUrl = new Map(out.programme.map((p) => [p.url, p]));
  for (const g of old.programme) {
    const url = out.placeholders[g.url] ?? g.url;
    const now = byUrl.get(url);
    if (!now) {
      errs.push(`${old.id}: URL fehlt: ${g.url}`);
      continue;
    }
    if (now.kind !== g.kind) errs.push(`${old.id}: kind geändert bei ${g.url}`);
    if (g.render !== undefined && now.render !== g.render) errs.push(`${old.id}: render verloren bei ${g.url}`);
  }
  for (const [from, to] of Object.entries(out.placeholders)) {
    if (!old.programme.some((g) => g.url === from)) errs.push(`${old.id}: Platzhalter für unbekannte URL ${from}`);
    if (!/\{(von|bis)\}/.test(to)) errs.push(`${old.id}: Platzhalter-Ziel ohne {von}/{bis}: ${to}`);
  }
  const oldNotes = old.notes ?? [];
  if (oldNotes.some((n, i) => out.notes[i] !== n)) errs.push(`${old.id}: alte notes sind kein Präfix der neuen`);
  const haystack = [
    ...out.programme.flatMap((p) => [p.url, p.hint ?? "", p.blocked?.reason ?? ""]),
    ...out.notes,
    ...Object.values(out.venueHints),
  ].join("\n");
  for (const g of old.programme)
    for (const part of noteParts(g.note ?? ""))
      if (!haystack.includes(part)) errs.push(`${old.id}: Teil der note fehlt: „${part}“`);
  const venueIds = new Set((old.venues ?? []).map((v) => v.id));
  for (const id of Object.keys(out.venueHints)) if (!venueIds.has(id)) errs.push(`${old.id}: unbekannter Ort ${id}`);
  // Probelauf Phase c
  if (out.programme.some((p) => p.use === undefined)) errs.push(`${old.id}: Programmeintrag ohne use`);
  if (
    old.role === "anbieter" &&
    old.coveredBy === undefined &&
    !out.programme.some((p) => p.use === "termine" && !p.blocked)
  )
    errs.push(`${old.id}: keine Terminseite ohne blocked`);
  return errs;
}

/** Setzt geprüfte Ergebnisse ein; wirft mit allen Gründen, wenn auch nur einer fehlt oder abweicht. */
export function applyOutputs(text: string, outs: Record<string, unknown>): string {
  const doc = parseDocument(text);
  // auch die von Hand gebauten Einträge (MANUAL) laufen durch dieselben Prüfungen
  const olds = parse(text) as Entry[];
  const errs: string[] = [];
  const want = new Set(olds.map((e) => e.id));
  for (const id of Object.keys(outs)) if (!want.has(id)) errs.push(`${id}: Ausgabe ohne Eingabe`);
  for (const e of olds) {
    if (!(e.id in outs)) errs.push(`${e.id}: Ausgabe fehlt`);
    else errs.push(...problemsOf(e, outs[e.id]));
  }
  if (errs.length > 0) throw new Error(errs.join("\n"));
  const root = doc.contents;
  if (!isSeq(root)) throw new Error("keine Liste");
  for (const node of root.items) {
    if (!isMap(node)) continue;
    const item = node as YAMLMap;
    const id = String(item.get("id"));
    const raw = outs[id];
    if (raw === undefined) continue;
    const out = Out.parse(raw);
    item.set("programme", doc.createNode(out.programme));
    if (out.notes.length > 0) item.set("notes", doc.createNode(out.notes));
    else item.delete("notes");
    const venues = item.get("venues");
    if (isSeq(venues))
      for (const v of venues.items) {
        if (!isMap(v)) continue;
        const venue = v as YAMLMap;
        const hint = out.venueHints[String(venue.get("id"))];
        if (hint) venue.set("hint", hint);
      }
  }
  return doc.toString({ lineWidth: 0 });
}

if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "--extract") {
  const [, , , file = "", dir = ""] = process.argv;
  mkdirSync(dir, { recursive: true });
  const ins = extractInputs(readFileSync(file, "utf8"));
  for (const [id, v] of Object.entries(ins)) writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(v, null, 1)}\n`);
  console.log(`✓ ${Object.keys(ins).length} Auszüge nach ${dir}`);
} else if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "--check") {
  // Selbstprüfung der Subagenten: nur die genannten Einträge, ohne zu schreiben
  const [, , , file = "", outDir = "", ...ids] = process.argv;
  const olds = new Map((parse(readFileSync(file, "utf8")) as Entry[]).map((e) => [e.id, e]));
  let bad = 0;
  for (const id of ids) {
    const old = olds.get(id);
    const errs = old
      ? problemsOf(old, JSON.parse(readFileSync(join(outDir, `${id}.json`), "utf8")))
      : [`${id}: unbekannt`];
    bad += errs.length;
    console.log(errs.length === 0 ? `✓ ${id}` : errs.map((e) => `✗ ${e}`).join("\n"));
  }
  process.exit(bad > 0 ? 1 : 0);
} else if (import.meta.url === `file://${process.argv[1]}` && process.argv[2] === "--apply") {
  const [, , , file = "", outDir = ""] = process.argv;
  const outs: Record<string, unknown> = {};
  for (const f of readdirSync(outDir).filter((x) => x.endsWith(".json")))
    outs[f.slice(0, -5)] = JSON.parse(readFileSync(join(outDir, f), "utf8"));
  writeFileSync(file, applyOutputs(readFileSync(file, "utf8"), outs));
  console.log(`✓ ${Object.keys(outs).length} Einträge eingesetzt in ${file}`);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    const before = parse(readFileSync(file, "utf8")) as Array<Record<string, unknown>>;
    const out = migrateText(readFileSync(file, "utf8"));
    const after = parse(out) as Array<Record<string, unknown>>;
    if (after.length !== before.length) throw new Error(`${file}: Anzahl geändert`);
    writeFileSync(file, out);
    console.log(`✓ ${file}: ${after.length} Einträge`);
  }
}
