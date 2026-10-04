# Buchungssysteme: wo die Platzangabe steht

Nachschlagen, wenn ein Anbieter-Eintrag eines dieser Systeme unter `availability.system` nennt oder eine Seite Unerwartetes zeigt. Stand: Oktober 2026.

## Per Skript lesbar

| System / Anbieter | Wo die Platzangabe steht | Übersetzung |
|---|---|---|
| **FBS** (fbs-nuernberg.de) | Ampel als `[Status: … ampel green/yellow/red/blue]` im Text von `fetch_page.py`. Alle Termine eines Treffs zeigt `https://www.fbs-nuernberg.de/?s=<Treffname>`. Eltern-Kind-Kurse stehen auch in den Kategorien schwangerschaft, kreativ-musik und einzelveranstaltungen. | green = frei, yellow = wenige, red = warteliste, blue = unbekannt (keine Online-Anmeldung) |
| **Zoff + Harmonie** | In der Liste nur „- Ausgebucht!“ / „- Abgesagt!“ im Titel. Die genaue Zahl steht auf den `?mode=detail`-Seiten („X von Y Plätzen frei“). Die Gesamtliste ist paginiert (`?pageindex=7/14/21&component-id=…`). | |
| **Hebamio** (`*.hebamio.de/kursliste`) | Reines HTML: Titel, „Termine:“, „Kursort:“. Viele Hebamio-Seiten gehören zu anderen Städten, daher nach „Kursort:“ filtern. | „Plätze vorhanden“ = frei, „Noch wenige Plätze“ = wenige, „auf Warteliste setzen“ = warteliste |
| **Kursorganizer** (NÜBAD-Flipper, Wassermäuse) | GraphQL `POST https://api.kursorganizer.com/graphql`, Header `Origin: https://app.<sub>.kursorganizer.com` und `x-application-type: end-user-app`. Query `coursesWithPaginationPublic(filters:{courseTypeIds:[…]}, options:{limit,offset})`. Die courseTypeIds stehen im Anbieter-Eintrag. Ungefiltertes `coursesPublic` bricht bei 200 ab. `startDateTime` ist UTC. | `freePlaces` > 2 frei, 1–2 wenige, 0 mit `waitListCount` = warteliste |
| **Kursolino** (Ohana) | JSON-LD `Course` → `hasCourseInstance`. `fetch_page.py` zeigt es unter `## JSON-LD`. Nürnberger Kurse tragen das Präfix „NDE“. `startDate` hat keine Uhrzeit, die steht im Kursnamen („NDE-14.11.-10.15“ = 10:15). | `InStock` = frei, `LimitedAvailability` = wenige, `SoldOut` = ausgebucht |
| **Post SV** | Kurstabellen mit „Platz frei“/„ausgebucht“, Detail unter `/detailansicht/?kursid=…` | direkt |
| **Reservix** (Mummpitz, Salz+Pfeffer) | Spielplan zeigt pro Termin „Karten verfügbar“ / „Restkarten“ / „Ausverkauft“ | frei / wenige / ausgebucht |
| **MSVplus** (Musication) | „belegt – klicken für Warteliste“ | warteliste |
| **Elena Paulus, kinder-hautnah.de** | Freitext „ausgebucht“, „freie Plätze“, „Anmeldung möglich“ | direkt |
| **evangelische-termine.de** | „(Warteliste)“ im Titel, sonst keine Angabe. Für Abfragen `scripts/evtermine.py --vid <vid>` nutzen, nicht den iCal-Feed: der kodiert Wochenreihen („jeweils“) fälschlich als `FREQ=DAILY`. | warteliste / unbekannt |
| **Ticketportale ohne Platzangabe** (rausgegangen, Eventim-Listen, JSON-LD mit `availability: null`) | nur Preis sichtbar | `unbekannt`, Ticketlink in `url` |
| **Stadt-Kalender (stadt_vk.py)** | Felder `sold_out`, `cancelled` | ausgebucht / Termin weglassen |

## Nur im Browser

Für diese Systeme liefern Skripte oder WebFetch einen Fehler oder nur leere Seiten. Die Platzangabe lässt sich nur mit claude-in-chrome lesen: Tools per ToolSearch laden, neuen Tab öffnen, Seite lesen.

- **Eversports** (Studio Herzschlag, Die FamilienBox, Wolf Pack Yoga): Cloudflare blockt Skripte mit 403. Ersatz für die Termine ist die HTML-Kalenderseite des Anbieters.
- **Calendly**, **Nimbuscloud** (dance maxX; Login nötig)
- **Eventim-Inhouse** (Staatstheater, Sternenhaus; Shop antwortet oft erst nach > 30 s), **go~mus** (Neues Museum), **miya** (Eva Kauper), Canva-Kursplan (Mutherstudio), pekip.de-Gruppensuche.

Ist kein Browser verbunden, bekommt der Termin `availability: unbekannt` und eine `availability_note` mit dem Buchungslink. Der Anbieter gilt trotzdem als `ok`, sofern die Termine selbst lesbar waren.

## Störungen

- Unzuverlässige Domains (nuernberger-nest.de, st-martin-nuernberg.de): sie liefern zeitweise DNS-Fehler oder 503. Nach 1 Minute einmal erneut versuchen.
- Schlägt die DNS-Auflösung in Python-Skripten fehl, curl aber funktioniert, blockiert die Bash-Sandbox den Netzzugriff. Dann das Skript außerhalb der Sandbox ausführen.
- PDF-Programme mit Halbjahres-Dateinamen (Stadtbibliothek `bcn_kinder_programm_JJJJ_N.pdf`, Zoff + Harmonie, Martha-Maria-Flyer): Ist der Link tot, die neue PDF über die Übersichtsseite des Anbieters suchen und als Drift melden.
