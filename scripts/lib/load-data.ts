/** Lädt und prüft den Datenbestand – echte Daten (data/) oder Fixtures (ZWERGENPLAN_DATA=fixture). */
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { type ValidationResult, validateDataset } from "../../src/domain/dataset.ts";

export const ROOT = new URL("../../", import.meta.url);

export type DataSource = "real" | "fixture";

export function dataSource(): DataSource {
  return process.env["ZWERGENPLAN_DATA"] === "fixture" ? "fixture" : "real";
}

function readOptional(url: URL): string | undefined {
  return existsSync(url) ? readFileSync(url, "utf8") : undefined;
}

export function loadDataset(source: DataSource = dataSource()): ValidationResult {
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
