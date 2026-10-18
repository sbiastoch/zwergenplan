import { describe, expect, it } from "vitest";
import {
  ageHint,
  appStepParts,
  cityChoices,
  finishLabel,
  LIMIT_CHOICES,
  ONBOARDING_TEXTS,
  onboardingSteps,
  primaryLabel,
  SWIPE,
  stepOf,
  stepText,
  swipeStep,
  welcomeStats,
} from "./onboarding.ts";
import type { InstallState, PushCapability } from "./pwa.ts";
import { LIMIT_MINUTES } from "./reach.ts";
import type { Region } from "./regions.ts";
import { REGIONS } from "./regions.ts";
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

  it("iPhone im Browser: App zuerst (Plan 0035, E1), ohne Schalter, nur der Hinweis", () => {
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
  it("Düsseldorf, Nürnberg und Fürth: drei Kacheln nach Einwohnern, kein Dropdown (Plan 0036; Plan 0039, E8)", () => {
    expect(cityChoices(REGIONS)).toEqual({
      tiles: [
        { id: "duesseldorf", name: "Düsseldorf" },
        { id: "nuernberg", name: "Nürnberg" },
        { id: "fuerth", name: "Fürth" },
      ],
      more: [],
    });
  });

  it("sechs Regionen: vier Kacheln nach Einwohnern absteigend, Gleichstand nach Name, Rest im Dropdown", () => {
    const region = (name: string, population: number): Region => ({ ...REGIONS.nuernberg, name, population });
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

describe("ageHint (Nachtrag Plan 0035, 2026-10-11: herzlich statt Rechnen)", () => {
  it.each([
    [0, "Willkommen auf der Welt!"],
    [1, "Ganz frisch dabei!"],
    [2, "Ganz frisch dabei!"],
    [3, "Schon 3 Monate!"],
    [5, "Schon 5 Monate!"],
    [6, "Schon ein halbes Jahr!"],
    [7, "Schon 7 Monate!"],
    [9, "Schon 9 Monate!"],
    [10, "Bald ein Jahr!"],
    [11, "Bald ein Jahr!"],
    [12, "Ein ganzes Jahr – Glückwunsch!"],
    [13, "Schon über ein Jahr!"],
    [17, "Schon über ein Jahr!"],
    [18, "Anderthalb Jahre!"],
    [19, "Bald zwei!"],
    [23, "Bald zwei!"],
    [24, "Schon zwei!"],
    [29, "Schon zwei!"],
    [30, "Zweieinhalb!"],
    [32, "Zweieinhalb!"],
    [33, "Bald drei!"],
    [35, "Bald drei!"],
    [36, "Schon drei! Hier gibt’s vor allem Angebote bis 3."],
    [50, "Schon drei! Hier gibt’s vor allem Angebote bis 3."],
  ])("%i Monate: „%s“", (months, text) => {
    expect(ageHint(months)).toBe(text);
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
      lead: "Schluss mit dem Rechnen: Ich prüfe für jeden Termin, ob oder ab wann das Alter passt.",
    });
    expect(stepText("weg", { first: false })).toEqual({
      kicker: "Gut erreichbar",
      title: "Nur, was ihr mit Bus und Bahn schafft",
      lead: "Ich zeige, wie lange ihr mit Bus und Bahn braucht – mit höchstens einem Umstieg.",
    });
  });

  it("drei Varianten des App-Schritts", () => {
    expect(stepText("app", { first: false, app: { install: "knopf", push: "schalter" } })).toEqual({
      kicker: "Immer griffbereit",
      title: "Ein Tipp, und ich bin da",
      lead: "Auf dem Startbildschirm wie eine App. Und einmal pro Woche eine Push-Nachricht, was es Neues für euch gibt.",
    });
    expect(stepText("app", { first: false, app: { install: "ios", push: "nur-in-app" } }).lead).toMatch(
      /^Auf dem .* einmal pro Woche/,
    );
    const installOnly = {
      kicker: "Immer griffbereit",
      title: "Ein Tipp, und ich bin da",
      lead: "Auf dem Startbildschirm wie eine App, mit eigenem Symbol und ohne Browserleiste.",
    };
    expect(stepText("app", { first: false, app: { install: "menue", push: undefined } })).toEqual(installOnly);
    expect(stepText("app", { first: false, app: { install: "menue", push: "verweigert" } })).toEqual(installOnly);
    expect(stepText("app", { first: false, app: { install: undefined, push: "schalter" } })).toEqual({
      kicker: "Einmal pro Woche",
      title: "Neues kommt von selbst",
      lead: "Einmal pro Woche eine Push-Nachricht, was es Neues für euch gibt.",
    });
  });
});

describe("stepText nach Position (Plan 0035, E2)", () => {
  it("App als Schritt 1 (iPhone im Safari-Tab): Kicker „Willkommen“, Überschrift und Lead wie sonst", () => {
    const ios = { install: "ios", push: "nur-in-app" } as const;
    const later = stepText("app", { first: false, app: ios });
    expect(later.kicker).toBe("Immer griffbereit");
    expect(stepText("app", { first: true, app: ios })).toEqual({ ...later, kicker: "Willkommen" });
  });

  it("Push-Variante als Schritt 1 heißt ebenfalls „Willkommen“, sonst „Einmal pro Woche“", () => {
    const pushOnly = { install: undefined, push: "schalter" } as const;
    expect(stepText("app", { first: false, app: pushOnly }).kicker).toBe("Einmal pro Woche");
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

describe("swipeStep (Plan 0035, E10)", () => {
  const width = 412;
  const g = (x0: number, y0: number, x1: number, y1: number) => swipeStep({ x0, y0, x1, y1, width });

  it("nach links weiter, nach rechts zurück", () => {
    expect(g(300, 400, 200, 410)).toBe("weiter");
    expect(g(100, 400, 200, 390)).toBe("zurueck");
  });

  it("Mindestweg genau 56 px", () => {
    expect(SWIPE.minDistance).toBe(56);
    expect(g(300, 400, 244, 400)).toBe("weiter");
    expect(g(300, 400, 245, 400)).toBeUndefined();
    expect(g(100, 400, 156, 400)).toBe("zurueck");
  });

  it("Start am Rand gehört dem System (24 px)", () => {
    expect(g(23, 400, 200, 400)).toBeUndefined();
    expect(g(389, 400, 200, 400)).toBeUndefined();
    expect(g(24, 400, 200, 400)).toBe("zurueck");
    expect(g(388, 400, 200, 400)).toBe("weiter");
  });

  it("Steigung höchstens 0,5", () => {
    expect(g(300, 400, 200, 450)).toBe("weiter");
    expect(g(300, 400, 200, 451)).toBeUndefined();
    expect(g(300, 400, 200, 349)).toBeUndefined();
  });

  it("rein vertikal: nichts", () => {
    expect(g(200, 100, 200, 400)).toBeUndefined();
  });
});
