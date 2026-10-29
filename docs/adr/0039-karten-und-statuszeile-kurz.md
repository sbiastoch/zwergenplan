# ADR 0039 – Kurze Statuszeile, Karten am Startpunkt

Status: **angenommen** (2026-10-29, mit Plan 0056), Nutzerentscheidungen. Umsetzung in Schritten; dieser Stand deckt die Statuszeile (Plan 0056, S2). Die Teile zu Karte, Quellenangabe und Startausschnitt folgen mit S3 und S5 und ergänzen dieses ADR.
- **Ersetzt** ADR 0019, Punkt 1 und 3: Die Statuszeile nennt den Startpunkt nicht mehr.
- **Ändert** ADR 0011, Punkt 9 in der Form: Der Grund der Luftlinie steht weiter sichtbar in der Statuszeile, gekürzt.

## Kontext

- Die Statuszeilen „230 Angebote ab heute · Wegzeit ab deinem Standort“, „… an 80 Orten“ und „69 Anbieter mit 356 Angeboten“ brachen auf dem Handy in zwei oder drei Zeilen um. Der Nutzer stuft das als störender ein als den fehlenden Bezug der Minuten zum Startpunkt („Vielleicht reicht auch einfach nur die Anzahl der Ergebnisse“, Rückfrage vom 2026-10-29: „Nur die Anzahl“).
- ADR 0019 hatte „Hinweis ganz weglassen“ verworfen, weil die Minuten auf den Kacheln sonst keinen sichtbaren Bezug hätten. Der Startpunkt steht aber weiter im Kind-Sheet und im Untertitel der Sortierung „Nächstgelegen“.
- Grundsatz des Nutzers für die App, ebenfalls vom 2026-10-29: „Usability ist wichtiger als Privatsphäre.“ Er trägt die späteren Teile dieses ADR (Startausschnitt am Startpunkt) und gilt als Maßstab für Abwägungen, die ältere ADRs zugunsten der Privatsphäre entschieden hatten.

## Entscheidung

1. **Statuszeile nur mit der Anzahl:** „230 Angebote“ in Liste und Karte, „69 Anbieter“ im Tab „Anbieter“, „5 Angebote gemerkt“ auf der Merklisten-Karte. „ab heute“, „an n Orten“ und „mit n Angeboten“ entfallen.
2. **Ein gesetzter Zeitraum bleibt** im Satz: „3 Angebote vom 17.–18.10.“ (Browser-Review 0023, m1). Einen Chip für den Zeitraum gibt es nicht, die Zeile ist die einzige sichtbare Angabe.
3. **Kein Startpunkt in der Statuszeile.** Nur der seltene Rückfall auf die Luftlinie steht dahinter, kurz mit Grund: „· Luftlinie, außerhalb“ bzw. „· Luftlinie, Wegzeit fehlt“. Damit bleibt ADR 0011, Punkt 9 erfüllt.
4. Die Ansage über `role="status"` bleibt, mit demselben kurzen Text.

## Konsequenzen

- Die Statuszeile passt bei 320 px in eine Zeile, außer im Luftlinien-Rückfall neben „Alle zeigen“.
- Wer wissen will, wovon „25 Min.“ ausgeht, findet den Startpunkt im Kind-Sheet, im Sortiermenü und im Detail („ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“).
- Beim Laden der Wegzeit hält die Statuszeile keinen unsichtbaren Platz mehr für den Zusatz frei.
