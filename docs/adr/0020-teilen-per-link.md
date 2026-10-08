# ADR 0020 – Teilen per Link: statische Vorschauseiten und Merkliste im Fragment

Status: angenommen (2026-10-08), mit Plan 0026 (Plan-Review eingearbeitet, Nutzerentscheide N1–N4). Punkt 8 (Merkliste im Fragment) gilt erst mit Stufe 2, nach Plan 0025. Ergänzt ADR 0002 (Datenfluss), ADR 0009 (`noindex`) und ADR 0013 (Service Worker, ohne Regeländerung). Ändert die Regel „Merkliste nie in der URL“ (Plan 0003, Zeile 75; Kommentar in `src/domain/route.ts`), aber erst mit Stufe 2. Die Nummer ist am 2026-10-08 gegen `origin/main` und die Branches der Pläne 0022–0025 geprüft (alle endeten bei 0019); nach dem Merge von `main` d5fab1b ist 0021 durch Plan 0027 belegt, 0020 bleibt hier. Beim Merge erneut prüfen.

## Kontext

- Eltern wollen einzelne Angebote und Anbieter, später auch die ganze Merkliste, per WhatsApp und Co. an andere schicken. Im Chat soll dabei eine aussagekräftige Vorschau stehen: Titel, Termin, Ort.
- Deep Links gibt es schon (`?angebot=<id>`, `?anbieter=<id>`, `src/domain/route.ts`). GitHub Pages liefert für jede Query aber dieselbe `index.html`. Link-Vorschauen (WhatsApp, Signal, Telegram, iMessage) lesen die `og:`-Tags aus dem HTML und führen in der Regel kein JavaScript aus. Jeder Deep Link hat heute also dieselbe Vorschau, und `index.html` hat nicht einmal `og:`-Tags.
- Es gibt keinen Server (ADR 0002). Eine Edge-Funktion vor Pages gibt es nicht, und die Domain liegt bei Porkbun und nicht bei Cloudflare (ADR 0009).

## Entscheidung

1. **Eine statische Vorschauseite je Angebot und je Anbieter.** `scripts/build-data.ts` schreibt aus denselben geprüften Daten wie `site.json`:
   - `public/angebot/<offerId>/index.html` für jedes Angebot in `site.json`,
   - `public/anbieter/<providerId>/index.html` für jeden Anbieter in `anbieter.json`.

   Die Pfade bilden die Query-Namen ab und stehen nur in `src/domain/share.ts`. Sie sind ab dem ersten Deploy ein **öffentlicher Vertrag**, denn geteilte Links leben in Chats unbegrenzt weiter. Eine Änderung braucht ein neues ADR samt Weiterleitung der alten Form.
2. **Inhalt einer Vorschauseite:**
   - `og:title`, `og:description`, `og:url` (die Seite selbst, nie die Query-URL), `og:image` (generisch), `og:site_name`, `og:locale`, `twitter:card`,
   - `<meta name="robots" content="noindex, nofollow">`, wie in ADR 0009,
   - nur öffentliche Felder aus `site.json` bzw. `anbieter.json`, alles HTML-escaped,
   - Titel und Beschreibung deterministisch gekürzt (110 bzw. 200 Zeichen), damit kein Datenstand den Build bricht (Nachtlauf, ADR 0016). Eine Grenze von 4 kB je Seite bleibt als Wächter gegen Fehler im Generator.

   Die Texte hängen nur an den Daten und an `generatedAt`, nie an der Build-Uhr. Der Build ist damit deterministisch.
3. **Weiterleitung in die App per JavaScript, ohne `meta refresh`.** Ein gleiches Inline-Skript auf jeder Seite ruft `location.replace(<href des Links „Im Zwergenplan öffnen“>)` auf. Das Ziel ist `/?angebot=<id>` bzw. `/?anbieter=<id>`. Daten werden nicht in das Skript interpoliert.
   - Nicht weitergeleitet werden nur Abrufer, die JavaScript ausführen könnten: `/facebookexternalhit|Facebot|Twitterbot|bot\b|crawler|spider/i`. iMessage rendert Vorschauen mit JavaScript und sendet `facebookexternalhit … Twitterbot` ([Netlify-Forum](https://answers.netlify.com/t/cant-get-open-graph-previews-working-in-imessage-with-netlify-prerendering/87487)).
   - WhatsApp holt per GET ohne JavaScript ([Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)) und steht deshalb nicht in der Liste, damit In-App-Browser mit „WhatsApp“ im User-Agent weitergeleitet werden.
   - Ohne JavaScript sieht man eine kleine Seite mit Titel, Termin und dem Link. Sie folgt nur der System-Darstellung.
   - Vorschauseiten und `404.html` sind eigene Dokumente. Die Regel „genau zwei Inline-Skripte“ gilt nur für `index.html`.
4. **`404.html`** (vom Build erzeugt) leitet `/angebot/<id>/` und `/anbieter/<id>/` für unbekannte IDs in die App weiter. Dort meldet ein Toast, dass es das Angebot nicht mehr gibt. Andere unbekannte Pfade zeigen einen Link zur Startseite.
5. **Service Worker unverändert** (ADR 0013): Die neuen Pfade fallen unter „sonst nur Netz“. Sie werden nie vorgehalten und nie abgefangen. Ein Unit-Test in `src/sw/routes.test.ts` hält das fest.
6. **`index.html` bekommt generische `og:`-Tags.** Das Vorschaubild `public/og/vorschau-v1.jpg` (1200 × 630, unter 100 kB; Meta verlangt für WhatsApp < 600 kB, ≥ 300 px Breite, Seitenverhältnis ≤ 4 : 1) entsteht reproduzierbar aus `design/icon.svg` über `scripts/icons.ts`, mit der gebündelten Schrift per `@font-face`, und wird committet wie die Icons.
7. **Geräte-APIs fürs Teilen** (`navigator.share`, `navigator.clipboard`) nur in `src/data/share.ts`, wie Geolocation mit injizierbarer API. Scheitern Teilen und Kopieren, zeigt die App den Link in einem markierbaren Feld.
8. **Stufe 2: Merkliste im Fragment.** Die Merkliste darf in genau einer Form in eine URL: im Fragment `#merkliste=1.<kurz-ids>` (Format v1). Sie entsteht nur auf ausdrücklichen Tipp auf „Liste teilen“.
   - Kurz-IDs sind 8 Zeichen `[0-9a-z]` aus einem Hash der stabilen ID (ADR 0003). Haben zwei aktuelle IDs dieselbe Kurz-ID, warnt der Build (`::warning::`, kein Abbruch, ADR 0016), und der Empfang verwirft die mehrdeutige Kurz-ID. Häufen sich Kollisionen, kommt Format v2.
   - Das Fragment erreicht nie einen Server und nie ein Log. Die App liest es einmal (`takeSharedFragment` in `src/data`, StrictMode-fest), entfernt es sofort aus der Adresszeile und schreibt es nie in eine Query oder einen Request.
   - Das gilt ebenso für gemerkte Anbieter (Plan 0025, dort „nie in URL“).
   - Die Empfängerin übernimmt Einträge nur auf Tipp und nur hinzufügend, nie überschreibend.
   - Geburtsdatum, Startpunkt, Filter und Darstellung stehen nie darin.

## Alternativen

- **Cloudflare Worker vor der Domain** mit dynamischen `og:`-Tags: Den Push-Worker gibt es schon (ADR 0014). Dafür müsste aber die Domain zu Cloudflare umziehen oder ein zweiter Host her, und es entstünde ein Laufzeitdienst im Pfad jeder Navigation. Für rund 400 Seiten, die sich nur mit dem Datenstand ändern, ist statisch einfacher.
- **Nur `?angebot=` teilen**: kostet nichts, aber jede Vorschau ist gleich und sagt nichts. Das verfehlt den Wunsch.
- **`meta http-equiv="refresh"`** zusätzlich zum Skript: Manche Abrufer folgen ihm (der Facebook-Crawler folgt Weiterleitungen und liest dann die Tags des Ziels). Dann stünde in der Vorschau wieder die generische `index.html`. Ohne JavaScript bleibt der sichtbare Link.
- **Merkliste mit vollen IDs**: Im Median sind sie 95 Zeichen lang, bei 30 Einträgen also etwa 3 000 Zeichen. Kurz-IDs brauchen für 30 Einträge etwa 280 Zeichen URL. Aufgelöst wird ohnehin gegen `site.json`, und eine verschwundene ID ließe sich auch mit voller Länge nicht mehr anzeigen.
- **Merkliste in der Query**: Die Query landet in Server-Logs (GitHub Pages) und im Referrer. Das Fragment nicht.

## Konsequenzen

- Das Deploy-Artefakt wächst um etwa 410 kleine HTML-Dateien (Stand 2026-10-08: 333 Angebote, 74 Anbieter, je etwa 1,5–2,5 kB), dazu die `404.html` und das Vorschaubild. Heute sind es schon 1 865 ICS-Dateien. Die Build-Zeit wächst um Millisekunden.
- Eine Vorschau zeigt den Stand des letzten Deploys. Die App zeigt immer den aktuellen Stand. Vorschauen, die schon im Chat stehen, cacht der Messenger. Deshalb steht in der Vorschau kein „nächster Termin“ für regelmäßige Angebote, sondern der Rhythmus (Plan 0026, E3).
- Verschwindet ein Angebot aus den Daten, fehlt seine Seite. Dann antwortet Pages mit der `404.html`, die Vorschau ist leer oder generisch, und die App sagt „gibt es nicht mehr“.
- iOS öffnet Links nie in der Home-Bildschirm-App. Wer dort die App nutzt, landet in Safari, mit eigenem `localStorage`. Eine in Safari übernommene Merkliste landet nicht in der App. Ob dafür ein Einfügefeld in der App nötig ist, entscheidet der Gerätetest von Stufe 2 (Plan 0026, E14, N3).
- `docs/architecture.md` bekommt Datenfluss, Pfadvertrag und die Fragment-Ausnahme. Plan 0003, Zeile 75 bekommt mit Stufe 2 einen Vermerk.
