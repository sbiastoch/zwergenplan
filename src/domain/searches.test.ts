import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, type FilterState } from "./filter.ts";
import { addSearch, hasSearch, MAX_SEARCHES, parseSearches, removeSearch } from "./searches.ts";

const f = (state: Partial<FilterState>): FilterState => ({ ...EMPTY_FILTER, ...state });
const MUSIK_NATUR = f({ categories: ["natur", "musik"], reachLimit: { kind: "minuten", value: 20 } });

describe("addSearch", () => {
  it("speichert eine Suche als kanonischen Filter-Querystring", () => {
    expect(addSearch([], MUSIK_NATUR)).toEqual({ list: ["kat=musik,natur&wegzeit=20"], outcome: "neu" });
  });

  it("erkennt eine schon abonnierte Suche, egal in welcher Reihenfolge die Werte gewählt wurden", () => {
    const list = ["kat=musik,natur&wegzeit=20"];
    const same = f({ categories: ["musik", "natur"], reachLimit: { kind: "minuten", value: 20 } });
    expect(addSearch(list, same)).toEqual({ list, outcome: "schon-da" });
  });

  it("legt keine leere Suche an", () => {
    expect(addSearch([], EMPTY_FILTER)).toEqual({ list: [], outcome: "leer" });
  });

  it("nimmt höchstens fünf Suchen", () => {
    const list = ["kat=musik", "kat=natur", "kat=wasser", "kat=buehne", "kat=museum"];
    expect(MAX_SEARCHES).toBe(5);
    expect(addSearch(list, f({ categories: ["kreativ"] }))).toEqual({ list, outcome: "voll" });
    // eine schon vorhandene bleibt „schon da“, auch bei voller Liste
    expect(addSearch(list, f({ categories: ["musik"] })).outcome).toBe("schon-da");
  });

  it("ändert die übergebene Liste nicht", () => {
    const list = ["kat=musik"];
    addSearch(list, f({ categories: ["natur"] }));
    expect(list).toEqual(["kat=musik"]);
  });
});

describe("removeSearch und hasSearch", () => {
  it("entfernt genau die eine Suche", () => {
    expect(removeSearch(["kat=musik", "kat=natur"], "kat=musik")).toEqual(["kat=natur"]);
    expect(removeSearch(["kat=musik"], "kat=wasser")).toEqual(["kat=musik"]);
  });

  it("prüft über die kanonische Form", () => {
    expect(hasSearch(["kat=musik,natur&wegzeit=20"], MUSIK_NATUR)).toBe(true);
    expect(hasSearch(["kat=musik"], MUSIK_NATUR)).toBe(false);
    expect(hasSearch([], EMPTY_FILTER)).toBe(false);
  });
});

describe("parseSearches", () => {
  it("liest die gespeicherte Liste", () => {
    expect(parseSearches('["kat=musik","format=kurs&kosten=kostenlos"]')).toEqual([
      "kat=musik",
      "format=kurs&kosten=kostenlos",
    ]);
  });

  it("normalisiert jeden Eintrag und verwirft Unbekanntes", () => {
    expect(parseSearches('["kat=natur,musik&wegzeit=20","kat=unbekannt&foo=1","wegzeit=25&kat=musik"]')).toEqual([
      "kat=musik,natur&wegzeit=20",
      "kat=musik",
    ]);
  });

  it("entfernt Leere und Dubletten (auch solche, die erst normalisiert gleich sind)", () => {
    expect(parseSearches('["", "foo=1", "kat=musik", "kat=musik&x=1"]')).toEqual(["kat=musik"]);
  });

  it("kappt auf fünf", () => {
    const seven = ["musik", "natur", "wasser", "buehne", "museum", "kreativ", "buecher"].map((k) => `kat=${k}`);
    expect(parseSearches(JSON.stringify(seven))).toEqual(seven.slice(0, 5));
  });

  it("liefert bei Müll eine leere Liste", () => {
    for (const raw of [null, "", "kein json", "{}", '"kat=musik"', "42", "null", "[1,2,null,{}]"]) {
      expect(parseSearches(raw)).toEqual([]);
    }
  });
});
