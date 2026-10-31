import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { programmeText } from "./fetch.ts";
import { INPUT_EPOCH, normalizeText } from "./normalize.ts";

/**
 * Pin-Test der Eingabe-Epoche (Plan 0049, Nachtrag 2, B1): Ändert sich der Code, der den Eingabetext erzeugt, ändert
 * sich jeder Cache-Schlüssel, und die Neuextraktion liefe am ID-Gate vorbei, wenn die Fassung (`partsHash`) gleich
 * bliebe. Rot heißt: `INPUT_EPOCH` in `lib/normalize.ts` erhöhen und unten Epoche und Hash neu eintragen.
 */
const PAGES: ReadonlyArray<{ kind: "html" | "ical"; url: string; body: string }> = [
  {
    kind: "html",
    url: "https://fz.example.org/kurse/",
    body: `<html><head><script type="application/ld+json">{"@type":"Event","name":"Krabbelgruppe","startDate":"2026-11-03T09:30"}</script></head>
<body><header>Kopf</header><nav>Menü</nav><main><h1>Kurse</h1><p>Babymassage   dienstags 9:30&nbsp;Uhr</p>
<ul><li>PEKiP, Do 10:00</li><li>Krabbelgruppe Mo 15:30 – <b>ausgebucht</b></li></ul><a href="/anmeldung">Anmeldung</a></main><footer>Tellerringstr. 56</footer></body></html>`,
  },
  {
    kind: "ical",
    url: "https://fz.example.org/kurse.ics",
    body: [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:1",
      "SUMMARY:Eltern-Kind-Turnen",
      "DTSTART;TZID=Europe/Berlin:20261104T100000",
      "DTEND;TZID=Europe/Berlin:20261104T110000",
      "LOCATION:Turnhalle",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"),
  },
];

const PINNED = { epoch: 1, hash: "84af6424a08059a2" };

describe("INPUT_EPOCH (Pin)", () => {
  it("der Eingabetext eingefrorener Seiten ist unverändert, sonst Epoche erhöhen", () => {
    const text = PAGES.map((p) => normalizeText(programmeText(p.kind, p.body, p.url))).join("\n---\n");
    const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
    expect({ epoch: INPUT_EPOCH, hash }).toEqual(PINNED);
  });
});
