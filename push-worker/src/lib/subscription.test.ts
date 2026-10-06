import { describe, expect, it } from "vitest";
import { allowedEndpoint, MAX_BODY_BYTES, parseSubscription } from "./subscription.ts";

const KEYS = { p256dh: "BOrA_valid-base64url", auth: "c2VjcmV0" };
const sub = (endpoint: string, extra: object = {}) => JSON.stringify({ endpoint, keys: KEYS, ...extra });

describe("allowedEndpoint", () => {
  it("nimmt die Push-Dienste der Browser-Hersteller", () => {
    for (const url of [
      "https://web.push.apple.com/QGuQyavXutnMH",
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://eu.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(allowedEndpoint(url), url).toBe(true);
    }
  });

  it("lehnt alles andere ab: fremde Hosts, Suffix ohne Punkt, http, Port, Userinfo, Unsinn", () => {
    for (const url of [
      "https://example.com/push",
      "https://evilpush.apple.com/x",
      "https://push.apple.com.evil.com/x",
      "https://fcm.googleapis.com.evil.com/x",
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com:8443/fcm/send/abc",
      "https://user:pw@fcm.googleapis.com/fcm/send/abc",
      "kein url",
    ]) {
      expect(allowedEndpoint(url), url).toBe(false);
    }
  });
});

describe("parseSubscription", () => {
  it("liefert genau endpoint, expirationTime und keys", () => {
    expect(parseSubscription(sub("https://web.push.apple.com/abc", { expirationTime: null, extra: "weg" }))).toEqual({
      endpoint: "https://web.push.apple.com/abc",
      expirationTime: null,
      keys: KEYS,
    });
  });

  it("lehnt kaputtes JSON, fehlende Schlüssel, fremde Hosts und zu Großes ab", () => {
    expect(parseSubscription("kein json")).toBeUndefined();
    expect(parseSubscription(JSON.stringify({ endpoint: "https://web.push.apple.com/abc" }))).toBeUndefined();
    expect(parseSubscription(sub("https://example.com/abc"))).toBeUndefined();
    expect(
      parseSubscription(sub("https://web.push.apple.com/abc", { keys: { p256dh: "a b", auth: "x" } })),
    ).toBeUndefined();
    expect(parseSubscription(sub(`https://web.push.apple.com/${"a".repeat(MAX_BODY_BYTES)}`))).toBeUndefined();
  });
});
