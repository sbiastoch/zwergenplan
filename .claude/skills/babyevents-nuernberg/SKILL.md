---
name: babyevents-nuernberg
description: Datenstand des Zwergenplans aktualisieren – alle Anbieter aus data/providers.yaml für die nächsten 4 Monate prüfen, data/offers.json bauen und auf main veröffentlichen. Nutzen bei „Daten aktualisieren“, „Pipeline-Lauf“, „neue Termine holen“ und bei Pflege des Anbieterkatalogs. Fragen wie „was machen wir nächste Woche mit dem Baby“ beantwortet die Website (https://zwergenplan.app/) bzw. data/offers.json.
---

# Zwergenplan-Datenstand aktualisieren

Ein **Lauf** prüft den ganzen Katalog `data/providers.yaml` für den Horizont von 4 Monaten und endet mit einem Commit auf `main` (ADR 0002). Alle Befehle sind `pnpm pipeline …` (Übersicht: Kopf von `scripts/pipeline/cli.ts`). Der Lauf ist **fertig**, wenn CI auf `main` grün ist und die Live-Seite den neuen Commit zeigt.

Der Datenvertrag ist `src/domain/schema.ts`. Für Agenten ist er exportiert nach `schema/providers.schema.json` (Katalog), `schema/raw-batch.schema.json` (Ergebnis der Subagenten) und `schema/offers.schema.json`. Rohdaten werden korrigiert, das Schema bleibt, wie es ist.

## 0. Fahrplan prüfen

```
pnpm pipeline oepnv
```

Der Befehl fragt beim VGN mit bedingtem `GET` nach einem neuen GTFS-Feed (Cache unter `~/.cache/zwergenplan/gtfs/`, Plan 0009). Ist der Feed unverändert, meldet er „Fahrplan aktuell“ und ändert nichts. Ist er neu, schreibt er `data/oepnv/fahrplan.json` mit neuem Stichtag (Referenz-Dienstag, Schultag). `publish` committet den Auszug dann mit dem Datenstand. Warnt `pnpm data:validate`, dass der Auszug abgelaufen ist oder ein Fahrplanwechsel ansteht, und der VGN hat noch keinen neuen Feed, bleibt der alte Auszug gültig; das gehört in den Abschlussbericht.

Fertig, wenn der Befehl „Fahrplan aktuell“ oder „data/oepnv/fahrplan.json geschrieben“ meldet. Bricht er ab (Netz, geänderte Spalten im Feed), bleibt der alte Auszug stehen: Grund in den Abschlussbericht, der Lauf geht weiter.

## 1. Lauf anlegen

```
pnpm pipeline init                 # → runs/<heute>/ mit meta.json (from, to)
pnpm pipeline select runs/<from>   # → batch-<n>.json je Paket, selection.json
```

Fertig, wenn `selection.json` die Pakete, die Sammelkalender mit Adapter und die übersprungenen Einträge listet.

## 2. Termine erfassen – Subagenten und Sammelkalender parallel

**Subagenten zuerst**: Starte je Paket einen Subagenten im Hintergrund, alle in **einer** Nachricht. Jeder bekommt:
- den Pfad `.claude/skills/babyevents-nuernberg/references/extraction.md` mit dem Auftrag, ihn zuerst zu lesen und genau zu befolgen
- den Horizont `from`–`to` aus `meta.json`
- das Paket `runs/<from>/batch-<n>.json` und den Ausgabepfad `runs/<from>/raw/batch-<n>.json`

**Sammelkalender währenddessen selbst**:

```
pnpm pipeline candidates fetch runs/<from>
pnpm pipeline candidates list runs/<from>
```

`list` zeigt je Kandidat den Vorschlag `→ anbieter/ort` oder `?`. Behalten wird jeder Kandidat, an dem Eltern **mit** Kind von 0–3 Jahren teilnehmen: Krabbel- und Eltern-Kind-Gruppen, Miniclubs, Babymassage, PEKiP, Musikzwerge, Babykonzerte, Bücherzwerge, Eltern-Kind-Turnen, Krabbelgottesdienste, Fitness oder Yoga mit Baby. Kurse für Eltern ohne Kind, Basare, reine Vorträge und Angebote ab 3+ fallen weg.
- Fehlt der Veranstalter im Katalog: `candidates add-provider runs/<from> <cid> --id <kebab-id>`, danach den neuen Eintrag in `data/providers.yaml` kurz prüfen.
- Ein falscher oder offener Vorschlag wird überschrieben mit `<cid>=<anbieter>/<ort>`.

```
pnpm pipeline candidates keep runs/<from> <cid>,<cid>=<anbieter>/<ort>,…
```

`keep` schreibt den Entwurf `raw/aggregatoren.json` und nennt je Event die offenen Felder. Fülle sie direkt in der Datei: `summary` in eigenen Worten (1–2 Sätze, was passiert), dazu `topics`, `cost` und `registration`, falls offen. Der Katalog liefert keine Rückfallwerte (ADR 0024). Prüfe dabei das abgeleitete `format`: Ein `einmalig` bei einer Reihe ergibt Einzeltermine mit anderer ID. Dann `pnpm pipeline validate-raw runs/<from>/raw/aggregatoren.json`.

Fertig ist Schritt 2, wenn es für jedes `batch-<n>.json` ein `raw/batch-<n>.json` gibt und `validate-raw` für jede Rohdatei grün ist. Hat ein Subagent einen Anbieter ausgelassen, prüft ein neuer Subagent nur diesen: `pnpm pipeline select runs/<from> --only <id>` erzeugt ein zusätzliches Paket mit der nächsten freien Nummer, vorhandene Pakete bleiben unberührt.

## 3. Bauen

```
pnpm pipeline build runs/<from>
```

`build` schreibt `data/offers.json` und `runs/<from>/report.json`. Auf stdout stehen Zahlen, jede Quelle mit `fehler` und jede Drift-Meldung. Bricht es ab, nennt die Meldung Datei, Event und Feld. Korrigiere die Rohdatei und baue erneut. Fertig, wenn `build` „data/offers.json geschrieben“ meldet.

## 4. Katalog pflegen

Jede Drift-Meldung aus dem Bericht wird in `data/providers.yaml` umgesetzt (tote URL, Umzug, neues Buchungssystem, Schließung), danach `verified` auf heute. Die Regeln stehen in `references/catalog.md`. Fertig, wenn jede Drift-Meldung umgesetzt oder begründet verworfen ist und `pnpm data:validate` grün ist.

## 5. Veröffentlichen

```
pnpm pipeline publish runs/<from>
gh run watch <id> -i 120 --exit-status
```

Die Lauf-ID nennt `gh run list --branch main --limit 1`. Ein Intervall unter 2 Minuten reißt mit parallelen Sessions das API-Limit (Plan 0027, E13). Läuft der Skill als Subagent, beobachtet er die CI nicht: Er meldet SHA und Lauf-ID, und die Haupt-Session beobachtet.

`publish` bricht ab, wenn es Änderungen außerhalb von `data/` gibt. Code-Änderungen gehören in einen eigenen Commit. Danach prüft `publish` gegen den deployten Stand, committet `data/` auf `main` und pusht. Ist CI rot, bleibt die alte Version live: Ursache reparieren, neu bauen, neu veröffentlichen.

Fertig, wenn der CI-Lauf grün ist und `curl -s https://zwergenplan.app/data/meta.json` in `commit` den neuen Kurz-SHA zeigt. Als Subagent: fertig, wenn SHA und Lauf-ID gemeldet sind.

## Abschlussbericht im Chat

- Fahrplan: „aktuell“ oder neuer Stand mit Stichtag, ggf. Warnung zum Fahrplanwechsel
- Angebote und Termine, verglichen mit dem vorigen Stand
- **jede** Quelle mit `fehler` samt Grund und **jede** aus dem Altbestand übernommene Quelle
- umgesetzte Katalogänderungen
- Link zur Live-Seite
