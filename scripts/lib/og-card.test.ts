import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_SHAPES } from "../../src/domain/category-look.ts";
import { fixtureSiteOffers } from "../../src/domain/test-fixtures.ts";
import { OG_CANARY, offerCardHtml, ogDocument } from "./og-card.ts";
import { offerPreview } from "./share-pages.ts";

const GENERATED_AT = "2026-10-05T06:00:00+02:00";
const offers = fixtureSiteOffers();
const preview = (start: string) => {
  const offer = offers.find((o) => o.title.startsWith(start));
  if (!offer) throw new Error(`Fixture ${start} fehlt`);
  return offerPreview(offer, GENERATED_AT);
};
const css = (file: string) => readFileSync(new URL(`../../src/ui/styles/${file}`, import.meta.url), "utf8");

describe("Kachel im Vorschaubild (Plan 0026, Nachtrag A, E16)", () => {
  it("zeigt Pille, wann, Titel, Meta und Fakten wie die Kachel der Übersicht", () => {
    const html = offerCardHtml(preview("PEKiP-Gruppe Herbst"));
    expect(html).toContain('<article class="card k-babykurse">');
    expect(html).toContain(`<path class="shape-ink" d="${CATEGORY_SHAPES.babykurse}"/>`);
    expect(html).toContain(">Babykurse</span>");
    expect(html).toContain('<span class="when">Kurs ab Di 13. Okt., 8 Termine</span>');
    expect(html).toContain('<h3 class="ctitle">PEKiP-Gruppe Herbst (Babys geb. Juni–Aug. 2026)</h3>');
    expect(html).toContain('<p class="meta">Familientreff Beispielhof (fiktiv), Altstadt</p>');
    const facts = [...html.matchAll(/<span class="(fact[^"]*)">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
    expect(facts).toEqual([
      ["fact", "1–5 Monate"],
      ["fact", "120 € (8 Termine)"],
      ["fact reg", "Anmeldung nötig"],
      ["fact avail-wenige", "Wenige Plätze"],
    ]);
  });

  it("ohne Anmeldung kein Rahmen, ohne aussagekräftigen Status kein Plätze-Fakt", () => {
    const html = offerCardHtml(preview("Offener Krabbeltreff"));
    expect(html).not.toContain("fact reg");
    expect(html).not.toContain("avail-");
    expect(html).toContain('<span class="fact">6–24 Monate</span>');
  });

  it("escapet alle Texte, kein Skript", () => {
    const evil = { ...preview("Offener Krabbeltreff"), title: `Tom & Jerry's "<script>"` };
    const html = offerCardHtml(evil);
    expect(html).toContain("Tom &amp; Jerry&#39;s &quot;&lt;script&gt;&quot;");
    expect(html).not.toContain("<script");
  });

  it("jede genutzte Klasse steht als Selektor in den Styles der App (Review A, M2)", () => {
    const html = [OG_CANARY, preview("PEKiP-Gruppe Herbst"), preview("Babymassage"), preview("„Kuckuck")]
      .map(offerCardHtml)
      .join("");
    const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => (m[1] ?? "").split(" ")));
    const styles = `${css("card.css")}${css("base.css")}${css("tokens.css")}`;
    for (const cls of classes) expect(styles, cls).toMatch(new RegExp(`\\.${cls}\\b`));
  });

  it("Seite: deutsch, hell, Start-CSS der App und die Marke", () => {
    const doc = ogDocument(["/assets/index-abc.css"]);
    expect(doc).toContain('<html lang="de">');
    expect(doc).toContain('<link rel="stylesheet" href="/assets/index-abc.css">');
    expect(doc).toContain("zwergenplan.app");
    expect(doc).not.toContain("<script");
  });

  it("Kanarienvogel ist der schlimmste Fall: langer Titel, lange Kosten, alle Fakten", () => {
    expect(OG_CANARY.title.length).toBeGreaterThanOrEqual(150);
    expect(OG_CANARY.facts).toHaveLength(4);
    expect(OG_CANARY.facts[1]?.text.length).toBe(40);
  });
});
