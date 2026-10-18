import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { berlinDay, PUSH_CRON, PUSH_TIMEZONE } from "./push-schedule.ts";

describe("berlinDay", () => {
  it("nimmt den Berliner Kalendertag für die Versand-Marke", () => {
    expect(berlinDay(new Date("2026-10-10T08:07:00Z"))).toBe("2026-10-10");
    expect(berlinDay(new Date("2026-10-10T22:30:00Z"))).toBe("2026-10-11");
  });
});

describe("Zeitplan", () => {
  it("steht für Samstag 10:07 in Berliner Zeit (Minute 7: volle Stunden verwirft GitHub unter Last)", () => {
    expect(PUSH_CRON).toBe("7 10 * * 6");
    expect(PUSH_TIMEZONE).toBe("Europe/Berlin");
  });

  it("stimmt mit .github/workflows/push-weekly.yml überein (genau ein Zeitplan)", () => {
    const workflow = parse(readFileSync(new URL("../../.github/workflows/push-weekly.yml", import.meta.url), "utf8"));
    expect(workflow.on.schedule).toEqual([{ cron: PUSH_CRON, timezone: PUSH_TIMEZONE }]);
  });

  it("Nachholen per Hand (dry_run aus, ohne Kennung) sendet wie der Zeitplan an alle, ohne --force (Plan 0040)", () => {
    const yml = readFileSync(new URL("../../.github/workflows/push-weekly.yml", import.meta.url), "utf8");
    expect(yml).toMatch(/elif \[ -z "\$ONLY" \]; then\n(\s*#[^\n]*\n)?\s*node scripts\/push-weekly\.ts\n/);
    expect(yml).toContain("(!inputs.dry_run && inputs.only == '')) && 'schedule'");
  });
});
