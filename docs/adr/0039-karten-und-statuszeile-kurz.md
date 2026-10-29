# ADR 0039 – Kurze Statuszeile, Karten am Startpunkt

Status: **angenommen** (2026-10-29, mit Plan 0056), Nutzerentscheidungen. Umsetzung in Schritten; dieser Stand deckt Statuszeile (S2) sowie Quellenangabe, Hinweistext und Kartenmitte (S3). Der Startausschnitt am Startpunkt folgt mit S5 und ergänzt dieses ADR.
- **Ersetzt** ADR 0019, Punkt 1 und 3: Die Statuszeile nennt den Startpunkt nicht mehr.
- **Ändert** ADR 0011, Punkt 9 in der Form: Der Grund der Luftlinie steht weiter sichtbar in der Statuszeile, gekürzt.
- **Ändert** ADR 0008: Punkt „Nur in der Kartenansicht“ (kein Hinweistext unter der Karte mehr), die Attribution (klappt nach 5 s ein) und Punkt „Startpunkt ohne GPS“ (keine Kartenmitte mehr); bei den Tests entfällt der Fall „Kartenmitte“.
- **Ändert** ADR 0038, Punkt 2: Der Hinweistext unter der Anbieterkarte entfällt.
- **Ändert** ADR 0005, Hinweis zum Fallback ohne GPS: Ohne GPS bleibt der Stadtteil, die Kartenmitte entfällt.

## Kontext

- Die Statuszeilen „230 Angebote ab heute · Wegzeit ab deinem Standort“, „… an 80 Orten“ und „69 Anbieter mit 356 Angeboten“ brachen auf dem Handy in zwei oder drei Zeilen um. Der Nutzer stuft das als störender ein als den fehlenden Bezug der Minuten zum Startpunkt („Vielleicht reicht auch einfach nur die Anzahl der Ergebnisse“, Rückfrage vom 2026-10-29: „Nur die Anzahl“).
- ADR 0019 hatte „Hinweis ganz weglassen“ verworfen, weil die Minuten auf den Kacheln sonst keinen sichtbaren Bezug hätten. Der Startpunkt steht aber weiter im Kind-Sheet und im Untertitel der Sortierung „Nächstgelegen“.
- Grundsatz des Nutzers für die App, ebenfalls vom 2026-10-29: „Usability ist wichtiger als Privatsphäre.“ Er trägt die späteren Teile dieses ADR (Startausschnitt am Startpunkt) und gilt als Maßstab für Abwägungen, die ältere ADRs zugunsten der Privatsphäre entschieden hatten.

## Entscheidung

1. **Statuszeile nur mit der Anzahl:** „230 Angebote“ in Liste und Karte, „69 Anbieter“ im Tab „Anbieter“, „5 Angebote gemerkt“ auf der Merklisten-Karte. „ab heute“, „an n Orten“ und „mit n Angeboten“ entfallen.
2. **Ein gesetzter Zeitraum bleibt** im Satz: „3 Angebote vom 17.–18.10.“ (Browser-Review 0023, m1). Einen Chip für den Zeitraum gibt es nicht, die Zeile ist die einzige sichtbare Angabe.
3. **Kein Startpunkt in der Statuszeile.** Nur der seltene Rückfall auf die Luftlinie steht dahinter, kurz mit Grund: „· Luftlinie, außerhalb“ bzw. „· Luftlinie, Wegzeit fehlt“. Damit bleibt ADR 0011, Punkt 9 erfüllt.
4. Die Ansage über `role="status"` bleibt, mit demselben kurzen Text.
5. **Quellenangabe eingeklappt:** Alle Karten nutzen `compact` und klappen die Angabe 5 s nach dem Laden auf das „i“ ein, beim ersten Verschieben schon früher (MapLibre). Der Nutzer wünschte „per Standard eingeklappt“; die OSMF Attribution Guidelines erlauben das Einklappen nach einer Interaktion oder „automatically after five seconds“, nicht direkt beim Laden. Ein Tipp auf „i“ klappt sie wieder auf.
6. **Kein Hinweistext unter der Karte.** „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“ entfällt unter allen Karten; OpenFreeMap nennen die Quellenangabe hinter dem „i“ und der Datenschutztext im Impressum.
7. **Keine Kartenmitte als Startpunkt.** Die Werkzeugzeile unter der Angebotskarte („Kartenmitte als Startpunkt“, „Startpunkt wählen“) und das Fadenkreuz entfallen. Den Startpunkt wählt man im Kind-Sheet: Standort oder Stadtteil. Ein gespeicherter Startpunkt „Kartenmitte“ (ADR 0017) wird weiter gelesen und gilt, bis jemand einen anderen wählt.

## Konsequenzen

- Die Statuszeile passt bei 320 px in eine Zeile, außer im Luftlinien-Rückfall neben „Alle zeigen“.
- Wer wissen will, wovon „25 Min.“ ausgeht, findet den Startpunkt im Kind-Sheet, im Sortiermenü und im Detail („ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“).
- Beim Laden der Wegzeit hält die Statuszeile keinen unsichtbaren Platz mehr für den Zusatz frei.
- Unter der Karte steht nichts mehr zwischen Rahmen und Liste. Ohne GPS ist der Stadtteil der einzige Startpunkt; einen Punkt zwischen den Stadtteilen gibt es nur noch über den Standort.
- Im E2E-Build lässt sich die Verzögerung des Einklappens setzen (`__zpAttributionMs`), sonst sähen Tests die Angabe je nach Laufzeit ein- oder ausgeklappt.
