import { describe, expect, it } from "vitest";
import { FALLBACK_TITLE, PUSH_TAG, PUSH_TOPIC, PUSH_TTL_SECONDS, weeklyPayload } from "./push-payload.ts";
import { FIXTURE_NOW } from "./test-fixtures.ts";

const SITE = "https://zwergenplan.app/";

describe("weeklyPayload", () => {
  it("baut die allgemeine Wochen-Nachricht im Declarative-Web-Push-Format", () => {
    expect(weeklyPayload({ news: 7, week: 42, siteUrl: SITE, sentAt: FIXTURE_NOW })).toEqual({
      web_push: 8030,
      notification: {
        title: "Zwergenplan",
        body: "7 neue Angebote seit letztem Samstag",
        navigate: "https://zwergenplan.app/",
        tag: "wochen-nachricht",
        lang: "de",
        data: { sentAt: "2026-10-05T12:00:00+02:00" },
      },
      mutable: true,
    });
  });

  it("spricht ein einzelnes neues Angebot im Singular an", () => {
    expect(weeklyPayload({ news: 1, week: 3, siteUrl: SITE, sentAt: FIXTURE_NOW }).notification.body).toBe(
      "1 neues Angebot seit letztem Samstag",
    );
  });

  it("sagt ohne Neues, was in den nächsten 7 Tagen ansteht", () => {
    const body = (week: number) =>
      weeklyPayload({ news: 0, week, siteUrl: SITE, sentAt: FIXTURE_NOW }).notification.body;
    expect(body(42)).toBe("Diese Woche nichts Neues. 42 Angebote in den nächsten 7 Tagen.");
    expect(body(1)).toBe("Diese Woche nichts Neues. 1 Angebot in den nächsten 7 Tagen.");
    expect(body(0)).toBe("Diese Woche nichts Neues.");
  });

  it("führt immer auf die Startseite, auch ohne Schrägstrich am Ende", () => {
    expect(
      weeklyPayload({ news: 2, week: 0, siteUrl: "http://localhost:4173", sentAt: FIXTURE_NOW }).notification.navigate,
    ).toBe("http://localhost:4173/");
  });

  it("setzt sentAt immer mit Offset (Berliner Zeit, auch im Winter)", () => {
    const winter = weeklyPayload({ news: 2, week: 5, siteUrl: SITE, sentAt: new Date("2026-12-05T09:07:00Z") });
    expect(winter.notification.data.sentAt).toBe("2026-12-05T10:07:00+01:00");
  });

  it("markiert einen Testversand, sonst nicht", () => {
    expect(
      weeklyPayload({ news: 0, week: 0, siteUrl: SITE, sentAt: FIXTURE_NOW, test: true }).notification.data,
    ).toEqual({
      sentAt: "2026-10-05T12:00:00+02:00",
      test: true,
    });
    expect(
      weeklyPayload({ news: 0, week: 0, siteUrl: SITE, sentAt: FIXTURE_NOW }).notification.data,
    ).not.toHaveProperty("test");
  });

  it("lehnt Zahlen ab, die keine Anzahl sein können", () => {
    for (const n of [-1, 1.5, Number.NaN]) {
      expect(() => weeklyPayload({ news: n, week: 0, siteUrl: SITE, sentAt: FIXTURE_NOW })).toThrow(RangeError);
      expect(() => weeklyPayload({ news: 0, week: n, siteUrl: SITE, sentAt: FIXTURE_NOW })).toThrow(RangeError);
    }
  });
});

describe("Konstanten", () => {
  it("hat ein Topic, das Apple annimmt: Base64url, Länge ein Vielfaches von 4 (Spike)", () => {
    expect(PUSH_TOPIC).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(PUSH_TOPIC.length % 4).toBe(0);
  });

  it("hat einen Tag, einen festen Ersatztitel und hält die Nachricht einen Tag auf", () => {
    expect(PUSH_TAG).toBe("wochen-nachricht");
    expect(FALLBACK_TITLE).toBe("Neues im Zwergenplan");
    expect(PUSH_TTL_SECONDS).toBe(86_400);
  });
});
