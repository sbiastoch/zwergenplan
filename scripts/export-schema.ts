/**
 * Exportiert die Zod-Schemas als JSON Schema nach schema/ – als Vorlage für Recherche-Agenten.
 *   --check   nur vergleichen; Abweichung = Exit 1 (Schema-Drift in CI)
 * Hinweis: Querprüfungen (refine) sind im JSON Schema nicht abbildbar; maßgeblich bleibt validate-data.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { OffersFile, ProvidersFile } from "../src/domain/schema.ts";
import { ROOT } from "./lib/load-data.ts";
import { RawBatch } from "./pipeline/lib/raw.ts";

const outDir = fileURLToPath(new URL("schema/", ROOT));
const targets = {
  "providers.schema.json": ProvidersFile,
  "offers.schema.json": OffersFile,
  /** Rohformat der Recherche-Subagenten (ADR 0006) */
  "raw-batch.schema.json": RawBatch,
} as const;

const check = process.argv.includes("--check");
let drift = false;
mkdirSync(outDir, { recursive: true });
for (const [file, schema] of Object.entries(targets)) {
  const json = `${JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }), null, 2)}\n`;
  const path = `${outDir}${file}`;
  if (check) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      // fehlt → Drift
    }
    if (current !== json) {
      console.error(`✗ schema/${file} ist veraltet – \`pnpm schema:export\` ausführen und committen`);
      drift = true;
    }
  } else {
    writeFileSync(path, json);
    console.log(`✓ schema/${file}`);
  }
}
if (drift) process.exit(1);
if (check) console.log("✓ JSON Schema aktuell");
