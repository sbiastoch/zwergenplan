import { describe, expect, it } from "vitest";
import { offerId, slug } from "./ids.ts";

describe("slug", () => {
  it("transliteriert Umlaute und ersetzt Sonderzeichen", () => {
    expect(slug("Bücherzwerge & Fingerspiele")).toBe("buecherzwerge-fingerspiele");
    expect(slug("Große Füße – Österreich")).toBe("grosse-fuesse-oesterreich");
    expect(slug("  PEKiP®-Gruppe (Babys geb. Juli–Sept. 2026) ")).toBe("pekip-gruppe-babys-geb-juli-sept-2026");
  });

  it("kürzt an einer Wortgrenze", () => {
    const s = slug("Musikgarten für Babys und Kleinkinder mit ihren Eltern am Vormittag im Gemeindehaus", 40);
    expect(s).toBe("musikgarten-fuer-babys-und-kleinkinder");
    expect(s.length).toBeLessThanOrEqual(40);
  });

  it("kürzt hart, wenn das erste Wort zu lang ist", () => {
    expect(slug("Donaudampfschifffahrtsgesellschaft", 10)).toBe("donaudampf");
  });

  it("liefert nie einen leeren Slug", () => {
    expect(slug("!!!")).toBe("x");
  });
});

describe("offerId", () => {
  const base = { providerId: "fbs-nuernberg", venueId: "fbs-nuernberg", title: "PEKiP" };

  it("regelmäßig: nur der Titel", () => {
    expect(offerId({ ...base, format: "regelmaessig", firstStart: "2026-10-13T09:30:00+02:00" })).toBe(
      "fbs-nuernberg--pekip--fbs-nuernberg",
    );
  });

  it("Kurs und einmalig: Titel plus Berliner Beginn des ersten Termins", () => {
    expect(offerId({ ...base, format: "kurs", firstStart: "2026-10-13T07:30:00Z" })).toBe(
      "fbs-nuernberg--pekip-20261013t0930--fbs-nuernberg",
    );
    expect(offerId({ ...base, format: "einmalig", firstStart: "2026-11-15T11:00:00+01:00" })).toBe(
      "fbs-nuernberg--pekip-20261115t1100--fbs-nuernberg",
    );
  });
});
