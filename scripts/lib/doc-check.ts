/**
 * Prüfungen über die Doku (Plan 0027, E11), rein: Dateiliste, Lesen und Existenz kommen als Funktionen herein.
 * Regel 3: Plan-Nummern sind über docs/plans/ und docs/plans/archiv/ eindeutig, ADR-Nummern über docs/adr/.
 * Regel 4: Pfadverweise auf Plan- und ADR-Dateien zeigen auf vorhandene Dateien, relative Markdown-Links lösen auf.
 * Regeln 1 und 2 (Planstatus, Archiv) seit Plan 0027, Etappe 6.
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
  return [...planStatus(repo), ...uniqueNumbers(repo.files), ...references(repo)];
}

const PLAN_FILE = /^docs\/plans\/(archiv\/)?\d{4}-[^/]+\.md$/;
const ACTIVE = /^Status: (?:Entwurf|Review eingearbeitet|freigegeben|in Umsetzung)\b/;
const CLOSED = /^Status: (?:abgeschlossen, live seit [0-9a-f]{7,40} \(\d{4}-\d{2}-\d{2}\)|ersetzt durch Plan \d{4})/;

/**
 * Regel 1: Die erste nicht-leere Zeile nach dem Titel ist eine gültige Statuszeile.
 * Regel 2: „abgeschlossen“ und „ersetzt“ liegen nur in docs/plans/archiv/, alle anderen nur in docs/plans/.
 */
function planStatus(repo: DocRepo): string[] {
  const errors: string[] = [];
  for (const file of repo.files) {
    const match = PLAN_FILE.exec(file);
    if (match === null) continue;
    const archived = match[1] !== undefined;
    const lines = repo.read(file).split("\n");
    const title = lines.findIndex((l) => l.startsWith("# "));
    if (title === -1) {
      errors.push(`${file}: kein Titel („# Plan NNNN – …“) vor der Statuszeile`);
      continue;
    }
    const status = lines.slice(title + 1).find((l) => l.trim() !== "") ?? "";
    if (CLOSED.test(status)) {
      if (!archived)
        errors.push(
          `${file}: Status „${status.includes("ersetzt") ? "ersetzt" : "abgeschlossen"}“ gehört nach docs/plans/archiv/ (verschieben)`,
        );
    } else if (ACTIVE.test(status)) {
      if (archived) errors.push(`${file}: im Archiv liegen nur Pläne mit Status „abgeschlossen“ oder „ersetzt“`);
    } else {
      errors.push(`${file}: erste Zeile nach dem Titel ist keine gültige Statuszeile („${status.slice(0, 60)}“)`);
    }
  }
  return errors;
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
