/** Kleiner JSON-Cache unter ~/.cache/zwergenplan/ – schont offene Dienste bei wiederholten Läufen. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Standardverzeichnis; Tests setzen `XDG_CACHE_HOME` auf ein Temp-Verzeichnis (`vitest.setup.ts`, Plan 0050, E5) */
export const defaultCacheDir = (): string =>
  join(process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "zwergenplan");

export function readCache<T>(name: string, dir: string = defaultCacheDir()): T | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function writeCache(name: string, value: unknown, dir: string = defaultCacheDir()): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), JSON.stringify(value));
}
