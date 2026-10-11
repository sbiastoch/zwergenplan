# Plan 0034 – Impressum und Freigabe für Suchmaschinen

Status: in Umsetzung
Datum: 2026-10-11
Bezug:
- ADR 0002 (privat gedacht, ohne Impressum, `noindex`), ADR 0009 (keine `robots.txt`, `noindex, nofollow`), ADR 0020 (Vorschauseiten mit `noindex`), ADR 0013 (Service Worker), **neu ADR 0028** (im selben Commit)
- Plan 0026 (Vorschauseiten und `404.html` aus `scripts/build-data.ts`)

## Anlass

Der Nutzer, wörtlich: „Füge dezent ein Impressum hinzu und entferne den Ausschluss von Suchmaschinen. Stephan Biastoch, Zwischen den Fleischbänken 12, 90403 Nürnberg“. Auf Rückfrage (§ 5 DDG verlangt eine E-Mail-Adresse) gewählt: `kontakt@zwergenplan.app`; der Nutzer hat die Weiterleitung bei Porkbun dann als `info@zwergenplan.app` eingerichtet („info@ steht“), diese Adresse gilt. Auf Rückfrage nach dem Plan-Review (Art. 13 DSGVO bei öffentlicher Seite) gewählt: „Ja, kurzer Abschnitt Datenschutz auf derselben Seite“.

## Ziel

- Es gibt eine statische Seite `https://zwergenplan.app/impressum/` („Impressum und Datenschutz“) mit den Angaben nach § 5 DDG (Name, Anschrift, E-Mail) und einem kurzen Abschnitt „Datenschutz“ (E7).
- Sie ist dezent verlinkt: in der App als Textlink hinter „Datenstand: …“ am Ende der Liste („Entdecken“) und im Kind-Sheet („Kind und Einstellungen“, vom Kopf aus in jedem Tab und auch im Lade- und Fehlerzustand erreichbar), auf jeder Vorschauseite und auf `404.html` als kleiner Textlink unten.
- Die App (`index.html`) und die Vorschauseiten (`a/<id>/`, `p/<id>/`) tragen kein `robots`-Meta mehr. `404.html` behält `noindex, nofollow` (eine Fehlerseite gehört nicht in den Index). Eine `robots.txt` gibt es weiter nicht; ohne sie ist alles erlaubt.

## Ist-Stand

- `index.html`, Zeile 6: `<meta name="robots" content="noindex, nofollow" />`.
- `scripts/lib/share-pages.ts`: `sharePage()` (Vorschauseiten) und `notFoundPage()` (`404.html`) schreiben beide `<meta name="robots" content="noindex, nofollow">`; gemeinsamer Stil `PAGE_STYLE` stylt jedes `a` als Knopf. `checkSharePages` begrenzt eine Seite auf 10 000 Byte.
- `scripts/build-data.ts` löscht vorab `data`, `ics`, `a`, `p`, `angebot`, `anbieter`, `404.html` unter `public/` und schreibt `404.html` per `write("404.html", notFoundPage())`. `.gitignore` nimmt die generierten Pfade aus.
- `src/sw/routes.ts`: Navigationen außer `""`/`index.html` sind `"netz"`, der Service Worker greift bei `impressum/` also nicht ein (kein Precache, offline nicht erreichbar; hinnehmbar).
- `src/ui/App.tsx`, Zeile 478: `<p className="stand">Datenstand: …</p>`, Stil `.stand` in `src/ui/styles/list.css`.
- Tests mit `noindex`: `e2e/app.spec.ts` („ist für Suchmaschinen gesperrt …“), `e2e/teilen.spec.ts` („Angebot: og:-Tags, noindex, …“), `scripts/lib/share-pages.test.ts` (Vorschauseite, 404).
- Doku mit „kein Impressum“/`noindex`: `CLAUDE.md` Zeile 3, ADR 0002, ADR 0009, ADR 0020.

## Entscheidungen

- **E1 Statische Seite statt Dialog in der App.** Das Impressum lädt nichts in den Start-Chunk (ADR 0012, Startbudget), ist ohne JavaScript lesbar, hat eine eigene URL und ist von den Vorschauseiten und `404.html` aus erreichbar. Sie entsteht wie `404.html` in `scripts/lib/share-pages.ts` (`imprintPage()`, gleicher `PAGE_STYLE`) und wird von `scripts/build-data.ts` nach `public/impressum/index.html` geschrieben. Ein neues Modul lohnt für eine Funktion nicht.
- **E2 Angaben an einer Stelle.** Name, Anschrift und E-Mail stehen als Konstante `IMPRINT` in `scripts/lib/share-pages.ts`. Der Pfad `impressum/` steht als `IMPRINT_PATH` in `src/domain/share.ts` (einzige Quelle für Pfade statischer Seiten, `docs/architecture.md`, „Pfade zum Teilen“) und wird in `share-pages.ts`, `build-data.ts` und der UI genutzt. Die Seite hat Überschrift „Impressum“, den Satz „Angaben gemäß § 5 DDG“, Name, Straße, PLZ Ort, E-Mail als `mailto:`-Link, und einen Rücklink „Zum Zwergenplan“ (Knopf wie auf `404.html`). Kein Tracking, keine Haftungsfloskeln.
- **E3 Dezente Links.**
  - App, Liste: `<p className="stand">Datenstand: … · <a href={`${import.meta.env.BASE_URL}${IMPRINT_PATH}`}>Impressum</a></p>`. Der Link erbt Farbe und Größe von `.stand` (gedämpft, 0,875 rem), ist unterstrichen und bleibt `display:inline`. Das Touch-Gate (`e2e/mobile-ux.ts`) verlangt für Inline-Links 24 px (WCAG 2.5.8); `.stand a { padding-block: 4px }` hebt die Box darüber, ohne die Zeile zu erhöhen.
  - App, Kind-Sheet (`src/ui/KidSheet.tsx`): unter „Einführung ansehen“ eine Zeile `<p className="small"><a href=…>Impressum und Datenschutz</a></p>`, gleiche Regel für die Trefferfläche.
  - Vorschauseiten und `404.html`: unten `<p class="foot"><a href="${BASE}impressum/">Impressum</a></p>`. `PAGE_STYLE` bekommt `.foot a{background:none;color:var(--muted);font-weight:400;text-decoration:underline;padding:0}` (44 px Höhe aus der `a`-Regel bleibt).
- **E4 Suchmaschinen.** `robots`-Meta raus aus `index.html` und `sharePage()`. `404.html` behält `noindex, nofollow`. Die Impressum-Seite hat kein `robots`-Meta. Der Satz „keine `robots.txt`“ aus ADR 0009 bleibt (ohne Datei ist alles erlaubt). Sitemap und `canonical` sind nicht Teil dieses Plans (→ `docs/ideas.md`).
- **E5 Service Worker unverändert.** `impressum/` ist eine Navigation außerhalb von `""`/`index.html`, also `"netz"`. Eine Zeile in `src/sw/routes.test.ts` hält das fest.
- **E7 Datenschutz-Abschnitt** (auf Wunsch des Nutzers, sachlich, ohne Floskeln): Verantwortlicher wie oben; Hosting GitHub Pages (Server-Logs mit IP-Adresse beim Anbieter); keine Cookies, kein Tracking; Geburtsdatum, Merkliste, Startpunkt, Darstellung nur im Browser (`localStorage`/IndexedDB), verlassen das Gerät nicht; Karte lädt Kacheln von OpenFreeMap erst beim Öffnen der Karte (IP-Adresse); Push nur auf Wunsch: Abo beim eigenen Dienst auf Cloudflare Workers (Abo-Adresse, Anmeldedatum), Zustellung über den Push-Dienst des Browsers, Abschalten löscht das Abo; Links zu Google Maps und Anbieterseiten erst beim Tipp; Rechte (Auskunft, Berichtigung, Löschung, Widerspruch) per E-Mail, Beschwerde beim BayLDA. Rechtsgrundlagen: Art. 6 Abs. 1 lit. f (Bereitstellung), lit. a (Push). Die Quelle der Fakten sind ADR 0008, 0013, 0014, 0017; ändert sich dort etwas, muss der Abschnitt mit (ADR 0028 nennt die Kopplung).
- **E9 Hinweise** (auf Wunsch des Nutzers, nach dem Arch-Review: „dass die Inhalte AI-Zusammenfassungen sind und Fehler enthalten können, genauso wie alle Daten“): Abschnitt vor dem Datenschutz. Ohne Gewähr, KI fasst die Anbieterseiten zusammen, alle Angaben samt Wegzeiten können falsch sein, vor dem Besuch beim Anbieter prüfen; Kontakt für Fehler, fehlende Angebote und Anbieter, die anders oder nicht erscheinen wollen; privat, nicht-kommerziell, ohne Werbung, unabhängig von den Anbietern, keine Verantwortung für verlinkte Seiten.
- **E8 Keine Angabe nach § 18 Abs. 2 MStV.** Die Seite listet automatisiert öffentliche Anbieterangaben ohne eigene journalistisch-redaktionelle Beiträge. Steht im ADR 0028; der Nutzer kann es jederzeit ergänzen.
- **E6 ADR 0028** „Impressum und Suchmaschinen“ ersetzt in ADR 0002 die Punkte „ohne Impressum und mit `noindex`“, in ADR 0009 „Es bleibt bei `noindex, nofollow`“ und in ADR 0020 das `noindex` der Vorschauseiten. Die drei ADRs bekommen je einen kursiven Ersetzungsvermerk wie bereits in ADR 0002. ADR 0028 begründet außerdem: die Weiterleitung der Vorschauseiten nur für Menschen (`SHARE_REDIRECT`) ist kein Cloaking, weil Bot und Mensch denselben Inhalt (Titel, Beschreibung, Link in die App) sehen; das Impressum ist offline nicht erreichbar (`"netz"`), hinnehmbar; die E-Mail `info@zwergenplan.app` braucht MX-Einträge bei Porkbun (Weiterleitung), die der Nutzer anlegt. ADR 0009 bekommt im DNS-Punkt einen Ergänzungsvermerk dazu.

## Schritte

1. **Tests zuerst** (`scripts/lib/share-pages.test.ts`):
   - `imprintPage()`: enthält „Impressum“, „Datenschutz“, „Stephan Biastoch“, „Zwischen den Fleischbänken 12“, „90403 Nürnberg“, `href="mailto:info@zwergenplan.app"`, „OpenFreeMap“, Rücklink auf `BASE`, kein `name="robots"`, kein `<script>`.
   - Vorschauseite (Angebot): kein `name="robots"`, enthält `href="${BASE}impressum/"`.
   - `404.html`: weiter `noindex, nofollow`, enthält `href="${BASE}impressum/"`.
   - `src/sw/routes.test.ts`: Zeile `["https://zwergenplan.app/impressum/", true, "netz"]`.
2. **Generator**: `IMPRINT_PATH` in `src/domain/share.ts`, `IMPRINT`, `imprintPage()`, Fußlink in `sharePage()` und `notFoundPage()`, `.foot` in `PAGE_STYLE`, `robots` raus aus `sharePage()`.
3. **Build**: `scripts/build-data.ts` nimmt `IMPRINT_PATH` in die Löschliste auf und schreibt `write("impressum/index.html", imprintPage())`; Kopfkommentar ergänzen. `.gitignore`: `public/impressum/`.
4. **App**: `index.html` ohne `robots`-Meta; `src/ui/App.tsx` Link in `.stand`; `src/ui/styles/list.css` Regel `.stand a`; `src/ui/KidSheet.tsx` Link unter „Einführung ansehen“.
5. **E2E**:
   - `e2e/app.spec.ts`: Test umbenennen in „ist für Suchmaschinen offen und liegt im Wurzelpfad“, erwartet `meta[name="robots"]` mit Anzahl 0. Neuer Test: Link „Impressum“ sichtbar, Klick öffnet `/impressum/` mit Überschrift „Impressum“ und dem Namen.
   - `e2e/teilen.spec.ts`: Erwartung auf „kein `robots`“ drehen, Testtitel anpassen.
   - `e2e/mobile-ux.spec.ts`: Block `impressum` wie `404-seite` (Gates hell/dunkel, 320 px und 200 %).
   - Kind-Sheet: Link „Impressum und Datenschutz“ vorhanden mit `href="/impressum/"` (in `app.spec.ts`).
   - `e2e/smoke.spec.ts`: `existsSync("dist/impressum/index.html")`.
   - Lokal: `pnpm e2e:local e2e/app.spec.ts e2e/teilen.spec.ts e2e/mobile-ux.spec.ts` (`index.html` steht in `FULL`, `--affected` nähme sonst nur `app` und `theme`), dazu `--affected --smoke`.
6. **Doku**: ADR 0028 anlegen; Vermerke in ADR 0002, 0009 (auch DNS/MX), 0020; `docs/architecture.md` (Ausgaben von `build-data`, Pfade); `CLAUDE.md` Zeile 3 („öffentlich auffindbar, mit Impressum“); `docs/ideas.md`: Sitemap, `canonical`, Impressum offline vorhalten.
7. `pnpm verify`, `pnpm e2e:local --affected` (plus `--smoke`, falls die Auswahl es nennt), `/browser-review` für Liste unten und `/impressum/` hell/dunkel, Commit, Push, CI auf `main`, `/browser-review live`.

## Tests (Abnahme)

- Unit: die Fälle aus Schritt 1 grün.
- E2E: `app.spec.ts` (robots fehlt, Impressum erreichbar), `teilen.spec.ts` (Vorschauseite ohne `robots`).
- Live: `curl -s https://zwergenplan.app/ | grep -c 'name="robots"'` ist 0; `https://zwergenplan.app/impressum/` liefert 200 mit Name und Anschrift.

## Risiken

- Die Vorschauseiten leiten Menschen per Skript in die App weiter, Bots nicht (`SHARE_REDIRECT`). Indexiert werden sie damit als kurze Seiten mit Titel und Beschreibung. Das ist gewollt; Doubletten zur App gibt es nicht, weil die App die Angebote erst per JavaScript rendert.
- Vorschauseiten abgelaufener Angebote verschwinden mit dem nächsten Build (404). Suchmaschinen räumen sie dann selbst aus.
- Die Postfach-Weiterleitung für `info@zwergenplan.app` (MX bei Porkbun) richtet der Nutzer ein; das ist außerhalb des Repos. Bis dahin ist die Adresse tot; der Abschlussbericht nennt das ausdrücklich.
- Der Rücklink „Zum Zwergenplan“ führt auf die Startseite ohne Filter; „Zurück“ im Browser erhält sie. Hinnehmbar.

## Review (2026-10-11) – Verdict: Freigabe mit Änderungen

Kein Blocker. Übernommen:
- M1 Erreichbarkeit nur in „Entdecken“: zweiter Link im Kind-Sheet (E3), E2E-Test.
- M2 Kein Mobile-UX-Gate für die Seite: Block `impressum` in `mobile-ux.spec.ts` (Schritt 5).
- M3 E-Mail ohne MX: in ADR 0028 und als Vermerk in ADR 0009; der Nutzer richtet die Weiterleitung ein, der Abschlussbericht nennt es. Eine Testmail als Vorbedingung des Pushs ist nicht übernommen: Der Agent kann sie nicht prüfen, und ohne Push gäbe es gar kein Impressum.
- M4 Datenschutz: auf Rückfrage beim Nutzer kurzer Abschnitt auf derselben Seite (E7).
- m5 Touch-Gate: `padding-block: 4px` an Inline-Links (E3).
- m6 `IMPRINT_PATH` in `src/domain/share.ts` (E2).
- m7 Smoke prüft `dist/impressum/index.html`.
- m8 `docs/architecture.md` in Schritt 6.
- m9 Offline: als Folge in ADR 0028, Idee in `docs/ideas.md`.
- m10 Begründung zu `SHARE_REDIRECT` in ADR 0028.
- m11 Rücklink ohne Filter: unter Risiken.
- m12 MStV: entschieden in E8 (keine Angabe), steht in ADR 0028.
- m13 Specs für den lokalen Lauf benannt (Schritt 5).

## Arch-Review (2026-10-11) – Verdict: Nacharbeit nötig, eingearbeitet

Kein Blocker. Übernommen:
- M1 `getByText("Stephan Biastoch")` traf zwei Absätze: Test prüft die Straße (zeigte auch der erste lokale E2E-Lauf).
- M2 Start-JS-Delta: gemessen und in ADR 0012 eingetragen (Schritt 6).
- m1 Datenschutz nennt die IP beim Push-Worker und den Zähler je IP als Hash (ADR 0014, `push-worker/src/handler.ts`); Unit-Test prüft das Stichwort.
- m2 Rückverweis: Invariante „Privatsphäre“ in `docs/architecture.md` nennt `imprintPage()`.
- m3 Service-Worker-Absatz in `docs/architecture.md` nennt `impressum/`.
- m4 Herleitung von `MAX_PAGE_BYTES` auf rund 1,9 kB festen Text (≈ 9,1 kB) nachgezogen.
- m5 `.imprint a` liegt in `sheet.css`.
- Zusätzlich: „Wochen-Nachricht“ → „Samstags-Nachricht“ (ein Begriff überall, Plan 0033, N2).
