import { describe, expect, it } from "vitest";
import { guardTileRequest, styleUrl } from "./tiles.ts";

describe("styleUrl", () => {
  it("nimmt hell „positron“ und dunkel „dark“ von OpenFreeMap", () => {
    expect(styleUrl(false)).toBe("https://tiles.openfreemap.org/styles/positron");
    expect(styleUrl(true)).toBe("https://tiles.openfreemap.org/styles/dark");
  });

  it("liefert URLs, die der eigene Wächter durchlässt", () => {
    for (const dark of [false, true]) expect(guardTileRequest(styleUrl(dark))).toEqual({ url: styleUrl(dark) });
  });
});

describe("guardTileRequest", () => {
  it.each([
    ["Stil hell", "https://tiles.openfreemap.org/styles/positron"],
    ["Stil dunkel", "https://tiles.openfreemap.org/styles/dark"],
    ["TileJSON", "https://tiles.openfreemap.org/planet"],
    ["Vektorkachel", "https://tiles.openfreemap.org/planet/20261001_001001_pt/14/8712/5618.pbf"],
    ["Glyphen mit %20", "https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf"],
    ["Sprite JSON", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.json"],
    ["Sprite PNG", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm.png"],
    ["Sprite @2x JSON", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.json"],
    ["Sprite @2x PNG", "https://tiles.openfreemap.org/sprites/ofm_f384/ofm@2x.png"],
  ])("lässt %s unverändert durch", (_name, url) => {
    expect(guardTileRequest(url)).toEqual({ url });
  });

  it.each([
    ["blob:", "blob:https://zwergenplan.app/6f1c7a52-2b1e-4c55-9a43-0d2f4f0c1e9a"],
    ["data:", "data:image/png;base64,iVBORw0KGgo="],
  ])("reicht %s unverändert durch", (_name, url) => {
    expect(guardTileRequest(url)).toEqual({ url });
  });

  it.each([
    ["fremder Host", "https://tile.openstreetmap.org/14/8712/5618.png"],
    ["Hauptdomain statt tiles.", "https://openfreemap.org/styles/positron"],
    ["Host als Präfix", "https://tiles.openfreemap.org.example.com/styles/positron"],
    ["Host im Pfad", "https://example.com/tiles.openfreemap.org/styles/positron"],
    ["http:", "http://tiles.openfreemap.org/styles/positron"],
    ["anderer Port", "https://tiles.openfreemap.org:8443/styles/positron"],
    ["Zugangsdaten", "https://nutzer@tiles.openfreemap.org/styles/positron"],
    ["Querystring", "https://tiles.openfreemap.org/styles/positron?lat=49.452&lon=11.077"],
    ["leerer Querystring", "https://tiles.openfreemap.org/styles/positron?"],
    ["Fragment", "https://tiles.openfreemap.org/styles/positron#49.452,11.077"],
    ["leeres Fragment", "https://tiles.openfreemap.org/styles/positron#"],
    ["relative URL", "/styles/positron"],
    ["protokoll-relative URL", "//tiles.openfreemap.org/styles/positron"],
    ["keine URL", "kein Link"],
    ["javascript:", "javascript:alert(1)"],
  ])("wirft bei %s", (_name, url) => {
    expect(() => guardTileRequest(url)).toThrow(new Error("Karten-Request an fremde Adresse blockiert"));
  });
});
