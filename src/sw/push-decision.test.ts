import { describe, expect, it } from "vitest";
import { weeklyPayload } from "../domain/push-payload.ts";
import { FIXTURE_NOW } from "../domain/test-fixtures.ts";
import { decidePush, readProposed } from "./push-decision.ts";

const SCOPE = "https://zwergenplan.app/";
const payload = weeklyPayload({ news: 3, week: 7, siteUrl: SCOPE, sentAt: FIXTURE_NOW });
const proposed = readProposed(payload.notification);
const TEXT = { title: "2 neue Angebote für deine Suchen", body: "A und B", hits: ["a", "b"] };

describe("readProposed", () => {
  it("liest Titel, Text, Versandzeit und Test-Markierung", () => {
    expect(proposed).toEqual({
      title: "Zwergenplan",
      body: "3 neue Angebote seit letztem Samstag",
      sentAt: "2026-10-05T12:00:00+02:00",
      test: false,
    });
    expect(
      readProposed(weeklyPayload({ news: 0, week: 0, siteUrl: SCOPE, sentAt: FIXTURE_NOW, test: true }).notification)
        ?.test,
    ).toBe(true);
  });

  it("verwirft Kaputtes", () => {
    for (const raw of [undefined, null, "x", {}, { title: 3 }, { title: "T", body: 4 }]) {
      expect(readProposed(raw)).toBeUndefined();
    }
    expect(readProposed({ title: "T", body: "B" })).toEqual({ title: "T", body: "B", test: false });
  });
});

describe("decidePush", () => {
  it("zeigt den Zuschnitt, immer mit navigate auf die Startseite (Pflicht auf iOS)", () => {
    const { show } = decidePush({ proposed, declarative: true, outcome: { kind: "text", text: TEXT }, scope: SCOPE });
    expect(show).toEqual({
      title: TEXT.title,
      options: {
        body: TEXT.body,
        tag: "wochen-nachricht",
        lang: "de",
        icon: "https://zwergenplan.app/icons/icon-192.png",
        navigate: SCOPE,
        data: { navigate: SCOPE },
      },
    });
  });

  it("deklarativ ohne Zuschnitt: nichts anzeigen, das System zeigt die allgemeine Fassung", () => {
    for (const kind of ["nichts", "zeit", "fehler"] as const) {
      expect(decidePush({ proposed, declarative: true, outcome: { kind }, scope: SCOPE }).show).toBeNull();
    }
  });

  it("klassisch ohne Zuschnitt: die vorgeschlagene Nachricht selbst zeigen", () => {
    const { show } = decidePush({ proposed, declarative: false, outcome: { kind: "zeit" }, scope: SCOPE });
    expect(show?.title).toBe("Zwergenplan");
    expect(show?.options.body).toBe("3 neue Angebote seit letztem Samstag");
    expect(show?.options.navigate).toBe(SCOPE);
  });

  it("klassisch mit kaputter Payload: fester Ersatztitel (Chrome verlangt eine sichtbare Nachricht)", () => {
    const { show } = decidePush({ proposed: undefined, declarative: false, outcome: { kind: "fehler" }, scope: SCOPE });
    expect(show?.title).toBe("Neues im Zwergenplan");
    expect(show?.options.body).toBe("");
  });
});
