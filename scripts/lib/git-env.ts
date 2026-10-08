/**
 * Umgebung für git-Aufrufe ohne geerbte GIT_*-Variablen.
 *
 * Git setzt in Hooks GIT_DIR, GIT_INDEX_FILE und weitere Variablen. Ein Kindprozess, der sie erbt, arbeitet auf dem
 * Repo des Hooks statt auf seinem eigenen `cwd`. Am 2026-10-08 hat so ein Unit-Test, den der pre-commit-Hook
 * startete, mit `git init` und `git config` im vermeintlichen Temp-Repo das echte Repo umkonfiguriert
 * (`core.bare = true`, fremde `user.*`) und auf den Branch committet (Plan 0027, Etappe 3).
 * Jeder git-Aufruf mit eigenem `cwd` geht deshalb über diese Umgebung.
 */
export function withoutGitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("GIT_")));
}
