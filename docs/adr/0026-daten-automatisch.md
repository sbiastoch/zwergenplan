# ADR 0026 – Daten automatisch: Nachtlauf und Entdecken in GitHub Actions über `claude -p`

Status: angenommen (2026-10-11), mit Plan 0032, Stufe 5; Nachtlauf live seit 7bd84f2. Ersetzt ADR 0016. Weicht ab von ADR 0002, 0003, 0004 und 0006, ändert den Vergabeweg der IDs aus ADR 0022 und weicht ab von `docs/architecture.md` („Ein Datenvertrag“, Schichten); ADR 0011 Nr. 4 bleibt unverändert (Abschnitt „Abweichungen“). Baut auf ADR 0022 (stabile IDs) und ADR 0025 (ausführbarer, regionsfähiger Katalog) auf. Details, Messungen und Begründungen in Plan 0032. **Ergänzt durch Plan 0042:** Folgeseiten mit `follow` (Nachtrag unten).

**Geändert durch ADR 0032 (Plan 0039):** Der Fahrplanauszug liegt je Netz unter `data/oepnv/<netz>.json` (`vgn.json`, vormals `data/oepnv/fahrplan.json`, und `vrr.json`) und entsteht weiter nur über `pnpm pipeline oepnv [--netz vgn|vrr]`, von Hand über den Skill, nicht im Nachtlauf.

## Kontext

- Bisher aktualisiert ein interaktiver Lauf in Claude Code die Daten, lokal mit dem Abo des Nutzers (ADR 0002, ADR 0006). Subagenten lesen jedes Mal alle Seiten, es gibt keinen Zeitplan, und neue Anbieter findet nur, wer sucht.
- ADR 0016 (Entwurf, Plan 0015) plante einen Nachtlauf mit eigenem OpenAI-kompatiblem Client, Eval-Gate über einen Extraktor-Hash, Schattenbetrieb und dreistufigen Exit-Codes. Er wurde nie umgesetzt.
- Der Nutzer will am 2026-10-10 regelmäßige, automatische Aktualisierung, weitere Regionen, keine Beschädigung bestehender Daten, wechselbare und messbare Modelle und vor allem Einfachheit (Plan 0032, Anlass). Entdecken neuer Anbieter ist für ihn „der wichtigste Schritt für die Nutzer“ (N-C).
- Gemessen (Plan 0032, Stufe 1 und 2): Der Abruf aller Seiten dauert 52–75 s und ist zu 99 % fehlerfrei; Haiku extrahiert einen kleinen bis mittleren Anbieter für $0,003–0,017 (Schätzung der CLI); große Eingaben müssen in Teile zerlegt werden, weil die Ausgabe sonst abgeschnitten wird.

## Entscheidung

1. **Zwei Läufe in GitHub Actions.** Der **Nachtlauf** (`nightly.yml`, täglich) liest die bekannten Seiten und baut `data/offers.json`. **Entdecken** (`discover.yml`, wöchentlich je Region aus `REGION_IDS`) sucht neue Anbieter und nimmt einen auf, wenn er mindestens ein gültiges Angebot für 0–3 Jahre liefert (N-D). Beide committen direkt auf `main`, ohne PR (N-C); CI bleibt das einzige Gate vor dem Deploy.
2. **Ein Extraktionsweg.** Seiten holt deterministischer Open-Source-Code nach dem Katalog (ADR 0025, Punkt 7: HTML, Playwright, iCal, JSON, PDF); Links werden nie verfolgt; einzige Ausnahme ist das Bewerten beim Entdecken, das höchstens zwei Kontakt- oder Adressseiten derselben Website aus den Links der Fund-Seite mitliest (Plan 0032, „Stufe 4 – Umsetzung“). Rohdaten erzeugt nur `refreshProvider` (`scripts/pipeline/io/refresh.ts`), aufgerufen von `pipeline nightly` und, für jeden neuen Anbieter, von `pipeline discover`. Je Anbieter gibt es einen Modellaufruf ohne Werkzeuge (große Eingaben in Teilen), nur wenn sich der Eingabe-Hash (Seiten, Kandidaten, Katalogauszug, Prompt, Schema, Modell) geändert hat.
3. **Modellzugang über die `claude`-CLI** (`claude -p`). Sie ist eine **externe Abhängigkeit** außerhalb von `package.json`: im Workflow per `npm i -g` mit fest gepinnter Version installiert, ein Wechsel der Version nur mit Eval-Lauf (`pnpm eval`) und grünem `llm.test.ts`. Einzige Stelle, die ein Modell aufruft, ist `scripts/pipeline/io/llm.ts`: Kindprozess in leerem Arbeitsverzeichnis mit leerem `HOME` und knapper Umgebung, Antwort nach JSON-Schema, Werkzeuge nur per `--tools` (Websuche nur beim Entdecken). Zugang zum Start über das Abo (`CLAUDE_CODE_OAUTH_TOKEN`); später API-Nutzung, bei Anthropic oder einem anderen Anbieter, und dieser Wechsel geschieht allein in `io/llm.ts` (N-H). Modell: Haiku mit Sonnet als Fallback je Anbieter (Nutzerentscheid nach dem Eval, Plan 0032, Stufe 2).
4. **Zustand im Repo.** `data/raw/<providerId>.json` (Schema `ProviderRaw` in `scripts/pipeline/lib/raw.ts`) hält je Anbieter Events, Eingabe-Hash, Modell, Status und Zeitstempel; `data/discover/<region>.json` hält abgelehnte und zurückgestellte Kandidaten; `data/kosten.csv` ist die Kosten-Zeitreihe. Feste Regeln (`lib/refresh.ts`, Plan 0032, E5) entscheiden je Anbieter. **Ein Fehler kostet höchstens Aktualität, nie Bestand:** Seiten- oder Adapterausfall, ungültige oder abgeschnittene Antwort und vorzeitiges Laufende lassen den alten Stand stehen; ein Einbruch der Event-Zahl wird als `pending` zurückgehalten.
5. **Rechte.** Das Modell läuft nie in einem Job mit Schreib-Token. Gepusht wird nur im Job `veroeffentlichen` mit `GITHUB_TOKEN` (`contents: write`, `actions: write`), das Token nur im Push-Schritt, nur Pfade unter `data/`; danach startet `gh workflow run ci.yml --ref main` die CI, weil ein Push mit `GITHUB_TOKEN` sonst keinen Workflow auslöst (ADR 0002, Konsequenzen). Entdecken darf in `data/providers.yaml` nur neue Einträge anlegen (G2); IDs und `publicId` vergibt der Code (ADR 0022).
6. **Kosten sichtbar** je Aufruf (`runs/<datum>/kosten.jsonl`, Artefakt), je Lauf (`$GITHUB_STEP_SUMMARY`, Bericht) und als Zeitreihe; Bremsen für Aufrufe, Tokens und Zeit beenden einen Lauf geordnet und rot.
7. **Evals messen, sie sperren nicht.** `pnpm eval` misst ein Modell auf eingefrorenen Fällen in `evals/cases/` mit demselben Code wie der Nachtlauf; Ergebnisse stehen in `evals/results.md`.

## Abweichungen von bestehenden Festlegungen

- **ADR 0002:** Die Pipeline läuft nicht mehr lokal, sondern in GitHub Actions über das Abo des Nutzers, und das nur für den Start, später über eine API (N-H); gepusht wird aus Actions mit `GITHUB_TOKEN`, allein im Job `veroeffentlichen`, und die CI startet per `workflow_dispatch`.
- **ADR 0003:** Der Datenhorizont von `data/offers.json` beträgt 12 Monate statt 4 (`HORIZON_MONTHS`).
- **ADR 0004:** Das Eval-Gate aus ADR 0016 entfällt; Backpressure leisten Validierung je Anbieter (Schema, URL-Plausibilität, Wiederholung und Fallback), der Build-Probelauf je Anbieter, der Einbruchschutz, die Gates vor dem Push (`data:validate`, `check:fast`) und der Vergleich gegen den deployten Stand, während das Eval eine Messung ohne Gate ist und die CI nur warnt (`::warning::` aus `data:validate`), wenn für den aktuellen Prompt-Hash keine Zeile in `evals/results.md` steht.
- **ADR 0006:** Es gibt keine Subagenten-Pakete mehr; extrahiert wird nur über `pipeline nightly` bzw. `refreshProvider`, und Agenten pflegen den Katalog nur über `discover` (neue Anbieter) und von Hand über den Skill `babyevents-nuernberg`.
- **ADR 0022:** Nur der Vergabeweg ändert sich: Angebots-IDs vergibt der Build in `pipeline nightly`, die `publicId` neuer Anbieter `pipeline discover` oder die Meldung von `data:validate`; die Regel `shortId(id, seed)` bleibt.
- **ADR 0011 Nr. 4:** Bleibt unverändert, anders als ADR 0016 und Plan 0032, E14 vorsahen: `pipeline oepnv` läuft nicht im Nachtlauf, `data/oepnv/fahrplan.json` liegt weiter im Repo und wird bei einem Fahrplanwechsel von Hand über den Skill erneuert (Plan 0032, „Stufe 3 – Umsetzung“).
- **`docs/architecture.md`:** `data/raw` und `data/discover` sind dauerhafter Zustand der Pipeline in `data/`, aber kein Vertrag der Website („Ein Datenvertrag“ bleibt `src/domain/schema.ts`); `scripts/validate-data.ts` darf dafür aus `scripts/pipeline/lib` importieren, und `pipeline publish` läuft aus dem Workflow.

## Alternativen

- **ADR 0016 umsetzen** (eigener OpenAI-kompatibler Client, Eval-Gate, Schattenbetrieb, Exit-Codes 0/1/2): mehr eigener Code für Fälle, die Hash-Cache, Einbruchschutz und Vergleich gegen den Live-Stand schon abdecken.
- **API-Konto mit SDK von Anfang an:** sauberer getrennt vom interaktiven Kontingent, aber ein zweites Konto und eine zweite Abrechnung, bevor feststeht, dass der Nachtlauf trägt. Der spätere Wechsel ist eine Änderung in `io/llm.ts` (N-H).
- **Externer Crawl-Dienst** (z. B. Firecrawl): entfällt nach N-A; Playwright plus Textextraktion leistet dasselbe ohne Dienst.
- **Weiter lokal mit Subagenten:** kein Zeitplan, kein Entdecken ohne Menschen, nicht messbar.
- **Neue Anbieter per PR:** sicherer, aber gegen N-C; ersetzt durch Ertragsbeweis, G1–G4, einen Commit je Anbieter, Issue mit Mail und `abgelehnt`.

## Konsequenzen

- Jede Nacht ein Commit auf `main` (mindestens die Zeile in `data/kosten.csv`); das hält den Cron über die 60-Tage-Regel aktiv.
- Abo-Läufe teilen sich das Nutzungsfenster mit der interaktiven Arbeit; ein Limit beendet den Lauf geordnet, der Bestand bleibt, der Erstbestand darf über 2–3 Nächte entstehen.
- Ein Wechsel von Prompt, Schema oder Modell extrahiert einmal alles neu (N3); IDs, Links und Merklisten bleiben (ADR 0022).
- Neue Abhängigkeiten außerhalb von `package.json`: die gepinnte `claude`-CLI und `pdftotext` (System) im Workflow; Playwright (schon devDependency) nur in `scripts/pipeline/io/browser.ts`.
- Eine CLI-Version, die Ausgabeformat oder Optionen ändert, bricht `llm.test.ts` (Fake-Binary) oder den Eval-Lauf, bevor sie in den Nachtlauf kommt.
- Ein falsch aufgenommener Anbieter wird per `git revert` zurückgenommen und in `abgelehnt` eingetragen.
- Mit der Annahme (Plan 0032, Stufe 5) ist ADR 0016 „ersetzt durch ADR 0026“; ADR 0002, 0003, 0004 und 0006 verweisen in ihrer Statuszeile hierher, `docs/architecture.md`, `CLAUDE.md` (Datenfluss, IDs auch über `pipeline nightly` und `pipeline discover`) und der Skill `babyevents-nuernberg` (Wartungsleitfaden statt Lauf mit Subagenten) sind nachgezogen.

## Nachtrag (2026-10-24): Folgeseiten mit `follow` (Plan 0042, E2)

- **Ergänzung zu Punkt 2** („Links werden nie verfolgt“): Die zweite Ausnahme sind die Folgeseiten derselben Liste, ausdrücklich im Katalog mit `follow: { match, max }` an einer `kind: html`-Programmseite ohne `render`. Der Abruf folgt je Seite dem ersten unbesuchten Link derselben Website, dessen URL (ohne `#…`) auf `match` endet, bis `max` Folgeseiten, und verbindet die Texte zu einer Eingabe (ein Eingabe-Hash). Fehlt eine Folgeseite, scheitert die Programmseite; der Einbruchschutz hält den Bestand.
- **Grund:** Die Kursportale der Düsseldorfer Familienbildungswerke (Kufer) blättern per Cursor (`?knr=<letzter Kurs>&browse=forward`). Feste URLs je Folgeseite veralten mit jedem neuen Kurs, eine Gesamtansicht gibt es nicht (Messung 2026-10-24, Plan 0042, „Umsetzung“).
- **Ende statt Teilstring:** An dieselbe Folge-URL hängt Kufer `&knradd=…` für „in den Warenkorb legen“; ein Teilstring hätte diese Links verfolgt.
- Der Katalog nennt weiter jede Programmseite, an der eine Liste beginnt. Das Bewerten beim Entdecken setzt `follow` nie; das Feld kommt nur von Hand.
