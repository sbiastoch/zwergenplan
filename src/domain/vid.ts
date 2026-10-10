/**
 * Veranstalter-IDs von evangelische-termine.de in Programm-URLs (Plan 0031, Review m5): Die Pipeline fragt je vid ab und
 * ordnet darüber zu; `validateDataset` verlangt sie bei `coveredBy` auf einen evtermine-Kalender. Einzige Definition.
 */
export function vidsIn(urls: readonly string[]): string[] {
  return urls.flatMap((url) => /evangelische-termine\.de\/\S*[?&]vid=(\d+)/.exec(url)?.[1] ?? []);
}
