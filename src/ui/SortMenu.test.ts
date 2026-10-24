import { describe, expect, it } from "vitest";
import { menuKey } from "./SortMenu.tsx";

describe("menuKey: Tastenlogik des Sortiermenüs (Plan 0043, E4)", () => {
  it("Pfeile wandern mit Umlauf, Home/End springen", () => {
    expect(menuKey("ArrowDown", 0, 3)).toBe(1);
    expect(menuKey("ArrowDown", 2, 3)).toBe(0);
    expect(menuKey("ArrowUp", 0, 3)).toBe(2);
    expect(menuKey("ArrowUp", 2, 3)).toBe(1);
    expect(menuKey("Home", 2, 3)).toBe(0);
    expect(menuKey("End", 0, 3)).toBe(2);
  });

  it("Enter und Leertaste wählen, Escape schließt, andere Tasten tun nichts", () => {
    expect(menuKey("Enter", 1, 3)).toBe("choose");
    expect(menuKey(" ", 1, 3)).toBe("choose");
    expect(menuKey("Escape", 1, 3)).toBe("close");
    expect(menuKey("Tab", 1, 3)).toBeUndefined();
    expect(menuKey("a", 1, 3)).toBeUndefined();
  });
});
