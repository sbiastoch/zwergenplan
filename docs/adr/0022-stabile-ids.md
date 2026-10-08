# ADR 0022 – Stabile IDs: gespeicherte Kurz-ID je Angebot, Zuordnung gegen den Vorstand

Status: Entwurf (2026-10-08), mit Plan 0015, Nachtrag A (Stufe 0, Plan-Review eingearbeitet, Nutzerentscheide N-I1–N-I4 offen). Ersetzt die ID-Regeln von ADR 0003 („Stabile IDs“, UID) und ADR 0006 („ID-Regel“). Ergänzt ADR 0007 (UID-Form der Merklisten-ICS), ADR 0016 (Titel-Anker entfällt) und ADR 0020 (ID-Form in den Pfaden aus Punkt 1, Höchstlängen aus Punkt 2, `404.html` aus Punkt 4, Kurz-IDs aus Punkt 8). Die Nummer ist am 2026-10-08 gegen `origin/main` und die Branches der Pläne 0025 und 0026 geprüft (alle enden bei 0021). Beim Merge erneut prüfen.

## Kontext

- Die Offer-ID ist bisher eine Funktion aus Anbieter, Titel-Slug, Ort und bei Kursen und Einzelterminen dem ersten Termin (ADR 0003, ADR 0006). Am 2026-10-08 tragen 251 von 333 Titeln Wochentag, Uhrzeit, Datum oder Saison. Jede Umformulierung durch die Recherche und jeder verschobene Kursbeginn ergibt eine neue ID. Ab dem Nachtlauf (ADR 0016) extrahiert ein Sprachmodell; dann ändern sich Titel häufiger.
- Eine neue ID bricht seit Plan 0026 geteilte Links (`angebot/<id>/`, öffentlicher Vertrag nach ADR 0020), leert still Merklisten-Einträge, erzeugt Kalender-Duplikate bei erneutem Import (UID mit ID, ADR 0003) und meldet bekannte Angebote in der Wochen-Nachricht als neu.
- Die Pipeline hielt die ID bisher nur für laufende Kurse mit gleichem Titel-Slug fest (Kursfortschreibung, ADR 0006).
- Anbieter-IDs vergibt ein Mensch im Katalog. Sie hängen an keinem Recherchetext.

## Entscheidung

1. **Angebots-ID = 8 Zeichen `[0-9a-z]`, gespeichert** in `data/offers.json`. Die Pipeline vergibt sie und übernimmt sie in jedem Lauf; sie wird nicht mehr aus Feldern berechnet. Einzige Definition des Musters ist `src/domain/ids.ts`.
2. **Neue IDs** sind `shortId(offerKey, seed)`: cyrb53 über den bisherigen Schlüssel `providerId--slug(title)[-Beginn]--venueId` (jetzt `offerKey`, nur noch Zuordnungsschlüssel, nirgends gespeichert), base36 auf 8 Zeichen, kleinster freier `seed`. Belegt ist jede ID im Vorstand und in der Ausgabe. Der Build bleibt rein und deterministisch.
3. **Zuordnung gegen den Vorstand** (`scripts/pipeline/lib/stable-ids.ts`), drei Stufen, jeweils 1:1, verglichen im gemeinsamen Fenster beider Datenstände:
   - gleicher Schlüssel, wenn auf beiden Seiten eindeutig;
   - gleiche Termine: gleicher Anbieter, gleicher Ort (oder der alte Ort steht nicht mehr im Katalog), ≥ 80 % gleiche Beginnzeiten, strikt bester Partner für beide Seiten;
   - ähnlicher Titel mit gleichen Tagen: gleicher Anbieter, Ort und Format, ≥ 50 % gleiche Tage, nur wenn beide füreinander der einzige Kandidat sind.

   Gleichstand oder Mehrdeutigkeit heißt kein Treffer, also eine neue ID. Die Kursfortschreibung (ADR 0006) hängt an dieser Zuordnung und übernimmt nur vergangene Termine. Eine ID wechselt nie den Anbieter; das prüft der Build. Zusammenlegungen (eine verschwundene ID weiterleiten) gibt es nicht.
4. **Alt → neu ist eine Rechenregel, keine Liste:** Die neue ID einer alten langen ID ist `shortId(alteId, 0)`. Genau das vergibt die einmalige Migration, und kehrt ein vor dem Umstieg verschwundenes Angebot mit gleichem Schlüssel zurück, bekommt es dieselbe ID. Die App rechnet damit alte IDs aus der Query und aus der Merkliste um, der Service Worker die `seenIds`. Alte Links `angebot/<lange-id>/` erreichen die App über `404.html`.
5. **Anbieter** behalten ihre Katalog-ID als öffentliche ID. Katalog-IDs werden nicht umbenannt; braucht es das einmal, kommt vorher ein Alias-Feld für Anbieter.
6. **Pfade** bleiben `angebot/<id>/` (jetzt mit Kurz-ID) und `anbieter/<id>/`. Der Pfadvertrag aus ADR 0020, Punkt 1 gilt weiter, nur die Form der Angebots-ID ändert sich. Die Höchstlänge 240 gilt nur noch für die alte Form (`404.html`).
7. **Kalender:** Pfade und UID behalten ihre Form mit der neuen ID: `ics/<id>.ics`, `ics/<id>/<YYYYMMDDTHHmm>.ics`, UID `<id>--<YYYYMMDDTHHmm>@zwergenplan`. Ein erneuter Import eines vor dem Umstieg übernommenen Angebots erzeugt einmalig Duplikate.
8. **Merkliste im Fragment** (ADR 0020, Punkt 8, Plan 0026, Stufe 2): Die Kurz-IDs sind die gespeicherten IDs, kein Hash. Anbieter stehen mit ihrer Katalog-ID, durch `.` getrennt. Kollisionswarnung und Verwerfen mehrdeutiger Kurz-IDs entfallen.
9. **Titel-Anker** (ADR 0016) entfällt; die Zuordnung ersetzt ihn.
10. **Gespeicherte IDs auf dem Gerät** werden in der UI-Zustandsschicht umgeschrieben (`useSaved`), nicht in `src/data` (ADR 0010).

## Alternativen

- **ID weiter ableiten, Titel vorher normalisieren** (Uhrzeit, Datum, Saison aus dem Slug streichen): hilft nur gegen einen Teil der Umformulierungen und nicht gegen verschobene Kursstarts oder ein Modell, das anders formuliert.
- **Zufällige IDs:** Der Build wäre nicht mehr deterministisch, Tests bräuchten eine injizierte Zufallsquelle, und ein Angebot, das nach einer Lücke mit gleichem Schlüssel zurückkommt, bekäme eine fremde ID.
- **Alias-Liste als Daten** (Feld `formerIds` am Angebot oder eigene Datei): Für die Migration reicht die Rechenregel. Eine Liste brächte nur Vorschauseiten für erneut geteilte alte Links (Nutzerentscheid N-I4) und Zusammenlegungen, und Zusammenlegungen ordnen in den gemessenen Fällen (Schwestergruppen mit gleichen Terminen) falsch zu.
- **Alte UID-Basis behalten:** Die Merklisten-ICS entsteht im Browser (ADR 0007) und bräuchte dafür die langen IDs in `site.json`; dazu zwei UID-Regeln auf Dauer.
- **Neue Pfade `/a/<id>/`, `/p/<id>/`:** 6 Zeichen kürzer, aber ein zweiter öffentlicher Vertrag neben dem bestehenden, der ohnehin weiterleben muss.
- **Kurz-ID auch für Anbieter:** zweite ID je Anbieter mit Übersetzung in der App, ohne das Problem der Angebote zu lösen.
- **Titel-Anker auf den Rohdaten behalten** (ADR 0016): wirkt erst ab dem Nachtlauf, hält nur ähnliche Titel und wäre neben der Zuordnung ein zweiter Mechanismus.

## Konsequenzen

- Ein Angebot behält seine ID über Titel-, Uhrzeit- und Ferienänderungen. Eine neue ID entsteht nur, wenn keine Stufe eindeutig trifft, z. B. bei neuem Titel **und** neuer Uhrzeit, bei zwei Schwestergruppen, die sich zugleich ändern, oder bei einem verlegten Einzeltermin (wie bisher „ein anderer Termin“).
- Eine falsche Zuordnung wäre ein neuer Fehler (alter Link zeigt auf ein anderes Angebot desselben Anbieters). Dagegen stehen die strengen Regeln, ein Probelauf mit gestörten Titeln und der Bericht, der jede Zuordnung über Titel oder Termine mit beiden Titeln nennt.
- Einmalige Migration von `data/offers.json` und `tests/fixtures/offers.json` per Pipeline-Befehl; benannte Ausnahme von „nie von Hand“.
- Einmalige Kalender-Duplikate bei erneutem Import alter Angebote; erneut geteilte alte Links zeigen keine Vorschau mehr, funktionieren aber.
- `site.json` wird kleiner. Start-JS und Service Worker wachsen um `shortId` und die Abbildung (Plan 0015, Nachtrag A, Budget; Zeile in ADR 0012).
- Ein Revert nach dem Deploy ist kein Rückweg, weil Geräte ihre Merkliste schon umgeschrieben haben; Korrekturen gehen nach vorn.
- `docs/architecture.md` (Invariante „Stabile IDs“, Schichten), `CLAUDE.md` (IDs nur über `pipeline build`, Katalog-IDs nicht umbenennen) und der Skill `babyevents-nuernberg` werden mit der Annahme nachgezogen; ADR 0003, 0006, 0007, 0016 und 0020 bekommen Verweise.
