/** Dateien und git für die Pipeline: Laufverzeichnis, Katalog, offers.json. Keine Logik. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  type OffersFile,
  OffersFile as OffersFileSchema,
  type Provider,
  ProvidersFile,
} from "../../../src/domain/schema.ts";
import { toBerlinIso } from "../../../src/domain/time.ts";
import { type Candidate, CandidatesFile, SOURCES, type Source } from "../lib/candidate.ts";
import { appendEntries, providerIdsOf } from "../lib/catalog-yaml.ts";
import { type RunMeta, RunMeta as RunMetaSchema, type SourceStatus, SourceStatusFile } from "../lib/run.ts";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const CATALOG = join(ROOT, "data/providers.yaml");
const OFFERS = join(ROOT, "data/offers.json");

export const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
export function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`);
}

export function readMeta(runDir: string): RunMeta {
  const file = join(runDir, "meta.json");
  if (!existsSync(file)) throw new Error(`${file} fehlt – zuerst \`pnpm pipeline init\``);
  return RunMetaSchema.parse(readJson(file));
}

export function readCatalog(): Provider[] {
  return ProvidersFile.parse(parse(readFileSync(CATALOG, "utf8")));
}

/** Hängt Einträge an den Katalog an, ohne Formatierung und Kommentare der übrigen zu ändern. */
export function appendToCatalog(entries: readonly Provider[]): void {
  writeFileSync(CATALOG, appendEntries(readFileSync(CATALOG, "utf8"), entries));
}

export function readPreviousOffers(): OffersFile | undefined {
  if (!existsSync(OFFERS)) return undefined;
  return OffersFileSchema.parse(readJson(OFFERS));
}

/** Schreibt data/offers.json und formatiert es wie das Repo (Biome), damit Lint und Diffs stimmen. */
export function writeOffers(file: OffersFile): void {
  writeFileSync(OFFERS, `${JSON.stringify(file, null, 2)}\n`);
  execFileSync(join(ROOT, "node_modules/.bin/biome"), ["format", "--write", OFFERS], { cwd: ROOT, stdio: "pipe" });
}

export function candidatesOf(runDir: string): Array<Candidate & { cid: string }> {
  const out: Array<Candidate & { cid: string }> = [];
  for (const source of SOURCES) {
    const file = join(runDir, "candidates", `${source}.json`);
    if (!existsSync(file)) continue;
    CandidatesFile.parse(readJson(file)).forEach((c, i) => {
      out.push({ ...c, cid: `${source.slice(0, 2)}${i}` });
    });
  }
  return out;
}

export function sourceStatus(runDir: string): Partial<Record<Source, SourceStatus>> {
  const file = join(runDir, "candidates", "_status.json");
  return existsSync(file) ? SourceStatusFile.parse(readJson(file)) : {};
}

/** Anbieter-IDs eines Pakets (batch-<n>.json). */
export function batchProviders(file: string): string[] {
  return providerIdsOf(readJson(file));
}

/** Prüfzeitpunkt einer Rohdatei = ihre Änderungszeit (kein Agent schreibt eine Uhrzeit). */
export function checkedAtOf(file: string): string {
  return toBerlinIso(statSync(file).mtime);
}

/** Paket zur Rohdatei: raw/batch-3.json ↔ batch-3.json */
export function batchFileFor(rawFile: string): string {
  return join(dirname(dirname(rawFile)), basename(rawFile));
}

export function git(args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}
