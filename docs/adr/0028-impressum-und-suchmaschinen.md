# ADR 0028 – Impressum, Datenschutz und Freigabe für Suchmaschinen

Status: angenommen (2026-10-11), mit Plan 0034. **Ersetzt** in ADR 0002 „ohne Impressum und mit `noindex`“, in ADR 0009 „Es bleibt bei `noindex, nofollow`“ und in ADR 0020, Punkt 2, das `noindex` der Vorschauseiten. **Ergänzt** ADR 0009 (DNS) um MX-Einträge für die Kontaktadresse.

## Kontext

- Der Zwergenplan war für Freunde und Familie gedacht: ohne Impressum, mit `noindex, nofollow` auf App und Vorschauseiten (ADR 0002, 0009, 0020).
- Der Nutzer will die Seite jetzt auffindbar machen und ein dezentes Impressum ergänzen. Damit greifen § 5 DDG (Name, Anschrift, E-Mail) und Art. 13 DSGVO (Informationen zur Verarbeitung).

## Entscheidung

1. **Statische Seite `impressum/`** (Pfad `IMPRINT_PATH` in `src/domain/share.ts`), erzeugt von `imprintPage()` in `scripts/lib/share-pages.ts` und geschrieben von `scripts/build-data.ts`, wie `404.html`. Sie lädt nichts in den Start-Chunk, braucht kein JavaScript und hat eine eigene URL.
2. **Inhalt:** Angaben nach § 5 DDG (Stephan Biastoch, Zwischen den Fleischbänken 12, 90403 Nürnberg, `kontakt@zwergenplan.app`) ein Abschnitt „Hinweise“ (KI-Zusammenfassung ohne Gewähr, vor dem Besuch beim Anbieter prüfen, Kontakt für Fehler und Wünsche von Anbietern, privat und unabhängig) und ein kurzer Abschnitt „Datenschutz“. Seine Fakten stammen aus ADR 0008 (Kacheln von OpenFreeMap nur bei offener Karte), 0013/0017 (Speicher nur im Browser) und 0014 (Push-Worker speichert nur das Abo). **Ändert sich dort etwas, muss der Text in `imprintPage()` mit.**
3. **Dezente Links:** in der App hinter „Datenstand“ am Ende der Liste und im Kind-Sheet (aus jedem Tab und im Lade- und Fehlerzustand erreichbar), auf jeder Vorschauseite und auf `404.html` als Fußlink.
4. **Suchmaschinen:** Kein `robots`-Meta mehr auf App, Vorschauseiten und Impressum. `404.html` behält `noindex, nofollow`. Eine `robots.txt` gibt es weiter nicht (ohne Datei ist alles erlaubt).
5. **Keine Angabe nach § 18 Abs. 2 MStV:** Die Seite listet automatisiert öffentliche Anbieterangaben, ohne eigene journalistisch-redaktionelle Beiträge. Der Nutzer kann die Angabe jederzeit ergänzen.

## Begründung zur Weiterleitung der Vorschauseiten

`SHARE_REDIRECT` leitet Menschen in die App weiter, Bots nicht. Das ist kein Cloaking: Bot und Mensch bekommen dieselbe Aussage (Titel, Termin, Ort, Link in die App); die App zeigt dasselbe Angebot, nur mit Bedienung.

## Konsequenzen

- Die Kontaktadresse braucht eine Postfach-Weiterleitung bei Porkbun (MX-Einträge, ggf. SPF). Die richtet der Nutzer ein; bis dahin erfüllt das Impressum die Pflicht zur elektronischen Kontaktaufnahme nicht.
- Das Impressum ist offline nicht erreichbar (Service Worker: `"netz"`, ADR 0013). Hinnehmbar; Idee in `docs/ideas.md`.
- Vorschauseiten können im Index landen. Abgelaufene Angebote verschwinden mit dem nächsten Build (404), Suchmaschinen räumen sie selbst aus.
- Sitemap und `canonical` sind nicht Teil dieser Entscheidung (`docs/ideas.md`).
