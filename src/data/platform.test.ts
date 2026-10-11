import { describe, expect, it } from "vitest";
import { isIosDevice } from "./platform.ts";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ipod: "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  // iPadOS meldet sich als Mac; nur die Touch-Punkte verraten es
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15",
  pixel:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
};

describe("isIosDevice (Plan 0035, E8)", () => {
  it("iPhone, iPad und iPod", () => {
    for (const userAgent of [UA.iphone, UA.ipad, UA.ipod])
      expect(isIosDevice({ userAgent, maxTouchPoints: 5 }), userAgent).toBe(true);
  });

  it("Mac nur mit Touch-Punkten (iPadOS)", () => {
    expect(isIosDevice({ userAgent: UA.mac, maxTouchPoints: 5 })).toBe(true);
    expect(isIosDevice({ userAgent: UA.mac, maxTouchPoints: 0 })).toBe(false);
  });

  it("Android und Desktop nicht", () => {
    expect(isIosDevice({ userAgent: UA.pixel, maxTouchPoints: 5 })).toBe(false);
    expect(isIosDevice({ userAgent: UA.desktop, maxTouchPoints: 0 })).toBe(false);
  });
});
