/** Kleiner JSON-Cache unter ~/.cache/zwergenplan/ – schont offene Dienste bei wiederholten Läufen. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = join(process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "zwergenplan");

export function readCache<T>(name: string): T | undefined {
  try {
    return JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function writeCache(name: string, value: unknown): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, name), JSON.stringify(value));
}
