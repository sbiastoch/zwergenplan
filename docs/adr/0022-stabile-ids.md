# ADR 0022 – Stabile IDs: gespeicherte Kurz-ID je Angebot und Anbieter, Zuordnung gegen den Vorstand, kurze Pfade

Status: angenommen (2026-10-10), mit Plan 0015, Nachtrag A (Stufe 0 von Plan 0032; Plan-Review eingearbeitet; Nutzerentscheide N-I1 und N-I2 am 2026-10-08 mit „ja“ entschieden, N-I3 und N-I4 mit der Empfehlung umgesetzt: UID mit der Kurz-ID, keine Aliasseiten). Umsetzung mit zwei Nachschärfungen der Zuordnung (Punkt 3, Umsetzung). Ersetzt die ID-Regeln von ADR 0003 („Stabile IDs“, UID) und ADR 0006 („ID-Regel“) und den Pfadvertrag aus ADR 0020, Punkt 1. Ergänzt ADR 0003 (Feld `publicId` am Anbieter), ADR 0007 (UID-Form der Merklisten-ICS), ADR 0016 (Titel-Anker entfällt) und ADR 0020 (Kachelbild-Pfad und Höchstlängen aus Punkt 2, Ziel aus Punkt 3, `404.html` aus Punkt 4, Service Worker aus Punkt 5, Kurz-IDs aus Punkt 8). Die Nummer ist am 2026-10-08 gegen `origin/main` und die Branches der Pläne 0025 und 0026 geprüft (alle enden bei 0021) und am 2026-10-10 beim Umsetzen erneut (höchste ADR 0025).

## Kontext

- Die Offer-ID ist bisher eine Funktion aus Anbieter, Titel-Slug, Ort und bei Kursen und Einzelterminen dem ersten Termin (ADR 0003, ADR 0006). Am 2026-10-08 tragen 251 von 333 Titeln Wochentag, Uhrzeit, Datum oder Saison. Jede Umformulierung durch die Recherche und jeder verschobene Kursbeginn ergibt eine neue ID. Ab dem Nachtlauf (ADR 0016) extrahiert ein Sprachmodell; dann ändern sich Titel häufiger.
- Eine neue ID bricht seit Plan 0026 geteilte Links (`angebot/<id>/`, öffentlicher Vertrag nach ADR 0020), leert still Merklisten-Einträge, erzeugt Kalender-Duplikate bei erneutem Import (UID mit ID, ADR 0003) und meldet bekannte Angebote in der Wochen-Nachricht als neu.
- Die Pipeline hielt die ID bisher nur für laufende Kurse mit gleichem Titel-Slug fest (Kursfortschreibung, ADR 0006).
- Anbieter-IDs vergibt ein Mensch im Katalog. Sie hängen an keinem Recherchetext, sind aber lang (bis 38 Zeichen) und stehen in Links, in `site.json`, in `anbieter.json` und seit Plan 0025 in der Merkliste gemerkter Anbieter.
- Die Pfade `angebot/<id>/` und `anbieter/<id>/` sind seit dem 2026-10-08 öffentlicher Vertrag (ADR 0020, Punkt 1). Eine Änderung verlangt ein neues ADR samt Weiterleitung der alten Form.
- Der Nutzer hat am 2026-10-08 entschieden, dass auch Anbieter eine feste Kurz-ID bekommen und die Pfade kurz werden (Plan 0015, Nachtrag A, N-I1 und N-I2: „NI1 Und 2: doch“).

## Entscheidung

1. **Angebots-ID = 8 Zeichen `[0-9a-z]`, gespeichert** in `data/offers.json`. Die Pipeline vergibt sie und übernimmt sie in jedem Lauf; sie wird nicht mehr aus Feldern berechnet. Einzige Definition des Musters ist `SHORT_ID_PATTERN` in `src/domain/ids.ts`; es gilt auch für die Kurz-ID der Anbieter (Punkt 5).
2. **Neue IDs** sind `shortId(offerKey, seed)`: cyrb53 über den bisherigen Schlüssel `providerId--slug(title)[-Beginn]--venueId` (jetzt `offerKey`, nur noch Zuordnungsschlüssel, nirgends gespeichert), base36 auf 8 Zeichen, kleinster freier `seed`. Belegt ist jede ID im Vorstand und in der Ausgabe. Der Build bleibt rein und deterministisch.
3. **Zuordnung gegen den Vorstand** (`scripts/pipeline/lib/stable-ids.ts`), drei Stufen, jeweils 1:1, verglichen im gemeinsamen Fenster beider Datenstände:
   - gleicher Schlüssel, wenn auf beiden Seiten eindeutig;
   - gleiche Termine: gleicher Anbieter, gleicher Ort (oder der alte Ort steht nicht mehr im Katalog), ≥ 80 % gleiche Beginnzeiten, strikt bester Partner für beide Seiten;
   - ähnlicher Titel mit gleichen Tagen: gleicher Anbieter, Ort und Format, ≥ 50 % gleiche Tage, nur wenn beide füreinander der einzige Kandidat sind.

   Gleichstand oder Mehrdeutigkeit heißt kein Treffer, also eine neue ID.

   **Umsetzung (2026-10-10), zwei Nachschärfungen aus Tests und Probelauf** (Plan 0015, Nachtrag A, „Umsetzung“):
   - Stufe 0 vergleicht den **Fensterschlüssel** (`offerKey` mit dem ersten Termin ab Beginn des Laufs) statt `offerKey`. Sonst verlöre ein laufender Kurs, dessen Quelle die vergangenen Termine nicht mehr nennt und bei dem ein Termin verlegt wurde, seine ID. Saat neuer IDs bleibt `offerKey`, damit Punkt 4 gilt.
   - Stufe 1 nimmt kein Paar mit **Titel-Widerspruch**: Ähnelt der neue Titel nicht dem alten, aber einem anderen Angebot desselben Anbieters im Vorstand (auch einem schon zugeordneten), ist eher ein Schwesterangebot auf den frei gewordenen Platz gerückt. Die Regel führt im Zweifel zu einer neuen ID, nie zu einer anderen alten. Die Kursfortschreibung (ADR 0006) hängt an dieser Zuordnung und übernimmt nur vergangene Termine. Eine ID wechselt nie den Anbieter; das prüft der Build. Zusammenlegungen (eine verschwundene ID weiterleiten) gibt es nicht.
4. **Alt → neu ist eine Rechenregel, keine Liste:** Die neue ID einer alten langen ID ist `shortId(alteId, 0)`. Genau das vergibt die einmalige Migration, und kehrt ein vor dem Umstieg verschwundenes Angebot mit gleichem Schlüssel zurück, bekommt es dieselbe ID. Die App rechnet damit alte IDs aus der Query und aus der Merkliste um, der Service Worker die `seenIds`. Für Anbieter gilt dasselbe: Die Kurz-ID einer Katalog-ID aus einem alten Link oder aus der Merkliste gemerkter Anbieter ist `shortId(katalogId, 0)`, denn genau das vergibt die Migration. Alte Links erreichen die App über `404.html` (Punkt 6).
5. **Anbieter bekommen eine feste Kurz-ID `publicId`**, gespeichert in `data/providers.yaml` bei jedem Eintrag mit `role: anbieter`.
   - Vergeben wird sie wie bei Angeboten: `shortId(katalogId, seed)` mit dem kleinsten freien `seed`, von `pipeline candidates add-provider` oder als Wert in der Meldung von `data:validate`. Die Migration vergibt einmalig `seed` 0.
   - Sie ändert sich nie. Der Build prüft Eindeutigkeit und `publicId === shortId(id, s)` für ein `s` von 0 bis 9.
   - Die **Katalog-ID bleibt der interne Schlüssel**: Katalog, `offers.providerId`, `coveredBy`, Orte, Rohdaten, Zuordnung und `offerKey`. Katalog-IDs werden weiter nicht umbenannt, denn Zuordnung und Angebots-IDs hängen an ihnen.
   - **Jede Anbieter-ID im Browser ist die `publicId`**: `site.json` (`providerId` je Angebot) und `anbieter.json` (`id`) tragen sie. Übersetzt wird nur beim Erzeugen dieser beiden Dateien. `venueId` bleibt die interne Orts-ID und ist keine Anbieter-ID, auch wenn sie oft wie die Katalog-ID lautet.
   - Pakete für Subagenten enthalten keine `publicId`.
6. **Pfade** (ersetzt ADR 0020, Punkt 1): Angebote unter `a/<id>/` mit dem Kachelbild `a/<id>/vorschau.jpg`, Anbieter unter `p/<publicId>/`. `src/domain/share.ts` bleibt die einzige Quelle.
   - Die alten Ordner leben als Weiterleitung weiter: Unter `angebot/` und `anbieter/` gibt es keine Seiten mehr; `404.html` leitet `angebot/<id>/` nach `?angebot=` und `anbieter/<id>/` nach `?anbieter=` weiter, und die App rechnet um (Punkt 4). Dazu leitet `404.html` unbekannte `a/<id>/` und `p/<id>/` in die App, die „gibt es nicht mehr“ meldet.
   - Die Query-Namen bleiben `?angebot=` und `?anbieter=`. Geteilt wird der Pfad, die Query sieht man nur in der Adresszeile der App, die übrigen Query-Namen sind deutsche Wörter, und die alten Namen müssten ohnehin auf Dauer gelesen werden. Ordner- und Query-Namen sind damit verschieden.
   - Der Service Worker bleibt unverändert: `a/` und `p/` fallen unter „sonst nur Netz“ (ADR 0020, Punkt 5).
   - Die Höchstlänge 240 für Angebots-IDs gilt nur noch für die alte Form in `404.html` und in der Umrechnung. Die Höchstlänge 80 prüft das Schema weiter für Katalog- und Orts-IDs; in Pfaden gilt sie nur noch für die alte Form `anbieter/<id>/`.
7. **Kalender:** Pfade und UID behalten ihre Form mit der neuen ID: `ics/<id>.ics`, `ics/<id>/<YYYYMMDDTHHmm>.ics`, UID `<id>--<YYYYMMDDTHHmm>@zwergenplan`. Ein erneuter Import eines vor dem Umstieg übernommenen Angebots erzeugt einmalig Duplikate.
8. **Merkliste im Fragment** (ADR 0020, Punkt 8, Plan 0026, Stufe 2): `#merkliste=1.{A}.{P}` mit den gespeicherten Kurz-IDs der Angebote und den `publicId` der Anbieter, je 8 Zeichen ohne Trenner, kein Hash. Kollisionswarnung und Verwerfen mehrdeutiger Kurz-IDs entfallen.
9. **Titel-Anker** (ADR 0016) entfällt; die Zuordnung ersetzt ihn.
10. **Gespeicherte IDs auf dem Gerät** (Merkliste und gemerkte Anbieter) werden in der UI-Zustandsschicht umgeschrieben (`useSaved`, `useSavedProviders`), nicht in `src/data` (ADR 0010).

## Alternativen

- **ID weiter ableiten, Titel vorher normalisieren** (Uhrzeit, Datum, Saison aus dem Slug streichen): hilft nur gegen einen Teil der Umformulierungen und nicht gegen verschobene Kursstarts oder ein Modell, das anders formuliert.
- **Zufällige IDs:** Der Build wäre nicht mehr deterministisch, Tests bräuchten eine injizierte Zufallsquelle, und ein Angebot, das nach einer Lücke mit gleichem Schlüssel zurückkommt, bekäme eine fremde ID.
- **Alias-Liste als Daten** (Feld `formerIds` am Angebot oder eigene Datei): Für die Migration reicht die Rechenregel. Eine Liste brächte nur Vorschauseiten für erneut geteilte alte Links (Nutzerentscheid N-I4) und Zusammenlegungen, und Zusammenlegungen ordnen in den gemessenen Fällen (Schwestergruppen mit gleichen Terminen) falsch zu.
- **Alte UID-Basis behalten:** Die Merklisten-ICS entsteht im Browser (ADR 0007) und bräuchte dafür die langen IDs in `site.json`; dazu zwei UID-Regeln auf Dauer.
- **Ordner `angebot/` und `anbieter/` behalten, nur mit Kurz-ID darin** (bisherige Empfehlung): ein Vertrag statt zwei. Der Nutzer hat kurze Pfade gewählt (N-I1); die alten Ordner kosten als Weiterleitung nur zwei Regeln in `404.html`.
- **Katalog-ID weiter als öffentliche Anbieter-ID** (bisherige Empfehlung): keine zweite ID je Anbieter. Der Nutzer hat eine feste Kurz-ID gewählt (N-I2). Damit hängen Links nicht mehr an einem lesbaren Namen, Anbieter- und Angebots-IDs haben eine Form, und das Fragment braucht keine Trenner.
- **Anbieter-Kurz-ID nur rechnen statt speichern** (`shortId(katalogId, 0)` überall): keine Schemaänderung, aber bei einer Kollision gäbe es keinen Ausweg, und die öffentliche ID stünde nirgends sichtbar.
- **`offers.providerId` auf die `publicId` umstellen:** Der Browser bräuchte keine Übersetzung, aber Rohdaten, Zuordnung und `offerKey` hängen an der Katalog-ID; es wäre eine zweite Migration ohne Gewinn.
- **Kurze Query-Namen `?a=`, `?p=`:** etwa 12 Zeichen weniger in einer Adresse, die niemand teilt, dafür zwei Namen je Parameter auf Dauer.
- **Eigene Weiterleitungsseiten unter `anbieter/<katalog-id>/`:** behielten die Vorschau beim erneuten Teilen alter Anbieter-Links, wären aber eine zweite Mechanik neben `404.html`. Gehört zur offenen Frage N-I4.
- **Titel-Anker auf den Rohdaten behalten** (ADR 0016): wirkt erst ab dem Nachtlauf, hält nur ähnliche Titel und wäre neben der Zuordnung ein zweiter Mechanismus.

## Konsequenzen

- Geteilte Links sind kurz (`https://zwergenplan.app/a/4tpu5qaq/`). Alte Links unter `angebot/` und `anbieter/` funktionieren weiter, zeigen beim erneuten Teilen aber keine Vorschau mehr; die Regeln dafür bleiben auf Dauer in `404.html`.
- Jeder Anbieter hat zwei IDs: die Katalog-ID intern, die `publicId` im Browser. Eine Verwechslung im Build wäre ein neuer Fehler; dagegen steht, dass nur zwei Funktionen übersetzen und ein Test die Anbieter-Felder von `site.json` und `anbieter.json` prüft.
- Eine Umbenennung einer Katalog-ID bleibt ausgeschlossen, solange die Prüfung `publicId === shortId(id, s)` an der Katalog-ID hängt; vorher käme ein Feld mit der früheren Katalog-ID.
- Ein Angebot behält seine ID über Titel-, Uhrzeit- und Ferienänderungen. Eine neue ID entsteht nur, wenn keine Stufe eindeutig trifft, z. B. bei neuem Titel **und** neuer Uhrzeit, bei zwei Schwestergruppen, die sich zugleich ändern, oder bei einem verlegten Einzeltermin (wie bisher „ein anderer Termin“).
- Eine falsche Zuordnung wäre ein neuer Fehler (alter Link zeigt auf ein anderes Angebot desselben Anbieters). Dagegen stehen die strengen Regeln, ein Probelauf mit gestörten Titeln und der Bericht, der jede Zuordnung über Titel oder Termine mit beiden Titeln nennt.
- Einmalige Migration von `data/offers.json` und `data/providers.yaml` samt Fixtures per Pipeline-Befehl; benannte Ausnahme von „nie von Hand“.
- Einmalige Kalender-Duplikate bei erneutem Import alter Angebote; erneut geteilte alte Links zeigen keine Vorschau mehr, funktionieren aber.
- `site.json` und `anbieter.json` werden kleiner. Start-JS und Service Worker wachsen um `shortId` und die Abbildungen (Plan 0015, Nachtrag A, Budget; Zeile in ADR 0012).
- Ein Revert nach dem Deploy ist kein Rückweg, weil Geräte ihre Merklisten schon umgeschrieben haben und seither geteilte Links auf `a/` und `p/` zeigen; Korrekturen gehen nach vorn.
- `docs/architecture.md` (Invariante „Stabile IDs“, Pfadvertrag, Schichten), `CLAUDE.md` (IDs nur über `pipeline build` bzw. `add-provider`, Katalog-IDs nicht umbenennen, `publicId` nie ändern) und der Skill `babyevents-nuernberg` werden mit der Annahme nachgezogen; ADR 0003, 0006, 0007, 0016 und 0020 bekommen Verweise.
