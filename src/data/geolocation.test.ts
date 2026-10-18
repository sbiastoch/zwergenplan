import { afterEach, describe, expect, it, vi } from "vitest";
import { NUERNBERG_BBOX } from "../domain/geo.ts";
import { canLocate, type LocationEnv, type PositionApi, requestPosition } from "./geolocation.ts";

/** Gerät, das sofort mit einer Position antwortet */
function at(latitude: number, longitude: number): PositionApi {
  return { getCurrentPosition: (success) => success({ coords: { latitude, longitude } }) };
}

/** Gerät, das mit einem Fehlercode antwortet (1 verweigert, 2 nicht verfügbar, 3 Zeitüberschreitung) */
function failing(code: number): PositionApi {
  return { getCurrentPosition: (_success, error) => error({ code }) };
}

const secure = (geolocation: PositionApi): LocationEnv => ({ geolocation, isSecureContext: true });

describe("requestPosition", () => {
  it("rundet den Standort sofort auf ca. 100 m", async () => {
    expect(await requestPosition(NUERNBERG_BBOX, secure(at(49.45213, 11.07672)))).toEqual({
      ok: true,
      point: { lat: 49.452, lon: 11.077 },
    });
  });

  it("prüft den gerundeten Punkt gegen die übergebene bbox (Plan 0039, E3)", async () => {
    expect(await requestPosition(NUERNBERG_BBOX, secure(at(48.137, 11.575)))).toEqual({ ok: false, reason: "outside" });
    const duesseldorf = { minLat: 51.08, maxLat: 51.4, minLon: 6.62, maxLon: 7.0 };
    expect(await requestPosition(NUERNBERG_BBOX, secure(at(51.226, 6.773)))).toEqual({ ok: false, reason: "outside" });
    expect(await requestPosition(duesseldorf, secure(at(51.226, 6.773)))).toEqual({
      ok: true,
      point: { lat: 51.226, lon: 6.773 },
    });
    // knapp außerhalb, gerundet genau auf der Grenze 49,3 → gilt
    expect(await requestPosition(NUERNBERG_BBOX, secure(at(49.2996, 11.07)))).toEqual({
      ok: true,
      point: { lat: 49.3, lon: 11.07 },
    });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
    [0, "unavailable"],
  ] as const)("übersetzt Fehlercode %d in „%s“", async (code, reason) => {
    expect(await requestPosition(NUERNBERG_BBOX, secure(failing(code)))).toEqual({ ok: false, reason });
  });

  it("fragt grob, mit 10 s Zeitlimit und höchstens 5 min alter Position", async () => {
    const getCurrentPosition = vi.fn<PositionApi["getCurrentPosition"]>((success) =>
      success({ coords: { latitude: 49.45, longitude: 11.07 } }),
    );
    await requestPosition(NUERNBERG_BBOX, secure({ getCurrentPosition }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(getCurrentPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 300_000,
    });
  });

  it("ist ohne API oder ohne sicheren Kontext „unsupported“ und fragt gar nicht", async () => {
    const getCurrentPosition = vi.fn<PositionApi["getCurrentPosition"]>();
    expect(await requestPosition(NUERNBERG_BBOX, { geolocation: undefined, isSecureContext: true })).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(
      await requestPosition(NUERNBERG_BBOX, { geolocation: { getCurrentPosition }, isSecureContext: false }),
    ).toEqual({
      ok: false,
      reason: "unsupported",
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  describe("eigenes Gesamt-Zeitlimit von 15 s", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("gibt nach 15 s „timeout“, wenn das Gerät nie antwortet (z. B. offener Berechtigungsdialog)", async () => {
      vi.useFakeTimers();
      let settled = false;
      const result = requestPosition(NUERNBERG_BBOX, secure({ getCurrentPosition: () => undefined })).then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await result).toEqual({ ok: false, reason: "timeout" });
    });

    it("eine Antwort nach dem Zeitlimit ändert nichts mehr, eine rechtzeitige räumt den Timer ab", async () => {
      vi.useFakeTimers();
      let answer: ((position: { coords: { latitude: number; longitude: number } }) => void) | undefined;
      const late = requestPosition(
        NUERNBERG_BBOX,
        secure({
          getCurrentPosition: (success) => {
            answer = success;
          },
        }),
      );
      await vi.advanceTimersByTimeAsync(15_000);
      answer?.({ coords: { latitude: 49.45213, longitude: 11.07672 } });
      expect(await late).toEqual({ ok: false, reason: "timeout" });

      expect(await requestPosition(NUERNBERG_BBOX, secure(at(49.45213, 11.07672)))).toEqual({
        ok: true,
        point: { lat: 49.452, lon: 11.077 },
      });
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("nutzt ohne Parameter den Browser – in Node gibt es keine Geolocation", async () => {
    expect(await requestPosition(NUERNBERG_BBOX)).toEqual({ ok: false, reason: "unsupported" });
  });
});

describe("canLocate", () => {
  it("braucht die API und einen sicheren Kontext", () => {
    expect(canLocate(secure(at(49.45, 11.07)))).toBe(true);
    expect(canLocate({ geolocation: at(49.45, 11.07), isSecureContext: false })).toBe(false);
    expect(canLocate({ geolocation: undefined, isSecureContext: true })).toBe(false);
    expect(canLocate()).toBe(false);
  });
});
