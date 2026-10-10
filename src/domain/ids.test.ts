import { describe, expect, expectTypeOf, it } from "vitest";
import {
  KEBAB_ID_PATTERN,
  LEGACY_OFFER_ID_PATTERN,
  MAX_KEBAB_ID,
  MAX_LEGACY_OFFER_ID,
  nextPublicId,
  type OfferKeyInput,
  offerKey,
  resolveOfferId,
  resolveProviderId,
  SHORT_ID_PATTERN,
  shortId,
  slug,
} from "./ids.ts";
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

describe("offerKey", () => {
  const base = { providerId: "fbs-nuernberg", venueId: "fbs-nuernberg", title: "PEKiP" };

  it("regelmäßig: nur der Titel", () => {
    expect(offerKey({ ...base, format: "regelmaessig", firstStart: "2026-10-13T09:30:00+02:00" })).toBe(
      "fbs-nuernberg--pekip--fbs-nuernberg",
    );
  });

  it("Kurs und einmalig: Titel plus Berliner Beginn des ersten Termins", () => {
    expect(offerKey({ ...base, format: "kurs", firstStart: "2026-10-13T07:30:00Z" })).toBe(
      "fbs-nuernberg--pekip-20261013t0930--fbs-nuernberg",
    );
    expect(offerKey({ ...base, format: "einmalig", firstStart: "2026-11-15T11:00:00+01:00" })).toBe(
      "fbs-nuernberg--pekip-20261115t1100--fbs-nuernberg",
    );
  });
});

describe("LEGACY_OFFER_ID_PATTERN", () => {
  it("passt auf jede erzeugte ID und weist Fremdes ab", () => {
    const base = { providerId: "fbs-nuernberg", venueId: "fbs-nuernberg", title: "Müsik & Spiel" };
    for (const format of ["kurs", "regelmaessig", "einmalig"] as const) {
      expect(LEGACY_OFFER_ID_PATTERN.test(offerKey({ ...base, format, firstStart: "2026-10-13T09:30:00+02:00" }))).toBe(
        true,
      );
    }
    for (const bad of ["", "a--b", "../../etc", "A--b--c", "a--b--c\n"]) {
      expect(LEGACY_OFFER_ID_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("OfferKeyInput", () => {
  it("kennt genau die Formate des Schemas", () => {
    expectTypeOf<OfferKeyInput["format"]>().toEqualTypeOf<Format>();
  });
});

describe("KEBAB_ID_PATTERN (Plan 0010, E2)", () => {
  it("akzeptiert alle Anbieter-IDs der Fixtures", () => {
    // Rohdaten der Fixtures vor Zod; gelesen wird nur `id`, die das Schema für jeden Eintrag verlangt
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
    const venue = { name: "Ort", address: "Weg 1, 90402 Nürnberg", geo: { lat: 49.45, lon: 11.07 } };
    expect(Venue.safeParse({ ...venue, id: "ort-eins" }).success).toBe(true);
    const bad = Venue.safeParse({ ...venue, id: "Ort--Eins" });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.message)).toEqual(["kebab-case erwartet"]);
  });

  it("begrenzt die Länge, weil IDs in geteilten Links stehen (Plan 0026, Arch-Review M1)", () => {
    const venue = { name: "Ort", address: "Weg 1, 90402 Nürnberg", geo: { lat: 49.45, lon: 11.07 } };
    expect(Venue.safeParse({ ...venue, id: "a".repeat(MAX_KEBAB_ID) }).success).toBe(true);
    expect(Venue.safeParse({ ...venue, id: "a".repeat(MAX_KEBAB_ID + 1) }).success).toBe(false);
    // der längste mögliche Schlüssel (alte Angebots-ID) aus zwei Katalog-IDs passt in MAX_LEGACY_OFFER_ID
    const longest = offerKey({
      providerId: "p".repeat(MAX_KEBAB_ID),
      venueId: "v".repeat(MAX_KEBAB_ID),
      title: "wort ".repeat(40),
      format: "kurs",
      firstStart: "2026-10-13T09:30:00+02:00",
    });
    expect(longest.length).toBeLessThanOrEqual(MAX_LEGACY_OFFER_ID);
  });
});

describe("shortId (Plan 0015, E13)", () => {
  it("trifft die Testvektoren aus dem Befund", () => {
    expect(shortId("atv-1873-frankonia--riesen-zwerge-turnen-fuer-2-bis-3-jaehrige-mo--atv-1873-frankonia")).toBe(
      "d4qshjw0",
    );
    expect(
      shortId(
        "babykonzert-nuernberg--herbst-babykonzert-klassik-auf-der-krabbeldecke-20261108t1100--babykonzert-nuernberg",
      ),
    ).toBe("4tpu5qaq");
    expect(
      shortId(
        "brk-familienzentrum--auf-entdeckungsreise-mit-papa-10-24-monate-mi-ab-11-11-20261111t1600--brk-familienzentrum",
      ),
    ).toBe("toieuwx3");
  });

  it("hat immer 8 Zeichen [0-9a-z], der seed ändert das Ergebnis", () => {
    for (const text of ["", "a", "x".repeat(500), "Müsik"]) {
      for (const seed of [0, 1, 9]) expect(SHORT_ID_PATTERN.test(shortId(text, seed)), text).toBe(true);
    }
    expect(shortId("fbs-nuernberg", 1)).not.toBe(shortId("fbs-nuernberg", 0));
    expect(shortId("fbs-nuernberg")).toBe(shortId("fbs-nuernberg", 0));
  });
});

describe("SHORT_ID_PATTERN", () => {
  it("nimmt genau 8 Zeichen [0-9a-z]", () => {
    expect(SHORT_ID_PATTERN.test("4tpu5qaq")).toBe(true);
    for (const bad of ["4tpu5qa", "4tpu5qaq0", "4TPU5QAQ", "4tpu-qaq", "4tpu5qaq\n", ""]) {
      expect(SHORT_ID_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("resolveOfferId (E15)", () => {
  it("rechnet die alte Form mit seed 0 um, lässt die neue und verwirft Unfug", () => {
    expect(
      resolveOfferId("atv-1873-frankonia--riesen-zwerge-turnen-fuer-2-bis-3-jaehrige-mo--atv-1873-frankonia"),
    ).toBe("d4qshjw0");
    expect(resolveOfferId("d4qshjw0")).toBe("d4qshjw0");
    for (const bad of ["", "../x", "a--b", "D4QSHJW0", `a--${"b".repeat(MAX_LEGACY_OFFER_ID)}--c`]) {
      expect(resolveOfferId(bad), bad).toBeUndefined();
    }
  });
});

describe("resolveProviderId (E15, N-I2)", () => {
  it("lässt Kurz-IDs, rechnet Katalog-IDs um und verwirft Unfug", () => {
    expect(resolveProviderId("gl1sfqim")).toBe("gl1sfqim");
    expect(resolveProviderId("babykonzert-nuernberg")).toBe("gl1sfqim");
    expect(resolveProviderId("atv-1873-frankonia")).toBe("2i1objpq");
    expect(resolveProviderId("familientreff-beispiel")).toBe("b5nuus36");
    for (const bad of ["", "A-b", "a--b", "a".repeat(MAX_KEBAB_ID + 1), "../x"]) {
      expect(resolveProviderId(bad), bad).toBeUndefined();
    }
  });
});

describe("nextPublicId (E16)", () => {
  it("nimmt den kleinsten freien seed und wirft ab seed 10", () => {
    expect(nextPublicId("babykonzert-nuernberg", new Set())).toBe("gl1sfqim");
    expect(nextPublicId("babykonzert-nuernberg", new Set(["gl1sfqim"]))).toBe(shortId("babykonzert-nuernberg", 1));
    const all = new Set(Array.from({ length: 10 }, (_, s) => shortId("babykonzert-nuernberg", s)));
    expect(() => nextPublicId("babykonzert-nuernberg", all)).toThrow();
  });
});
