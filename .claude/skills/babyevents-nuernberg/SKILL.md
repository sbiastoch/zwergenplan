---
name: babyevents-nuernberg
description: Babykurse, Krabbelgruppen, Elterntreffs, Babykonzerte, Theater und Museumsangebote für 0–3 Jahre in Nürnberg für einen Zeitraum finden – mit freien Plätzen, Wegzeit (zu Fuß/ÖPNV) ab einer Adresse und ICS je Termin. Nutzen bei Fragen wie „was können wir nächste Woche mit dem Baby machen“ oder „Babyangebote im November“.
---

# Babyangebote Nürnberg

Prüft **alle** passenden Quellen aus dem Katalog `data/providers.yaml` (Repo-Root) auf Termine im Zeitraum. Das Ergebnis ist ein Bericht mit Plätzen, Wegzeit und Kalenderdateien. `SKILL_DIR` ist das Verzeichnis dieser Datei. Alle Skripte brauchen Netzzugriff.

## 1. Auftrag klären

Folgende Angaben werden gebraucht:
- **Zeitraum** `FROM`–`TO` (ISO-Daten)
- **Startadresse**
- optional: **Alter des Kindes** in Monaten
- optional: **Filter** (Themen-Tags, `kostenlos`, `ohne-anmeldung`, Lage zum Ring)
- optional: **maximale Wegzeit**

Zeitraum oder Adresse fehlen: einmal nachfragen. Eine in der Memory hinterlegte Heimadresse gilt als Standard. Die vorhandenen Tags zeigt `python3 SKILL_DIR/scripts/select_providers.py --list-tags`.

Lege `RUN_DIR=./runs/<FROM>_<TO>` an. Dort entsteht `meta.json`:

```json
{"from": "2026-10-05", "to": "2026-10-18", "address": "…", "age_months": 7,
 "filters": "Klartext für den Bericht", "require_tags": ["kostenlos"], "max_minutes": 30}
```

`require_tags` und `max_minutes` wirken auf die **Termine** (in Schritt 5), nicht auf die Anbieter. Grund: Anbieter mit `teils-kostenlos` haben oft genau die gesuchten Termine.

## 2. Quellen auswählen

```
python3 SKILL_DIR/scripts/select_providers.py [--topics …] [--ring …] [--age-months N] --batch 6 --out RUN_DIR
```

Anbieter werden nur nach Thema, Ring und Alter ausgeschlossen. Die Ausgabe hat drei Teile:
- `scripts`: Sammelkalender mit eigenem Abfrageskript (Schritt 3a)
- `batch_files`: `RUN_DIR/batch-<n>.yaml`, ein Paket je Subagent (Schritt 3b)
- `covered`: Anbieter, deren Termine vollständig über einen Sammelkalender kommen; kein eigener Abruf

## 3. Termine erfassen – 3a und 3b parallel

**3b zuerst starten:** Je Paket startest du einen Subagenten im Hintergrund, alle in **einer** Nachricht. Jeder bekommt:
- den Pfad zu `SKILL_DIR/references/extraction.md` mit der Anweisung, ihn zuerst zu lesen und genau zu befolgen
- `FROM`, `TO`, das Alter
- `SKILL_DIR`
- den Pfad zum Paket `RUN_DIR/batch-<n>.yaml`
- den Ausgabepfad `RUN_DIR/raw/batch-<n>.json`

**3a, währenddessen selbst:**

```
python3 SKILL_DIR/scripts/candidates.py fetch RUN_DIR
python3 SKILL_DIR/scripts/candidates.py list RUN_DIR
```

Sichte die Liste. Behalten wird jeder Kandidat, an dem Eltern **mit** Kind von 0–3 (bzw. im Alter des Kindes) teilnehmen. Dazu gehören Krabbel- und Eltern-Kind-Gruppen, Miniclubs, Babymassage, PEKiP, Musikzwerge, Babykonzert, Bücherzwerge, Eltern-Kind-Turnen, Krabbelgottesdienste sowie Fitness oder Yoga mit Baby. Raus fallen Basare, Kurse ohne Kind, reine Vorträge und Angebote erst ab 3+. Dann:

```
python3 SKILL_DIR/scripts/candidates.py keep RUN_DIR <cid,cid,…>
```

Fertig ist Schritt 3, wenn `RUN_DIR/raw/` zwei Arten von Dateien enthält: `aggregatoren.json` und eine `batch-<n>.json` je Paket. Jeder Anbieter aus den Paketen muss darin einen `status` haben. Fehlt ein Anbieter, wird er gezielt nachgeprüft (eigener Subagent, nur dieser Anbieter).

## 4. Anreichern

```
python3 SKILL_DIR/scripts/enrich.py RUN_DIR
```

Das Skript erledigt der Reihe nach:
1. Es führt alle `raw/*.json` zusammen und entfernt Dubletten über Anbieter und Sammelkalender hinweg.
2. Bei wöchentlichen offenen Treffs nimmt es die bayerischen Ferien und Feiertage aus.
3. Je Ort berechnet es die Wegzeit: zu Fuß über OSRM, mit den Öffis über VGN-EFA mit Ankunft zum Terminbeginn.
4. Es schreibt `RUN_DIR/ics/*.ics` und `alle.ics`.

Meldet es `route_errors`, wird die Adresse im Event korrigiert („Straße Nr, PLZ Nürnberg“ oder „lat,lon“) und das Skript erneut gestartet.

## 5. Berichten

```
python3 SKILL_DIR/scripts/report.py RUN_DIR
```

Es wendet `require_tags` und `max_minutes` an und schreibt `bericht.md` und `bericht.html`. Im Chat gibst du eine kurze Übersicht aus:
- die besten Treffer je Tag (frei oder ohne Anmeldung, kurzer Weg; Ring zuerst)
- die Zahl der Termine und Quellen
- **jede** Quelle mit `status: fehler` samt Grund
- Pfade zu `bericht.html` und `ics/alle.ics`

Bei Fernzugriff schickst du `bericht.html` mit SendUserFile. Einzelne ICS-Dateien gibt es auf Wunsch.

## 6. Verzeichnis pflegen

Haben Subagenten **Drift** gemeldet (tote URL, Umzug, Schließung, neues Buchungssystem), korrigierst du den Eintrag in `data/providers.yaml` und setzt `verified` auf heute. Bei einer Schließung wird der Eintrag gelöscht und in `references/excluded.md` vermerkt. Taucht ein Veranstalter in einem Sammelkalender wiederholt auf und fehlt im Verzeichnis, nimmst du ihn nach `references/provider-schema.md` auf. Die Lage zum Ring liefert `python3 SKILL_DIR/scripts/ring.py "<Adresse>"`. Nach jeder Änderung erzeugst du die Übersicht neu: `python3 SKILL_DIR/scripts/providers_md.py ANBIETER.md` (im Projektverzeichnis).
