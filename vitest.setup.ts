/**
 * Kein GIT_* aus der Umgebung des Aufrufers (Plan 0027, Etappe 3, Vorfall vom 2026-10-08). Im pre-commit-Hook
 * setzt git GIT_DIR und GIT_INDEX_FILE. Ein Test, der sie erbte, hat mit `git init`/`git config` im Temp-Ordner
 * das echte Repo umkonfiguriert (`core.bare = true`) und auf den Branch committet. Hier gelöscht, gilt das für
 * jeden Test und jeden Kindprozess, auch künftige rohe git-Aufrufe. Schreibend nutzen Tests git trotzdem nur
 * über `tempRepo()` (scripts/lib/temp-repo.ts).
 */
for (const key of Object.keys(process.env)) {
  if (key.startsWith("GIT_")) delete process.env[key];
}

/**
 * Unit-Tests laufen nie gegen das Live-Netz (Plan 0002): Quellen-Parser bekommen gespeicherte
 * Snapshots aus tests/fixtures/pipeline/. Ein versehentlicher fetch wird hier sofort rot.
 */
globalThis.fetch = () => {
  throw new Error("Kein Netz in Unit-Tests – Snapshot aus tests/fixtures/pipeline/ verwenden");
};
