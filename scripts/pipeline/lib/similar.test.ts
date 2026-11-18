import { describe, expect, it } from "vitest";
import {
  compatibleAge,
  conflictingLabels,
  coreWords,
  keywords,
  ratio,
  sameCoreTitle,
  similarTitle,
} from "./similar.ts";

describe("similar", () => {
  it("ignoriert Füllwörter", () => {
    expect([...keywords("Offener Krabbeltreff für Babys in Nürnberg")]).toEqual(["krabbeltreff"]);
  });

  it("berechnet die Ähnlichkeit wie difflib", () => {
    expect(ratio("abcd", "abcd")).toBe(1);
    expect(ratio("", "")).toBe(1);
    expect(ratio("abcd", "wxyz")).toBe(0);
    expect(ratio("musikzwerge", "musikzwerg")).toBeCloseTo(0.952, 3);
  });

  it("erkennt gleiche Termine mit abweichenden Titeln", () => {
    expect(similarTitle("Musikzwerge für Eltern mit Baby", "Musikzwerge (3–12 Monate)")).toBe(true);
    expect(similarTitle("Mini-Club", "Miniclub")).toBe(true);
    expect(similarTitle("Krabbelgruppe", "Babymassage")).toBe(false);
  });
});

describe("sameCoreTitle (Plan 0038, E4)", () => {
  it("erkennt Fassungen desselben Angebots", () => {
    expect(
      sameCoreTitle("PEKiP (geb. Jan.–März 2026), freitags 9:30", "PEKiP-Gruppe (Babys geb. Jan.–März 2026)"),
    ).toBe(true);
    expect(sameCoreTitle("Abenteuerturnen 1 (1–3 Jahre mit Eltern)", "Abenteuerturnen 1 (1–3 Jahre) – Fr 13.11.")).toBe(
      true,
    );
    expect(
      sameCoreTitle("Rückbildung mit/ohne Baby – Abendkurs", "Rückbildungskurs mit Katrina, donnerstags 17:20–19"),
    ).toBe(true);
    expect(
      sameCoreTitle(
        "Mini-Club Passionskirche (Do 9:00–10:30 Uhr)",
        "Mini-Club Passionskirche (Donnerstag 9–10:30 Uhr)",
      ),
    ).toBe(true);
  });

  it("trennt verschiedene Angebote", () => {
    expect(
      sameCoreTitle("BabySinne (9–15 Monate), Dienstag 9:30", "Kleinkindturnen (12–36 Monate), Dienstag 9:30"),
    ).toBe(false);
    expect(sameCoreTitle("Babyturnen (8–15 Monate)", "PEKiP (Babys im ersten Lebensjahr)")).toBe(false);
    expect(sameCoreTitle("Spielgruppe (1. Lebensjahr)", "Musikgarten (1. Lebensjahr)")).toBe(false);
    expect(sameCoreTitle("Kleinkind-Musik", "Kleinkindturnen")).toBe(false);
    expect(sameCoreTitle("Babyschwimmen ab 4. Monat", "Babymassage ab 4. Monat")).toBe(false);
    // Namensregel: benannte Parallelgruppen
    expect(sameCoreTitle("Spielgruppe Mäuse (Di 9:30)", "Spielgruppe Bären (Di 9:30)")).toBe(false);
    expect(sameCoreTitle("Eltern-Kind-Turnen (Igel)", "Eltern-Kind-Turnen (Bären)")).toBe(false);
    // nur Füllwörter: kein Kerntitel; gleich nur über die Tokenfolge (Plan 0061, E1.2; vorher nie gleich)
    expect(coreWords("MiniClub Eltern-Kind-Gruppe (Mo 15–17 Uhr)")).toEqual([]);
    expect(
      sameCoreTitle("MiniClub Eltern-Kind-Gruppe (Mo 15–17 Uhr)", "MiniClub Eltern-Kind-Gruppe (Mo 15–17 Uhr)"),
    ).toBe(true);
    expect(sameCoreTitle("MiniClub Eltern-Kind-Gruppe (Mo 15–17 Uhr)", "Krabbelgruppe (Mo 15–17 Uhr)")).toBe(false);
  });

  it("lässt Kalender- und Füllwörter aus den Kernwörtern", () => {
    expect(coreWords("PEKiP-Gruppe Dienstagvormittag, dienstags im Herbst (ab 3. Lebensjahr, Start Sept.)")).toEqual([
      "pekip",
    ]);
  });

  it("vergleicht Gruppenkennung und Zeitraum", () => {
    expect(sameCoreTitle("PEKiP Gruppe A (Di 9:30)", "PEKiP Gruppe B (Di 9:30)")).toBe(false);
    expect(sameCoreTitle("PEKiP Gruppe A, Di 9:30", "PEKiP Gruppe B, Di 9:30")).toBe(false);
    expect(sameCoreTitle("Babyschwimmen 2 (ab 8 Monaten)", "Babyschwimmen 1 (ab 8 Monaten)")).toBe(false);
    expect(sameCoreTitle("Babyschwimmen 2 – Fortgeschrittene", "Babyschwimmen 1 – Anfänger")).toBe(false);
    expect(sameCoreTitle("Babyschwimmen (3–12 Monate)", "Babyschwimmen 2 (ab 8 Monaten)")).toBe(true);
    expect(sameCoreTitle("Turnen (1,5 Jahre)", "Turnen (3 bis 6 Monate)")).toBe(true);
    expect(sameCoreTitle("Abenteuerturnen 1 (1 – 3 Jahre)", "Abenteuerturnen (1–3 Jahre)")).toBe(true);
    expect(
      sameCoreTitle(
        "PEKiP-Gruppe Babys 3–5 Mon. (Do 11:15, Geb. Juni–Aug. 2026)",
        "PEKiP-Gruppe Babys 3–5 Mon. (Do 11:15, Geb. Mai–Juli 2026)",
      ),
    ).toBe(false);
    expect(sameCoreTitle("PEKiP (Babys geb. Jan.–März 2026)", "PEKiP (Babys geb. Januar–März 2026) · Fr 9:30")).toBe(
      true,
    );
    expect(sameCoreTitle("Turnen (6 Termine)", "Turnen")).toBe(true);
  });

  it("meldet widersprechende Kennungen auch ohne Kerntitel", () => {
    expect(conflictingLabels("Babyschwimmen 1 (Fr 10:45)", "Babyschwimmen 2 (Fr 10:45)")).toBe(true);
    expect(conflictingLabels("Babyschwimmen A, Start 08.11.", "Babyschwimmen B (So ab 08.11.)")).toBe(true);
    expect(conflictingLabels("PEKiP (Geb. Juni–Aug.)", "PEKiP (Geb. Mai–Juli)")).toBe(true);
    expect(conflictingLabels("Babyschwimmen I (Fr 10:45)", "Babyschwimmen II (Fr 10:45)")).toBe(true);
    expect(conflictingLabels("Turnzwerge III", "Turnzwerge II")).toBe(true);
    expect(conflictingLabels("Spielgruppe C, Mo 9:00", "Spielgruppe F, Mo 9:00")).toBe(true);
    expect(conflictingLabels("Spielgruppe G, Mo 9:00", "Spielgruppe H, Mo 9:00")).toBe(false);
    expect(conflictingLabels("Babyschwimmen 1 (Fr 10:45)", "Babyschwimmen (Fr 10:45)")).toBe(false);
    expect(conflictingLabels("PEKiP (geb. Jan.–März)", "PEKiP (geb. Januar–März)")).toBe(false);
  });
});

describe("sameCoreTitle: Titel ohne Kernwort und Ortsname (Plan 0061, E1.2)", () => {
  it("ohne Kernwort auf beiden Seiten: gleiche Tokenfolge ohne Kalenderwörter und Uhrzeit", () => {
    expect(
      sameCoreTitle("Eltern-Kind-Gruppe 0–3 Jahre (dienstags)", "Eltern-Kind-Gruppe 0–3 Jahre (dienstags 9:30)"),
    ).toBe(true);
    // Wochentagskürzel zählen zu den Kalenderwörtern, „Uhr“ zur Uhrzeit
    expect(sameCoreTitle("Eltern-Kind-Gruppe 0–3 Jahre (Di 9.30 Uhr)", "Eltern-Kind-Gruppe 0–3 Jahre")).toBe(true);
    expect(sameCoreTitle("Eltern-Kind-Gruppe 0–3 Jahre", "Eltern-Kind-Gruppe 0–3 Jahre im Gemeindehaus")).toBe(false);
    // Ziffern bleiben: 0–3 und 1–3 Jahre sind Parallelgruppen (Review m1)
    expect(sameCoreTitle("Eltern-Kind-Gruppe 0–3 Jahre (dienstags)", "Eltern-Kind-Gruppe 1–3 Jahre (dienstags)")).toBe(
      false,
    );
    // nur eine Seite mit Kernwort: weiter verschieden
    expect(sameCoreTitle("Eltern-Kind-Gruppe (dienstags)", "Eltern-Kind-Gruppe Sonnenschein (dienstags)")).toBe(false);
  });

  it("die Kernwörter einer Seite (mindestens zwei) stehen alle in der anderen: gleich", () => {
    expect(
      sameCoreTitle(
        "MiniClub Montag 15–17 Uhr (Blaues Sofa, Dietrich-Bonhoeffer-Kirche)",
        "Miniclub Dietrich-Bonhoeffer-Kirche (Mo 15–17 Uhr)",
      ),
    ).toBe(true);
    // ein einzelnes gemeinsames Wort genügt nicht (Schwestergruppen der Gegenprobe, Plan 0061)
    expect(
      sameCoreTitle(
        "Krabbelgruppe Maxis (ab 13 Monate) Donnerstag",
        "Wunder-Krabbler Maxis (über 12 Monate), donnerstags",
      ),
    ).toBe(false);
    // widersprechende Kennung trennt weiter
    expect(
      sameCoreTitle("Dietrich-Bonhoeffer-Kirche Gruppe A", "Blaues Sofa Dietrich-Bonhoeffer-Kirche Gruppe B"),
    ).toBe(false);
  });

  it("verschiedene Daten im Titel trennen: aufeinanderfolgende Kurse (Messung Plan 0061)", () => {
    expect(
      sameCoreTitle(
        "Babyschwimmen 3–12 Monate, Start 21.02.2027 (Sonntag)",
        "Babyschwimmen 3–12 Monate, Start 29.11.2026 (Sonntag)",
      ),
    ).toBe(false);
    expect(
      sameCoreTitle("Babyschwimmen (3–12 Monate), So ab 21.02.2027", "Babyschwimmen (3–12 Monate), So ab 29.11."),
    ).toBe(false);
    // gleiches Datum oder nur eine Seite mit Datum: wie bisher
    expect(sameCoreTitle("Babyschwimmen, Start 29.11.2026", "Babyschwimmen (So ab 29.11.)")).toBe(true);
    expect(sameCoreTitle("Abenteuerturnen 1 (1–3 Jahre mit Eltern)", "Abenteuerturnen 1 (1–3 Jahre) – Fr 13.11.")).toBe(
      true,
    );
  });

  it("Gegenprobe: die Titel der Schwestergruppen aus dem Befund bleiben verschieden", () => {
    for (const [a, b] of [
      ["BabySinne 12–30 Monate, Di 9:30–10:15", "Kleinkindturnen 12–36 Monate, Di 9:30–10:30"],
      ["Mini-Club Donnerstagvormittag (9–10:30 Uhr)", "Mini-Club Passionskirche (Eltern-Kind-Gruppe, donnerstags)"],
      ["Eltern-Kind-Gruppe für Säuglinge und Kleinkinder (donnerstags)", "Krabbelgruppe Donnerstag, TabeaHaus"],
      ["Abenteuerturnen 1 (1–3 J., mit Eltern)", "PapaZeit Spezial: Waldweihnacht (ab 2 Jahren)"],
      ["PapaZeit Spezial: Weihnachtswerkstatt (ab 2 J.)", "Waldwichtel Knorke durch den Advent (10–12 Uhr)"],
      ["Babymassage Mittwoch 10:00 Uhr (ab ca. 6 Wochen)", "Krabbelgruppe Minis (0–6 Monate) Mittwoch"],
      ["Krabbelgruppe Maxis (ab 13 Monate) Donnerstag", "Wunder-Krabbler Maxis (über 12 Monate), donnerstags"],
      ["Achtsame Babymassage-Kurs (Mo, 09.11.–21.12.2026)", "Bindung durch Berührung (Babymassage), ab Mo 09.11.2026"],
    ] as const)
      expect(sameCoreTitle(a, b), `${a} | ${b}`).toBe(false);
  });
});

describe("compatibleAge (Plan 0038, E4)", () => {
  it("verlangt, dass ein Bereich im anderen liegt", () => {
    expect(compatibleAge({ minMonths: 0, maxMonths: 12 }, { minMonths: 7, maxMonths: 10 })).toBe(true);
    expect(compatibleAge({ minMonths: 7, maxMonths: 10 }, { minMonths: 0, maxMonths: 12 })).toBe(true);
    expect(compatibleAge({ minMonths: 9, maxMonths: 15 }, { minMonths: 12, maxMonths: 36 })).toBe(false);
    expect(compatibleAge(undefined, { minMonths: 9, maxMonths: 15 })).toBe(true);
    expect(compatibleAge({ minMonths: 9, maxMonths: 15 }, undefined)).toBe(true);
  });
});
