import { describe, expect, it } from "vitest";
import { resubscribe } from "./resubscribe.ts";

const NEW = "https://fcm.googleapis.com/fcm/send/neu";
const OLD = "https://fcm.googleapis.com/fcm/send/alt";
const fresh = { endpoint: NEW, toJSON: () => ({ endpoint: NEW, keys: { p256dh: "p", auth: "a" } }) };

function env(options: { ok?: boolean; stored?: string } = {}) {
  const sent: [string, unknown][] = [];
  const stored = new Map<string, unknown>(options.stored ? [["endpoint", options.stored]] : []);
  return {
    sent,
    stored,
    env: {
      send: async (method: "POST" | "DELETE", body: unknown) => {
        sent.push([method, body]);
        return options.ok ?? true;
      },
      store: {
        get: async (key: "endpoint") => stored.get(key),
        set: async (key: "endpoint", value: string) => {
          stored.set(key, value);
        },
      },
    },
  };
}

describe("resubscribe", () => {
  it("meldet nur das neue Abo, meldet das alte ab und merkt den Endpoint", async () => {
    const e = env();
    await resubscribe(fresh, OLD, e.env);
    expect(e.sent).toEqual([
      ["POST", { endpoint: NEW, keys: { p256dh: "p", auth: "a" } }],
      ["DELETE", { endpoint: OLD }],
    ]);
    expect(e.stored.get("endpoint")).toBe(NEW);
  });

  it("ohne altes Abo im Event: alter Endpoint aus dem Geräte-Speicher", async () => {
    const e = env({ stored: OLD });
    await resubscribe(fresh, undefined, e.env);
    expect(e.sent.at(-1)).toEqual(["DELETE", { endpoint: OLD }]);
  });

  it("gleicher Endpoint: kein DELETE", async () => {
    const e = env({ stored: NEW });
    await resubscribe(fresh, undefined, e.env);
    expect(e.sent.map(([m]) => m)).toEqual(["POST"]);
  });

  it("scheitert das Melden: kein DELETE, nichts geschrieben (der Abgleich holt es nach)", async () => {
    const e = env({ ok: false, stored: OLD });
    await resubscribe(fresh, OLD, e.env);
    expect(e.sent.map(([m]) => m)).toEqual(["POST"]);
    expect(e.stored.get("endpoint")).toBe(OLD);
  });
});
