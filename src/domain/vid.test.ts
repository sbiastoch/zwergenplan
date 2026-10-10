import { describe, expect, it } from "vitest";
import { vidsIn } from "./vid.ts";

describe("vidsIn", () => {
  it("liest vid aus URLs von evangelische-termine.de, auch an späterer Parameterposition", () => {
    expect(
      vidsIn([
        "https://www.evangelische-termine.de/ical?vid=124",
        "https://www.evangelische-termine.de/veranstaltungen?region=507&vid=579",
        "https://example.org/?vid=1",
      ]),
    ).toEqual(["124", "579"]);
  });
});
