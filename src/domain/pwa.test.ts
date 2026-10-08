import { describe, expect, it } from "vitest";
import { type InstallState, installFoot, installHelp, pushView } from "./pwa.ts";

describe("installHelp: Texte der Installationshilfe je Zustand (Plan 0011, E7)", () => {
  it("läuft schon als App", () => {
    expect(installHelp("app")).toEqual({ kind: "text", text: "Läuft als App." });
  });

  it("Browser bietet die Installation an: nur der Text, der Knopf steht im Fuß (Plan 0022)", () => {
    expect(installHelp("angebot")).toEqual({
      kind: "text",
      text: "Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste.",
    });
  });

  it("gerade installiert: Hinweis auf das neue Symbol", () => {
    expect(installHelp("installiert")).toEqual({
      kind: "text",
      text: "Installiert. Öffne den Zwergenplan jetzt über das Symbol auf dem Startbildschirm.",
    });
  });

  it("Android ohne gemerktes Angebot (Event verloren): Browser-Menü", () => {
    expect(installHelp("menue")).toEqual({ kind: "text", text: "Im Browser-Menü „App installieren“ wählen." });
  });

  it("iPhone/iPad: Teilen-Symbol, dann „Zum Home-Bildschirm“, mit dem Hinweis auf den eigenen Speicher (Spike h)", () => {
    expect(installHelp("ios")).toEqual({
      kind: "ios",
      before: "Tippe auf",
      share: "Teilen",
      after: "und dann auf „Zum Home-Bildschirm“.",
      note: "Die App startet leer: Alter, Merkliste und Stadtteil dort noch einmal eintragen.",
    });
  });

  it("sonst: ausgeblendet", () => {
    expect(installHelp("keine")).toBeUndefined();
  });

  it("jeder Zustand ist abgedeckt", () => {
    const all: InstallState[] = ["app", "angebot", "installiert", "menue", "ios", "keine"];
    expect(all.filter((s) => installHelp(s) !== undefined)).toHaveLength(5);
  });
});

describe("installFoot: Fuß des Kind-Sheets über „Fertig“ (Plan 0022)", () => {
  it("Browser bietet die Installation an: Knopf", () => {
    expect(installFoot("angebot")).toEqual({ kind: "knopf", button: "Zum Startbildschirm hinzufügen" });
  });

  it("iPhone/iPad: kompakte Zeile mit Teilen-Symbol zwischen `before` und `share`", () => {
    expect(installFoot("ios")).toEqual({
      kind: "ios",
      before: "Als App:",
      share: "Teilen",
      after: "→ Zum Home-Bildschirm",
    });
  });

  it("sonst nichts: der Fuß zeigt nur „Fertig“", () => {
    for (const state of ["app", "installiert", "menue", "keine"] as const)
      expect(installFoot(state), state).toBeUndefined();
  });
});

describe("pushView: Sichtbarkeit des Push-Teils je Zustand (Plan 0017, E7)", () => {
  const states: InstallState[] = ["app", "angebot", "installiert", "menue", "ios", "keine"];

  it("mit Push-Fähigkeit überall der Push-Teil, auch im Safari-Tab und am Desktop ohne Angebot", () => {
    for (const state of states) expect(pushView(state, "ok"), state).toEqual({ kind: "teil" });
  });

  it("abgelehnt: Push-Teil (Schalter aus, Hinweis auf die Einstellungen)", () => {
    for (const state of states) expect(pushView(state, "verweigert"), state).toEqual({ kind: "teil" });
  });

  it("iPhone im Browser ohne Push: Hinweis auf die App", () => {
    expect(pushView("ios", "kein-push")).toEqual({ kind: "hinweis", text: "Benachrichtigungen gibt es in der App." });
    expect(pushView("ios", "kein-sw")).toEqual({ kind: "hinweis", text: "Benachrichtigungen gibt es in der App." });
  });

  it("Browser ohne Push: Hinweis; ohne Service Worker (blockiert, Erstbesuch, Notausgang) keiner", () => {
    for (const state of ["app", "angebot", "installiert", "menue"] as const) {
      expect(pushView(state, "kein-push")).toEqual({
        kind: "hinweis",
        text: "Dieser Browser kann keine Benachrichtigungen.",
      });
      expect(pushView(state, "kein-sw")).toEqual({ kind: "nichts" });
    }
  });

  it("Desktop ohne Angebot und ohne Push: nichts (der Abschnitt bleibt leer)", () => {
    expect(pushView("keine", "kein-push")).toEqual({ kind: "nichts" });
    expect(pushView("keine", "kein-sw")).toEqual({ kind: "nichts" });
  });
});
