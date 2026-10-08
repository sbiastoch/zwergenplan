# Plan 0026 – Teilen per Link: Angebote, Anbieter und Merkliste

Status: Entwurf (2026-10-08), noch ohne Review. Zwei Etappen: **Stufe 1** (Angebote und Anbieter) ist unabhängig umsetzbar. **Stufe 2** (Merkliste) wird eigens gemergt, nach Plan 0025 (Nutzerentscheid N1).
Datum: 2026-10-08
Bezug:
- ADR 0002 (Datenfluss), ADR 0003 (stabile IDs), ADR 0009 (`noindex`), ADR 0012 (Startbudget), ADR 0013 (Service Worker), ADR 0016 (nächtlicher Deploy), **neu ADR 0020** (Entwurf, im selben Commit)
- Plan 0003 (Merkliste nie in der URL), Plan 0010 (Anbieter-Sheet), Plan 0022 (keine „Sticker“-Begriffe), Plan 0025 (Merkliste als Planungszentrale, „Anbieter merken“)

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

- **Bild je Angebot oder Kategorie** in der Vorschau. Alle Seiten nutzen ein generisches Bild (E5). Kategorie-Bilder kommen nach `docs/ideas.md`.
- **Umzug per QR-Code** auf ein anderes Gerät: zurückgestellt, steht in `docs/ideas.md` (Plan 0022). Die Kodierung aus Stufe 2 ist so gebaut, dass sie wiederverwendbar wäre (Versionsfeld).
- **Teilen-Knopf auf den Kacheln** in Liste, Kalender und Karte. Geteilt wird aus dem Detail und dem Anbieter-Sheet.
- **Filter oder Suchen teilen** (`?kat=…`): Das geht schon heute mit der Adresszeile, nur ohne eigene Vorschau.
- **Offline teilen bzw. öffnen**: Eine Vorschauseite ohne Netz zeigt den Fehler des Browsers (E7).
- **Link-Vorschau prüfen oder erzwingen** bei Messengern. Was WhatsApp cacht, liegt nicht in unserer Hand.
- **Kurz-URLs** über einen Dienst: Das wäre ein Drittanbieter (Privatsphäre-Invariante).
- **Merkliste synchron halten** zwischen Geräten oder Personen: Ein geteilter Link ist eine Momentaufnahme.

## Ausgangslage

- **Deep Links**: `src/domain/route.ts:28–40` liest `?angebot=` (geprüft mit `OFFER_ID_PATTERN`) und `?anbieter=` (`KEBAB_ID_PATTERN`, höchstens 80 Zeichen). Der Kopfkommentar `route.ts:1–4` sagt: „Links werden geteilt – Geburtsdatum, Merkliste und Darstellung gehören deshalb nie hierher.“ Das steht auch in Plan 0003, Zeile 75.
- **URL-Pflege**: `src/ui/use-app-state.ts:35` (`urlFor`) baut `pathname + search`, **ohne Fragment**. Jedes `replace` würde ein `#…` also verwerfen. Das ist für Stufe 2 wichtig (E12).
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
- **Service Worker**: `src/sw/routes.ts:223–230`. Die Navigation greift nur für `""` und `index.html` („schale“), alles andere ist `netz`. `scripts/vite-sw.ts:45–56` liest für den Precache nur `<script>` und `<link rel=stylesheet|modulepreload>`. `meta`-Tags stören also nicht.
- **Detail**: Im Kopf `src/ui/DetailDialog.tsx:83–88` (`.dhead`, `justify-content: space-between`, `dialog.css:61`) stehen „Zurück“ und das Herz (`HeartButton inline`). Das Detail liegt im Start-Bundle.
- **Anbieter-Sheet**: `src/ui/anbieter/ProviderSheet.tsx` liegt im Lazy-Chunk `assets/anbieter/`. Sein Fuß `:77–83` hat nur „Schließen“. Die Props stehen in `src/ui/provider-types.ts:38–48`.
- **Toast**: `useToast` steht in `src/ui/use-app-state.ts:178`. Dialoge bekommen ihn als Prop (`Overlays.tsx`), damit er im Top-Layer steht. Die Texte zum Merken nennen noch „Stickerheft“ (`App.tsx:160–168`); Plan 0022 ersetzt sie.
- **Geräte-APIs**: Biome sperrt `navigator` in `src/ui` (`noRestrictedGlobals`). `src/data/geolocation.ts` ist das Muster mit injizierbarer API.
- **Texte**: Datumswörter (`WEEKDAYS`, `WD_SHORT`, `MONTHS`, `src/ui/format.ts:24–40`) liegen in `src/ui`, und `scripts/` darf `src/ui` nicht importieren (`docs/architecture.md`, Schichten). `rhythm`, `uniformTimes` (`src/domain/agenda.ts:201–217`), `berlinKey`, `berlinIsoDate` und `isoWeekday` (`time.ts`) sind schon in der Domäne.
- **Icons**: `scripts/icons.ts` rendert PNGs aus `design/icon.svg` mit Playwright-Chromium, ohne neues Paket, und schreibt nach `public/icons/` (committet).
- **Budget**: `JS (initial)` 100 kB. Den letzten Stand führt die Delta-Tabelle in ADR 0012 (92,78 kB nach Plan 0017, danach Pläne 0020/0021 ohne Eintrag): **vorher neu messen.** `dist/angebot/**` fällt nicht unter ein Budget, denn die Muster in `.size-limit.json` greifen nur in `dist/assets/` und `dist/data/`.
- **Merkliste**: `src/data/preferences.ts:9, 44, 52` (`zwergenplan.merkliste`, JSON-Array von IDs). `src/domain/saved.ts:1–4`: Unbekannte IDs werden nur ausgeblendet, nie gelöscht. Plan 0025 (parallel, Branch `plan-0025-merkliste`, beim Schreiben noch nicht gepusht) bringt „Anbieter merken“ mit eigenem Schlüssel und baut `SavedView` um: Liste, Karte und Kalender, der Tab „Kalender“ entfällt.
- **ADR-Nummer**: Auf `main` und allen Branches ist 0019 die letzte. 0020 ist frei, die Pläne 0022–0025 könnten sie aber ebenfalls beanspruchen.

## Entscheidungen – Stufe 1 (Angebote und Anbieter)

### E1 – Geteilt wird die Vorschauseite, nicht die Query-URL

- Der Knopf teilt `https://zwergenplan.app/angebot/<offerId>/` bzw. `…/anbieter/<providerId>/`. Nur diese URL hat eigene `og:`-Tags, `/?angebot=` liefert immer die generische `index.html`.
- **Pfade**: `angebot/` und `anbieter/`, genau wie die Query-Namen. Sie sind lesbar, und die Länge spielt bei 95 Zeichen ID keine Rolle. Abschließender Schrägstrich, damit Pages `index.html` ohne 301 liefert.
- Einzige Quelle ist `src/domain/share.ts` (rein, im Start-Bundle):
  ```ts
  export const SHARE_DIRS = { offer: "angebot", provider: "anbieter" } as const;
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
  export function escapeHtml(text: string): string;  // & < > " '
  ```
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
| regelmäßig, `rhythm(offer, generatedAt).weekly` | `{title} · jeden {Wochentag}, {Uhr}` (Uhr nur bei `uniformTimes`) | „Offener Krabbeltreff · jeden Mittwoch, 9:30“ |
| regelmäßig, gleicher Wochentag, nicht wöchentlich | `{title} · {Wochentag}s` | „… · Samstags“ |
| regelmäßig, sonst | `{title} · regelmäßig` | |

- Einmalig und Kurs: Das Datum ist ein fester Teil der ID (ADR 0006) und veraltet nicht. Ist der Termin vorbei, solange das Angebot noch in den Daten steht, zeigt die App das Ende.
- „Jetzt“ für `rhythm` ist `generatedAt` des Datenstands, wie bei den ICS-Dateien (`icsContextFor`).
- `og:description` (höchstens 200 Zeichen, gekürzt am Wortende mit „…“): `{Ort}, {Stadtteil} · {Alter} · {Kosten} · {Anmeldung} – {Anbieter}`.
  - Beispiel: „Familientreff Beispielhaus, Gostenhof · 0–12 Monate · Kostenlos · Ohne Anmeldung – Familientreff Beispiel“.
  - Die Bausteine sind dieselben Texte wie im Detail (`costLabel`, `registrationLabel`, `ageRangeLabel`).
- **Anbieter**: `og:title` = Name. `og:description` = `{n} kommende Angebote im Zwergenplan · {Kategorien, höchstens 3} · {Stadtteile, höchstens 3}`. „Kommend“ zählt wie das Sheet, relativ zu `generatedAt`. Bei 0 Angeboten steht nur „Im Zwergenplan“ davor.
- `<title>` = `og:title` + „ – Zwergenplan“. Dazu kommt `<meta name="description">` mit dem Text von `og:description`.
- **Wo die Texte liegen**: Datumswörter und die drei Label-Funktionen ziehen aus `src/ui/format.ts` nach **`src/domain/labels.ts`** (rein). `format.ts` re-exportiert sie, damit keine Aufrufer wandern; das Bundle bleibt gleich (Tree-Shaking). So gibt es keine zweite Schreibweise. Die Kombination für die Vorschau steht in `scripts/lib/share-pages.ts`, denn nur der Build braucht sie.

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
<style>/* ≈ 10 Zeilen: Systemschrift, zentriert, hell/dunkel per color-scheme, Link ≥ 44 px */</style>
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
  if (!/facebookexternalhit|Facebot|Twitterbot|WhatsApp|TelegramBot|Slackbot|Discordbot|SkypeUriPreview|LinkedInBot|Signal/i.test(navigator.userAgent)) location.replace(document.getElementById("go").href);
  ```
  - Keine Daten im Skript, also kein Escaping-Risiko in JS.
  - Das Ziel ist das `href` des sichtbaren Links, eine Quelle für Mensch und Skript.
  - Die Bot-Liste ist ein Schutz für Abrufer, die JavaScript ausführen könnten. iMessage sendet `facebookexternalhit … Twitterbot`. WhatsApp, Signal und Telegram führen nach heutigem Wissen kein JavaScript aus, die Liste schadet dort nicht. Ob die Vorschauen wirklich ankommen, prüft der Browser-Review am Gerät (Schritt 9).
  - `href` ist bei `BASE = "/"` absolut-pfadig (`/?angebot=…`). Der Generator setzt `BASE` aus `site.config.ts` davor, nicht fest `/`.
- **Kein `meta refresh`** (ADR 0020, Alternativen): Ein Abrufer, der ihm folgt, läse die Tags der generischen `index.html`.
- **`og:url` ist die Seite selbst.** Zeigte sie auf `/?angebot=`, holte Facebooks Abrufer dort die generische Vorschau.
- **Ohne JavaScript** (selten, z. B. Lesemodus oder blockiertes JS) sieht man Titel, Beschreibung und einen deutlichen Link. Das ist eine eigene „Ansicht“, deshalb mit Mobile-UX-Gate (Tests 6).
- **Größe**: Ziel ≤ 2,5 kB je Seite. Der Build bricht ab, wenn eine Seite 4 kB übersteigt (Backpressure gegen ausufernde Texte; Beschreibung ist auf 200, Titel auf 83 + 40 Zeichen begrenzt).

### E5 – Vorschaubild und `og:`-Tags in `index.html`

- **Bild** `public/og/vorschau-v1.jpg`: 1200 × 630 (1,91 : 1, das Format, in dem WhatsApp das große Vorschaubild zeigt), JPEG, Ziel < 100 kB (WhatsApp zeigt Bilder über etwa 300 kB oft nicht). Motiv: App-Icon links auf Papierfläche, rechts „Zwergenplan“ und „Angebote für Kinder unter 3 in Nürnberg“.
  - Es entsteht reproduzierbar in `scripts/icons.ts` als weitere Variante (`page.screenshot({ type: "jpeg", quality: 85 })`) und wird committet wie die Icons.
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
    - `NotAllowedError`/`TypeError` → weiter zum Kopieren.
  - Ohne `share` oder nach dem Fehler: `writeText(url)` → `"kopiert"`, scheitert das → `"fehler"`.
  - `browserShareApi()` bindet `navigator.share` und `navigator.clipboard.writeText` nur, wenn sie da sind (`canShare` wird nicht gebraucht, bei URLs ist es immer wahr).
  - **Synchroner Aufruf im Tipp-Handler**: Safari verlangt eine Nutzer-Aktivierung. Deshalb gibt es kein `import()` und kein `await` vor `share`; das Modul liegt im Start-Bundle (Budget: E9).
- **UI-Hilfe** `useShare(say)` in `src/ui/use-app-state.ts`, gibt `(target: { title: string; path: string }) => void` zurück. Sie ruft `shareLink` und meldet:
  - `"kopiert"` → „Link kopiert – zum Einfügen in WhatsApp & Co.“
  - `"fehler"` → „Teilen ging hier nicht. Die Adresse oben öffnet das Angebot auch.“
  - `"geteilt"` / `"abgebrochen"` → nichts (das System hat schon Rückmeldung gegeben).
  - Texte als Konstanten in `src/ui/format.ts` (`SHARE_COPIED`, `SHARE_FAILED`).
- **Detail** (`DetailDialog.tsx:83–88`): Rechts im Kopf steht eine Gruppe `<div className="dhead-actions">` mit `iconbtn` „Teilen“ (Icon `share`, `aria-label="Teilen"`, 44 × 44) und danach dem Herz. Neue Prop `onShare: (offer: SiteOffer) => void`, verdrahtet in `Overlays.tsx`/`App.tsx` mit `share({ title: offer.title, path: offerSharePath(offer.id) })`.
- **Anbieter-Sheet** (`ProviderSheet.tsx:77–83`): Der Fuß wird zu `Teilen` (`btn`, Icon `share`) + `Schließen` (`btn primary`), im vorhandenen `.sheetfoot` (Flex-Wrap, bricht bei 200 % Schrift um). Neue Prop `onShare: (provider: { id: string; name: string }) => void` in `ProviderSheetProps` (`provider-types.ts`), gesetzt in `Overlays.tsx`. Das Sheet ruft sie synchron im Klick.
- **Icon** `share` in `icons.tsx`: Strich-Icon „Kasten mit Pfeil nach oben“, kennen beide Plattformen. `PATHS.share = "M12 3v12M8 7l4-4 4 4M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"`.
- **Privatsphäre**: Der Pfad entsteht nur aus der ID, nie aus `location`. Aktive Filter, Ansicht, Geburtsdatum und Startpunkt können also nicht hineingeraten (E2E, Tests 5).

### E7 – Weg verschwundener Angebote: `404.html` und Hinweis in der App

- `notFoundPage()` erzeugt `public/404.html` (Pages liefert sie für jeden unbekannten Pfad mit Status 404):
  - `noindex`, kein `og:` (eine Vorschau für „gibt es nicht“ wäre irreführend; der Messenger zeigt dann den Link ohne Karte).
  - Ein Skript ordnet `^{BASE}angebot/([a-z0-9-]{1,200})/?$` → `{BASE}?angebot=$1` und `^{BASE}anbieter/([a-z0-9-]{1,80})/?$` → `{BASE}?anbieter=$1` zu, sonst kein Sprung. Die App prüft die IDs danach noch einmal (`parseRoute`).
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
  - Privatsphäre: Ein geteilter Link enthält nur eine öffentliche ID (Stufe 2: Fragment).

### E9 – Budget und Größen

- **Start-JS**: `src/domain/share.ts` (Pfade), `src/data/share.ts`, `useShare`, Icon, zwei Toast-Texte, Hinweis bei unbekanntem Angebot. Geschätzt +0,3–0,4 kB. Messen vorher und nachher, Zeile in der Delta-Tabelle von ADR 0012. Der Anbieter-Teil liegt im Lazy-Chunk `Anbieter JS` (6 kB, +≈ 0,05 kB).
- **Artefakt**: etwa 410 Seiten × ≈ 2 kB ≈ 0,8 MB roh, dazu das Bild < 100 kB. Die ICS-Dateien sind schon heute ein Vielfaches. Kein neues size-limit, dafür die harte 4-kB-Grenze je Seite (E4) und die Zählzeile im Build-Log.
- **Build-Zeit**: Strings bauen und rund 410 `writeFileSync`, gemessen erwartet unter 0,2 s. Läge es über 2 s, schreibt der Build eine `::warning::` wie bei der Wegzeit.

## Entscheidungen – Stufe 2 (Merkliste teilen)

> Eigene Etappe, eigener Branch, eigener Merge. Sie setzt Plan 0025 voraus (gemerkte Anbieter, neue `SavedView`). Vor dem Start von Stufe 2 werden E10–E15 an den gemergten Stand von 0025 angepasst: Ort des Knopfs und Name des Schlüssels für Anbieter.

### E10 – Kodierung v1: Kurz-IDs im Fragment

- Form: `{SITE_URL}#merkliste=1.{A}` bzw. mit Anbietern `…#merkliste=1.{A}.{P}`.
  - `1` ist die Formatversion.
  - `{A}` sind die Kurz-IDs der Angebote, `{P}` die der Anbieter, jeweils **ohne Trenner** aneinandergereiht (je genau 8 Zeichen).
  - Nur `[0-9a-z.]`: Kein Messenger schneidet das ab oder kodiert es um. Satzzeichen am Ende wie `,` oder `)` würden manche Link-Erkennungen abtrennen.
- **Kurz-ID** `shortId(id)`: cyrb53 (53-Bit-Hash, Seed 0) über die UTF-16-Zeichen der ID, dann `(h % 36 ** 8).toString(36).padStart(8, "0")`. Das sind 41 Bit, rein und synchron, etwa 15 Zeilen in `src/domain/share.ts`. Feste Testvektoren werden test-first ermittelt und eingefroren.
- **Kollisionen**:
  - Bei 1 000 IDs ist die Wahrscheinlichkeit etwa 2 · 10⁻⁷.
  - Trotzdem prüft `build-data` alle aktuellen Angebots-IDs und getrennt alle Anbieter-IDs: Gleiche Kurz-IDs → Exit 1 mit „Kurz-ID-Kollision (Plan 0026, E10): … – Format v2 nötig“.
  - v2 hieße dann z. B. 10 Zeichen. Der Parser kennt die Version und lehnt Unbekanntes ab.
- **Länge**: 30 Angebote → `https://zwergenplan.app/#merkliste=1.` (37 Zeichen) + 240 = **277 Zeichen**, 60 Angebote ≈ 520. WhatsApp erlaubt etwa 65 000 Zeichen je Nachricht, die Link-Erkennung kommt mit 277 Zeichen ohne Sonderzeichen zurecht.
- **Obergrenzen**: höchstens 60 Angebote und 60 Anbieter. Der Parser lehnt längere Fragmente ab, kein Aufwand für Riesenlisten. Beim Senden mit mehr als 60 gehen die 60 nächsten (nach Termin), und der Toast sagt „Die nächsten 60 Angebote geteilt“.
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

- `useSharedList()` in `src/ui/use-app-state.ts`:
  - liest im `useState`-Initialisierer **einmal** `window.location.hash` und parst ihn mit `parseSharedList`,
  - entfernt das Fragment danach per `history.replaceState(history.state, "", pathname + search)`.
  - Das läuft **vor** dem ersten `replace` aus `useRoute`, sonst verwirft `urlFor` das Fragment (Ausgangslage). Die Reihenfolge sichert ein Aufruf in `App` vor `useRoute` und ein E2E-Test.
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

### E14 – iOS-App: Link einfügen

- Auf iOS öffnet ein Link aus WhatsApp in Safari, nicht in der Home-Bildschirm-App, und Safari hat einen anderen `localStorage`. „Alle übernehmen“ landete dann in Safari, die App bliebe leer.
- Gegenmittel (Nutzerentscheid N3, Empfehlung ja):
  - Die Merkliste bekommt unten den Textknopf „Geteilte Liste öffnen“. Er öffnet ein Feld „Link hier einfügen“ (Eingabe ≥ 16 px, `inputmode="url"`). Ein gültiger Link öffnet dasselbe Sheet (E13).
  - Im Sheet steht in Safari außerhalb der App (`display-mode` nicht `standalone`, gelesen über `src/data/pwa.ts`, lazy) der Hinweis: „Nutzt du den Zwergenplan als App? Dann kopiere den Link und füge ihn dort in der Merkliste ein.“ Daneben steht der Knopf „Link kopieren“.
  - Kein `clipboard.readText`: Das braucht auf iOS eine Rückfrage und auf Android eine Berechtigung, das Feld ist einfacher.

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
   - **Escaping**: Titel `Tom & Jerry's "<script>"` steht als `Tom &amp; Jerry&#39;s &quot;&lt;script&gt;&quot;` in `<title>`, `og:title` und `h1`. Kein `<script>` außer dem einen festen.
   - Ungültige ID (`../x`) → Wurf.
   - `og:url` = `SITE_URL + "angebot/<id>/"`, `href` von `#go` = `BASE + "?angebot=<id>"`.
   - Das Redirect-Skript ist für zwei verschiedene Angebote byte-gleich.
   - Determinismus: zweimal erzeugt → gleiche Bytes. Eine andere Systemzeit (`vi.setSystemTime`) ändert nichts.
   - Größe: das längste Fixture-Angebot < 4 kB.
   - Anbieter: Zählung relativ zu `generatedAt`, höchstens 3 Kategorien und Stadtteile, Text bei 0 Angeboten.
   - `notFoundPage()`: enthält `noindex`, kein `og:`, beide Muster.
2. **Unit `src/domain/share.test.ts`**: Pfade, `offerAppSearch` stimmt mit `routeToSearch` überein, `parseRoute(offerAppSearch(id)).offerId === id`.
3. **Unit `src/domain/labels.test.ts`**: Die verschobenen Funktionen liefern dieselben Texte (bestehende Fälle aus `format.test.ts` ziehen mit).
4. **Unit `src/data/share.test.ts`** mit injizierter API:
   - `share` ok → „geteilt“,
   - `AbortError` → „abgebrochen“, `writeText` nicht gerufen,
   - `NotAllowedError` → `writeText` → „kopiert“,
   - kein `share` → „kopiert“,
   - beides scheitert → „fehler“,
   - `share` bekommt kein `text`.
5. **Unit `src/sw/routes.test.ts`**: Navigation auf `angebot/x/`, `anbieter/y/` und `404.html` → `"netz"`.
6. **E2E `e2e/teilen.spec.ts`** (neu, Fixture-Build):
   - **Detail**: Stub `navigator.share` per `addInitScript` (zeichnet Aufrufe auf). Detail öffnen, mit aktivem Filter `?kat=…`, Geburtsdatum und Startpunkt gesetzt, „Teilen“ tippen.
     - Aufgerufen genau einmal mit `url` = `{origin}/angebot/<id>/`, ohne `?`, ohne Geburtsdatum, ohne `kat`.
     - `title` = Angebotstitel. Kein Toast.
   - **Fallback**: `navigator.share` auf `undefined`, `navigator.clipboard.writeText` gestubbt → Toast „Link kopiert …“ im Detail sichtbar, kopierter Text = URL. Ein gestubbtes Scheitern → Toast „Teilen ging hier nicht …“.
   - **Abbruch**: Stub wirft `AbortError` → kein Toast.
   - **Anbieter-Sheet**: „Teilen“ im Fuß → URL `{origin}/anbieter/<id>/`.
   - **Vorschauseite**: `request.get("/angebot/<id>/")` → 200, `og:title`, `og:description`, `og:image`, `og:url`, `robots noindex` vorhanden, Werte wie Unit-Test.
   - **Weiterleitung**: `page.goto("/angebot/<id>/")` → URL wird `/?angebot=<id>`, das Detail ist offen, `history.length` steigt nicht (Zurück schließt das Detail, landet nicht auf der Vorschauseite).
   - **Bot**: Kontext mit `userAgent: "WhatsApp/2.23.20 A"` → bleibt auf der Seite, Link sichtbar.
   - **Ohne JavaScript** (`javaScriptEnabled: false`): Titel und Link sichtbar, Link führt ins Detail.
   - **Verschwundenes Angebot**: `page.route("**/angebot/gibt-es-nicht--x--y/", r => r.fulfill({ status: 404, path: "dist-e2e/404.html" }))` → Sprung nach `/?angebot=gibt-es-nicht--x--y` → Startseite, Toast „Dieses Angebot ist nicht mehr im Zwergenplan.“, kein `angebot=` in der URL.
   - Prüfen in Schritt 1, ob `vite preview` `/angebot/<id>/` als `angebot/<id>/index.html` ausliefert. Falls nicht: Tests auf `…/index.html` und ein Satz im Test, warum.
7. **E2E Mobile-UX** (`e2e/mobile-ux.spec.ts`): Zustände
   - `detail` (vorhanden) prüft jetzt den Kopf mit drei Knöpfen bei 320 px und 200 %,
   - `anbieter-sheet` (vorhanden) den zweiteiligen Fuß,
   - neu `vorschauseite-ohne-js` (eigener Kontext ohne JavaScript, hell und dunkel).
8. **E2E PWA** (`e2e/pwa.spec.ts`, Chromium mit Service Worker): Nach der Registrierung `goto("/angebot/<id>/")` → Detail offen, keine Konsolenfehler. Der Navigation-Preload-Hinweis ist nur eine Warnung; falls doch ein Fehler kommt: Ursache beheben, nicht freischalten.
9. **Smoke** (echte Daten, `dist/`): Für das erste und das letzte Angebot aus `site.json` und einen Anbieter aus `anbieter.json` antwortet die Seite mit 200 und enthält den escapten Titel. `dist/404.html` ist vorhanden. `__zpMap` fehlt wie bisher.
10. **Build-Gate**: `build-data` schreibt so viele Seiten, wie es Angebote und Anbieter gibt. Wirft bei einer Seite > 4 kB (Unit für die Prüffunktion `checkSharePages(pages)` in `share-pages.ts`).

**Stufe 2**

11. **Unit `src/domain/share.test.ts`**:
    - `shortId`-Testvektoren (eingefroren), `encodeSharedList`/`parseSharedList` hin und zurück, Duplikate, Reihenfolge,
    - ungültig: Version 2, Länge nicht durch 8 teilbar, Großbuchstaben, > 60, leer,
    - `resolveShared` ignoriert Unbekanntes,
    - Kollisionsprüfung `findShortIdCollisions(ids)` (künstliche Kollision über eine injizierte Hashfunktion).
12. **Unit `src/domain/saved.test.ts`**: `mergeSaved` hängt nur Neues an und entfernt nichts.
13. **E2E `e2e/teilen.spec.ts`, Merkliste**:
    - Senden: zwei Angebote merken, „Liste teilen“ (Stub) → `url` matcht `/#merkliste=1\.[0-9a-z]{16}$/`, `text` „2 Angebote aus meiner Zwergenplan-Merkliste“. Kein Geburtsdatum, keine Query.
    - Empfangen in neuem Kontext mit einem schon gemerkten dritten Angebot:
      - Sheet mit 2 Kacheln, „Alle übernehmen (2)“ → Merkliste hat 3. Das alte ist noch da.
      - Fragment aus der URL entfernt, kein Request enthält `merkliste`.
    - Teilweise: Herz auf einer Kachel → genau dieses gemerkt.
    - Kaputter Link → Toast, kein Sheet.
    - Einfügefeld (E14): Link einfügen → dasselbe Sheet.
14. **E2E Mobile-UX**: Zustand `geteilte-merkliste` (Sheet mit 2 Kacheln und Hinweis auf fehlende Einträge) und `merkliste-link-einfuegen`.

## Schritte

**Stufe 1** (Branch `teilen-0026-s1`)

1. Inventar und Probe:
   - `grep -rn "angebot=\|anbieter=\|og:\|Stickerheft" src e2e scripts`.
   - Start-JS auf aktuellem `main` messen (`pnpm build && pnpm size`).
   - Prüfen, ob `vite preview` Verzeichnis-Indizes ausliefert (Tests 6).
   - Prüfen, ob die Pläne 0022–0025 inzwischen eine ADR-Nummer ≥ 0020 belegen; dann ADR 0020 umnummerieren.
2. `src/domain/labels.ts` herauslösen (Tests 3), `format.ts` re-exportiert. `pnpm check:fast` grün, Bundle-Hash unverändert oder Start-JS ±0.
3. `src/domain/share.ts` (Pfade) test-first (Tests 2).
4. `scripts/lib/share-pages.ts` test-first (Tests 1, 10). Danach die Verdrahtung in `build-data.ts`, `.gitignore`, Log-Zeile.
5. Vorschaubild in `scripts/icons.ts`, `public/og/vorschau-v1.jpg` erzeugen und committen. `index.html` und das Plugin `zp-site-url` (E5).
6. `src/data/share.ts` test-first (Tests 4), `useShare`, Icon, Knopf im Detail und im Anbieter-Sheet, Toast bei unbekanntem Angebot (E6, E7). `src/sw/routes.test.ts` ergänzen (Tests 5).
7. E2E und Smoke (Tests 6–9). `PW_PORT=4273 pnpm check:fast`, dann `PW_PORT=4273 pnpm check`.
8. Doku: `docs/architecture.md` (E8), ADR 0020 auf „angenommen (Stufe 1)“, Delta in ADR 0012, `docs/ideas.md` („Vorschaubild je Kategorie“, „Teilen auf der Kachel“). `/arch-review` (neues Modul, mehr als 200 Zeilen), Branch pushen, CI grün, Fast-Forward nach `main`, CI auf `main` grün.
9. `/browser-review live` und **Gerätetest** durch den Nutzer:
   - Link aus dem Detail per WhatsApp (Android und iOS) an sich selbst schicken: Erscheint die Vorschau mit Titel, Beschreibung und Bild? Öffnet ein Tipp das Detail?
   - Dasselbe mit Signal und iMessage, falls vorhanden.
   - Ergebnis als Abschnitt hier eintragen. Bleibt die Vorschau in einem Messenger aus: Befund notieren, mit einer Quelle prüfen (z. B. Bot-Liste oder Bildgröße) und erst dann ändern.

**Stufe 2** (Branch `teilen-0026-s2`, erst nach dem Merge von Plan 0025 und mit Entscheidung N1)

10. E10–E15 an den Stand von Plan 0025 anpassen (Ort des Knopfs, Schlüssel gemerkter Anbieter, Kachel für Anbieter), kurzer Nachtrag hier und ein `/plan-review` nur für Stufe 2.
11. `shortId`, Kodierung und `mergeSaved` test-first (Tests 11, 12). Kollisionsprüfung in `build-data`.
12. `useSharedList` (Reihenfolge vor `useRoute`), Sheet, Senden, Einfügefeld (E12–E15). Budget messen (E13, ggf. lazy).
13. E2E und Mobile-UX (Tests 13, 14), `pnpm check`.
14. Doku: Vermerk in Plan 0003, Zeile 75, und im Kopfkommentar von `route.ts`; `docs/architecture.md`, Privatsphäre (Fragment-Ausnahme); ADR 0020 auf „angenommen“; Delta in ADR 0012. `/arch-review`, CI, Fast-Forward, `/browser-review live`, Gerätetest iOS Safari → App (E14).

## Offene Punkte (Nutzerentscheid)

- **N1 – Stufe 2 jetzt oder später?** **Empfehlung: später**, als eigene Etappe direkt nach dem Merge von Plan 0025.
  - Plan 0025 baut `SavedView` um (Liste, Karte, Kalender) und führt „Anbieter merken“ ein. Stufe 2 hängt an beidem: am Ort des Knopfs, am Speicherschlüssel und an der Kachel für Anbieter. Parallel gebaut gäbe es Konflikte und doppelte Arbeit.
  - Stufe 1 bringt den größten Nutzen (einzelne Angebote in WhatsApp) und ist davon unabhängig.
- **N2 – Datum in der Vorschau regelmäßiger Angebote.** **Empfehlung: Rhythmus** („jeden Mittwoch, 9:30“) statt „nächster Termin Mi 14. Okt.“ (E3). Der nächste Termin veraltet zwischen zwei Deploys und im Cache des Messengers, und der Build hinge an der Uhr. Einmalige Termine und Kurse zeigen ihr festes Datum.
- **N3 – Einfügefeld für iOS-App-Nutzer (Stufe 2, E14).** **Empfehlung: ja.** Ohne Feld können Empfänger, die den Zwergenplan als iOS-App nutzen, eine geteilte Liste nur in Safari übernehmen, nicht in ihrer App. Kosten: ein Textknopf, ein Feld und ein Hinweis, geschätzt +0,2 kB.
- **N4 – Vorschaubild.** **Empfehlung: ein generisches Bild** (Icon und Schriftzug, E5). Bilder je Kategorie wären hübscher, kosten aber 12 Motive, Pflege und Gestaltung. Sie kommen nach `docs/ideas.md`.

## Risiken

- **Messenger-Verhalten ist nicht spezifiziert.** Wann WhatsApp große oder kleine Vorschauen zeigt, wie lange es cacht und ob iMessage JavaScript ausführt, ist nur empirisch bekannt. Abgesichert durch Standard-Tags, ein Bild in 1,91 : 1 unter 100 kB, die Bot-Ausnahme, kein `meta refresh` und den Gerätetest (Schritt 9).
- **Pfadvertrag**: Wer später `angebot/` umbenennt, bricht alle geteilten Links. ADR 0020 hält ihn fest.
- **Bot-Liste zu breit**: Ein Mensch mit „Signal“ oder „WhatsApp“ im User-Agent (In-App-Browser) bliebe auf der Seite und müsste den Link tippen. Das ist unschön, aber keine Sackgasse. Fällt es im Gerätetest auf, wird die Liste enger.
- **ADR-Nummer**: Kollision mit parallelen Plänen möglich (Schritt 1).

## Review

Noch keiner. Nächster Schritt: `/plan-review docs/plans/0026-teilen-per-link.md`.
