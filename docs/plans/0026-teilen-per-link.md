# Plan 0026 – Teilen per Link: Angebote, Anbieter und Merkliste

Status: in Umsetzung (Stufe 1, Branch `teilen-0026-s1`; Stufe 2 nach Plan 0025). Review eingearbeitet, Nutzerentscheide N1–N4 vom 2026-10-08 siehe „Offene Punkte“, N4 für Angebote ersetzt durch Nachtrag A (Kachelbild je Angebot). Zwei Etappen: **Stufe 1** (Angebote und Anbieter) ist unabhängig umsetzbar. **Stufe 2** (Merkliste) wird eigens gemergt, nach Plan 0025 (Nutzerentscheid N1).
Datum: 2026-10-08
Bezug:
- ADR 0002 (Datenfluss), ADR 0003 (stabile IDs), ADR 0009 (`noindex`), ADR 0012 (Startbudget), ADR 0013 (Service Worker), ADR 0016 (nächtlicher Deploy), **neu ADR 0020** (Entwurf, im selben Commit)
- Plan 0003 (Merkliste nie in der URL), Plan 0010 (Anbieter-Sheet), Plan 0022 (keine „Sticker“-Begriffe, umgesetzt), Plan 0023 (Zeitraumfilter `von=`/`bis=`, umgesetzt), Plan 0024 (Karte, umgesetzt), Plan 0025 (Merkliste als Planungszentrale, „Anbieter merken“)

## Ziel

Nutzerwunsch vom 2026-10-08, wörtlich:

> „Einzelne Veranstaltungen oder Anbieter über eine Teilenfunktion mit anderen teilen, sodass dann über einen Deep Link in die Anwendung und mit einer guten Metadaten-HTML-Beschreibung über WhatsApp das Ganze geteilt werden kann.“
> „Man soll die Merkliste via Link über eine URL, in die alles hineinkopiert ist, teilen können, ebenso wie einzelne Veranstaltungen oder Anbieter.“

Leitlinien:

1. **Ein Tipp.** „Teilen“ öffnet das System-Teilen-Menü (WhatsApp, Signal, Mail …). Wo es das nicht gibt, wird der Link kopiert, mit Toast.
2. **Die Vorschau sagt, worum es geht.** Im Chat stehen Titel, wann, wo, für welches Alter und was es kostet, dazu das Zwergenplan-Bild.
3. **Ein Tipp auf den Link öffnet das Angebot in der App**, nicht eine Zwischenseite.
4. **Geteilt wird nur Öffentliches.** Geburtsdatum, Startpunkt, Filter, Darstellung und Ansicht stehen nie im Link. Die Merkliste steht nur dann in einem Link, wenn man sie ausdrücklich teilt, und nur im Fragment.
5. **Nichts wird still überschrieben.** Eine empfangene Merkliste ergänzt die eigene nur auf Tipp.

## Nicht-Ziele

- **Bild je Kategorie** und **Bild je Anbieter** in der Vorschau: Anbieter, Startseite und Merkliste nutzen das generische Bild (E5). Angebote bekommen seit Nachtrag A ein eigenes Kachelbild (E16).
- **Umzug per QR-Code** auf ein anderes Gerät: zurückgestellt, steht in `docs/ideas.md` (Plan 0022). Die Kodierung aus Stufe 2 ist so gebaut, dass sie wiederverwendbar wäre (Versionsfeld).
- **Teilen-Knopf auf den Kacheln** in Liste, Kalender und Karte. Geteilt wird aus dem Detail und dem Anbieter-Sheet.
- **Filter oder Suchen teilen** (`?kat=…`): Das geht schon heute mit der Adresszeile, nur ohne eigene Vorschau.
- **Offline teilen bzw. öffnen**: Eine Vorschauseite ohne Netz zeigt den Fehler des Browsers (E7).
- **Link-Vorschau prüfen oder erzwingen** bei Messengern. Was WhatsApp cacht, liegt nicht in unserer Hand.
- **Kurz-URLs** über einen Dienst: Das wäre ein Drittanbieter (Privatsphäre-Invariante).
- **Merkliste synchron halten** zwischen Geräten oder Personen: Ein geteilter Link ist eine Momentaufnahme.

## Ausgangslage

- **Deep Links**: `src/domain/route.ts:32–44` (`parseRoute`) liest `?angebot=` (geprüft mit `OFFER_ID_PATTERN`) und `?anbieter=` (`KEBAB_ID_PATTERN`, höchstens 80 Zeichen). Der Kopfkommentar `route.ts:1–4` sagt: „Links werden geteilt – Geburtsdatum, Merkliste und Darstellung gehören deshalb nie hierher.“ Das steht auch in Plan 0003, Zeile 75. `routeToSearch` (`route.ts:47–53`) baut die kanonische Query, seit Plan 0023 samt `von=`/`bis=` aus `filterToSearch`.
- **URL-Pflege**: `src/ui/use-app-state.ts:33–36` (`urlFor`) baut `pathname + search`, **ohne Fragment**. Jedes `replace` würde ein `#…` also verwerfen. Das ist für Stufe 2 wichtig (E12).
- **Unbekanntes Angebot**: `src/ui/App.tsx:136–139` entfernt `?angebot=` still, wenn es das Angebot nicht gibt, ohne jeden Hinweis. Ein unbekannter Anbieter meldet sich im Sheet (`src/ui/ProviderPanel.tsx:135–138`, `isKnownProvider` in `src/domain/provider-count.ts:14`).
- **`index.html`**: hat `robots noindex, nofollow` (Zeile 6), `description` (Zeile 10) und genau zwei Inline-Skripte (Bootstrap-Regel, `docs/architecture.md`). `og:`-Tags gibt es nicht.
- **Build**:
  - `scripts/build-data.ts:38–39` löscht `public/data` und `public/ics` und schreibt dort hinein.
  - Die ICS-Schleife `:61–72` erzeugt heute 1 865 Dateien.
  - `public/` kopiert Vite unverändert nach `dist/`, ohne HTML-Transformation.
  - `.gitignore` nennt `public/data/` und `public/ics/`.
- **Daten** (Stand 2026-10-08):
  - 333 Angebote (117 regelmäßig, 170 Kurse, 46 einmalig), 74 Katalog-Einträge mit `role: anbieter`, davon 64 mit Angeboten.
  - Offer-IDs sind 48–167 Zeichen lang, im Median 95. Titel sind bis 83 Zeichen lang und enthalten `&` und `'`.
  - Der Horizont beträgt seit ADR 0016 12 Monate, der Bestand wächst also eher.
- **Service Worker**: `src/sw/routes.ts:45–52` (`RULES`), verdrahtet in `src/sw/sw.ts:66–77`. Die Navigation greift nur für `""` und `index.html` („schale“), alles andere ist `netz`. `scripts/vite-sw.ts:45–56` liest für den Precache nur `<script>` und `<link rel=stylesheet|modulepreload>`. `meta`-Tags stören also nicht.
- **Detail**: Im Kopf `src/ui/DetailDialog.tsx:83–88` (`.dhead`, `justify-content: space-between`, `dialog.css:64`) stehen „Zurück“ und das Herz (`HeartButton inline`). Das Detail liegt im Start-Bundle.
- **Anbieter-Sheet**: `src/ui/anbieter/ProviderSheet.tsx` liegt im Lazy-Chunk `assets/anbieter/`. Sein Fuß `:77–81` hat nur „Schließen“. Die Props stehen in `src/ui/provider-types.ts:38–48`.
- **Toast**: `useToast` steht in `src/ui/use-app-state.ts:178`. Dialoge bekommen ihn als Prop (`Overlays.tsx`), damit er im Top-Layer steht. Die Texte zum Merken lauten seit Plan 0022 „Gemerkt – liegt jetzt auf deiner Merkliste“ bzw. „Nicht mehr gemerkt“ (`App.tsx:162`). Neue Texte dieses Plans nennen ebenfalls keine „Sticker“.
- **Geräte-APIs**: Biome sperrt `navigator` in `src/ui` (`noRestrictedGlobals`). `src/data/geolocation.ts` ist das Muster mit injizierbarer API.
- **Texte**: Datumswörter (`WEEKDAYS`, `WD_SHORT`, `MONTHS`, `src/ui/format.ts:24–40`) liegen in `src/ui`, und `scripts/` darf `src/ui` nicht importieren (`docs/architecture.md`, Schichten). `rhythm`, `uniformTimes` (`src/domain/agenda.ts:206–222`), `berlinKey`, `berlinIsoDate` und `isoWeekday` (`time.ts`) sind schon in der Domäne.
- **Icons**: `scripts/icons.ts` rendert PNGs aus `design/icon.svg` mit Playwright-Chromium, ohne neues Paket, und schreibt nach `public/icons/` (committet).
- **Budget**: `JS (initial)` 100 kB. Den letzten Stand führt die Delta-Tabelle in ADR 0012: **94,26 kB** nach den Plänen 0022–0024 (Stand `main` d5fab1b), Rest 5,74 kB. **Vor der Umsetzung neu messen**, falls inzwischen weitere Pläne gemergt sind. `dist/angebot/**` fällt nicht unter ein Budget, denn die Muster in `.size-limit.json` greifen nur in `dist/assets/` und `dist/data/`.
- **Merkliste**: `src/data/preferences.ts:9, 44, 52` (`zwergenplan.merkliste`, JSON-Array von IDs). `src/domain/saved.ts:1–4`: Unbekannte IDs werden nur ausgeblendet, nie gelöscht.
- **Plan 0025** (Branch `origin/plan-0025-merkliste`, `docs/plans/0025-merkliste-als-planungszentrale.md`):
  - baut `SavedView` um: Liste, Karte und Kalender, der Tab „Kalender“ entfällt,
  - bringt „Anbieter merken“ mit dem Schlüssel `zwergenplan.anbieter-merkliste` (Zeile 112),
  - legt fest, dass gemerkte Anbieter „nie in URL“ stehen (Zeile 122). Stufe 2 ändert das für das Fragment ebenso wie für die Merkliste (ADR 0020).
- **StrictMode**: `src/main.tsx:11` rendert in `<StrictMode>`, `useState`-Initialisierer laufen in der Entwicklung also doppelt. `use-app-state.ts:53–54` verlässt sich deshalb auf einen Lader, der sich das Ergebnis merkt. Das ist das Muster für Stufe 2 (E12).
- **ADR-Nummer**: Auf `main` und allen Branches ist 0019 die letzte. 0020 ist frei, die Pläne 0022–0025 könnten sie aber ebenfalls beanspruchen.

## Entscheidungen – Stufe 1 (Angebote und Anbieter)

### E1 – Geteilt wird die Vorschauseite, nicht die Query-URL

- Der Knopf teilt `https://zwergenplan.app/angebot/<offerId>/` bzw. `…/anbieter/<providerId>/`. Nur diese URL hat eigene `og:`-Tags, `/?angebot=` liefert immer die generische `index.html`.
- **Pfade**: `angebot/` und `anbieter/`, genau wie die Query-Namen. Sie sind lesbar, und die Länge spielt bei 95 Zeichen ID keine Rolle. Abschließender Schrägstrich, damit Pages `index.html` ohne 301 liefert.
- Einzige Quelle ist `src/domain/share.ts` (rein, im Start-Bundle):
  ```ts
  const SHARE_DIRS = { offer: "angebot", provider: "anbieter" } as const; // nicht exportiert (knip)
  /** relativ zur Basis, z. B. „angebot/<id>/“ */
  export function offerSharePath(offerId: string): string;
  export function providerSharePath(providerId: string): string;
  /** Ziel in der App, relativ zur Basis: „?angebot=<id>“ bzw. „?anbieter=<id>“, kanonisch über routeToSearch */
  export function offerAppSearch(offerId: string): string;
  export function providerAppSearch(providerId: string): string;
  ```
  Build (Generator, `404.html`) und App (Knopf) nutzen dieselben Funktionen. Die absolute URL baut `src/data/share.ts` aus `location.origin` und der Basis (`assetUrl`), damit sie im E2E-Build auf den Testserver zeigt.
- **Was der Empfänger erlebt:**
  - Tipp im Chat → Browser lädt die Vorschauseite (≈ 2 kB, nichts weiter) → Skript ersetzt sie sofort durch `/?angebot=<id>` → die App öffnet das Detail.
  - „Zurück“ führt nicht zurück auf die Zwischenseite (`location.replace`).
  - Android mit installierter App: Chrome öffnet Links im Scope oft direkt in der App (WebAPK). Die Weiterleitung läuft dann dort.
  - iOS: Links öffnen immer in Safari, nie in der Home-Bildschirm-App. Das ist eine Plattformgrenze und für Empfänger ohne App ohnehin richtig. Für Stufe 1 hat es keine Folgen: Wer in Safari merkt, merkt dort. Für Stufe 2 siehe E14.

### E2 – Vorschauseiten entstehen in `build-data`, rein generiert

- Neues Modul **`scripts/lib/share-pages.ts`** (rein: kein I/O, keine Uhr, importiert nur `src/domain` und `site.config.ts`):
  ```ts
  export interface SharePage { path: string; html: string }
  export function offerSharePage(offer: SiteOffer, generatedAt: string): SharePage;
  export function providerSharePage(provider: SiteProvider, offers: readonly SiteOffer[], generatedAt: string): SharePage;
  export function notFoundPage(): string;           // 404.html, E7
  export function checkSharePages(pages: readonly SharePage[]): string[]; // Fehler, E4
  // escapeHtml (& < > " ') bleibt modulintern; getestet wird es über die Ausgabe der Seiten (knip, Review m12)
  ```
  `notFoundPage` braucht die Muster aus `src/domain/share.ts`. Dafür exportiert `share.ts` höchstens eine Funktion `sharePathPattern(kind)`, und nur, wenn die Umsetzung sie wirklich von außen braucht. Exportiert wird nur, was ein anderes Modul importiert.
- `scripts/build-data.ts`:
  - löscht zusätzlich `public/angebot`, `public/anbieter` und `public/404.html` (Zeile 39),
  - schreibt nach den ICS-Dateien für jedes `site.offers` und jeden Eintrag von `directory.providers` eine Seite,
  - schreibt `public/404.html`,
  - meldet „✓ Vorschauseiten: N Angebote, M Anbieter, größte X kB“.
- `.gitignore` bekommt `public/angebot/`, `public/anbieter/` und `public/404.html` mit dem Kommentar „generiert von scripts/build-data.ts (Plan 0026)“.
- **Determinismus**: Die Ausgabe hängt nur an Daten, `generatedAt` und `SITE_URL`. Zweimal bauen ergibt dieselben Bytes; das prüft ein Unit-Test (Tests 1).
- **Pfade sind sicher**: Der Generator prüft `OFFER_ID_PATTERN` bzw. `KEBAB_ID_PATTERN` und wirft sonst. Das Schema garantiert das schon, der Wurf ist die zweite Linie gegen Pfad-Tricks (`..`).
- **Fixture-Build**: `ZWERGENPLAN_DATA=fixture` erzeugt die Seiten aus `tests/fixtures/` nach `dist-e2e/` wie alles andere. In `dist/` kommen nie Fixture-Seiten (Invariante „Testdaten gehen nie live“).

### E3 – Texte der Vorschau: Rhythmus statt „nächster Termin“

Der Vorschlag „Babyschwimmen · Mi 14. Okt., 10:00“ ist für **regelmäßige** Angebote problematisch:
- Die Seite entsteht beim Deploy. Läuft der Nachtlauf (ADR 0016) noch nicht täglich, liegen Deploys Tage auseinander.
- WhatsApp cacht die Vorschau zur URL.
- Ein „nächster Termin“ wäre also bald falsch, und der Build hinge an der Uhr.

Deshalb gilt je Format (alle Zeiten in Berlin, über `time.ts`):

| Format | `og:title` | Beispiel |
|---|---|---|
| einmalig | `{title} · {Wd} {T}. {Monat kurz} {Jahr}, {Uhr}` | „Babykonzert im Advent · So 6. Dez. 2026, 10:00“ |
| kurs | `{title} · Kurs ab {Wd} {T}. {Monat kurz}, {n} Termine` | „PEKiP-Gruppe Herbst-Babys · Kurs ab Di 13. Okt., 8 Termine“ |
| regelmäßig, `rhythm(offer, ref)?.weekly` | `{title} · jeden {Wochentag}, {Uhr}` (Uhr nur bei `uniformTimes(upcomingSessions(offer, ref))`) | „Offener Krabbeltreff · jeden Mittwoch, 9:30“ |
| regelmäßig, gleicher Wochentag, nicht wöchentlich | `{title} · {Wochentag}s` | „… · Samstags“ |
| regelmäßig, sonst | `{title} · regelmäßig` | |

- Einmalig und Kurs: Das Datum ist ein fester Teil der ID (ADR 0006) und veraltet nicht. Ist der Termin vorbei, solange das Angebot noch in den Daten steht, zeigt die App das Ende.
- „Jetzt“ ist `const ref = new Date(generatedAt)` des Datenstands, wie bei den ICS-Dateien (`icsContextFor`). `rhythm(offer, ref)` und `uniformTimes(upcomingSessions(offer, ref))` bekommen genau dieses `Date`, nie `new Date()`.
- **Monatsnamen kurz**: „Jan.“, „Feb.“, „März“, „Apr.“, „Mai“, „Juni“, „Juli“, „Aug.“, „Sept.“, „Okt.“, „Nov.“, „Dez.“. Das bloße Abschneiden auf drei Zeichen wie in `weekTitle` (`format.ts:78`) ergäbe „Mai.“, „Jun.“ und „Jul.“. `labels.ts` bekommt deshalb eine eigene Liste `MONTHS_SHORT`, mit Testfall für Mai, Juni und Juli. `weekTitle` stellt bei der Gelegenheit darauf um; das ändert dort „Jun.“ zu „Juni“, ein bewusster Nebeneffekt, und der Test in `format.test.ts` wird angepasst.
- **Länge**: `og:title` wird deterministisch auf höchstens 110 Zeichen gekürzt: Ist er länger, wird der Titelteil am Wortende gekürzt und endet mit „…“, der Teil „ · {wann}“ bleibt stehen. Ein ungewöhnlich langer Titel aus dem Nachtlauf (ADR 0016) bricht den Build also nie.
- `og:description` (höchstens 200 Zeichen, gekürzt am Wortende mit „…“): `{Ort}, {Stadtteil} · {Alter} · {Kosten} · {Anmeldung} – {Anbieter}`.
  - Beispiel: „Familientreff Beispielhaus, Gostenhof · 0–12 Monate · Kostenlos · Ohne Anmeldung – Familientreff Beispiel“.
  - Die Bausteine sind dieselben Texte wie im Detail (`costLabel`, `registrationLabel`, `ageRangeLabel`).
- **Anbieter**: `og:title` = Name. `og:description` = `{n} kommende Angebote im Zwergenplan · {Kategorien, höchstens 3} · {Stadtteile, höchstens 3}`. „Kommend“ zählt wie das Sheet (`providerOffers` in `src/domain/directory.ts:149–151`: `nextSession(o, ref) !== undefined`), relativ zu `ref = new Date(generatedAt)`. Der Generator importiert dafür `nextSession` aus `agenda.ts` direkt, nicht `directory.ts` (Regel `directory-only-lazy`). Bei 0 Angeboten steht nur „Im Zwergenplan“ davor.
- `<title>` = `og:title` + „ – Zwergenplan“. Dazu kommt `<meta name="description">` mit dem Text von `og:description`.
- **Wo die Texte liegen**: Datumswörter (samt `MONTHS_SHORT`) und die drei Label-Funktionen ziehen aus `src/ui/format.ts` nach **`src/domain/labels.ts`** (rein). `format.ts` re-exportiert sie, damit keine Aufrufer wandern; das Bundle bleibt gleich (Tree-Shaking). So gibt es keine zweite Schreibweise. Die Kombination für die Vorschau steht in `scripts/lib/share-pages.ts`, denn nur der Build braucht sie.

### E4 – Aufbau der Seite, Weiterleitung, Bots

Vorlage (Platzhalter in `{}` sind escaped, `SITE_URL` aus `site.config.ts`):

```html
<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>{title} – Zwergenplan</title>
<meta name="description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zwergenplan">
<meta property="og:locale" content="de_DE">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{SITE_URL}angebot/{id}/">
<meta property="og:image" content="{SITE_URL}og/vorschau-v1.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Zwergenplan – Angebote für Kinder unter 3 in Nürnberg">
<meta name="twitter:card" content="summary_large_image">
<style>/* ≈ 15 Zeilen: Systemschrift, zentriert, Hintergrund, Text- und Linkfarbe für hell und
   @media (prefers-color-scheme: dark) selbst gesetzt, Link ≥ 44 px hoch */</style>
</head>
<body>
<main>
<p>Zwergenplan</p>
<h1>{title}</h1>
<p>{description}</p>
<p><a id="go" href="/?angebot={id}">Im Zwergenplan öffnen</a></p>
</main>
<script>/* SHARE_REDIRECT, für alle Seiten gleich */</script>
</body>
</html>
```

- **`SHARE_REDIRECT`** ist eine Konstante in `share-pages.ts` (für alle Seiten byte-gleich, getestet):
  ```js
  if (!/facebookexternalhit|Facebot|Twitterbot|bot\b|crawler|spider/i.test(navigator.userAgent)) location.replace(document.getElementById("go").href);
  ```
  - Keine Daten im Skript, also kein Escaping-Risiko in JS.
  - Das Ziel ist das `href` des sichtbaren Links, eine Quelle für Mensch und Skript.
  - **Die Bot-Ausnahme gilt nur für Abrufer, die JavaScript ausführen** (Review M1).
    - WhatsApp holt die Vorschau per einfachem GET (User-Agent `WhatsApp/2.x`) und führt kein JavaScript aus ([Meta: Link-Vorschauen](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)). `location.replace` wirkt dort ohnehin nicht, „WhatsApp“ gehört deshalb nicht in die Liste.
    - In-App-Browser mit „WhatsApp“ oder „Signal“ im User-Agent würden sonst nicht weitergeleitet.
    - iMessage rendert die Vorschau mit JavaScript und sendet einen User-Agent mit `facebookexternalhit … Twitterbot` ([Erfahrungsbericht Netlify-Forum](https://answers.netlify.com/t/cant-get-open-graph-previews-working-in-imessage-with-netlify-prerendering/87487)). Ohne Ausnahme sähe iMessage nach der Weiterleitung die generische `index.html`.
    - `bot\b`, `crawler` und `spider` fangen weitere JS-fähige Abrufer wie `Googlebot`. Dass dabei auch `TelegramBot` passt, schadet nicht, denn der führt ohnehin kein JavaScript aus.
  - Ob die Vorschauen wirklich ankommen, prüft der Gerätetest (Schritt 9).
  - `href` ist bei `BASE = "/"` absolut-pfadig (`/?angebot=…`). Der Generator setzt `BASE` aus `site.config.ts` davor, nicht fest `/`.
- **Kein `meta refresh`** (ADR 0020, Alternativen): Ein Abrufer, der ihm folgt, läse die Tags der generischen `index.html`.
- **`og:url` ist die Seite selbst.** Zeigte sie auf `/?angebot=`, holte Facebooks Abrufer dort die generische Vorschau.
- **Ohne JavaScript** (selten, z. B. Lesemodus oder blockiertes JS) sieht man Titel, Beschreibung und einen deutlichen Link. Das ist eine eigene „Ansicht“, deshalb mit Mobile-UX-Gate (Tests 7).
- **Darstellung nur nach System** (Review m6): Die Seite folgt allein `prefers-color-scheme`. Die gewählte Darstellung (`zwergenplan.darstellung`, `data-theme`) liest sie nicht. Das hieße ein zweites Skript mit `localStorage` auf einer Seite, die man meist nur Millisekunden sieht. Die Farben für Hintergrund, Text und Link stehen für beide Schemata ausdrücklich im `<style>` (Kontrast ≥ 4,5 : 1, axe), nicht als Browser-Standard.
- **Größe**: Ziel ≤ 2,5 kB je Seite. Titel (110 Zeichen, E3) und Beschreibung (200 Zeichen) werden deterministisch gekürzt, die Seite hat also eine feste Obergrenze. `checkSharePages` meldet trotzdem jede Seite über 4 kB. Das ist ein Wächter gegen Bugs im Generator, nicht gegen Daten, und darf den Build abbrechen (Exit 1).

### E5 – Vorschaubild und `og:`-Tags in `index.html`

- **Bild** `public/og/vorschau-v1.jpg`: 1200 × 630 (1,91 : 1), JPEG, Ziel < 100 kB. Motiv: App-Icon links auf Papierfläche, rechts „Zwergenplan“ und „Angebote für Kinder unter 3 in Nürnberg“.
  - Vorgaben von Meta für WhatsApp ([Link-Vorschauen](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)): unter 600 kB, mindestens 300 px breit, Seitenverhältnis höchstens 4 : 1. 1200 × 630 unter 100 kB erfüllt das mit Abstand.
  - Es entsteht reproduzierbar in `scripts/icons.ts` als weitere Variante (`page.screenshot({ type: "jpeg", quality: 85 })`) und wird committet wie die Icons.
  - **Schrift reproduzierbar**: Die Seite für den Screenshot lädt die gebündelte Bricolage-woff2 aus `node_modules/@fontsource-variable/bricolage-grotesque/files/` per `@font-face` (als `data:`-URL eingebettet) und wartet auf `document.fonts.ready`. Ohne das hinge der Schriftzug an den Systemschriften des Rechners.
  - Das `-v1` im Namen umgeht Caches bei einem späteren Wechsel.
- **`index.html`** bekommt dieselben generischen Tags: `og:title` „Zwergenplan“, `og:description` = bisherige `description`, `og:url` = `SITE_URL`, `og:image` samt Maßen, `twitter:card`. Davon profitieren Links auf die Startseite und die Merkliste (Stufe 2).
  - `SITE_URL` steht nur in `site.config.ts`. `index.html` bekommt den Platzhalter `%ZP_SITE_URL%`, den ein kleines Inline-Plugin in `vite.config.ts` per `transformIndexHtml` ersetzt (`{ name: "zp-site-url", transformIndexHtml: (h) => h.replaceAll("%ZP_SITE_URL%", SITE_URL) }`).
  - Bleibt der Platzhalter stehen, wirft das Plugin (Prüfung `includes("%ZP_")` nach dem Ersetzen).
  - Die Bootstrap-Regel („genau zwei Inline-Skripte“) bleibt unberührt, es kommen nur `meta`-Tags dazu. `__SW_VERSION__` ändert sich einmal, weil es `index.html` hasht. Das ist gewollt.

### E6 – Knopf „Teilen“ und `src/data/share.ts`

- **`src/data/share.ts`** (einziger Ort für `navigator.share` und `navigator.clipboard`):
  ```ts
  export type ShareOutcome = "geteilt" | "kopiert" | "abgebrochen" | "fehler";
  export interface ShareApi { share?: (d: ShareData) => Promise<void>; writeText?: (t: string) => Promise<void> }
  /** absolute URL zu einem Pfad relativ zur Basis (location.origin + assetUrl) */
  export function absoluteUrl(path: string): string;
  export async function shareLink(data: { title: string; url: string }, api: ShareApi = browserShareApi()): Promise<ShareOutcome>;
  ```
  - Mit `share`: `share({ title, url })`, **ohne `text`**. WhatsApp setzt sonst Text und URL doppelt; die Vorschaukarte trägt den Inhalt.
    - `AbortError` → `"abgebrochen"` (kein Toast).
    - `InvalidStateError` (ein Teilen-Menü ist schon offen, etwa nach Doppeltipp) → `"abgebrochen"`, still, kein Kopieren (Review M2, eigener Unit-Test).
    - `NotAllowedError`/`TypeError` → weiter zum Kopieren.
  - Ohne `share` oder nach dem Fehler: `writeText(url)` → `"kopiert"`, scheitert das → `"fehler"`.
  - `browserShareApi()` bindet `navigator.share` und `navigator.clipboard.writeText` nur, wenn sie da sind (`canShare` wird nicht gebraucht, bei URLs ist es immer wahr).
  - **Synchroner Aufruf im Tipp-Handler**: Safari verlangt eine Nutzer-Aktivierung. Deshalb gibt es kein `import()` und kein `await` vor `share`; das Modul liegt im Start-Bundle (Budget: E9).
- **UI-Hilfe** `useShare(say)` in `src/ui/use-app-state.ts`, gibt `share: (target: { title: string; path: string }) => void` und den Zustand `manualLink: string | undefined` samt `closeManualLink` zurück. Sie ruft `shareLink` und reagiert so:
  - `"kopiert"` → Toast „Link kopiert – zum Einfügen in WhatsApp & Co.“
  - `"fehler"` → **Sheet „Link zum Teilen“** (Review M2). Ein Toast mit „Adresse oben“ trüge nicht: In der installierten App gibt es keine Adresszeile, und nach einem abgelehnten `share()` scheitert auf iOS wahrscheinlich auch `writeText`.
    - Inhalt: Satz „Halte den Link gedrückt, um ihn zu kopieren.“, darunter ein `<input type="url" readOnly>` (≥ 16 px Schrift, volle Breite) mit der Vorschau-URL. Beim Öffnen ist der Text markiert (`select()` im Effekt nach `showModal`). Fuß: „Fertig“.
    - Komponente `ManualLinkSheet` in `src/ui/Sheets.tsx`, gerendert in `Overlays.tsx` wie die anderen Sheets. Das Sheet liegt über einem offenen Detail bzw. Anbieter-Sheet (Top-Layer, späterer `showModal` liegt oben).
  - `"geteilt"` / `"abgebrochen"` → nichts (das System hat schon Rückmeldung gegeben).
  - Texte als Konstanten in `src/ui/format.ts` (`SHARE_COPIED`, `SHARE_MANUAL_HINT`).
- **Detail** (`DetailDialog.tsx:83–88`): Rechts im Kopf steht eine Gruppe `<div className="dhead-actions">` mit `iconbtn` „Teilen“ (Icon `share`, `aria-label="Teilen"`, 44 × 44) und danach dem Herz. Neue Prop `onShare: (offer: SiteOffer) => void`, verdrahtet in `Overlays.tsx`/`App.tsx` mit `share({ title: offer.title, path: offerSharePath(offer.id) })`.
- **Anbieter-Sheet** (`ProviderSheet.tsx:77–81`): Der Fuß wird zu `Teilen` (`btn`, Icon `share`) + `Schließen` (`btn primary`), im vorhandenen `.sheetfoot` (Flex-Wrap, bricht bei 200 % Schrift um). Neue Prop `onShare: (provider: { id: string; name: string }) => void` in `ProviderSheetProps` (`provider-types.ts`), gesetzt in `Overlays.tsx`. Das Sheet ruft sie synchron im Klick.
- **Icon** `share` in `icons.tsx`: Strich-Icon „Kasten mit Pfeil nach oben“, kennen beide Plattformen. `PATHS.share = "M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"`.
- **Privatsphäre**: Der Pfad entsteht nur aus der ID, nie aus `location`. Aktive Filter (auch der Zeitraum `von=`/`bis=` aus Plan 0023), Ansicht, Geburtsdatum und Startpunkt können also nicht hineingeraten (E2E, Tests 6).

### E7 – Weg verschwundener Angebote: `404.html` und Hinweis in der App

- `notFoundPage()` erzeugt `public/404.html` (Pages liefert sie für jeden unbekannten Pfad mit Status 404):
  - `noindex`, kein `og:` (eine Vorschau für „gibt es nicht“ wäre irreführend; der Messenger zeigt dann den Link ohne Karte).
  - Ein eigenes Inline-Skript (die Regel „genau zwei Inline-Skripte“ gilt nur für `index.html`, E8) ordnet `^{BASE}angebot/([a-z0-9-]{1,200})/?$` → `{BASE}?angebot=$1` und `^{BASE}anbieter/([a-z0-9-]{1,80})/?$` → `{BASE}?anbieter=$1` zu, sonst kein Sprung. Die App prüft die IDs danach noch einmal (`parseRoute`).
  - Sichtbar: „Diese Seite gibt es im Zwergenplan nicht (mehr).“ und der Link „Zum Zwergenplan“ (ohne JavaScript).
- **Hinweis in der App**: `App.tsx:136–139` ruft vor `closeDetail()` zusätzlich `say("Dieses Angebot ist nicht mehr im Zwergenplan.")`. Das gilt für jede unbekannte `?angebot=`, auch für alte Lesezeichen. Ein unbekannter Anbieter meldet sich wie bisher im Sheet.
- **Service Worker**: Die Navigation auf `angebot/…`/`anbieter/…` ist `netz` (ADR 0013, Regel „sonst nur Netz“). Offline zeigt der Browser seinen Fehler. Eine Schalen-Antwort hülfe nicht, denn die App liest nur die Query. Bewusst so (Nicht-Ziel).

### E8 – Kein neues Paket, keine Schemaänderung, ein ADR

- Kein npm-Paket, kein Schemafeld, keine neue Schicht.
- **ADR 0020 ist trotzdem nötig**:
  - Die Pfade sind ein dauerhafter öffentlicher Vertrag.
  - Die Bot-Ausnahme und der Verzicht auf `meta refresh` sind Entscheidungen, die man später sonst „repariert“.
  - Stufe 2 ändert die Regel „Merkliste nie in der URL“.
  - ADR 0002 und 0013 werden ergänzt, nicht geändert. Der Entwurf liegt als `docs/adr/0020-teilen-per-link.md` im selben Commit wie dieser Plan.
- `docs/architecture.md`:
  - Datenfluss: neue Zeile `public/angebot/<id>/, public/anbieter/<id>/, public/404.html (Vorschauseiten, Plan 0026, ADR 0020)`.
  - Schichten: `scripts/lib/share-pages.ts` rein, `src/data/share.ts` als Geräte-API, `src/domain/share.ts` und `labels.ts`.
  - Service Worker: ein Satz, dass die Vorschauseiten unter „sonst nur Netz“ fallen.
  - Bootstrap: Die Regel „genau zwei Inline-Skripte“ gilt nur für `index.html`. Vorschauseiten und `404.html` sind eigene Dokumente mit je einem eigenen, festen Inline-Skript ohne Daten- oder Gerätezugriff (nur `navigator.userAgent` und `location`).
  - Privatsphäre: Ein geteilter Link enthält nur eine öffentliche ID (Stufe 2: Fragment).

### E9 – Budget und Größen

- **Start-JS**: `src/domain/share.ts` (Pfade), `src/data/share.ts`, `useShare`, `ManualLinkSheet`, Icon, Texte, Hinweis bei unbekanntem Angebot. Geschätzt +0,4–0,5 kB. Messen vorher und nachher, Zeile in der Delta-Tabelle von ADR 0012. Der Anbieter-Teil liegt im Lazy-Chunk `Anbieter JS` (6 kB, +≈ 0,05 kB).
- **Artefakt**: etwa 410 Seiten × ≈ 2 kB ≈ 0,8 MB roh, dazu das Bild < 100 kB. Die ICS-Dateien sind schon heute ein Vielfaches. Kein neues size-limit, dafür die harte 4-kB-Grenze je Seite (E4) und die Zählzeile im Build-Log.
- **Build-Zeit**: Strings bauen und rund 410 `writeFileSync`, gemessen erwartet unter 0,2 s. Läge es über 2 s, schreibt der Build eine `::warning::` wie bei der Wegzeit.

## Entscheidungen – Stufe 2 (Merkliste teilen)

> Eigene Etappe, eigener Branch, eigener Merge. Sie setzt Plan 0025 voraus (gemerkte Anbieter, neue `SavedView`). Vor dem Start von Stufe 2 werden E10–E15 an den gemergten Stand von 0025 angepasst: Ort des Knopfs und Name des Schlüssels für Anbieter.

> **Geändert durch Plan 0025 (Nachtrag aus dem Mockup):** Gemerkte Anbieter stehen nicht auf der Merkliste, sondern oben im Tab „Anbieter“. Gespeichert sind nur IDs (`zwergenplan.anbieter-merkliste`), Namen kommen aus `anbieter.json`. Anbieterzeilen im Sheet (E13) brauchen also `anbieter.json` oder zeigen nur die Zahl. Der Kopf der Merkliste hat Überschrift, Umschalter, Filter und Statuszeile mit rundem Export-Knopf; den Ort von „Liste teilen“ (E15) legt Stufe 2 neu fest.

### E10 – Kodierung v1: Kurz-IDs im Fragment

- Form: `{SITE_URL}#merkliste=1.{A}` bzw. mit Anbietern `…#merkliste=1.{A}.{P}`.
  - `1` ist die Formatversion.
  - `{A}` sind die Kurz-IDs der Angebote, `{P}` die der Anbieter, jeweils **ohne Trenner** aneinandergereiht (je genau 8 Zeichen).
  - Nur `[0-9a-z.]`: Kein Messenger schneidet das ab oder kodiert es um. Satzzeichen am Ende wie `,` oder `)` würden manche Link-Erkennungen abtrennen.
- **Kurz-ID** `shortId(id)`: cyrb53 (53-Bit-Hash, Seed 0) über die UTF-16-Zeichen der ID, dann `(h % 36 ** 8).toString(36).padStart(8, "0")`. Das sind 41 Bit, rein und synchron, etwa 15 Zeilen in `src/domain/share.ts`. Feste Testvektoren werden test-first ermittelt und eingefroren.
- **Kollisionen**:
  - Bei 1 000 IDs ist die Wahrscheinlichkeit etwa 2 · 10⁻⁷.
  - Trotzdem prüft `build-data` alle aktuellen Angebots-IDs und getrennt alle Anbieter-IDs (`findShortIdCollisions`). Gleiche Kurz-IDs ergeben **nur eine `::warning::`** „Kurz-ID-Kollision (Plan 0026, E10): … – Format v2 erwägen“, kein Exit 1. Ein harter Abbruch blockierte sonst den Nachtlauf (ADR 0016) wegen eines Komfort-Features (Review M4).
  - **Mehrdeutigkeit beim Empfang**: Passt eine Kurz-ID auf mehr als ein Element, verwirft `resolveShared` sie ganz. Sie zählt dann zu den „nicht mehr im Zwergenplan“. Es wird nie ein falsches Angebot gemerkt.
  - Ein späteres v2 hieße z. B. 10 Zeichen. Der Parser kennt die Version und lehnt Unbekanntes ab.
- **Länge**: 30 Angebote → `https://zwergenplan.app/#merkliste=1.` (37 Zeichen) + 240 = **277 Zeichen**, 100 Angebote ≈ 840. WhatsApp erlaubt etwa 65 000 Zeichen je Nachricht, die Link-Erkennung kommt mit Links ohne Sonderzeichen in dieser Länge zurecht.
- **Keine Kappung beim Senden** (Review m13, Simplicity): Geteilt wird die ganze Liste. Nur der Parser lehnt Fragmente mit mehr als 200 Einträgen je Gruppe ab (≈ 1 600 Zeichen), als Schutz gegen Unfug, nicht als Produktgrenze.
- Reine API in `src/domain/share.ts`:
  ```ts
  export interface SharedList { offers: string[]; providers: string[] } // Kurz-IDs
  export function encodeSharedList(offerIds: readonly string[], providerIds: readonly string[]): string; // „merkliste=1.…“
  export function parseSharedList(hash: string): SharedList | undefined; // „#merkliste=…“, sonst undefined
  export function resolveShared<T extends { id: string }>(items: readonly T[], shortIds: readonly string[]): T[];
  ```
  Duplikate fallen beim Kodieren weg, und die Reihenfolge bleibt erhalten.

### E11 – Was geteilt wird

- Angebote: genau die, die die Merkliste zeigt (`savedOffers(offers, savedIds, now)`, also kommende und bekannte). Vergangene oder verschwundene IDs bleiben zu Hause (sie würden beim Empfänger ohnehin fehlen).
- Anbieter (nach Plan 0025): alle gemerkten, die `isKnownProvider` kennt.
- Nicht dabei: Geburtsdatum, Startpunkt, Filter (auch nicht die der Merkliste aus Plan 0025), Darstellung, Ansicht. Der Link zeigt immer auf die Startseite (`SITE_URL`) plus Fragment.
- Die Vorschau im Chat ist generisch (E5): Crawler sehen das Fragment nicht. `navigator.share` bekommt deshalb `text`: „{n} Angebote aus meiner Zwergenplan-Merkliste“ (Singular „1 Angebot …“, mit Anbietern „… und {m} Anbieter“), damit der Chat sagt, worum es geht.

### E12 – Empfangen: Fragment einmal lesen, sofort entfernen

- **`takeSharedFragment()`** in `src/data/shared-fragment.ts`, nach dem Muster von `takeEarlyRequest` (`src/data/site.ts`):
  ```ts
  /** Liest `#merkliste=…` beim ersten Aufruf, entfernt das Fragment und merkt sich das Ergebnis; jeder weitere Aufruf liefert dasselbe. */
  export function takeSharedFragment(loc: Pick<Location, "hash" | "pathname" | "search"> = window.location,
                                     hist: Pick<History, "state" | "replaceState"> = window.history): SharedList | "ungueltig" | undefined;
  ```
  - Erster Aufruf: liest `loc.hash`. Beginnt es mit `#merkliste=`, parst es mit `parseSharedList` und entfernt das Fragment per `hist.replaceState(hist.state, "", pathname + search)`. Ergebnis im Modul gemerkt.
  - Weitere Aufrufe: das gemerkte Ergebnis, kein zweites Lesen, kein zweites `replaceState`.
  - Grund (Review M3): Ein `useState`-Initialisierer mit Seiteneffekt läuft unter `<StrictMode>` (`main.tsx:11`) doppelt. Beim zweiten Mal wäre das Fragment schon weg, und der Zustand hinge davon ab, welcher Lauf zählt.
  - Aufruf: `App` ruft `useState(() => takeSharedFragment())` **vor** `useRoute()` auf. Sonst verwirft das erste `replace` aus `useRoute` (`urlFor`) das Fragment (Ausgangslage). Die Reihenfolge sichert ein E2E-Test.
  - Fehlt `#merkliste=` (auch bei anderen Fragmenten), bleibt die URL unberührt.
- Das Fragment geht in keinen Request, kein `site.json`-URL-Parameter, keinen Log. E2E prüft: Kein Request enthält `merkliste`.
- Ungültig oder unbekannte Version → kein Sheet, Toast „Dieser Merklisten-Link ist unvollständig.“.

### E13 – Sheet „Geteilte Merkliste“

- Nach dem Laden der Daten öffnet sich ein Sheet (`Dialog`, wie das Filter-Sheet):
  - Überschrift „Geteilte Merkliste“, darunter „{n} Angebote{, m Anbieter}“.
  - Die aufgelösten Angebote als `OfferCard` mit Termin (`dated`), sortiert wie die Merkliste. Das Herz jeder Kachel merkt bzw. entmerkt einzeln (teilweise Übernahme), mit den vorhandenen Texten. Anbieter erscheinen als Zeilen mit „Merken“ (Komponente aus Plan 0025).
  - Fehlende: „{k} davon sind vorbei oder nicht mehr im Zwergenplan.“ (nur wenn k > 0).
  - Fuß: „Alle übernehmen ({neu})“ (`btn primary`, fügt nur fehlende hinzu: `mergeSaved(existing, incoming)`, neu in `src/domain/saved.ts`, Reihenfolge: bestehende zuerst) und „Schließen“. Sind alle schon gemerkt, steht dort „Alles schon gemerkt“, deaktiviert.
  - Nach „Alle übernehmen“: Toast „{n} Angebote zur Merkliste hinzugefügt“, Sheet zu, Tab Merkliste.
- **Nie überschreiben**: Kein Weg im Sheet entfernt etwas, das vorher gemerkt war, außer dem ausdrücklichen Herz-Tipp auf genau dieser Kachel.
- Alle Angebote unbekannt → statt Sheet ein Toast „Die geteilten Angebote sind alle vorbei.“.
- **Budget**: Das Sheet liegt statisch im Start-Bundle, geschätzt +0,6–0,9 kB (Parser, Hash, Sheet, Texte). Messen und in ADR 0012 eintragen. Liegt es über 1,2 kB, wird das Sheet ein Lazy-Chunk `assets/merkliste/` nach dem Muster der Anbieter-UI (Lader, `…-only-lazy`, `…-entry-only`). Der Parser bleibt im Start, denn er muss vor `useRoute` laufen.

### E14 – iOS-App: bewusst nicht in Stufe 2 (offener Punkt N3)

- Auf iOS öffnet ein Link aus WhatsApp in Safari, nicht in der Home-Bildschirm-App, und Safari hat einen anderen `localStorage`. „Alle übernehmen“ landet dann in Safari, die App bleibt leer.
- Stufe 2 baut dafür **nichts** (Review m13, Simplicity). Erst der Gerätetest von Stufe 2 (Schritt 14) zeigt, ob es im Alltag stört. Danach entscheidet der Nutzer (N3).
- Skizze für den Fall „ja“, damit ein Folgeplan nicht bei null beginnt:
  - Textknopf „Geteilte Liste öffnen“ in der Merkliste mit dem Feld „Link hier einfügen“ (≥ 16 px, `inputmode="url"`). Ein gültiger Link öffnet das Sheet aus E13.
  - Im Sheet in Safari außerhalb der App ein Hinweis mit Knopf „Link kopieren“.
  - Kein `clipboard.readText` (Rückfrage auf iOS, Berechtigung auf Android).
  - Geschätzt +0,2 kB.

### E15 – Senden

- In der Merkliste (nach Plan 0025 im Kopf von `SavedView`, unter der Überschrift) steht `btn` „Liste teilen“ mit Icon `share`, nur ab 1 Eintrag.
- Aufruf `share({ title: "Meine Zwergenplan-Merkliste", text, path: "#" + encodeSharedList(…) })` über `useShare` (E6, um `text` erweitert).
- Toasts wie in E6.

## Tests (test-first für Domäne und Generator)

**Stufe 1**

1. **Unit `scripts/lib/share-pages.test.ts`** (zuerst rot, Uhr Los Angeles wie alle Unit-Tests):
   - Titel je Format, mit den Fixture-Angeboten:
     - einmalig „Babykonzert im Advent · So 6. Dez. 2026, 10:00“,
     - Kurs „… · Kurs ab Di 13. Okt., N Termine“,
     - wöchentlich „Offener Krabbeltreff · jeden …“,
     - nicht wöchentlich, gemischt.
   - Die Zeitzone stimmt über den Wechsel auf Winterzeit (Termin 26.10.).
   - Beschreibung: Reihenfolge der Bausteine, ohne Stadtteil, Kürzung bei 200 Zeichen am Wortende mit „…“.
   - Titel: ein künstlicher Titel mit 150 Zeichen ergibt einen `og:title` ≤ 110 Zeichen, der Titelteil endet auf „…“, „ · {wann}“ bleibt erhalten.
   - `rhythm` und `uniformTimes` bekommen `new Date(generatedAt)` (ein Angebot, dessen Rhythmus sich nach `generatedAt` ändert, zeigt den Rhythmus ab `generatedAt`).
   - **Escaping**: Titel `Tom & Jerry's "<script>"` steht als `Tom &amp; Jerry&#39;s &quot;&lt;script&gt;&quot;` in `<title>`, `og:title` und `h1`. Kein `<script>` außer dem einen festen.
   - Ungültige ID (`../x`) → Wurf.
   - `og:url` = `SITE_URL + "angebot/<id>/"`, `href` von `#go` = `BASE + "?angebot=<id>"`.
   - Das Redirect-Skript ist für zwei verschiedene Angebote byte-gleich.
   - Determinismus: zweimal erzeugt → gleiche Bytes. Eine andere Systemzeit (`vi.setSystemTime`) ändert nichts.
   - Größe: das längste Fixture-Angebot < 4 kB.
   - Anbieter: Zählung relativ zu `generatedAt`, höchstens 3 Kategorien und Stadtteile, Text bei 0 Angeboten.
   - `notFoundPage()`: enthält `noindex`, kein `og:`, beide Muster.
2. **Unit `src/domain/share.test.ts`**: Pfade, `offerAppSearch` stimmt mit `routeToSearch` überein, `parseRoute(offerAppSearch(id)).offerId === id`.
3. **Unit `src/domain/labels.test.ts`**: Die verschobenen Funktionen liefern dieselben Texte (bestehende Fälle aus `format.test.ts` ziehen mit). `MONTHS_SHORT`: Mai → „Mai“, Juni → „Juni“, Juli → „Juli“, September → „Sept.“, Oktober → „Okt.“. `weekTitle` über den Monatswechsel Juni/Juli ergibt „29. Juni – 5. Juli“.
4. **Unit `src/data/share.test.ts`** mit injizierter API:
   - `share` ok → „geteilt“,
   - `AbortError` → „abgebrochen“, `writeText` nicht gerufen,
   - `InvalidStateError` → „abgebrochen“, `writeText` nicht gerufen,
   - `NotAllowedError` → `writeText` → „kopiert“,
   - kein `share` → „kopiert“,
   - beides scheitert → „fehler“,
   - `share` bekommt kein `text`.
5. **Unit `src/sw/routes.test.ts`**: Navigation auf `angebot/x/`, `anbieter/y/` und `404.html` → `"netz"`.
6. **E2E `e2e/teilen.spec.ts`** (neu, Fixture-Build):
   - **Detail**: Stub `navigator.share` per `addInitScript` (zeichnet Aufrufe auf). Detail öffnen, mit aktiven Filtern `?kat=…&von=…&bis=…` (Plan 0023), Geburtsdatum und Startpunkt gesetzt, „Teilen“ tippen.
     - Aufgerufen genau einmal mit `url` = `{origin}/angebot/<id>/`, ohne `?`, ohne Geburtsdatum, ohne `kat`.
     - `title` = Angebotstitel. Kein Toast.
   - **Fallback**: `navigator.share` auf `undefined`, `navigator.clipboard.writeText` gestubbt → Toast „Link kopiert …“ im Detail sichtbar, kopierter Text = URL.
   - **Beides scheitert**: `share` wirft `NotAllowedError`, `writeText` wirft → Sheet „Link zum Teilen“ über dem Detail. Das Feld ist `readonly`, enthält `{origin}/angebot/<id>/`, und sein Text ist markiert (`selectionStart === 0`, `selectionEnd === value.length`). „Fertig“ schließt nur das Sheet, das Detail bleibt offen.
   - **Abbruch**: Stub wirft `AbortError` bzw. `InvalidStateError` → kein Toast, kein Sheet.
   - **Anbieter-Sheet**: „Teilen“ im Fuß → URL `{origin}/anbieter/<id>/`.
   - **Vorschauseite**: `request.get("/angebot/<id>/")` → 200, `og:title`, `og:description`, `og:image`, `og:url`, `robots noindex` vorhanden, Werte wie Unit-Test.
   - **Weiterleitung** (Review m7): `page.goto("/angebot/<id>/")` → URL wird `/?angebot=<id>`, das Detail ist offen.
     - `history.length` ist danach gleich wie direkt nach dem `goto` (`location.replace` legt keinen Eintrag an).
     - Der In-App-Knopf „Zurück“ im Detail schließt es und zeigt die Liste (URL ohne `angebot=`).
     - `page.goBack()` landet danach nicht auf `/angebot/…` (URL enthält kein `/angebot/`).
   - **Bot** (Review M1): Kontext mit dem iMessage-User-Agent `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0` → bleibt auf der Seite, Link sichtbar.
   - **Kein Bot**: Kontext mit `userAgent: "WhatsApp/2.23.20 A"` (ohne „bot“) → wird weitergeleitet, Detail offen.
   - **Ohne JavaScript** (`javaScriptEnabled: false`): Titel und Link sichtbar, Link führt ins Detail.
   - **Verschwundenes Angebot**: `page.route("**/angebot/gibt-es-nicht--x--y/", r => r.fulfill({ status: 404, path: "dist-e2e/404.html" }))` → Sprung nach `/?angebot=gibt-es-nicht--x--y` → Startseite, Toast „Dieses Angebot ist nicht mehr im Zwergenplan.“, kein `angebot=` in der URL.
   - Prüfen in Schritt 1, ob `vite preview` `/angebot/<id>/` als `angebot/<id>/index.html` ausliefert. Falls nicht: Tests auf `…/index.html` und ein Satz im Test, warum.
7. **E2E Mobile-UX** (`e2e/mobile-ux.spec.ts`): Zustände
   - `detail` (vorhanden) prüft jetzt den Kopf mit drei Knöpfen bei 320 px und 200 %,
   - `anbieter-sheet` (vorhanden) den zweiteiligen Fuß,
   - neu `link-zum-teilen` (Sheet aus E6 über dem Detail, hell und dunkel),
   - neu `vorschauseite-ohne-js` (eigener Kontext ohne JavaScript). Dunkel nur über `colorScheme: "dark"` (System). Die Variante `data-theme="dark"` entfällt hier bewusst, denn die Seite liest die gewählte Darstellung nicht (E4). Das wird im Test als Ausnahme mit Verweis auf Plan 0026, E4 begründet.
8. **E2E PWA** (`e2e/pwa.spec.ts`, Chromium mit Service Worker): Nach der Registrierung `goto("/angebot/<id>/")` → Detail offen, keine Konsolenfehler. Der Navigation-Preload-Hinweis ist nur eine Warnung; falls doch ein Fehler kommt: Ursache beheben, nicht freischalten.
9. **Smoke** (echte Daten, `dist/`): Für das erste und das letzte Angebot aus `site.json` und einen Anbieter aus `anbieter.json` antwortet die Seite mit 200 und enthält den escapten Titel. `dist/404.html` ist vorhanden. `__zpMap` fehlt wie bisher. **Keine Fixture-Seite im Deploy-Build** (Review m11): Für jede Angebots-ID aus `tests/fixtures/offers.json` antwortet `/angebot/<id>/` nicht mit der Vorschauseite (Status 404 bzw. kein `og:title`). Dazu prüft ein Node-Schritt im Smoke-Test, dass `dist/angebot/` kein Verzeichnis mit diesen IDs enthält.
10. **Build-Gate**: `build-data` schreibt so viele Seiten, wie es Angebote und Anbieter gibt. `checkSharePages(pages)` meldet jede Seite > 4 kB (Unit in `share-pages.test.ts`), `build-data` bricht dann ab. Das ist ein Wächter gegen Bugs im Generator, Daten allein können ihn wegen der Kürzungen nicht auslösen (E4).

**Stufe 2**

11. **Unit `src/domain/share.test.ts`**:
    - `shortId`-Testvektoren (eingefroren), `encodeSharedList`/`parseSharedList` hin und zurück, Duplikate, Reihenfolge,
    - 200 Einträge je Gruppe gültig, 201 ungültig,
    - ungültig: Version 2, Länge nicht durch 8 teilbar, Großbuchstaben, leer,
    - `resolveShared` ignoriert Unbekanntes und **verwirft mehrdeutige Kurz-IDs ganz** (künstliche Kollision über eine injizierte Hashfunktion),
    - Kollisionsprüfung `findShortIdCollisions(ids)` liefert die Paare. `build-data` macht daraus eine `::warning::`, keinen Abbruch.
12. **Unit `src/domain/saved.test.ts`**: `mergeSaved` hängt nur Neues an und entfernt nichts.
12a. **Unit `src/data/shared-fragment.test.ts`** (Review M3), mit injiziertem `loc`/`hist`:
    - erster Aufruf mit `#merkliste=1.…` → Liste, `replaceState` genau einmal mit `pathname + search` (Query bleibt, `history.state` bleibt),
    - zweiter Aufruf → dasselbe Ergebnis, `replaceState` nicht noch einmal,
    - ungültiges Fragment → `"ungueltig"`, Fragment trotzdem entfernt,
    - anderes Fragment (`#oben`) → `undefined`, URL unberührt.
    - Zwischen den Tests wird der Modulzustand über `vi.resetModules()` zurückgesetzt.
13. **E2E `e2e/teilen.spec.ts`, Merkliste**:
    - Senden: zwei Angebote merken, „Liste teilen“ (Stub) → `url` matcht `/#merkliste=1\.[0-9a-z]{16}$/`, `text` „2 Angebote aus meiner Zwergenplan-Merkliste“. Kein Geburtsdatum, keine Query.
    - Empfangen in neuem Kontext mit einem schon gemerkten dritten Angebot:
      - Sheet mit 2 Kacheln, „Alle übernehmen (2)“ → Merkliste hat 3. Das alte ist noch da.
      - Fragment aus der URL entfernt, kein Request enthält `merkliste`.
    - Teilweise: Herz auf einer Kachel → genau dieses gemerkt.
    - Kaputter Link → Toast, kein Sheet.
    - Mit Query und Fragment (`/?ansicht=kalender#merkliste=…`): Sheet erscheint, die Query bleibt (Reihenfolge vor `useRoute`).
14. **E2E Mobile-UX**: Zustand `geteilte-merkliste` (Sheet mit 2 Kacheln und Hinweis auf fehlende Einträge).

## Schritte

**Stufe 1** (Branch `teilen-0026-s1`)

1. Inventar und Probe:
   - `grep -rn "angebot=\|anbieter=\|og:" src e2e scripts`.
   - Start-JS auf aktuellem `main` messen (`pnpm build && pnpm size`).
   - Prüfen, ob `vite preview` Verzeichnis-Indizes ausliefert (Tests 6).
   - Prüfen, ob die Pläne 0022–0025 inzwischen eine ADR-Nummer ≥ 0020 belegen; dann ADR 0020 umnummerieren. Stand 2026-10-08 nach `git fetch`: `origin/main`, `feedback-0022-kleinigkeiten`, `zeitraumfilter-0023`, `karte-look-0024` und `origin/plan-0025-merkliste` enden alle bei ADR 0019. Plan 0025 sieht nur bedingt ein ADR vor (Lazy-Merkliste, dort E11/E12). Nachtrag nach dem Merge von `main` d5fab1b (Pläne 0022–0024): ADR 0021 ist durch Plan 0027 belegt (Branch `plan-0027-verifikation`), 0020 bleibt bei diesem Plan. Ein ADR für Plan 0025 bekäme 0022 oder höher.
2. `src/domain/labels.ts` herauslösen (Tests 3), `format.ts` re-exportiert. `pnpm check:fast` grün, Bundle-Hash unverändert oder Start-JS ±0.
3. `src/domain/share.ts` (Pfade) test-first (Tests 2).
4. `scripts/lib/share-pages.ts` test-first (Tests 1, 10). Danach die Verdrahtung in `build-data.ts`, `.gitignore`, Log-Zeile.
5. Vorschaubild in `scripts/icons.ts`, `public/og/vorschau-v1.jpg` erzeugen und committen. `index.html` und das Plugin `zp-site-url` (E5).
6. `src/data/share.ts` test-first (Tests 4), `useShare`, `ManualLinkSheet`, Icon, Knopf im Detail und im Anbieter-Sheet, Toast bei unbekanntem Angebot (E6, E7). `src/sw/routes.test.ts` ergänzen (Tests 5).
7. E2E und Smoke (Tests 6–9). `PW_PORT=4273 pnpm check:fast`, dann `PW_PORT=4273 pnpm check`.
8. Doku: `docs/architecture.md` (E8), ADR 0020: Vermerk „Stufe 1 umgesetzt (SHA)“, Delta in ADR 0012, `docs/ideas.md` („Vorschaubild je Kategorie“, „Teilen auf der Kachel“). `/arch-review` (neues Modul, mehr als 200 Zeilen), Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün.
9. `/browser-review live` und **Gerätetest** durch den Nutzer:
   - Link aus dem Detail per WhatsApp (Android und iOS) an sich selbst schicken: Erscheint die Vorschau mit Titel, Beschreibung und Bild? Öffnet ein Tipp das Detail?
   - Dasselbe mit Signal und iMessage, falls vorhanden.
   - Ergebnis als Abschnitt hier eintragen. Bleibt die Vorschau in einem Messenger aus: Befund notieren, mit einer Quelle prüfen (z. B. Bot-Liste oder Bildgröße) und erst dann ändern.

**Stufe 2** (Branch `teilen-0026-s2`, erst nach dem Merge von Plan 0025 und mit Entscheidung N1)

10. E10–E15 an den Stand von Plan 0025 anpassen (Ort des Knopfs, Schlüssel gemerkter Anbieter, Kachel für Anbieter), kurzer Nachtrag hier und ein `/plan-review` nur für Stufe 2.
11. `shortId`, Kodierung, `mergeSaved` und `takeSharedFragment` test-first (Tests 11, 12, 12a). Kollisionswarnung in `build-data`.
12. Aufruf in `App` vor `useRoute`, Sheet, Senden (E12, E13, E15). Budget messen (E13, ggf. lazy).
13. E2E und Mobile-UX (Tests 13, 14), `pnpm check`.
14. Doku: Vermerk in Plan 0003, Zeile 75, in Plan 0025 (gemerkte Anbieter „nie in URL“, Zeile 122) und im Kopfkommentar von `route.ts`; `docs/architecture.md`, Privatsphäre (Fragment-Ausnahme); ADR 0020: Vermerk „Stufe 2 umgesetzt (SHA)“; Delta in ADR 0012. `/arch-review`, CI, Fast-Forward, `/browser-review live`. **Gerätetest iOS**: Link aus WhatsApp in Safari öffnen, während der Zwergenplan als App installiert ist. Ergebnis hier eintragen, dann N3 entscheiden.

## Offene Punkte (Nutzerentscheid)

**Entschieden (Nutzer, 2026-10-08):** Alle Empfehlungen sind angenommen.
- N1: Stufe 2 kommt später, direkt nach Plan 0025.
- N2: Rhythmus statt nächstem Termin.
- N3: Entscheidung nach dem Gerätetest von Stufe 2.
- N4: generisches Vorschaubild.

Die Begründungen zu den einzelnen Punkten:

- **N1 – Stufe 2 jetzt oder später?** **Empfehlung: später**, als eigene Etappe direkt nach dem Merge von Plan 0025.
  - Plan 0025 baut `SavedView` um (Liste, Karte, Kalender) und führt „Anbieter merken“ ein. Stufe 2 hängt an beidem: am Ort des Knopfs, am Speicherschlüssel und an der Kachel für Anbieter. Parallel gebaut gäbe es Konflikte und doppelte Arbeit.
  - Stufe 1 bringt den größten Nutzen (einzelne Angebote in WhatsApp) und ist davon unabhängig.
  - **Budget**: Stufe 2 kostet geschätzt +0,6–0,9 kB Start-JS (E13), Stufe 1 +0,4–0,5 kB (E9). Plan 0018 (ICS nur altersgerecht) wartet ebenfalls auf Reserve im Startbudget, und Plan 0025 hat einen eigenen Entscheidungspunkt bei +2,5 kB. Wer Stufe 2 später baut, misst nach 0018 und 0025 neu und entscheidet dann, ob das Sheet statisch bleibt oder lazy wird (E13).
- **N2 – Datum in der Vorschau regelmäßiger Angebote.** **Empfehlung: Rhythmus** („jeden Mittwoch, 9:30“) statt „nächster Termin Mi 14. Okt.“ (E3). Der nächste Termin veraltet zwischen zwei Deploys und im Cache des Messengers, und der Build hinge an der Uhr. Einmalige Termine und Kurse zeigen ihr festes Datum.
- **N3 – Einfügefeld für iOS-App-Nutzer (E14), erst nach dem Gerätetest von Stufe 2.** Nicht Teil von Stufe 2 (Review m13). **Empfehlung: nach dem Gerätetest (Schritt 14) entscheiden.** Landet eine geteilte Liste bei iOS-App-Nutzern spürbar in Safari statt in der App, wird die Skizze aus E14 ein kleiner Folgeplan (geschätzt +0,2 kB). Sonst bleibt es bei einem Eintrag in `docs/ideas.md`.
- **N4 – Vorschaubild.** **Empfehlung: ein generisches Bild** (Icon und Schriftzug, E5). Bilder je Kategorie wären hübscher, kosten aber 12 Motive, Pflege und Gestaltung. Sie kommen nach `docs/ideas.md`.

## Nachtrag A (2026-10-08): Kachelbild je Angebot

Nutzerwunsch beim Start der Umsetzung, wörtlich:

> „Wichtig ist mir, dass in der Vorschau, die zB dann in Whatsapp gerendert wird, das Event vollständig identifizierbar ist, also quasi so aussieht wie in der App in der Übersicht.“

Das ersetzt N4 für Angebote. Ein generisches Bild sieht in jedem Chat gleich aus, und WhatsApp zeigt das Bild groß über Titel und Beschreibung. Erkennbar „wie in der App“ ist nur ein Bild der Kachel. Anbieter, `index.html` und Stufe 2 bleiben beim generischen Bild aus E5.

### E16 – Was das Bild zeigt

- **Eine Datei je Angebot**: `angebot/<offerId>/vorschau.jpg`, 1200 × 630 (1,91 : 1), JPEG Qualität 82, also neben der Vorschauseite im selben Ordner. Den Pfad liefert `offerImagePath(offerId)` aus `src/domain/share.ts`.
- **Motiv**: die Kachel der Übersicht, vergrößert, auf dem Punktraster-Papier der App, immer hell.
  - Kopfzeile: Kategorie-Pille mit Farbe, Form und Etikett der Leitkategorie (`leadCategory(offer.topics, [])`), daneben **wann**. Das ist derselbe Text wie im `og:title` (E3), also Rhythmus bzw. festes Datum, nie „nächster Termin“.
  - Titel (höchstens 3 Zeilen, danach „…“ per `line-clamp`).
  - Meta: `{Anbieter} · {Ort}, {Stadtteil}` (höchstens 2 Zeilen). Die Kachel der App zeigt nur den Stadtteil, das Bild nennt auch den Ort, denn im Chat fehlt der Kontext.
  - Fakten wie auf der Kachel: **Alter** (immer, die Kachel zeigt es nur bei „passt nicht“), Kosten, Anmeldung (Rahmen bei „Anmeldung nötig“ wie `.fact.reg`), Plätze (nur mit aussagekräftigem Status, `availabilityLabel`). Der Kosten-Fakt wird im Bild deterministisch auf 40 Zeichen gekürzt (Wortende, „…“), denn `price` ist Freitext (Review A, M1).
  - Ohne Herz (kein Bedienelement im Bild); der Platz, den `card.css` dafür freihält (`margin-right: 47px` an `.card-top` und `.ctitle`), entfällt per Bild-Regel. Die leichte Drehung der Kachel (−0,6°) bleibt wie in der App. Unten rechts das App-Icon und „zwergenplan.app“.
  - **Geometrie** (Review A, M1): Viewport 1200 × 630, `deviceScaleFactor: 1`. Die Kachel ist 460 CSS-px breit und per CSS `zoom` vergrößert, Start-Zoom 2,4 (≈ 1 100 px breit). Bild-eigene Schriftgrößen: Meta und Fakten 16 px statt 14/13 px, damit sie in einer Chat-Blase (≈ 0,24 pt je Bildpixel) noch lesbar sind. Kein DPR-Trick: Der kleine Viewport würde die Querformat-Media-Queries der App auslösen (`tabs.css`, `body { padding-left: 8rem }`).
  - **Passregel**: Ist Kachel samt Markenzeile höher als 630 px, sinkt der Zoom in Schritten von 0,1 bis 1,6. Passt es auch dann nicht, bricht der Build ab; das kann nur ein Generatorfehler sein, denn Titel (3 Zeilen), Meta (2 Zeilen) und Kosten (40 Zeichen) sind begrenzt. Ein **Kanarienvogel** rendert bei jedem Lauf zuerst eine synthetische schlimmste Kachel (150 Zeichen Titel, 40 Zeichen Kosten, alle Fakten, lange Meta) und bricht ab, wenn sie bei Zoom 1,6 nicht passt. So hängt das Gate nicht an den Daten (ADR 0016).
- **Eine Quelle für die Texte**: `offerPreview(offer, generatedAt)` in `scripts/lib/share-pages.ts` liefert `{ category, when, title, meta, facts }`. Daraus entstehen `og:title`, `og:description` **und** das Bild.
- **Kategorieformen**: nur die Form je Kategorie (`CATEGORY_SHAPES`, SVG-Pfade) zieht aus `src/ui/categories.ts` nach `src/domain/category-look.ts` (reine Darstellungsdaten). `CATEGORY_UI` in `src/ui/categories.ts` nutzt sie weiter, `short` bleibt dort (Review A, m7). Grund wie in E3: `scripts/` darf `src/ui` nicht importieren (`scripts-not-ui`).

### E17 – Wie das Bild entsteht

- **Neues Skript `scripts/og-images.ts`** nach dem Vite-Build: `"build": "pnpm data:build && vite build && node scripts/og-images.ts"`. Das Ausgabeverzeichnis folgt `ZWERGENPLAN_DATA` wie in `vite.config.ts` (`dist/` bzw. `dist-e2e/`).
- **Echte App-Styles**: Das Skript liest `<out>/data/site.json` und das Start-CSS samt Bricolage-woff2 aus `<out>/`, also genau den Stand, der ausgeliefert wird. Das Markup baut die reine Funktion `offerCardHtml(preview)` in **`scripts/lib/og-card.ts`** mit den Klassen der Kachel (`card k-<kategorie>`, `card-top`, `pill`, `when`, `ctitle`, `meta`, `facts`, `fact`), alles escaped. Ändert sich das CSS der Kachel, folgt das Bild beim nächsten Deploy; benennt `OfferCard.tsx` Klassen um, wird der Unit-Test rot (jede genutzte Klasse muss als Selektor in `src/ui/styles/card.css` stehen, Review A, M2). Bild-eigene Regeln (Größe, Papier, Zeilenbegrenzung, Marke) stehen in einem `<style>` in `og-card.ts`. Die Seite hat `<html lang="de">` (Silbentrennung wie in der App) und wird mit `colorScheme: "light"` gerendert.
- **Kein Server, kein Port**: Eine Seite unter einer festen Schein-Origin (`https://og.zwergenplan.invalid/`), `page.route` beantwortet jede Anfrage aus `<out>/`, alles andere wird abgebrochen. Je Angebot: Inhalt tauschen, Passregel anwenden, `screenshot({ type: "jpeg", quality: 82, clip })`. Vier Seiten parallel; je Bild ein Zeitlimit von 15 s und eine Wiederholung, erst dann Exit 1 (Review A, m3).
- **Styles und Schrift sind wirklich da** (Review A, M2): Je Seite einmal `document.fonts.load()` für Bricolage in den Gewichten 450, 700 und 800, danach als Gate `document.fonts.check(…)` und ein CSS-Wächter (`getComputedStyle(.card).borderTopLeftRadius === "22px"`). Sonst Exit 1: Ein Bild in Rückfallschrift oder ohne CSS ginge sonst still live. `document.fonts.ready` allein reicht nicht, es ist nach einem Tausch per `innerHTML` oft schon aufgelöst.
- **Engine**: Chromium. Im Fixture-Build (`dist-e2e/`) darf es auf WebKit ausweichen, wenn Chromium fehlt, denn die WebKit-Jobs der CI installieren nur WebKit (`.github/install-browsers.sh`). Der Deploy-Build verlangt Chromium, sonst Exit 1. „Fehlt“ heißt `!existsSync(chromium.executablePath())`; die Entscheidung `pickEngine(source, hasChromium)` steht rein in `scripts/lib/og-engine.ts` mit Unit-Test, das Log nennt die Engine. Quelle und Ausgabeordner kommen aus `dataSource()` (`scripts/lib/load-data.ts`), nicht aus einer Kopie der Logik von `vite.config.ts` (Review A, m4).
- **Gates** (Exit 1, wie `build-data`): Zahl der Bilder = Zahl der Angebote; jedes Bild unter 300 kB (Meta erlaubt 600 kB). Log „✓ Vorschaubilder: N in X s, größtes Y kB“. Über 60 s gibt es eine `::warning::`.
- **Service Worker**: `angebot/<id>/vorschau.jpg` fällt unter „sonst nur Netz“ (ADR 0013), wie die Seite selbst (Tests 5 bekommt den Fall).

### E18 – Tags und Kosten

- Vorschauseite eines Angebots: `og:image` = `{SITE_URL}angebot/<id>/vorschau.jpg?v=<hash>`, `og:image:width` 1200, `og:image:height` 630, `og:image:alt` fest „Kachel des Angebots im Zwergenplan“ (der Titel stünde sonst ein weiteres Mal escaped in der Seite, Review A, m5), `twitter:card` `summary_large_image`. Anbieter und `index.html`: generisch (E5).
- **`?v=<hash>`** (Review A, m6): 8 Hex-Zeichen FNV-1a über die Texte von `offerPreview` (Kategorie, wann, Titel, Meta, Fakten). Ändern sich Plätze oder Preis, ändert sich die Bild-URL, und Abrufer, die nach Bild-URL cachen, holen neu. Deterministisch, GitHub Pages ignoriert die Query.
- **Artefakt**: geschätzt 333 Bilder × 30–60 kB ≈ 10–20 MB. GitHub Pages erlaubt 1 GB je Seite. `dist/angebot/**` fällt unter kein size-limit (E9), die Grenze je Bild (300 kB) ist das Gate.
- **Build-Zeit**: geschätzt 10–30 s im Smoke-Job und lokal bei `pnpm build`; Fixture-Builds haben wenige Angebote. `pnpm dev` rendert keine Bilder.
- **Keine neue Abhängigkeit**: Playwright ist schon Dev-Abhängigkeit und rendert die Icons (`scripts/icons.ts`).
- **Grenze**: Zeigt ein Messenger nur ein kleines quadratisches Vorschaubild (Mitte des Bildes), ist die Kachel beschnitten. Titel und Beschreibung tragen den Inhalt dann allein (E3). Der Gerätetest (Schritt 9) bekommt dafür ein Kriterium: Sind Pille und Titelanfang im mittleren 630 × 630-Ausschnitt noch erkennbar? (Review A, m10)

### Tests zu Nachtrag A

- **Unit `scripts/lib/og-card.test.ts`**: Klassen und Kategorie stimmen, Reihenfolge der Fakten, Alter immer dabei, `.fact.reg` nur bei Anmeldung, Plätze nur mit Status; Escaping (`Tom & Jerry's "<script>"`), kein `<script>` im Markup; jede genutzte Kachel-Klasse steht als Selektor in `src/ui/styles/card.css` (M2); die Form je Kategorie kommt aus `CATEGORY_SHAPES`.
- **Unit `scripts/lib/og-engine.test.ts`**: `pickEngine` – echt mit Chromium → chromium, echt ohne → Fehler, Fixture ohne Chromium → webkit (m4).
- **Unit `scripts/lib/share-pages.test.ts`** (zusätzlich): `offerPreview` liefert dieselben Texte für Seite und Bild; `og:image` der Angebotsseite zeigt auf `angebot/<id>/vorschau.jpg`, der Anbieterseite auf das generische Bild.
- **E2E `e2e/teilen.spec.ts`** (zusätzlich): `request.get("/angebot/<id>/vorschau.jpg")` → 200, `image/jpeg`, unter 300 kB; Maße 1200 × 630 über `naturalWidth/naturalHeight` nach `page.goto` (m9); die Bilder zweier Angebote unterscheiden sich in den Bytes (M2).
- **Smoke**: Für das erste und das letzte Angebot aus `site.json` liefert `vorschau.jpg` 200 mit `image/jpeg`.
- **Sichtprüfung** (`/browser-review`): je ein Bild für einmalig, Kurs, regelmäßig, langen Titel und „Ausgebucht“ ansehen, zusätzlich in 300 px Breite (Größe in der Chat-Blase) und als mittlerer 630 × 630-Ausschnitt; Bilder dem Nutzer schicken.

### Schritte zu Nachtrag A

Zwischen Schritt 5 und 6: `category-look.ts` herauslösen, `og-card.ts` und `og-engine.ts` test-first, `scripts/og-images.ts`, `build`-Skript, Gates. Nach jedem Schritt `pnpm verify`. Danach lokal `pnpm e2e:local e2e/teilen.spec.ts` (Bilder in `dist-e2e/`) und `PW_SUITE=smoke pnpm e2e` (Deploy-Build mit echten Bildern), beide mit `run_in_background`; die volle Suite fährt die CI (CLAUDE.md, „Lokal prüfen“; ersetzt `pnpm check` aus Schritt 7). Doku: ADR 0020 Punkt 2, 6 und „Konsequenzen“ (Bild je Angebot, Build-Zeit, Headless-Browser im Deploy-Build Pflicht), `docs/architecture.md` (Datenfluss mit dem Schritt nach Vite, Schichten mit `category-look`), `docs/ideas.md` („Bild je Anbieter“) (m7, m8).

### Review zu Nachtrag A (2026-10-08) – Verdict: freigabefähig nach Einarbeitung → eingearbeitet

Unabhängiger `plan-reviewer`, kein Blocker. Alle Befunde übernommen:

| Befund | Umgang |
|---|---|
| **M1** Geometrie fehlt, abgeschnittener Inhalt unbemerkt, Fakten klein | feste Geometrie, Bild-Schriftgrößen 16 px, Kosten auf 40 Zeichen, Passregel (Zoom 2,4 → 1,6), Kanarienvogel mit schlimmster Kachel (E16) |
| **M2** ungestyltes Bild käme durch, Markup-Drift | `fonts.load` + `fonts.check`, CSS-Wächter, Klassen-Test gegen `card.css`, E2E „Bilder unterscheiden sich“ (E17, Tests) |
| m1 Media-Queries, `lang`, hell | Begründung „kein DPR-Trick“, `lang="de"`, `colorScheme: "light"` (E16, E17) |
| m2 Herz-Rand, Drehung | Bild-Regel ohne 47 px, Drehung bleibt (E16) |
| m3 Absturz bremst Deploy | Zeitlimit und eine Wiederholung je Bild (E17) |
| m4 Rückfall unklar | `pickEngine` rein mit Test, `existsSync`, `dataSource()` (E17, Tests) |
| m5 Alt-Text vergrößert die Seite | fester Alt-Text (E18); der Wächter je Seite liegt nach der Messung ohnehin bei 10 kB (Umsetzung zu E4) |
| m6 Cache | `?v=<hash>` (E18) |
| m7 Doku | ADR-Konsequenzen, Datenfluss, Schichten, nur Formen umziehen (E16, Schritte) |
| m8 lokale Prüfung | `pnpm verify`, gezielte E2E und Smoke statt `pnpm check` (Schritte) |
| m9 SOF-Parser | `naturalWidth/Height` (Tests) |
| m10 quadratischer Ausschnitt | Kriterium im Gerätetest, Sichtprüfung in 300 px und als Ausschnitt (E18, Tests) |

### Umsetzung zu E4: Seitengröße gemessen

Die Vorschauseiten mit echten Daten (2026-10-08) wiegen im Median 3,2 kB, die größte 3,5 kB, nicht die geschätzten 2,5 kB. Die geplante Grenze von 4 kB hätte ein Titel voller „&“ reißen können, das widerspricht Review M4. Der Wächter `checkSharePages` liegt deshalb bei **10 000 Byte** (nach Arch-Review m5, vorher 10 KiB): Die strenge Obergrenze aus den Kürzungen (jedes Zeichen escaped höchstens 6 Byte, Titel und Beschreibung je mehrfach in der Seite, ID ≤ 240 Zeichen, fester Text) liegt bei etwa 8,8 kB; darüber liegt nur ein Generatorfehler. Ein Unit-Test belegt, dass Titel und Anbietername aus 300 Anführungszeichen ihn nicht reißen.

### Umsetzung Stufe 1: Abweichungen und Messwerte

- **`labels.ts`** enthält zusätzlich `clock`, `timeRange` und `availabilityLabel`: Vorschauseite und Kachelbild brauchen sie, `format.ts` re-exportiert alle.
- **Meta-Zeile des Bildes**: Ort zuerst, `{Ort}, {Stadtteil} · {Anbieter}` (E16 nannte den Anbieter zuerst). Mit echten Daten verdrängten lange Anbieternamen („Post SV Nürnberg – Babyschwimmen, Kleinkindschwimmen, …“) sonst das „Wo“ aus den zwei Zeilen. Heißt der Ort ohne Klammerzusatz wie der Anbieter („Studio X (ehem. Y)“), steht der Name nur einmal da, in Meta und Beschreibung (dort entfällt dann „– {Anbieter}“).
- **Wann bei „Montags“**: Haben alle kommenden Termine dieselbe Uhrzeit, steht sie auch bei gleichem Wochentag ohne wöchentlichen Takt dabei („Montags, 9:30“); E3 sah sie nur für „jeden …“ vor.
- **Kürzen**: Eine angeschnittene Klammer („41,36 € (2…“) fällt ganz weg, solange mehr als die Hälfte bleibt.
- **Kachelbilder** (lokal, 2026-10-08, echte Daten): 333 Bilder in 7,4 s, 72–109 kB (Median 93 kB), zusammen 31 MB; 156 Kacheln mit kleinerem Zoom als 2,4. Qualität 75 statt 82 spart nur etwa 12 kB je Bild, das Punktraster etwa 3 kB; die Größe kommt von den Textkanten. Es bleibt bei Qualität 82 für scharfe Schrift.
- **Generisches Bild** `public/og/vorschau-v1.jpg`: 48 kB. `scripts/icons.ts` erzeugt die Icons dabei byte-gleich neu.
- **Schemaänderung** (Arch-Review M1, entgegen E8): Die ID-Höchstlängen stehen jetzt im Schema, als `MAX_KEBAB_ID` und `MAX_OFFER_ID` in `src/domain/ids.ts`. Katalog-IDs haben höchstens 80 Zeichen (längste echte 38), Offer-IDs höchstens 240 (längste echte 167). `route.ts`, `share.ts` und das Muster in `404.html` nutzen dieselben Konstanten, `schema/*.json` ist neu exportiert. So kann kein Datenstand, den Zod durchlässt, `build-data` an `providerSharePath` abbrechen lassen.
- **Wächter** `checkSharePages`: 10 000 Byte, Meldung in Byte (siehe „Umsetzung zu E4“).
- **Start-JS** 94,41 → 95,33 kB (+0,92 kB, geschätzt +0,4–0,5). Die Aufschlüsselung steht in ADR 0012; nichts davon ließ sich leicht vermeiden.

## Arch-Review (2026-10-08) – Stufe 1

Unabhängiger `arch-reviewer` über Stufe 1 samt Nachtrag A, Verdict „Nacharbeit nötig“, kein Blocker. Alle Befunde sind übernommen.

| Befund | Umgang |
|---|---|
| **M1** Länge der Anbieter-ID nicht im Schema; eine ID, die Zod durchlässt, bricht `build-data` ab. Ebenso die Grenze 200 der Offer-ID (Wächter, `404.html`) | `MAX_KEBAB_ID` (80) und `MAX_OFFER_ID` (240) in `src/domain/ids.ts`, per `.max()` im Schema; `route.ts`, `share.ts` und `404.html` nutzen sie; `schema/*.json` neu exportiert, mit Unit-Test (Schemaänderung) |
| **M2** `as`-Cast ohne Begründung in `src/data/share.ts` | Type Guard statt Cast |
| **m1** Gate „Zahl der Bilder = Zahl der Angebote“ wirkungslos | zählt `vorschau.jpg` auf der Platte (`scripts/og-images.ts`) |
| **m2** Zeitlimit je Bild nur für den Screenshot | `withTimeout` über Platzieren und Screenshot |
| **m3** Ausgabeordner doppelt und relativ zum cwd | `OUT_DIR` in `site.config.ts` für Vite und `og-images.ts`, dort über `ROOT` aufgelöst |
| **m4** Anbieter-Vorschau kopiert `providerOffers`, Kategorien weichen vom Sheet ab | `providerOffers` und `providerCategories` aus `src/domain/directory.ts` |
| **m5** veralteter Kommentar „4 kB“, gemischte Einheiten im Wächter | 10 000 Byte, Meldung in Byte, Kommentar korrigiert |
| **m6** Test in `e2e/pwa.spec.ts` unter dem falschen Kommentar | über den Kommentar verschoben |
| **m7** `404.html` ohne Mobile-UX-Gates | Block `404-seite` in `e2e/mobile-ux.spec.ts`: hell, dunkel, 320 px mit 200 % |
| **m8** Start-JS +0,90 statt +0,4–0,5 kB, ohne Ursache | Builds je Commit verglichen, Aufschlüsselung in ADR 0012; nichts leicht vermeidbar |
| **m9** Doku-Drift: Bildgröße unter „Risiken“, keine E2E-Pflicht für Vorschauseiten, Chromium für `pnpm build` | „Risiken“ korrigiert; CLAUDE.md: Zeile in „Lokal prüfen“ und Punkt unter „Stolperfallen“ |
| **m10** Kostentest tautologisch | feste Erwartungswerte für alle drei Zweige (`src/domain/labels.test.ts`) |

## Risiken

- **Messenger-Verhalten ist nicht spezifiziert.** Wann WhatsApp große oder kleine Vorschauen zeigt, wie lange es cacht und ob iMessage JavaScript ausführt, ist nur empirisch bekannt. Abgesichert durch Standard-Tags, Bilder in 1,91 : 1 (generisch 48 kB, Kachelbilder 72–109 kB, Gate 300 kB, Meta erlaubt 600 kB), die Bot-Ausnahme, kein `meta refresh` und den Gerätetest (Schritt 9).
- **Pfadvertrag**: Wer später `angebot/` umbenennt, bricht alle geteilten Links. ADR 0020 hält ihn fest.
- **Bot-Muster trifft einen Menschen**: Ein In-App-Browser mit „bot“ als eigenem Wort im User-Agent bliebe auf der Seite und müsste den Link tippen. Das ist unschön, aber keine Sackgasse. Nach dem Review ist die Liste auf JS-fähige Abrufer beschränkt (E4).
- **ADR-Nummer**: Kollision mit parallelen Plänen möglich (Schritt 1).

## Review (2026-10-08) – Verdict: freigabefähig nach Einarbeitung → eingearbeitet

Unabhängiger `plan-reviewer`, kein Blocker. Quellen des Reviewers: [Meta, WhatsApp-Link-Vorschauen](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/), [Netlify-Forum zu iMessage-Vorschauen](https://answers.netlify.com/t/cant-get-open-graph-previews-working-in-imessage-with-netlify-prerendering/87487).

| Befund | Umgang |
|---|---|
| **M1** Bot-Liste zu breit: WhatsApp holt per GET ohne JavaScript, `location.replace` wirkt dort nicht; „WhatsApp“/„Signal“ in der Liste träfe In-App-Browser | Liste auf `facebookexternalhit\|Facebot\|Twitterbot\|bot\b\|crawler\|spider` reduziert, Quellen zitiert (E4). Bot-Test mit iMessage-User-Agent, neuer Test „WhatsApp ohne bot wird weitergeleitet“ (Tests 6) |
| **M2** Fallback-Text „Adresse oben“ trägt nicht (keine Adresszeile in der App, `writeText` nach abgelehntem `share()` auf iOS unsicher) | Bei `"fehler"` Sheet „Link zum Teilen“ mit schreibgeschütztem, markiertem Feld (E6). `InvalidStateError` wird still ignoriert, mit Unit-Test (Tests 4) und E2E (Tests 6), Mobile-UX-Zustand `link-zum-teilen` (Tests 7) |
| **M3** Initialisierer mit Seiteneffekt bricht unter StrictMode | `takeSharedFragment()` in `src/data/shared-fragment.ts` nach dem Muster von `takeEarlyRequest`, Aufruf vor `useRoute` (E12), Unit-Test für den zweiten Aufruf (Tests 12a) |
| **M4** Harte Exit-1-Gates blockieren den Nachtlauf | `og:title` deterministisch auf 110 Zeichen gekürzt (E3), 4 kB bleibt nur als Bug-Wächter (E4, Tests 10). Kurz-ID-Kollision ist nur `::warning::`, `resolveShared` verwirft mehrdeutige IDs (E10, Tests 11) |
| **m5** Fundstellen | `routes.ts:45–52` und `sw.ts:66–77`, `dialog.css:64` (Ausgangslage) |
| **m6** Mobile-UX der Vorschauseite | nur System-Dunkel, begründet; Farben für Hintergrund, Text und Link in beiden Schemata gesetzt (E4, Tests 7) |
| **m7** History-Test unscharf | `history.length` gleich, In-App-„Zurück“ zur Liste, `goBack()` nicht auf `/angebot/` (Tests 6) |
| **m8** „Mai.“, „Jun.“, „Jul.“ | eigene Liste `MONTHS_SHORT` mit Testfall, `weekTitle` stellt um (E3, Tests 3) |
| **m9** `rhythm` nimmt ein `Date` | `ref = new Date(generatedAt)` für `rhythm` und `uniformTimes(upcomingSessions(offer, ref))` (E3, Tests 1) |
| **m10** Vorschaubild reproduzierbar, Meta-Grenzen | Bricolage-woff2 per `@font-face`, `document.fonts.ready`; Grenzen < 600 kB, ≥ 300 px, ≤ 4 : 1 zitiert, Ziel < 100 kB bleibt (E5) |
| **m11** Smoke: keine Fixture-Seite in `dist/` | Prüfung im Smoke-Test (Tests 9) |
| **m12** knip | `SHARE_DIRS` und `escapeHtml` modulintern, Export nur bei externem Bedarf (E1, E2) |
| **m13** Simplicity Stufe 2 | Kappung bei 60 gestrichen, Parser lehnt erst über 200 Einträge ab (E10, E11); Einfügefeld aus Stufe 2 genommen, offener Punkt N3 nach dem Gerätetest (E14) |
| **m14** Inline-Skript-Regel | in `docs/architecture.md` klargestellt: gilt nur für `index.html` (E7, E8) |
| Zusatz: Budget in N1 | Plan 0018 und der Entscheidungspunkt von Plan 0025 genannt (N1) |

Abgelehnt wurde nichts. ADR-Nummer geprüft (Schritt 1): 0020 ist frei und bleibt.

## Browser-Review live (2026-10-08, ca60ec9) – Stufe 1

Geprüft auf https://zwergenplan.app/ (Screenshots Detail und Anbieter-Sheet in sechs Größen, hell und dunkel; Weiterleitung, Bot-User-Agent, ohne JavaScript, Kopieren, Rückfall-Sheet, verschwundenes Angebot, 404, Kachelbilder in voller Größe, in 300 px und als mittlerer 630 × 630-Ausschnitt). Kein blockierender Befund; Konsole ohne Fehler außer der gewollten 404-Antwort.

| Befund | Umgang |
|---|---|
| **Mittel**: Im quadratischen Ausschnitt der Bildmitte fehlen Pille und Titelanfang (Kriterium aus E18 nicht erfüllt). In 1,91 : 1 und auf 300 px ist alles lesbar. | Offen für den **Gerätetest (Schritt 9)**: Zeigt WhatsApp oder ein anderer genutzter Messenger die Vorschau quadratisch, bekommt die Kachel eine sichere Zone in der Bildmitte (Inhalt ≈ 630 px breit, links bündig). Nicht auf Verdacht umgebaut. |
| Niedrig: Der Toast zeigt immer ein Häkchen, auch bei „Dieses Angebot ist nicht mehr im Zwergenplan.“ | nach `docs/ideas.md` |
| Niedrig: Anbieterseite zählt „43 kommende Angebote“, das Sheet am selben Tag 42; ein Kurs, der vorbei ist, heißt in der Vorschau noch „Kurs ab …“ | erwartbar: Die Vorschau zeigt den Datenstand des Deploys (E3, ADR 0020, Konsequenzen) |

Restpunkte von Stufe 1: Gerätetest durch den Nutzer (Schritt 9, mit dem Kriterium oben). Stufe 2 folgt nach Plan 0025. Der Plan bleibt deshalb `in Umsetzung`.
