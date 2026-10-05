import { describe, expect, expectTypeOf, it } from "vitest";
import { KEBAB_ID_PATTERN, OFFER_ID_PATTERN, type OfferIdInput, offerId, slug } from "./ids.ts";
import { type Format, Venue } from "./schema.ts";
import { rawFixtures } from "./test-fixtures.ts";

describe("slug", () => {
  it("transliteriert Umlaute und ersetzt Sonderzeichen", () => {
    expect(slug("Bücherzwerge & Fingerspiele")).toBe("buecherzwerge-fingerspiele");
    expect(slug("Große Füße – Österreich")).toBe("grosse-fuesse-oesterreich");
    expect(slug("Mu\u0308sik")).toBe("muesik"); // NFD-Eingabe ergibt dieselbe ID
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

describe("OFFER_ID_PATTERN", () => {
  it("passt auf jede erzeugte ID und weist Fremdes ab", () => {
    const base = { providerId: "fbs-nuernberg", venueId: "fbs-nuernberg", title: "Müsik & Spiel" };
    for (const format of ["kurs", "regelmaessig", "einmalig"] as const) {
      expect(OFFER_ID_PATTERN.test(offerId({ ...base, format, firstStart: "2026-10-13T09:30:00+02:00" }))).toBe(true);
    }
    for (const bad of ["", "a--b", "../../etc", "A--b--c", "a--b--c\n"]) {
      expect(OFFER_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("OfferIdInput", () => {
  it("kennt genau die Formate des Schemas", () => {
    expectTypeOf<OfferIdInput["format"]>().toEqualTypeOf<Format>();
  });
});

describe("KEBAB_ID_PATTERN (Plan 0010, E2)", () => {
  it("akzeptiert alle Anbieter-IDs der Fixtures", () => {
    const ids = (rawFixtures().providers as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toHaveLength(7);
    for (const id of ids) expect(KEBAB_ID_PATTERN.test(id), id).toBe(true);
  });

  it("lehnt Pfade, Großbuchstaben, doppelte und randständige Bindestriche und den Leerstring ab", () => {
    for (const bad of ["../x", "A-b", "a--b", "-a", "a-", "", "a b", "a\n"]) {
      expect(KEBAB_ID_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("ist die Regel des Schemas, mit unveränderter Meldung", () => {
    const venue = { name: "Ort", address: "Weg 1, 90402 Nürnberg", ring: "innen", geo: { lat: 49.45, lon: 11.07 } };
    expect(Venue.safeParse({ ...venue, id: "ort-eins" }).success).toBe(true);
    const bad = Venue.safeParse({ ...venue, id: "Ort--Eins" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toEqual(["kebab-case erwartet"]);
  });
});
