import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { tempRepo } from "./temp-repo.ts";
import { treeId } from "./tree-id.ts";

/**
 * `.claude/hooks/lib.ts` hat eine eigene Kopie von `treeId`, weil Hooks nur Node-Builtins importieren dürfen
 * (docs/architecture.md). Beide müssen dieselbe ID liefern, sonst passen Stempel und Review-Vermerk nicht zusammen.
 */
const repo = tempRepo("zp-hooks-tree-");
const savedProjectDir = process.env["CLAUDE_PROJECT_DIR"];
afterAll(() => {
  repo.remove();
  if (savedProjectDir === undefined) delete process.env["CLAUDE_PROJECT_DIR"];
  else process.env["CLAUDE_PROJECT_DIR"] = savedProjectDir;
});

describe("treeHash der Hooks = treeId der Skripte (Plan 0027, E5.1)", () => {
  it("liefert für denselben Arbeitsbaum dieselbe Tree-ID", async () => {
    writeFileSync(join(repo.dir, ".gitignore"), ".claude/state/\n");
    writeFileSync(join(repo.dir, "a.txt"), "a\n");
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "start");
    writeFileSync(join(repo.dir, "neu.txt"), "n\n");

    process.env["CLAUDE_PROJECT_DIR"] = repo.dir;
    const hooks = await import("../../.claude/hooks/lib.ts");
    expect(hooks.treeHash()).toBe(treeId(repo.dir));
    expect(hooks.treeHash()).toMatch(/^[0-9a-f]{40}$/);
  });
});
