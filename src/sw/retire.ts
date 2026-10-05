/**
 * Notausgang (README; Arch-Review Stufe 1, H3): Ein Service Worker, der sich selbst abmeldet. Gebaut statt `sw.ts`,
 * wenn `ZWERGENPLAN_SW=aus` gesetzt ist (`src/sw/kill.ts`, `vite.config.ts`). Die Seite registriert dann nicht neu
 * (`__SW_OFF__` in `src/data/pwa.ts`), deshalb endet das Neuladen nicht in einer Schleife.
 */

/** Was der Notausgang vom Service-Worker-Scope braucht; im Unit-Test stehen hier Fakes. */
export interface RetireScope {
  cacheNames: () => Promise<readonly string[]>;
  deleteCache: (name: string) => Promise<boolean>;
  unregister: () => Promise<boolean>;
  windows: () => Promise<ReadonlyArray<{ url: string; navigate: (url: string) => Promise<unknown> }>>;
}

/** Nur die eigenen Caches (`zp-shell-*`, `zp-assets`, `zp-data`, siehe routes.ts) */
const OWN = /^zp-/;

/** Eigene Caches löschen, abmelden, offene Fenster ohne Service Worker neu laden. */
export async function retire(scope: RetireScope): Promise<void> {
  for (const name of await scope.cacheNames()) {
    if (OWN.test(name)) await scope.deleteCache(name);
  }
  await scope.unregister();
  for (const client of await scope.windows()) {
    // z. B. ein Fenster eines anderen Origins im Scope: die übrigen trotzdem neu laden
    await client.navigate(client.url).catch(() => undefined);
  }
}
