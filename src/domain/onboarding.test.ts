import { describe, expect, it } from "vitest";
import { ageInMonths } from "./age.ts";
import {
  ageHint,
  appStepParts,
  cityChoices,
  dateAtAge,
  finishLabel,
  LIMIT_CHOICES,
  nextAgeStep,
  ONBOARDING_TEXTS,
  onboardingSteps,
  primaryLabel,
  stepOf,
  stepText,
  welcomeStats,
} from "./onboarding.ts";
import type { InstallState, PushCapability } from "./pwa.ts";
import { LIMIT_MINUTES } from "./reach.ts";
import type { Region } from "./regions.ts";
import { REGIONS } from "./regions.ts";
import type { AgeRange, Format, Offer } from "./schema.ts";
import { FIXTURE_NOW, fixtureOffer, fixtureSiteOffers } from "./test-fixtures.ts";

// Läuft absichtlich in America/Los_Angeles (vitest.config.ts): Kalenderlogik muss in Berlin rechnen.

const INSTALL: InstallState[] = ["app", "angebot", "installiert", "menue", "ios", "keine"];
const PUSH: PushCapability[] = ["ja", "verweigert", "nein"];

describe("appStepParts und onboardingSteps (E1)", () => {
  it("deckt alle 6 × 3 Kombinationen ab", () => {
    const table = INSTALL.flatMap((install) =>
      PUSH.map((push) => `${install}/${push}: ${onboardingSteps(install, push).join(",")}`),
    );
    expect(table).toEqual([
      "app/ja: stadt,alter,weg,app",
      "app/verweigert: stadt,alter,weg",
      "app/nein: stadt,alter,weg",
      "angebot/ja: stadt,alter,weg,app",
      "angebot/verweigert: stadt,alter,weg,app",
      "angebot/nein: stadt,alter,weg,app",
      "installiert/ja: stadt,alter,weg,app",
      "installiert/verweigert: stadt,alter,weg,app",
      "installiert/nein: stadt,alter,weg,app",
      "menue/ja: stadt,alter,weg,app",
      "menue/verweigert: stadt,alter,weg,app",
      "menue/nein: stadt,alter,weg,app",
      "ios/ja: app,stadt,alter,weg",
      "ios/verweigert: app,stadt,alter,weg",
      "ios/nein: app,stadt,alter,weg",
      "keine/ja: stadt,alter,weg,app",
      "keine/verweigert: stadt,alter,weg",
      "keine/nein: stadt,alter,weg",
    ]);
  });

  it("iPhone im Browser: App zuerst (Plan 0034, E1), ohne Schalter, nur der Hinweis", () => {
    for (const push of PUSH) expect(appStepParts("ios", push)).toEqual({ install: "ios", push: "nur-in-app" });
  });

  it("Angebot: Knopf, App zuletzt", () => {
    expect(appStepParts("angebot", "ja")).toEqual({ install: "knopf", push: "schalter" });
    expect(appStepParts("angebot", "nein")).toEqual({ install: "knopf", push: undefined });
  });

  it("schon App bzw. keine Installation: nur der Schalter oder gar kein Schritt", () => {
    expect(appStepParts("app", "ja")).toEqual({ install: undefined, push: "schalter" });
    expect(appStepParts("keine", "ja")).toEqual({ install: undefined, push: "schalter" });
    expect(appStepParts("app", "nein")).toBeUndefined();
    expect(appStepParts("keine", "nein")).toBeUndefined();
    // ein reines „verweigert“ hält den Schritt nicht
    expect(appStepParts("keine", "verweigert")).toBeUndefined();
  });

  it("Menü und verweigert: App-Schritt mit Menü-Hinweis und dem Hinweis zur Ablehnung", () => {
    expect(appStepParts("menue", "verweigert")).toEqual({ install: "menue", push: "verweigert" });
    expect(appStepParts("installiert", "ja")).toEqual({ install: "installiert", push: "schalter" });
  });
});

describe("cityChoices (E5)", () => {
  it("eine Region: eine Kachel, kein Dropdown", () => {
    expect(cityChoices(REGIONS)).toEqual({ tiles: [{ id: "nuernberg", name: "Nürnberg" }], more: [] });
  });

  it("sechs Regionen: vier Kacheln nach Einwohnern absteigend, Gleichstand nach Name, Rest im Dropdown", () => {
    const bbox = REGIONS.nuernberg.bbox;
    const region = (name: string, population: number): Region => ({ name, bbox, population });
    const regions = {
      fuerth: region("Fürth", 132_000),
      erlangen: region("Erlangen", 117_000),
      muenchen: region("München", 1_510_000),
      augsburg: region("Augsburg", 300_000),
      regensburg: region("Regensburg", 158_000),
      aalen: region("Aalen", 158_000),
    };
    const { tiles, more } = cityChoices(regions);
    expect(tiles.map((t) => t.id)).toEqual(["muenchen", "augsburg", "aalen", "regensburg"]);
    expect(more).toEqual([
      { id: "fuerth", name: "Fürth" },
      { id: "erlangen", name: "Erlangen" },
    ]);
    expect(cityChoices(regions, 2).more).toHaveLength(4);
  });
});

describe("welcomeStats (E5)", () => {
  it("zählt nur Angebote mit kommendem Termin und jeden Anbieter einmal", () => {
    // Fixtures: 9 Angebote, das Elterncafé ist am 5.10. um 12 Uhr vorbei; 5 Anbieter
    expect(welcomeStats(fixtureSiteOffers(), FIXTURE_NOW)).toEqual({ offers: 8, providers: 5 });
  });

  it("ein Anbieter nur mit beendeten Angeboten zählt nicht", () => {
    expect(welcomeStats([fixtureOffer("vergangen")], FIXTURE_NOW)).toEqual({ offers: 0, providers: 0 });
  });
});

describe("dateAtAge (E6)", () => {
  it("klemmt am Monatsende wie ageInMonths, auch im Schaltjahr", () => {
    expect(dateAtAge("2026-01-31", 1)).toBe("2026-02-28");
    expect(dateAtAge("2028-01-31", 1)).toBe("2028-02-29");
    expect(dateAtAge("2027-02-28", 12)).toBe("2028-02-28");
    expect(dateAtAge("2026-04-20", 6)).toBe("2026-10-20");
  });

  it("passt zu ageInMonths: am Tag genau m, am Vortag m − 1", () => {
    for (const birth of ["2026-01-31", "2025-08-29", "2027-12-31", "2026-04-20"]) {
      for (const m of [1, 2, 6, 13, 25]) {
        const at = dateAtAge(birth, m);
        expect(ageInMonths(birth, `${at}T12:00:00+01:00`)).toBe(m);
        const before = new Date(Date.parse(`${at}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
        expect(ageInMonths(birth, `${before}T12:00:00+01:00`)).toBe(m - 1);
      }
    }
  });
});

/** Angebot aus dem Krabbeltreff gebaut: Format, Alter und Termine je Test (Ende eine Stunde nach Beginn) */
function offer(format: Format, age: AgeRange, starts: string[]): Offer {
  return {
    ...fixtureOffer("krabbeltreff"),
    format,
    age,
    sessions: starts.map((start) => ({
      start: `${start}T10:00:00+01:00`,
      end: `${start}T11:00:00+01:00`,
    })),
  };
}

describe("nextAgeStep (E6)", () => {
  // am 5.10.2026 4 Monate alt; 5 Monate am 1.11., 6 am 1.12., 8 am 1.2.2027
  const BIRTH = "2026-06-01";
  const ab5 = offer("regelmaessig", { minMonths: 5, maxMonths: 24 }, ["2026-11-04", "2026-11-11"]);
  const ab8 = offer("regelmaessig", { minMonths: 8, maxMonths: 24 }, ["2027-02-10"]);
  const ab6OhneTermin = offer("regelmaessig", { minMonths: 6, maxMonths: 24 }, ["2026-10-14", "2026-11-25"]);
  const kursAb5 = offer("kurs", { minMonths: 5, maxMonths: 12 }, ["2026-11-04"]);
  const passtSchon = offer("regelmaessig", { minMonths: 0, maxMonths: 24 }, ["2026-10-14"]);

  it("ohne Kandidaten: nichts", () => {
    expect(nextAgeStep([], BIRTH, FIXTURE_NOW)).toBeUndefined();
    expect(nextAgeStep([passtSchon], BIRTH, FIXTURE_NOW)).toBeUndefined();
  });

  it("ignoriert Treffs ohne passenden kommenden Termin und Kurse", () => {
    expect(nextAgeStep([ab6OhneTermin, kursAb5], BIRTH, FIXTURE_NOW)).toBeUndefined();
    expect(nextAgeStep([ab6OhneTermin, kursAb5, ab8], BIRTH, FIXTURE_NOW)).toEqual({
      months: 8,
      from: "2027-02-01",
    });
  });

  it("das kleinste Mindestalter gewinnt", () => {
    expect(nextAgeStep([ab8, passtSchon, ab5, kursAb5], BIRTH, FIXTURE_NOW)).toEqual({
      months: 5,
      from: "2026-11-01",
    });
  });
});

describe("ageHint (E10)", () => {
  it("Alter ohne Ausblick", () => {
    expect(ageHint(0)).toBe("Neugeboren! Ab jetzt siehst du nur, was passt.");
    expect(ageHint(1)).toBe("1 Monat! Ab jetzt siehst du nur, was passt.");
    expect(ageHint(5)).toBe("5 Monate! Ab jetzt siehst du nur, was passt.");
  });

  it("mit dem nächsten Treff-Alter und Datum ohne führende Null", () => {
    expect(ageHint(4, { months: 5, from: "2026-11-01" })).toBe(
      "4 Monate! Treffs ab 5 Monaten zeige ich dir mit Terminen ab dem 1.11.",
    );
    expect(ageHint(0, { months: 1, from: "2026-03-09" })).toBe(
      "Neugeboren! Treffs ab 1 Monat zeige ich dir mit Terminen ab dem 9.3.",
    );
  });
});

describe("primaryLabel und finishLabel (E9)", () => {
  const ready = (count: number) => ({ count, pending: false });

  it("erster Schritt, Mitte, letzter Schritt", () => {
    expect(primaryLabel(0, 4, ready(12))).toBe("Los geht’s");
    expect(primaryLabel(1, 4, ready(12))).toBe("Weiter");
    expect(primaryLabel(2, 4, ready(12))).toBe("Weiter");
    expect(primaryLabel(3, 4, ready(12))).toBe("Zeig mir die 12 Angebote");
    expect(primaryLabel(2, 3, { count: 12, pending: true })).toBe("Zeig mir die Angebote");
  });

  it("alle Zweige des Abschlusses", () => {
    expect(finishLabel({ count: 7, pending: true })).toBe("Zeig mir die Angebote");
    expect(finishLabel(ready(0))).toBe("Zur Liste");
    expect(finishLabel(ready(1))).toBe("Zeig mir das eine Angebot");
    expect(finishLabel(ready(2))).toBe("Zeig mir die 2 Angebote");
  });
});

describe("stepText (E10)", () => {
  it("Stadt mit und ohne Daten", () => {
    expect(stepText("stadt", { first: true, stats: { offers: 123, providers: 71 } })).toEqual({
      kicker: "Willkommen",
      title: "Alles für Kinder unter 3 an einem Ort",
      lead: "123 Babykurse, Krabbelgruppen, Konzerte und Ausflüge von 71 Anbietern.",
    });
    const plain = "Babykurse, Krabbelgruppen, Konzerte und Ausflüge an einem Ort.";
    expect(stepText("stadt", { first: true }).lead).toBe(plain);
    expect(stepText("stadt", { first: true, stats: { offers: 0, providers: 0 } }).lead).toBe(plain);
  });

  it("Alter und Weg", () => {
    expect(stepText("alter", { first: false })).toEqual({
      kicker: "Passt zum Alter",
      title: "Nur, was zu deinem Zwerg passt",
      lead: "Auch bei regelmäßigen Treffs prüfe ich jeden einzelnen Termin.",
    });
    expect(stepText("weg", { first: false })).toEqual({
      kicker: "Gut erreichbar",
      title: "Nur, was ihr mit Bus und Bahn schafft",
      lead: "Fahrzeit nach echtem VGN-Fahrplan, mit höchstens einem Umstieg.",
    });
  });

  it("drei Varianten des App-Schritts", () => {
    expect(stepText("app", { first: false, app: { install: "knopf", push: "schalter" } })).toEqual({
      kicker: "Immer griffbereit",
      title: "Ein Tipp, und ich bin da",
      lead: "Auf dem Startbildschirm wie eine App. Und samstags gegen 10 Uhr eine Nachricht, was es Neues für euch gibt.",
    });
    expect(stepText("app", { first: false, app: { install: "ios", push: "nur-in-app" } }).lead).toMatch(
      /^Auf dem .* samstags/,
    );
    const installOnly = {
      kicker: "Immer griffbereit",
      title: "Ein Tipp, und ich bin da",
      lead: "Auf dem Startbildschirm wie eine App, mit eigenem Symbol und ohne Browserleiste.",
    };
    expect(stepText("app", { first: false, app: { install: "menue", push: undefined } })).toEqual(installOnly);
    expect(stepText("app", { first: false, app: { install: "menue", push: "verweigert" } })).toEqual(installOnly);
    expect(stepText("app", { first: false, app: { install: undefined, push: "schalter" } })).toEqual({
      kicker: "Samstags-Nachricht",
      title: "Neues kommt von selbst",
      lead: "Samstags gegen 10 Uhr eine Nachricht, was es Neues für euch gibt.",
    });
  });
});

describe("stepText nach Position (Plan 0034, E2)", () => {
  it("App als Schritt 1 (iPhone im Safari-Tab): Kicker „Willkommen“, Überschrift und Lead wie sonst", () => {
    const ios = { install: "ios", push: "nur-in-app" } as const;
    const later = stepText("app", { first: false, app: ios });
    expect(later.kicker).toBe("Immer griffbereit");
    expect(stepText("app", { first: true, app: ios })).toEqual({ ...later, kicker: "Willkommen" });
  });

  it("Samstags-Variante als Schritt 1 heißt ebenfalls „Willkommen“, sonst „Samstags-Nachricht“", () => {
    const pushOnly = { install: undefined, push: "schalter" } as const;
    expect(stepText("app", { first: false, app: pushOnly }).kicker).toBe("Samstags-Nachricht");
    expect(stepText("app", { first: true, app: pushOnly }).kicker).toBe("Willkommen");
  });

  it("Stadt nicht als Schritt 1: „Schön, dass ihr da seid“, Lead mit Zahlen bleibt", () => {
    const stats = { offers: 123, providers: 71 };
    expect(stepText("stadt", { first: false, stats })).toEqual({
      ...stepText("stadt", { first: true, stats }),
      kicker: "Schön, dass ihr da seid",
    });
    expect(stepText("stadt", { first: true, stats }).kicker).toBe("Willkommen");
  });
});

describe("feste Texte (E3, E10)", () => {
  it("Labels der Eingaben und Vorlesetext zum Fortschritt", () => {
    expect([ONBOARDING_TEXTS.cityLabel, ONBOARDING_TEXTS.birthLabel, ONBOARDING_TEXTS.limitLabel]).toEqual([
      "Eure Stadt",
      "Geburtsdatum",
      "Höchstens unterwegs",
    ]);
    expect(stepOf(1, 4)).toBe("Schritt 2 von 4: ");
  });
});

describe("LIMIT_CHOICES (E7)", () => {
  it("deckt jede Wegzeit-Stufe ab, dazu „Egal“ ohne Grenze", () => {
    expect(LIMIT_CHOICES.map((c) => c.label)).toEqual(["20 Min.", "30 Min.", "45 Min.", "Egal"]);
    expect(LIMIT_CHOICES.map((c) => c.limit?.value)).toEqual([...LIMIT_MINUTES, undefined]);
    for (const c of LIMIT_CHOICES) if (c.limit) expect(c.limit.kind).toBe("minuten");
  });
});
