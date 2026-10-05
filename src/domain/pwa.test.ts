import { describe, expect, it } from "vitest";
import { type InstallState, installHelp } from "./pwa.ts";

describe("installHelp: Texte der Installationshilfe je Zustand (Plan 0011, E7)", () => {
  it("läuft schon als App", () => {
    expect(installHelp("app")).toEqual({ kind: "text", text: "Läuft als App." });
  });

  it("Browser bietet die Installation an: Knopf", () => {
    expect(installHelp("angebot")).toEqual({
      kind: "knopf",
      text: "Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste.",
      button: "Zum Startbildschirm hinzufügen",
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
