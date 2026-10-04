import { describe, expect, it } from "vitest";

describe("Unit-Tests ohne Netz", () => {
  it("fetch wirft (Kanarienvogel für vitest.setup.ts)", () => {
    expect(() => fetch("https://example.org")).toThrow("Kein Netz in Unit-Tests");
  });
});
