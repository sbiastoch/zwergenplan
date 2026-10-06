import { describe, expect, it } from "vitest";
import { declarativePayload, FALLBACK_TITLE, newsUrl, PUSH_TAG, PUSH_TOPIC } from "./push-payload.ts";
import { FIXTURE_NOW } from "./test-fixtures.ts";

const SITE = "https://zwergenplan.app/";

describe("declarativePayload", () => {
  it("baut die allgemeine Nachricht im Declarative-Web-Push-Format", () => {
    expect(declarativePayload({ count: 7, siteUrl: SITE, sentAt: FIXTURE_NOW })).toEqual({
      web_push: 8030,
      notification: {
        title: "Zwergenplan",
        body: "7 neue Angebote im Zwergenplan",
        navigate: "https://zwergenplan.app/?neu",
        tag: "neue-angebote",
        lang: "de",
        app_badge: 7,
        data: { sentAt: "2026-10-05T12:00:00+02:00" },
      },
      mutable: true,
    });
  });

  it("spricht ein einzelnes Angebot im Singular an", () => {
    expect(declarativePayload({ count: 1, siteUrl: SITE, sentAt: FIXTURE_NOW }).notification.body).toBe(
      "1 neues Angebot im Zwergenplan",
    );
  });

  it("setzt sentAt immer mit Offset (Berliner Zeit, auch im Winter)", () => {
    const winter = declarativePayload({ count: 2, siteUrl: SITE, sentAt: new Date("2026-12-01T08:00:00Z") });
    expect(winter.notification.data.sentAt).toBe("2026-12-01T09:00:00+01:00");
  });

  it("lehnt eine Zahl ab, für die es keine Nachricht geben darf", () => {
    for (const count of [0, -1, 1.5, Number.NaN]) {
      expect(() => declarativePayload({ count, siteUrl: SITE, sentAt: FIXTURE_NOW })).toThrow(RangeError);
    }
  });
});

describe("newsUrl", () => {
  it("hängt das Flag an die Seiten-URL, auch ohne Schrägstrich am Ende", () => {
    expect(newsUrl(SITE)).toBe("https://zwergenplan.app/?neu");
    expect(newsUrl("http://localhost:4173")).toBe("http://localhost:4173/?neu");
  });
});

describe("Konstanten", () => {
  it("hat ein Topic, das Apple annimmt: Base64url, Länge ein Vielfaches von 4 (Spike)", () => {
    expect(PUSH_TOPIC).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(PUSH_TOPIC.length % 4).toBe(0);
  });

  it("hat einen Tag und einen festen Ersatztitel", () => {
    expect(PUSH_TAG).toBe("neue-angebote");
    expect(FALLBACK_TITLE).toBe("Neues im Zwergenplan");
  });
});
