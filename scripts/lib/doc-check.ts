/**
 * Prüfungen über die Doku (Plan 0027, E11), rein: Dateiliste, Lesen und Existenz kommen als Funktionen herein.
 * Regel 3: Plan-Nummern sind über docs/plans/ und docs/plans/archiv/ eindeutig, ADR-Nummern über docs/adr/.
 * Regel 4: Pfadverweise auf Plan- und ADR-Dateien zeigen auf vorhandene Dateien, relative Markdown-Links lösen auf.
 * Die Statusregeln 1 und 2 kommen mit Etappe 6 (sonst wären heute alle Pläne rot).
 */
import { posix } from "node:path";

export interface DocRepo {
  files: readonly string[];
  read: (path: string) => string;
  exists: (path: string) => boolean;
}

const NUMBERED: ReadonlyArray<[label: string, dir: RegExp]> = [
  ["Plan-Nummer", /^docs\/plans\/(?:archiv\/)?(\d{4})-[^/]+\.md$/],
  ["ADR-Nummer", /^docs\/adr\/(\d{4})-[^/]+\.md$/],
];
const PATH_REF = /docs\/(?:plans|adr)\/(?:archiv\/)?\d{4}-[a-z0-9-]+\.md/g;
const REF_SOURCES = /\.(?:md|ts|tsx|yml|json|cjs)$/;
// Rohdaten, Testmaterial und Unit-Tests nennen Pfade als Daten, nicht als Verweis (Review 2, Minor 9)
const REF_EXCLUDED = /^(?:data|tests\/fixtures)\/|\.test\.ts$/;
const LINK_SOURCES = /^(?:docs\/[^\0]+|CLAUDE|README)\.md$/;
const MD_LINK = /\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g;

export function checkDocs(repo: DocRepo): string[] {
  return [...uniqueNumbers(repo.files), ...references(repo)];
}

function uniqueNumbers(files: readonly string[]): string[] {
  const errors: string[] = [];
  for (const [label, pattern] of NUMBERED) {
    const byNumber = new Map<string, string[]>();
    for (const file of files) {
      const n = pattern.exec(file)?.[1];
      if (n !== undefined) byNumber.set(n, [...(byNumber.get(n) ?? []), file]);
    }
    for (const [n, list] of byNumber) {
      if (list.length > 1) errors.push(`${label} ${n} doppelt: ${[...list].sort().join(", ")}`);
    }
  }
  return errors;
}

function references(repo: DocRepo): string[] {
  const errors: string[] = [];
  for (const file of repo.files) {
    const refs = REF_SOURCES.test(file) && !REF_EXCLUDED.test(file);
    const links = LINK_SOURCES.test(file);
    if (!refs && !links) continue;
    repo
      .read(file)
      .split("\n")
      .forEach((line, i) => {
        const at = `${file}:${i + 1}`;
        if (refs) {
          for (const [ref] of line.matchAll(PATH_REF)) {
            if (!repo.exists(ref)) errors.push(`${at}: Verweis auf fehlende Datei ${ref}`);
          }
        }
        if (links) {
          for (const [, target = ""] of line.matchAll(MD_LINK)) {
            if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;
            const resolved = posix.normalize(posix.join(posix.dirname(file), target));
            if (!repo.exists(resolved)) errors.push(`${at}: Link auf fehlende Datei ${target}`);
          }
        }
      });
  }
  return errors;
}
