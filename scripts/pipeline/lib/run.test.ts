import { describe, expect, it } from "vitest";
import { RunMeta, SourceStatusFile } from "./run.ts";

describe("Laufdateien", () => {
  it("prüft meta.json und candidates/_status.json", () => {
    expect(RunMeta.parse({ from: "2026-10-04", to: "2027-02-04", startedAt: "x" }).to).toBe("2027-02-04");
    expect(() => RunMeta.parse({ from: "4.10.2026", to: "2027-02-04", startedAt: "x" })).toThrow();
    expect(SourceStatusFile.parse({ evtermine: { status: "fehler", reason: "503", fetchedAt: "t" } })).toEqual({
      evtermine: { status: "fehler", reason: "503", fetchedAt: "t" },
    });
    expect(() => SourceStatusFile.parse({ evtermine: { status: "kaputt", fetchedAt: "t" } })).toThrow();
  });
});
