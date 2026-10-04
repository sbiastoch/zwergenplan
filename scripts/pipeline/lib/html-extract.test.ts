import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractPage, renderFetchReport } from "./html-extract.ts";

const html = (file: string) =>
  readFileSync(new URL(`../../../tests/fixtures/pipeline/html/${file}`, import.meta.url), "utf8");

describe("extractPage", () => {
  it("FBS: Status-Ampeln aus Attributen erscheinen im Text", () => {
    const page = extractPage(
      html("fbs-eltern-kind.html"),
      "https://www.fbs-nuernberg.de/kursprogramm/eltern-kind-kurse/",
    );
    expect(page.text).toContain("[Status: Veranstaltung belegt - Anmeldung auf Warteliste ampel red]");
    expect(page.text).toMatch(/\[Status: [^\]]*ampel yellow\]/);
    expect(page.text).toMatch(/\[Status: [^\]]*ampel blue\]/);
    expect(page.jsRendered).toBe(false);
    expect(page.links.some((l) => l.url.startsWith("https://www.fbs-nuernberg.de/"))).toBe(true);
  });

  it("Ohana: JSON-LD Course → Kursinstanzen mit Verfügbarkeit", () => {
    const page = extractPage(html("ohana-kurs.html"), "https://buchung.schwimmschule-ohana.de/iframe/");
    expect(page.jsonLd.length).toBeGreaterThanOrEqual(10);
    const first = page.jsonLd[0];
    expect(first?.start).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(first?.availability).toMatch(/InStock|LimitedAvailability|SoldOut/);
    expect(first?.name).toBeTruthy();
  });

  it("CVJM-Kalender: Termine sind als Text lesbar", () => {
    const page = extractPage(html("cvjm-kalender.html"), "https://www.cvjm-nuernberg.de/eventcalendar");
    expect(page.jsRendered).toBe(false);
    expect(page.text).toContain("Wuselwelt\nTurnhalle des CVJM");
    expect(page.text).toContain("09:30 – 10:15");
  });

  it("wenig Text bei vielen Skripten → Hinweis auf JS-Rendering", () => {
    const page = extractPage(
      `<body><div id="app">Lädt …</div>${"<script>x()</script>".repeat(6)}</body>`,
      "https://a.example/",
    );
    expect(page.jsRendered).toBe(true);
    expect(page.text).toBe("Lädt …");
  });

  it("findet Feeds, Event-JSON-LD, Links aus data-href/onclick und entfernt Navigation", () => {
    const page = extractPage(
      `<html><head><link rel="alternate" type="application/rss+xml" href="/feed">
      <script type="application/ld+json">{"@graph":[{"@type":["Event"],"name":"Krabbelkonzert","startDate":"2026-11-02T10:00",
        "location":[{"name":"Kulturladen","address":{"streetAddress":"Hauptstr. 1","postalCode":"90402","addressLocality":"Nürnberg"}}],
        "offers":[{"availability":"https://schema.org/InStock","price":"5"}],"url":"https://x.example/k"},
        {"@type":"Course","name":"PEKiP","hasCourseInstance":[{"startDate":"2026-11-03","location":"Raum 2","offers":{"availability":"SoldOut"}}]}]}</script>
      <script type="application/ld+json">kaputt</script></head>
      <body><nav>Menü</nav><h1>Programm</h1><p>Krabbelkonzert am 2.11.</p>
      <a href="termine.ics">Kalender abonnieren</a><span data-href="/kurs/1">Kurs 1</span>
      <button onclick="window.open('https://booking.example/42')">Buchen</button><a href="mailto:x@y.de">Mail</a>
      <i class="status-full" title="ausgebucht"></i><footer>Impressum</footer></body></html>`,
      "https://anbieter.example/programm/",
    );
    expect(page.feeds).toEqual(["https://anbieter.example/feed", "https://anbieter.example/programm/termine.ics"]);
    expect(page.jsonLd).toEqual([
      {
        name: "Krabbelkonzert",
        start: "2026-11-02T10:00",
        location: "Kulturladen",
        address: "Hauptstr. 1 90402 Nürnberg",
        availability: "https://schema.org/InStock",
        price: "5",
        url: "https://x.example/k",
      },
      { name: "PEKiP", start: "2026-11-03", location: "Raum 2", availability: "SoldOut" },
    ]);
    expect(page.text).toBe(
      "Programm\nKrabbelkonzert am 2.11.\nKalender abonnieren\nKurs 1\nBuchen\nMail\n[Status: ausgebucht status-full]",
    );
    expect(page.links).toEqual([
      { label: "Kalender abonnieren", url: "https://anbieter.example/programm/termine.ics" },
      { label: "Kurs 1", url: "https://anbieter.example/kurs/1" },
      { label: "Buchen", url: "https://booking.example/42" },
    ]);
  });
});

describe("renderFetchReport", () => {
  const base = { status: 200, finalUrl: "https://a.example/", contentType: "text/html" };

  it("gliedert in META, JSON-LD, FEEDS, TEXT und optional LINKS und kürzt", () => {
    const out = renderFetchReport(
      { ...base, body: `<p>${"Krabbel ".repeat(20)}</p><a href="/x">X</a>` },
      { maxChars: 50, links: true },
    );
    expect(out).toMatch(/^## META\nstatus=200 final_url=https:\/\/a.example\/ content_type=text\/html\n## TEXT\n/);
    expect(out).toContain("[... gekürzt,");
    expect(out).toContain("## LINKS\nX -> https://a.example/x");
  });

  it("verweist PDFs auf pdftotext und wertet iCal-Feeds aus", () => {
    expect(
      renderFetchReport({ ...base, contentType: "application/pdf", body: "" }, { maxChars: 100, links: false }),
    ).toContain("pdftotext");
    const ics = renderFetchReport(
      {
        ...base,
        contentType: "text/plain",
        body: "BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:Miniclub\nEND:VEVENT\nEND:VCALENDAR",
      },
      { maxChars: 1000, links: false },
    );
    expect(ics).toContain("## ICAL");
    expect(ics).toContain('"SUMMARY": "Miniclub"');
  });
});
