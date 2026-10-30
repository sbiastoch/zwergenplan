import { describe, expect, it } from "vitest";
import { checkLanding } from "./browser.ts";

describe("checkLanding (Plan 0048, E8; Abweichung in S3)", () => {
  it("gleiche Adresse: keine Prüfung; andere Adresse: robots.txt dort, gesperrt wirft", async () => {
    const seen: string[] = [];
    const check = async (url: string) => {
      seen.push(url);
      if (url.includes("/intern/")) throw new Error("robots.txt sperrt /intern/");
    };
    await checkLanding("https://a.example/kurse", "https://a.example/kurse", check);
    await checkLanding("https://a.example/kurse", "https://a.example/kurse/neu", check);
    await expect(checkLanding("https://a.example/kurse", "https://a.example/intern/x", check)).rejects.toThrow(
      "robots.txt sperrt",
    );
    expect(seen).toEqual(["https://a.example/kurse/neu", "https://a.example/intern/x"]);
  });
});
