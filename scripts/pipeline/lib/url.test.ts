import { describe, expect, it } from "vitest";
import { canonicalUrl } from "./url.ts";

describe("canonicalUrl (Plan 0049, E2)", () => {
  it("ohne Fragment und ohne Sitzungs- und Tracking-Parameter, übrige Parameter in ihrer Reihenfolge", () => {
    expect(canonicalUrl("https://www.example.org/kurse/?PHPSESSID=abc&w=3&utm_source=x&sid=9&venueId=7#termine")).toBe(
      "https://www.example.org/kurse/?w=3&venueId=7",
    );
  });

  it("lässt eine saubere URL gleich, auch mit Schrägstrich und www.", () => {
    expect(canonicalUrl("https://www.example.org/kurse/")).toBe("https://www.example.org/kurse/");
    expect(canonicalUrl("https://example.org/a?b=1")).toBe("https://example.org/a?b=1");
  });

  it("ohne übrige Parameter kein Fragezeichen", () => {
    expect(canonicalUrl("https://example.org/a?utm_medium=y&fbclid=z")).toBe("https://example.org/a");
  });

  it("ungültige oder interne URL: undefined", () => {
    expect(canonicalUrl("kein-link")).toBeUndefined();
    expect(canonicalUrl("http://127.0.0.1/x")).toBeUndefined();
  });
});
