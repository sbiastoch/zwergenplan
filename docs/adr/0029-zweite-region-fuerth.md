# ADR 0029 – Zweite Region Fürth: Überlappung, Zuordnung, Startgebiet der Wegzeit

Status: angenommen (2026-10-12), mit Plan 0036. **Ändert** ADR 0011, Punkt 2 und 9 (Startgebiet der Wegzeit) und **ergänzt** ADR 0025, Punkt 1 und dessen Nachtrag (Region-Felder, Stadtwahl).

## Kontext

- Der Nutzer will Fürth als eigene Region (2026-10-12): eigene Kachel im Onboarding, eigenes Entdecken, eigene bbox; gleicher VGN-Fahrplan, Bayern-Ferien; Angebote beider Städte bleiben für alle sichtbar.
- Fürth liegt ganz in `NUERNBERG_BBOX` (Großraum). Standort, Kartenmitte, gespeicherter Punkt und Fahrplanauszug prüfen gegen diese bbox.
- Die Wegzeit-Tabelle hatte Zeilen nur für Haltbereiche im Stadtgebiet Nürnberg (DHID `de:09564:`). Ein Startpunkt in Fürth hätte nur die Luftlinie bekommen, obwohl der Fahrplan Fürth enthält (191 Haltbereiche `de:09563:`).

## Entscheidung

1. **Regionen dürfen überlappen.** Jede Region-bbox liegt in `NUERNBERG_BBOX` (Test in `src/domain/regions.test.ts`); `NUERNBERG_BBOX` und `inBounds` bleiben. Fürth: Stadt plus direkt angrenzende Orte.
2. **Zuordnung:** Ein neuer Anbieter gehört zur Region des Laufs, der ihn aufnimmt. Das Entdecken läuft in der Reihenfolge von `REGION_IDS`; liegt eine bbox in einer anderen, steht sie davor (Fürth vor Nürnberg). `region` erreicht die Website nicht.
3. **`Region.kreis`** (Kreisschlüssel) ist das DHID-Präfix der Haltbereiche, die Zeilen der Wegzeit-Tabelle werden. **Startgebiet der Wegzeit sind die Stadtgebiete aller Regionen** statt „das Stadtgebiet Nürnberg“ (ADR 0011, Punkt 2 und 9). Die 800-m-Regel und „außerhalb des Stadtgebiets“ bleiben.
4. **`abgelehnt` gilt über alle Regionen** im Vorfilter des Entdeckens; `zurueckgestellt` bleibt je Region.
5. **Die Stadtwahl im Onboarding bleibt ungespeichert.** Sie ordnet nur die Stadtteile im Schritt „Weg“ (gewählte Stadt zuerst). Liste und Karte zeigen alle Angebote, den Ort trägt der Startpunkt (ADR 0017).
6. Stadtteile stehen je Region in `src/domain/districts.ts`; Namen sind über alle Regionen eindeutig, allgemeine tragen „(Fürth)“. Ein Stadtteil ohne Zugangshalt fällt aus der Liste.

## Alternativen

- **Nürnberger bbox auf die Stadt verkleinern:** bräche Bestandseinträge im Umland und die Prüfungen mit der Standard-bbox.
- **Fürth mit der Großraum-bbox:** `region` verlöre jede räumliche Bedeutung.
- **Region nach Sitz neu bestimmen** (kleinste bbox mit allen Orten): mehr Code ohne sichtbare Folge.
- **Fürth ohne Wegzeit:** gesperrte Minuten-Chips für Fürther, Ziel verfehlt.
- **Stadtwahl speichern:** nichts außerhalb des Onboardings würde sie lesen.

## Konsequenzen

- Die Wegzeit-Tabelle wächst von 556 auf 747 Zeilen (51,8 kB gzip von 64 kB).
- Das Entdecken braucht je Woche etwa doppelt so viel Zeit und Geld; reißt das Zeitbudget, fehlt der zweite Teil (Nürnberg) bis zur nächsten Woche.
- Ein Fürther Anbieter mit einem Ort außerhalb der Fürther bbox verliert diesen beim Aufnehmen. Die Abhilfe hier ist überholt, siehe Nachtrag 2026-10-30: `region` kommt nur auf die Region, deren Gebiet alle Orte enthält. Bisher hieß es: Katalogpflege, `region` auf `nuernberg`, Ort ergänzen und den `hint` „… weglassen (außerhalb der Region)“ an den Terminseiten entfernen bzw. anpassen.
- Eine weitere Region braucht: Eintrag in `regions.ts` (mit `kreis`, Reihenfolge), Stadtteile, Prüfung des Zugangshalt-Gates; außerhalb Bayerns oder des VGN zusätzlich Ferienland und Fahrplan (`docs/ideas.md`).

## Nachtrag (2026-10-30, Plan 0050, S2c): Gebiet nach Gemeinde

Punkt 1 lautete „Fürth: Stadt plus direkt angrenzende Orte“. Für das Entdecken gilt jetzt mehr als die bbox, nämlich das Gebiet je Region (`territory` in `src/domain/regions.ts`, Nutzerentscheid 2026-10-29):

- Nürnberg ist die Stadt Nürnberg.
- Fürth ist die Stadt Fürth plus der Landkreis Fürth.
- Erlangen gehört zu keiner Region.

Ein Ort muss in der bbox **und** im Gebiet liegen. Gebiet heißt: Gemeinde oder Kreis aus Nominatim `addressdetails` passen.

Anlass war die vhs Erlangen. Sie lag in der bbox von Nürnberg und wurde in einem Eval-Lauf für Nürnberg aufgenommen.

Die bboxen bleiben, wie sie sind. Der Westen des Landkreises Fürth (Langenzenn, Wilhermsdorf, Roßtal) liegt außerhalb von `FUERTH_BBOX` und fällt weiter weg. Eine größere bbox wäre eine neue Änderung an diesem Punkt.

Das Schema prüft weiter nur die bbox.
