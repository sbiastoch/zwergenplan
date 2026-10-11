# Paket prüfen: Termine eines Anbieter-Pakets erfassen

Du bekommst den Horizont `from`–`to`, ein Paket `runs/<from>/batch-<n>.json` (Katalogeinträge, Format: `schema/providers.schema.json`) und den Ausgabepfad `runs/<from>/raw/batch-<n>.json`. Dein Ergebnis ist diese eine JSON-Datei im Format `schema/raw-batch.schema.json`.

Die Fachregeln (wer dazugehört, Felder eines Events, `schedule`, Verfügbarkeit, Lesarten der Buchungssysteme) stehen in `scripts/pipeline/prompt/extract.md`, dem Prompt der automatischen Extraktion (Plan 0032, E4). Lies ihn zuerst und befolge ihn. Er ist die einzige Quelle dieser Regeln; diese Datei ergänzt nur, was für ein Paket mit Subagenten anders ist.

**Fertig** bist du, wenn drei Dinge gelten:
- Jeder Anbieter des Pakets steht in `providers`.
- Jedes Angebot für 0–3 Jahre im Horizont steht in `events`.
- `pnpm pipeline validate-raw runs/<from>/raw/batch-<n>.json` endet ohne Fehler. Meldet es Fehler, korrigierst du die Datei und prüfst erneut.

## Vorgehen je Anbieter

1. **Alle** `programme`-URLs mit `use: termine` oder `verfuegbarkeit` abrufen: `pnpm pipeline fetch-page URL --links` (setzt `{von}`/`{bis}` selbst ein). Seiten mit `use: info` brauchst du nur bei Drift-Verdacht.
   - `render: browser` oder `HINWEIS: … JS-gerendert`: Die Seite ist JS-gerendert; öffne sie mit WebFetch oder im Browser (claude-in-chrome).
   - `request`: POST-Abfrage; mit `curl -X POST` und den Headern und dem Body aus dem Eintrag abrufen.
   - Bei `kind: pdf` lädst du die PDF herunter und liest sie mit `pdftotext datei.pdf -` (ohne `-layout`).
2. Den Text nach Angeboten durchsuchen. Über Paginierung, Monatsansichten und Kategorie-Filter (Eltern-Kind, Familie, Baby, Krabbel …) kommst du an alle Termine; folge diesen Links mit `--links`.
3. Je Treffer die **Detail- oder Buchungsseite** öffnen und die Verfügbarkeit ablesen. Nennt `availability.system` ein Buchungssystem oder bleibt die Seite leer, liest du zuerst `references/booking-systems.md`.

Ist ein Anbieter nicht prüfbar (Fehler, Login, Seite leer, nur Telefon), trägst du `status: fehler` mit konkretem `reason` ein und machst mit dem nächsten weiter. Mehr als 3 Abrufversuche pro URL lohnen sich nicht.

## Ausgabedatei

Anders als im Prompt trägt jedes Event hier `providerId` (die Katalog-ID), und `sourceUrl` darf jede abgerufene Seite sein, auch eine über `--links` gefundene. Der Horizont ist `from`–`to` aus dem Lauf, nicht die zwölf Monate des Prompts.

```json
{
  "providers": {
    "zoff-harmonie": { "status": "ok", "checked": ["https://…", "https://…"] },
    "brk-familienzentrum": { "status": "keine-termine", "checked": ["https://…"], "note": "nur Kurse ab Januar" },
    "xyz": { "status": "fehler", "reason": "Kursportal verlangt Login", "checked": ["https://…"] },
    "abc": { "status": "ok", "checked": ["https://…"], "drift": "Programm-PDF umgezogen nach https://…" }
  },
  "events": [ … ]
}
```

`drift` meldet alles, was der Katalog nachziehen muss: tote oder umgezogene URLs, ein neues Buchungssystem, eine Schließung, einen **neuen Ort** (Name + Adresse), einen Widerspruch zwischen Website und PDF-Heft.

Zum Schluss meldest du in 2–4 Zeilen auffällige Drift. Die gleichen Angaben stehen auch in `drift` der Datei.
