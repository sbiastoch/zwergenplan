# ADR 0019 – Die Statuszeile nennt nur den Startpunkt

Status: angenommen (2026-10-06), Nutzerentscheidung. Umsetzung mit Plan 0020. Ändert die Anzeige aus ADR 0011 (Punkt 3, Satz 3) und ADR 0015 (Kopf).

## Kontext

- Die Statuszeile zeigte in eigener Zeile unter „332 Angebote ab heute“ den Text „Wegzeit ab Gostenhof mit Bus & Bahn (Di vormittags, höchstens 1 Umstieg, inkl. Warten)“.
- Bei 320 px belegte er drei Zeilen, bei 390 px zwei. Für den Nutzer ist die Startseite damit überladen, die Annahme sei „gar nicht so wichtig“.
- Das Kind-Sheet erklärt das Modell unter „Wegzeit ab“ schon vollständig (`TRANSIT_RULE`, `src/domain/transit.ts`).

## Entscheidung

1. Die Statuszeile hängt hinter die Zahl nur den Startpunkt an: „332 Angebote ab heute · Wegzeit ab Gostenhof“.
2. Die Annahme (Di vormittags, höchstens 1 Umstieg, inkl. Warten) steht nur noch im Kind-Sheet. Detail und Orts-Sheet bleiben wie in ADR 0015, Punkt 7.
3. Der Rückfall auf die Luftlinie nennt seinen Grund kurz in Klammern: „Luftlinie ab Gostenhof (Wegzeiten gerade nicht verfügbar)“ bzw. „… (außerhalb des Stadtgebiets)“. ADR 0011, Punkt 9 bleibt damit erfüllt.

## Alternativen

- **Hinweis ganz weglassen:** Seit ADR 0017 bleibt auch der Standort gespeichert. Die Minuten auf den Kacheln hätten auf der Seite dann keinen sichtbaren Bezug mehr.
- **Statuszeile breiter machen, damit der Umschalter „Liste | Karte“ immer darunter steht:** Auf den meisten Handys wäre die Seite so nicht kürzer.

## Konsequenzen

- Bei langen Stadtteilnamen oder neben dem Umschalter (ab 412 px) bricht der Zusatz um, als Ganzes und ohne verwaisten Trennpunkt. Er bleibt kürzer als vorher.
- Wer wissen will, was „25 Min.“ bedeutet, findet es im Detail („ca. 25 Min. mit Bus 37 → U1 ab Gostenhof“) und im Kind-Sheet.
