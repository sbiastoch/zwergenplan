/** Lädt und prüft den Datenbestand – echte Daten (data/) oder Fixtures (ZWERGENPLAN_DATA=fixture). */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { type ValidationResult, validateDataset } from "../../src/domain/dataset.ts";

export const ROOT = new URL("../../", import.meta.url);

export type DataSource = "real" | "fixture";

export function dataSource(): DataSource {
  return process.env["ZWERGENPLAN_DATA"] === "fixture" ? "fixture" : "real";
}

export function isBootstrap(source: DataSource): boolean {
  return source === "real" && existsSync(new URL("data/BOOTSTRAP", ROOT));
}

function readOptional(url: URL): string | undefined {
  return existsSync(url) ? readFileSync(url, "utf8") : undefined;
}

export function loadDataset(source: DataSource = dataSource(), now = new Date()): ValidationResult {
  if (isBootstrap(source)) {
    // Bootstrap: data/ wird noch NICHT gelesen. Der Recherche-Skill pflegt data/providers.yaml
    // vorerst im eigenen Format; die Überführung in den Zod-Vertrag kommt mit der Pipeline
    // (Plan 0002). Erst danach wird data/BOOTSTRAP gelöscht und die Daten-Gates greifen.
    const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
    return validateDataset([], {
      generatedAt: iso,
      horizon: { from: iso.slice(0, 10), to: iso.slice(0, 10) },
      offers: [],
    });
  }

  const dir = new URL(source === "fixture" ? "tests/fixtures/" : "data/", ROOT);
  const providersText = readOptional(new URL("providers.yaml", dir));
  const offersText = readOptional(new URL("offers.json", dir));
  if (providersText === undefined || offersText === undefined) {
    return { ok: false, errors: [`${dir.pathname}providers.yaml und offers.json müssen existieren`] };
  }
  try {
    return validateDataset(parse(providersText), JSON.parse(offersText));
  } catch (e) {
    return { ok: false, errors: [`Lesefehler: ${(e as Error).message}`] };
  }
}
