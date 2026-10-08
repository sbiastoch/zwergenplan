/**
 * Risikoklasse eines Diffs (Plan 0027, E1). Es gibt zwei Stufen:
 * - 0: Jeder Pfad steht auf der Doku-Positivliste. Geprüft wird nur check-docs.
 * - C: alles andere, einschließlich unbekannter Pfade (fail-safe). Geprüft wird check:fast.
 * Kein Build, kein Test und kein Skript liest die Dateien der Positivliste. Das hält der Test
 * „Doku liest niemand“ in change-class.test.ts fest. Rein, nur Strings.
 */

export type Tier = "0" | "C";

const DOC_PATHS: readonly RegExp[] = [
  // docs/design/ ist Design-Material und von Biome ausgenommen, nicht Doku (Review 2, Minor 5)
  /^docs\/(?!design\/)[^\0]+\.md$/,
  /^[^/]+\.md$/,
  /^\.claude\/skills\/[^\0]+\.md$/,
  /^\.claude\/agents\/[^/]+\.md$/,
];

export function isDocPath(path: string): boolean {
  return DOC_PATHS.some((re) => re.test(path));
}

/** Stufe für eine Liste geänderter Pfade; `reason` nennt den ersten Pfad, der Stufe C auslöst. */
export function classify(paths: readonly string[]): { tier: Tier; reason?: string } {
  const reason = paths.find((p) => !isDocPath(p));
  return reason === undefined ? { tier: "0" } : { tier: "C", reason };
}
