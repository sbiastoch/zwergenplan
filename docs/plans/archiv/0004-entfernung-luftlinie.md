# Plan 0004 – Entfernung als Luftlinie ab einem Startpunkt

Status: abgeschlossen, live seit 7740fd5 (2026-10-05). Restpunkte stehen in `docs/ideas.md`, „Offen aus abgeschlossenen Plänen“ (Plan 0027, Etappe 6). Früherer Status: umgesetzt auf Branch `entfernung-0004` (Schritte 2–7, Basis `nacharbeit-0007`), Arch-Review eingearbeitet → offen: Schritt 8 (Push, CI, Fast-Forward nach `main`) und 9 (`/browser-review live`)
Datum: 2026-10-04
Bezug: Plan 0003 (E1: „Karte und Entfernung kommen in Plan 0004“), ADR 0005 (ÖPNV-Fahrzeit als Ziel). Die Karte folgt in Plan 0005 (ADR 0008) und baut auf diesem Plan auf.

## Ziel

Jedes Angebot zeigt eine **Entfernung** ab einem selbst gewählten Startpunkt, und man kann nach Umkreis filtern. Vom Nutzer entschieden: Die Entfernung ist zunächst die **Luftlinie**. Die ÖPNV-Fahrzeit (ADR 0005) ersetzt sie später hinter derselben Schnittstelle. Am Ende gilt:

- Im Kind-Sheet gibt es wieder den Abschnitt **„Entfernung ab“** (Plan 0003, E1). Der Startpunkt kommt entweder von **„Meinen Standort nutzen“** (Geolocation, nur auf Tipp) oder aus einer **kurzen Stadtteil-Liste** (35 geläufige Namen).
- Ist ein Startpunkt gesetzt, zeigt die Kachel „… · 1,4 km“. Das Detail zeigt „ca. 1,4 km Luftlinie ab Gostenhof“. Die Statuszeile sagt, dass es Luftlinie ist.
- Das Filter-Sheet hat die Gruppe „Entfernung: bis 2 / 5 / 10 km“ (`umkreis=` in der URL).
- **Kein Drittanbieter, keine neue Abhängigkeit.** Alles rechnet lokal. Der Standort verlässt das Gerät nie und wird nicht gespeichert, gespeichert wird höchstens die ID eines Stadtteils.
- Die Mobile-UX-Gates sind für das erweiterte Kind-Sheet und das Filter-Sheet grün, hell und dunkel. Die Budgets bleiben (JS 90 kB, CSS 15 kB).

## Nicht-Ziele

- **Karte**, Orts-Liste, Orts-Sheet, „Kartenmitte als Startpunkt“, MapLibre, OpenFreeMap: Plan 0005 (ADR 0008).
- **ÖPNV-Fahrzeit** (GTFS-Matrix, `nearestStops`): eigener Plan nach ADR 0005. Hier entsteht nur die Schnittstelle (E2, E9).
- **Sortierung der Liste nach Entfernung.** „Entdecken“ bleibt nach Tagen gruppiert (Plan 0003, E7), denn „wann“ ist für Eltern die erste Frage.
- Adresssuche (Geocoding wäre ein Drittanbieter), Gewichtung nach `ring`.
- Normalisierung der 51 `district`-Texte in den Daten. Die Kachel zeigt sie weiter wie bisher.
- Schemaänderung. `Venue.geo` ist schon Pflicht und reicht.

## Ausgangslage und Voraussetzungen

- **Voraussetzung:** Die Nacharbeit zu Plan 0003 ist umgesetzt und live, also die Befunde B1, B2, B5, B6 und B7 aus „Browser-Review live (2026-10-04)“ in Plan 0003. Das ist ein eigener kleiner Plan und wird hier nicht ausgearbeitet. Grund: B5 (Kopfzeile bei 360–370 px) und B7 (200 % bei 320 px) betreffen genau die Sheets und Kacheln, die dieser Plan erweitert. B6 (CLS beim Schrift-Swap) betrifft die Meta-Zeile der Kachel, die hier länger wird.
- `Venue.geo` `{lat, lon}` ist Pflicht und wird gegen `NUERNBERG_BBOX` geprüft (lat 49,30–49,65, lon 10,85–11,30). Die Konstante liegt heute lokal in `src/domain/schema.ts`. `SiteOffer.venue` enthält `name`, `address`, `district?`, `ring` und `geo`.
- Echte Daten (Stand 2026-10-04): 333 Angebote an 82 genutzten Orten mit 76 verschiedenen Koordinaten, Ausdehnung lat 49,389–49,522, lon 11,005–11,196. 51 verschiedene `district`-Texte, 18 Orte ohne.
- Fixture-Daten: 5 Orte. Familientreff Beispielhof (49,4521 / 11,0767, 4 Angebote), Musikschule (49,4362 / 11,0851), Bibliothek (49,4498 / 11,0812), Theater (49,4495 / 11,0601, 2 Angebote), Gemeinde (49,4301 / 11,0892).
- Budgets am Stand `d27ac67`: JS 81,9 / 90 kB, CSS 8,5 / 15 kB (gzip). Die Nacharbeit zu 0003 kann daran etwas ändern; der Ausgangswert wird deshalb in Schritt 2 neu gemessen.
- Präferenzen liegen in `src/data/preferences.ts` (`zwergenplan.*`, `try/catch`), der Zustand dazu in `src/ui/use-app-state.ts`. Abgeleitete Ansichten entstehen in `src/ui/use-offer-views.ts`, die Kachel in `OfferCard.tsx` (`CardContext`), die Sheets in `Sheets.tsx` (229 Zeilen).
- `e2e/fixtures.ts`: Der `thirdPartyGuard` macht jeden fremden Origin rot. Für diesen Plan bleibt er unverändert.

## Entscheidungen

### E1 – Luftlinie als Zwischenstufe, das Wort heißt „Entfernung“

- Die Entfernung ist die Luftlinie (Haversine). Ehrlich gekennzeichnet:
  - Die lange Form sagt immer „Luftlinie“.
  - Die kurze Form „1,4 km“ steht nur auf Kacheln. Dort erklärt die Statuszeile darüber „Entfernung als Luftlinie ab Gostenhof“.
- Die UI nennt das Konzept „**Entfernung**“ (Kind-Sheet „Entfernung ab“, Filter „Entfernung“). Mit ADR 0005 wird daraus „Wegzeit“.
- Die Domäne nennt es neutral `Reach` (E2). So braucht der spätere Austausch keine Umbenennung quer durch den Code.

### E2 – Domäne: Geometrie und Entfernung

- `src/domain/geo.ts` (neu):
  - `interface GeoPoint { lat: number; lon: number }`.
  - `NUERNBERG_BBOX`: aus `schema.ts` hierher verschoben. `schema.ts` importiert die Konstante, der Datenvertrag bleibt gleich (`pnpm schema:check` bleibt grün).
  - `inBounds(point)`: Grenzen inklusiv.
  - `haversineMeters(a, b)`: mittlerer Erdradius 6 371 008,8 m.
  - `coarsen(point)`: rundet auf 3 Nachkommastellen, das sind ≈ 110 m Nord-Süd und ≈ 70 m Ost-West.
    - Verfahren: `Math.round(x * 1000) / 1000` je Komponente, danach `-0` → `0` (`|| 0`).
    - Werte genau auf ,xxx5 sind wegen Gleitkomma nicht garantiert aufgerundet. Das ist für eine Unschärfe von 100 m egal, die Tests nutzen deshalb nur Werte abseits davon.
- `src/domain/reach.ts` (neu):
  ```ts
  export type OriginSource = "standort" | "stadtteil"; // Plan 0005 ergänzt "karte"
  export interface Origin { source: OriginSource; point: GeoPoint; label: string; districtId?: string }

  /** Wie weit ein Ort vom Startpunkt weg ist. Heute Luftlinie; mit ADR 0005 kommt { kind: "oepnv"; minutes; … } dazu. */
  export type Reach = { kind: "luftlinie"; meters: number };
  export interface ReachTarget { geo: GeoPoint }              // später + nearestStops
  export function reachTo(origin: Origin, target: ReachTarget): Reach;
  export function compareReach(a: Reach, b: Reach): number;   // < 0: a ist näher
  export const RADII_KM = [2, 5, 10] as const;
  export type RadiusKm = (typeof RADII_KM)[number];
  export type ReachLimit = { kind: "km"; value: RadiusKm };   // später { kind: "minuten"; value }
  export function withinLimit(reach: Reach, limit: ReachLimit): boolean; // ungerundete Meter ≤ value · 1000
  export function roundedDistance(meters: number): { unit: "m" | "km"; value: number };
  ```
- Rundung `roundedDistance`:
  - unter 950 m: auf 100 m, mindestens 100 m;
  - sonst auf 0,1 km;
  - ergibt das ≥ 10 km, auf ganze km.
  - Beispiele: 0 → 100 m, 140 → 100 m, 150 → 200 m, 949 → 900 m, 950 → 1 km, 2 340 → 2,3 km, 2 360 → 2,4 km, 9 940 → 9,9 km, 9 960 → 10 km, 12 400 → 12 km, 12 600 → 13 km.
- Die Domäne kennt kein `navigator`, kein `localStorage` und keine UI (`domain-is-pure` bleibt).

### E3 – Startpunkt: Herkunft und Speicherung

- **Mein Standort:**
  - Nur ein Tipp auf „Meinen Standort nutzen“ ruft `requestPosition()` in `src/data/geolocation.ts` (neu) auf. Nie automatisch, auch nicht beim nächsten Besuch.
  - Optionen: `{ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }`.
  - Ergebnis: `{ ok: true; point: GeoPoint } | { ok: false; reason: "denied" | "unavailable" | "timeout" | "outside" | "unsupported" }`.
  - Die Koordinate wird **in `src/data` sofort** mit `coarsen` gerundet, die Rohkoordinate verlässt die Funktion nie. Liegt der gerundete Punkt außerhalb von `NUERNBERG_BBOX`, ist das Ergebnis `outside`.
  - Die Geolocation-API wird als Parameter übergeben (Standard `navigator.geolocation`), damit der Unit-Test ohne Browser läuft.
  - Fehlt die API oder ist `window.isSecureContext` falsch, ist das Ergebnis `unsupported`, und der Knopf erscheint gar nicht (`canLocate()`).
- **Stadtteil:** Auswahl aus der kurzen Liste in E4.
- **Speicherung** (Nutzerentscheidung 1; **ersetzt durch ADR 0017 / Plan 0016**: Standort und Kartenmitte werden gerundet gespeichert):
  - **Der Standort bleibt nur im Arbeitsspeicher** und ist nach dem Neuladen weg.
  - Gespeichert wird nur ein gewählter Stadtteil, und zwar nur seine ID unter `zwergenplan.entfernung-ab` (`loadOriginDistrict`/`saveOriginDistrict` in `preferences.ts`). Eine unbekannte ID zählt als „kein Startpunkt“.
  - Begründung: Eine Koordinate, auch gerundet, ist praktisch die Wohnadresse. `localStorage` bleibt unbegrenzt liegen. Ein Stadtteil ist grob und öffentlich.
  - Wählt man den Standort, bleibt ein gespeicherter Stadtteil unberührt. Nach dem Neuladen gilt dann wieder der Stadtteil. „Startpunkt entfernen“ löscht beides.
- **Nie** in URL, Logs, Requests oder `console`. Es gibt in diesem Plan keinen Request, der einen Startpunkt brauchen könnte; der E2E-Test beweist, dass nach der Wahl gar kein Request entsteht (E8).
- UI-Zustand: `useOrigin()` in `src/ui/use-app-state.ts`.
  - Liefert `{ origin, locating, problem, canLocate, useMyLocation(), setDistrict(id), clear() }`.
  - `problem` ist der letzte Fehlergrund. Er wird beim nächsten erfolgreichen Setzen gelöscht.

### E4 – Kurze Stadtteil-Liste (Nutzerentscheidung 4)

Die `district`-Texte der Daten taugen nicht als Startpunkt: Es sind 51 uneinheitliche Schreibweisen, 18 Orte haben keinen Eintrag, und Eltern wohnen auch dort, wo es kein Angebot gibt. Darum gibt es eine handverlesene Liste mit 35 geläufigen Namen. Die Koordinaten kommen aus OpenStreetMap: `place=suburb|quarter`-Punkte in der Stadtgrenze Nürnberg, Overpass-Abfrage vom 2026-10-04. Für „Altstadt“ und „Südstadt“, die OSM nicht als Ortsteil-Punkt führt, stehen die Plätze Hauptmarkt bzw. Aufseßplatz. Alle Werte sind auf 3 Nachkommastellen gerundet.

| ID | Name | lat | lon | OSM-Quelle |
|---|---|---|---|---|
| altenfurt | Altenfurt | 49.408 | 11.167 | suburb |
| altstadt | Altstadt | 49.454 | 11.077 | Hauptmarkt (square) |
| buch | Buch | 49.497 | 11.045 | suburb |
| buchenbuehl | Buchenbühl | 49.503 | 11.111 | suburb |
| eberhardshof | Eberhardshof | 49.458 | 11.029 | suburb |
| eibach | Eibach | 49.403 | 11.035 | suburb |
| erlenstegen | Erlenstegen | 49.473 | 11.133 | suburb |
| fischbach | Fischbach | 49.420 | 11.188 | suburb „Fischbach bei Nürnberg“ |
| galgenhof | Galgenhof | 49.443 | 11.085 | suburb |
| gartenstadt | Gartenstadt | 49.415 | 11.078 | suburb |
| gibitzenhof | Gibitzenhof | 49.430 | 11.066 | suburb |
| gleisshammer | Gleißhammer | 49.442 | 11.107 | suburb |
| gostenhof | Gostenhof | 49.448 | 11.058 | suburb |
| grossreuth | Großreuth h. d. Veste | 49.475 | 11.083 | suburb „Großreuth hinter der Veste“ |
| hasenbuck | Hasenbuck | 49.426 | 11.091 | suburb |
| katzwang | Katzwang | 49.350 | 11.059 | suburb |
| langwasser | Langwasser | 49.407 | 11.130 | suburb |
| laufamholz | Laufamholz | 49.466 | 11.163 | suburb |
| maxfeld | Maxfeld | 49.465 | 11.091 | suburb |
| moegeldorf | Mögeldorf | 49.460 | 11.132 | suburb |
| muggenhof | Muggenhof | 49.464 | 11.025 | suburb |
| reichelsdorf | Reichelsdorf | 49.382 | 11.033 | suburb |
| roethenbach | Röthenbach b. Schweinau | 49.422 | 11.029 | suburb „Röthenbach bei Schweinau“ |
| schoppershof | Schoppershof | 49.466 | 11.102 | suburb |
| schweinau | Schweinau | 49.431 | 11.045 | suburb |
| st-jobst | St. Jobst | 49.465 | 11.119 | suburb „Sankt Jobst“ |
| st-johannis | St. Johannis | 49.461 | 11.062 | suburb „Sankt Johannis“ |
| st-leonhard | St. Leonhard | 49.440 | 11.051 | suburb „Sankt Leonhard“ |
| st-peter | St. Peter | 49.444 | 11.098 | suburb „Sankt Peter“ |
| steinbuehl | Steinbühl | 49.440 | 11.069 | suburb |
| suedstadt | Südstadt | 49.441 | 11.080 | Aufseßplatz |
| thon | Thon | 49.479 | 11.061 | suburb |
| woehrd | Wöhrd | 49.454 | 11.095 | suburb |
| zerzabelshof | Zerzabelshof | 49.445 | 11.125 | suburb |
| ziegelstein | Ziegelstein | 49.488 | 11.106 | suburb |

- Datei `src/domain/districts.ts`:
  - `export const DISTRICTS: readonly District[]` mit `{ id, name, point }`, in der Reihenfolge der Tabelle (alphabetisch nach Name, deutsche Sortierung).
  - `districtById(id): District | undefined`.
  - Die **IDs sind fest** (stehen im `localStorage`) und werden nie aus dem Namen abgeleitet.
- Kopfkommentar: Quelle, Datum, Abfrage für Nachprüfungen, „© OpenStreetMap-Mitwirkende, ODbL“:
  ```
  [out:json][timeout:60];
  rel["boundary"="administrative"]["name"="Nürnberg"]["admin_level"="6"];map_to_area->.a;
  node["place"~"suburb|quarter"](area.a);
  out;
  ```
  Der Server braucht einen User-Agent, sonst antwortet er mit 406.
- Die Quellenangabe steht auch im Kind-Sheet (E5). 35 Punkte sind ein unwesentlicher Auszug aus der Datenbank.
- Größe: ca. 0,6 kB gzip.

### E5 – Kind-Sheet „Entfernung ab“

Eigene Komponente `src/ui/OriginPicker.tsx`, in `KidSheet` eingebunden zwischen „Nur passende Angebote“ und „Darstellung“. Inhalt, von oben nach unten:

> **Geändert durch Plan 0021:** Der Schalter „Nur passende Angebote“ darüber ist ins Filter-Sheet gewandert; der `OriginPicker` folgt direkt auf das Geburtsdatum.

- `h3` „Entfernung ab“.
- Zeile „Startpunkt: **Gostenhof**“ / „Startpunkt: **Mein Standort**“ bzw. „Noch kein Startpunkt – dann zeigen wir keine Entfernung.“
- Knopf `.btn` „Meinen Standort nutzen“, nur wenn `canLocate`. Während der Suche ist er `disabled` und heißt „Suche Standort …“.
- `<select>` mit dem Label „Stadtteil“ (Schrift ≥ 16 px). Erste Option „Stadtteil wählen …“ (Wert leer), dann die 35 Namen. Ist der Standort aktiv, steht die Auswahl auf der leeren Option.
- Link-Knopf „Startpunkt entfernen“, nur wenn einer gesetzt ist.
- Hinweis `<p class="hint …" aria-live="polite">`. Es ist eine eigene Live-Region im Dialog; die einzige `role="status"`-Region der Seite bleibt die Statuszeile.
  - Erfolg Standort: „Entfernung ab deinem Standort (auf ca. 100 m gerundet).“
  - `denied`: „Standort nicht freigegeben. Wähle stattdessen einen Stadtteil.“
  - `unavailable`/`timeout`: „Standort gerade nicht verfügbar. Wähle stattdessen einen Stadtteil.“
  - `outside`: „Dein Standort liegt außerhalb von Nürnberg. Wähle einen Stadtteil.“
- `.small`: „Luftlinie, nicht die Fahrzeit. Dein Standort wird nicht gespeichert, ein Stadtteil bleibt auf diesem Gerät. Stadtteile: © OpenStreetMap-Mitwirkende.“

Damit `Sheets.tsx` unter ~250 Zeilen bleibt, wandert `KidSheet` nach `src/ui/KidSheet.tsx`, falls nötig.

### E6 – Anzeige der Entfernung

Nur wenn ein Startpunkt gesetzt ist, sonst entfällt jede Entfernungsangabe.

- **Kachel**: Meta-Zeile „Anbieter · Stadtteil · 1,4 km“.
  - `CardContext` bekommt `reachOf(offer): Reach | undefined`.
  - Berechnet wird in `useOfferViews` einmal je Koordinate (`Map<string, Reach>` mit Schlüssel `${lat},${lon}`), nicht je Render.
  - Gilt überall, wo Kacheln stehen (Entdecken, Kalender, Merkliste).
- **Detail**, Etikett „Wo“: zusätzliche Zeile „ca. 1,4 km Luftlinie ab Gostenhof“ bzw. „… ab deinem Standort“.
- **Statuszeile** (einzige `role="status"`-Region) in „Entdecken“ und „Kalender“: hinter „N Angebote ab heute“ folgt „· Entfernung als Luftlinie ab Gostenhof“. Bei 320 px darf die Zeile umbrechen.
- Formatierung in `src/ui/format.ts`:
  - `distanceShort(reach)` → „1,4 km“ / „400 m“ / „12 km“ (`Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 })` auf `roundedDistance`).
  - `originPhrase(origin)` → „ab Gostenhof“ / „ab deinem Standort“.
  - `distanceLong(reach, origin)` → „ca. 1,4 km Luftlinie ab Gostenhof“.
- Keine Komponente rechnet mit `meters` direkt. Sie rufen nur `reachTo`, `compareReach`, `withinLimit` und die Format-Funktionen (Review-Punkt für `/arch-review`).

### E7 – Filter „Entfernung“ (Umkreis)

- `src/domain/filter.ts`:
  - `FilterState` bekommt `reachLimit?: ReachLimit`.
  - URL-Parameter `umkreis=2|5|10`, kanonisch nach `kosten`. Andere Werte (`3`, `abc`, `-5`, leer) werden verworfen.
  - `FilterContext` bekommt `origin?: Origin`.
  - `applyFilters` wendet das Limit nur mit Startpunkt an (`withinLimit(reachTo(origin, offer.venue), limit)`).
  - `activeFilterCount(filter, { hasOrigin })` zählt den Umkreis **nur mit Startpunkt**. Ohne Startpunkt wirkt er nicht, also zählt er nicht.
  - `EMPTY_FILTER` hat kein Limit, „Zurücksetzen“ löscht es.
- Filter-Sheet: neue Gruppe „Entfernung“ nach „Kosten“, Einfachwahl „Egal“, „bis 2 km“, „bis 5 km“, „bis 10 km“.
  - Ohne Startpunkt sind die drei Werte `disabled`. Darunter stehen „Erst einen Startpunkt wählen.“ und der Link-Knopf „Startpunkt wählen“, der das Filter-Sheet schließt und das Kind-Sheet öffnet.
- `?umkreis=…` ohne Startpunkt (z. B. ein geteilter Link): Der Filter wirkt nicht. Unter der Statuszeile, außerhalb der Status-Region, steht „„bis 5 km“ braucht einen Startpunkt.“ mit dem Link-Knopf „Startpunkt wählen“.
- Kein Schnellfilter-Chip: Die Chip-Leiste ist schon voll, und ohne Startpunkt wäre der Chip tot.
- `umkreis` darf in die URL, weil es ohne Startpunkt nichts verrät. Startpunkt, Stadtteil und Koordinaten stehen **nie** in der URL (Test in `route.test.ts`).

### E8 – Privatsphäre und Tests ohne Netz

- Dieser Plan fügt keinen Request hinzu. Der `thirdPartyGuard` bleibt unverändert scharf.
- E2E-Nachweis: Nach „Meinen Standort nutzen“ und nach der Stadtteilwahl entsteht **kein einziger** Netzwerk-Request. Alle Requests werden ab dem Tipp gesammelt, die Liste muss leer sein.
- Geolocation in E2E:
  - Erfolg über `context.grantPermissions(["geolocation"])` + `context.setGeolocation({ latitude: 49.45213, longitude: 11.07672 })`.
  - Verweigerung über `page.addInitScript`, das `navigator.geolocation.getCurrentPosition` durch einen Aufruf des Fehler-Callbacks mit `{ code: 1 }` ersetzt. So verhält es sich in Chromium und WebKit gleich, ohne Berechtigungsdialog.
- `docs/architecture.md`, Privatsphäre-Invariante: „Der Startpunkt (Standort oder Stadtteil) steht nie in URL, Logs oder Requests. Der Standort wird nur auf Tipp abgefragt, sofort auf ca. 100 m gerundet und nie gespeichert. Gespeichert wird höchstens die ID eines Stadtteils.“ Zusätzlich in der Schichten-Tabelle bei `src/data`: „…, Geolocation“.

### E9 – Ausblick: Karte (Plan 0005) und Wegzeit (ADR 0005)

> **Umgesetzt in Plan 0009** (ADR 0011), mit Abweichungen: keine `nearestStops` in `ReachTarget` (Halt→Ort-Tabelle `wegzeit.json` statt Halt→Halt-Matrix), `reachTo` heißt `airlineReach`, `FilterContext.origin` wurde zu `FilterContext.reach`, `umkreis=` entfällt zugunsten von `wegzeit=`.

- **Plan 0005** ergänzt `OriginSource` um `"karte"` (Kartenmitte) und baut Orte (`places.ts`) auf `reachTo`/`compareReach` auf. Diese Funktionen müssen dafür nicht geändert werden.
- **ADR 0005** bleibt lokal austauschbar:
  - `Reach` bekommt `{ kind: "oepnv"; minutes: number }`.
  - `ReachTarget` bekommt `nearestStops` (dafür muss `SiteOffer.venue` sie in `site.json` mitliefern).
  - `ReachLimit` bekommt `{ kind: "minuten" }` mit URL-Parameter `wegzeit=`.
  - `compareReach`, `withinLimit` und `format.ts` bekommen je einen Zweig.
  - Die UI-Texte wechseln von „Entfernung“ zu „Wegzeit“.

## Struktur

```
src/domain/
  geo.ts (+test)          GeoPoint, NUERNBERG_BBOX (aus schema.ts), inBounds, haversineMeters, coarsen
  reach.ts (+test)        Origin, Reach, ReachTarget, reachTo, compareReach, RADII_KM, ReachLimit, withinLimit, roundedDistance
  districts.ts (+test)    DISTRICTS (35, OSM), districtById
  filter.ts (+test)       + reachLimit/umkreis, FilterContext.origin, activeFilterCount(filter, { hasOrigin })
  route.ts (+test)        unverändert bis auf den Test „kein Startpunkt in der URL“
  schema.ts               importiert NUERNBERG_BBOX aus geo.ts (Vertrag unverändert)
src/data/
  geolocation.ts (+test)  canLocate, requestPosition (gerundet, BBOX, Fehlergründe, API injizierbar)
  preferences.ts          + loadOriginDistrict/saveOriginDistrict (`zwergenplan.entfernung-ab`)
src/ui/
  OriginPicker.tsx        „Entfernung ab“
  KidSheet.tsx            (nur falls Sheets.tsx zu lang wird)
  Sheets.tsx              FilterSheet + Gruppe „Entfernung“
  OfferCard.tsx           Meta-Zeile mit Entfernung (CardContext.reachOf)
  DetailDialog.tsx        „Wo“ mit Entfernung
  App.tsx                 Statuszeile, Umkreis-Hinweis, Verdrahtung
  format.ts (+test)       distanceShort, distanceLong, originPhrase
  use-app-state.ts        + useOrigin
  use-offer-views.ts (+test)  + reachOf (je Koordinate), FilterContext.origin
e2e/
  startpunkt.spec.ts      Stadtteil, Standort, Verweigerung, Umkreis, Privatsphäre
  mobile-ux.spec.ts       + kind-sheet mit Startpunkt, filter-sheet mit Entfernung
  smoke.spec.ts           + Stadtteil wählen mit echten Daten, Kacheln zeigen km
```

## Tests

Test-first für alle Domänenfunktionen (Vitest, TZ `America/Los_Angeles`, Coverage ≥ 90 % in `src/domain`):

- **`geo`:**
  - `haversineMeters`: 0,01° Breite = 1 111,95 m (±0,5); 0,01° Länge bei 49,45° = 722,89 m (±0,5); symmetrisch; derselbe Punkt = 0.
  - `inBounds`: Grenzen inklusiv, knapp außerhalb falsch.
  - `coarsen`: 49,45678 → 49,457; 11,07849 → 11,078; 11,07851 → 11,079; −0,0001 → 0 (nicht −0, `Object.is`).
- **`reach`:** `reachTo` liefert `luftlinie`; `roundedDistance` mit allen Beispielen aus E2; `withinLimit` an der Grenze (5 000 m bei 5 km → wahr, 5 000,1 m → falsch); `compareReach`.
- **`districts`:** 35 Einträge; IDs eindeutig und kebab-case; alle in `NUERNBERG_BBOX`; sortiert nach `localeCompare(…, "de")`; Stichproben Gostenhof 49,448 / 11,058, Langwasser 49,407 / 11,130, St. Johannis 49,461 / 11,062; `districtById("unbekannt")` → `undefined`.
- **`filter`:**
  - `umkreis` parsen und kanonisch serialisieren;
  - `applyFilters` mit Startpunkt, ohne Startpunkt (wirkungslos) und an der Grenze;
  - `activeFilterCount` mit und ohne `hasOrigin`.
  - Fixture-Erwartung ab Gostenhof (49,448 / 11,058), berechnet: Theater 226 m, Beispielhof 1 427 m, Bibliothek 1 689 m, Musikschule 2 358 m, Gemeinde 3 008 m. „bis 2 km“ behält Theater, Beispielhof und Bibliothek.
- **`route`:** Für beliebige Filter mit Umkreis passt der Querystring nie auf `/\d{2}\.\d{2,}/`, und kein Stadtteil-Name erscheint.
- **`ui/format`:** `distanceShort` („100 m“, „400 m“, „1,4 km“, „10 km“, „12 km“), `distanceLong` je Herkunft, `originPhrase`.
- **`ui/use-offer-views`:** `reachOf` nur mit Startpunkt; der Umkreis-Filter wirkt auf `visible` und auf den Kalender.
- **`data/geolocation`:**
  - Erfolg wird gerundet;
  - außerhalb der BBOX → `outside`;
  - Fehlercodes 1/2/3 → `denied`/`unavailable`/`timeout`;
  - fehlende API → `unsupported`;
  - die übergebenen Optionen;
  - `canLocate` ohne sicheren Kontext ist falsch.

E2E (Fixtures, eingefrorene Uhr Mo 5.10.2026 12:00), `startpunkt.spec.ts`:

1. **Stadtteil:** Im Kind-Sheet „Gostenhof“ wählen.
   - Die Statuszeile nennt „Luftlinie ab Gostenhof“, die Theater-Kachel zeigt „200 m“, das Detail des Beispielhofs „ca. 1,4 km Luftlinie ab Gostenhof“.
   - Nach dem Neuladen gilt Gostenhof weiter, `localStorage["zwergenplan.entfernung-ab"] === "gostenhof"`.
   - Die URL enthält weder „gostenhof“ noch eine Koordinate.
   - Ab dem Tipp entsteht kein Request.
2. **Standort** mit Berechtigung (49,45213 / 11,07672): Startpunkt „Mein Standort“, Hinweis „auf ca. 100 m gerundet“.
   - Ab dem Tipp kein Request.
   - Nach dem Neuladen ist kein Startpunkt gesetzt. Kein `localStorage`-Wert enthält „49.45“.
3. **Verweigert** (Stub): Hinweis „Standort nicht freigegeben …“, kein Startpunkt.
4. **Umkreis:**
   - Mit Gostenhof und „bis 2 km“ fehlen die Angebote von Musikschule und Gemeinde, das Filter-Badge zählt 1.
   - Ohne Startpunkt sind die Umkreis-Chips `disabled`.
   - `?umkreis=2` ohne Startpunkt zeigt den Hinweis und alle Angebote, das Badge zählt 0. „Startpunkt wählen“ öffnet das Kind-Sheet.

Außerdem:
- `mobile-ux.spec.ts`: neue Gates hell und dunkel für `kind-sheet-startpunkt` (Gostenhof gesetzt, Hinweis sichtbar) und `filter-sheet-entfernung` (mit Startpunkt). 320 px / 200 % für beide. Die bestehende Entdecken-Ansicht wird zusätzlich mit gesetztem Startpunkt geprüft (längere Meta-Zeile).
- `smoke.spec.ts` (echte Daten): Stadtteil „Altstadt“ wählen, die Kacheln zeigen eine Entfernung, Gates und 320 px / 200 % bestehen.
- `scripts/screenshots.ts`: Ansicht `kind` mit gesetztem Startpunkt, neue Ansicht `filter-entfernung`.

## Backpressure

Keine Schwelle wird gesenkt, kein Gate geändert. Neu sind nur Tests und Gate-Aufrufe für die erweiterten Sheets.

- Budget: Dazu kommen geschätzt ~1 kB Domäne, ~0,6 kB Stadtteile und ~1,5–2 kB UI, also ca. +3–3,5 kB gzip. **Gemessen wird nach Schritt 3** (Domäne + `OriginPicker` verdrahtet) mit `pnpm build && pnpm size`, Ergebnis hier notieren.
- **Gemessen** (gzip, `pnpm build && pnpm size`, echte Daten):

  | Stand | JS / 90 kB | CSS / 15 kB |
  |---|---|---|
  | Ausgang (Plan 0007, Paket A) | 82,66 | 8,58 |
  | nach der Domäne (Schritt 3, vor `OriginPicker`) | 83,7 | 8,58 |
  | nach Schritt 3/4 (UI verdrahtet) | 85,66 | 8,75 |
  | nach Schritt 5 (E2E, Fokus-Rückweg) | 85,73 | 8,75 |
  | nach Rebase auf `nacharbeit-0007` (Plan 0007 A+B) und Arch-Review | 85,92 | 9,58 |

  Plan 0004 kostet damit +3,25 kB JS (Schätzung +3–3,5 kB) und +0,18 kB CSS gegenüber `nacharbeit-0007` (82,67 / 9,40). Die Warnschwelle 88 kB ist nicht erreicht, der Ausweg über `stadtteile.json` bleibt ungenutzt.
- Wird es knapp (> 88 kB nach Schritt 3), gibt es einen Ausweg ohne Budget-Änderung: Die Stadtteil-Tabelle wird `public/data/stadtteile.json` (vom Build aus `src/domain/districts.ts` geschrieben) und beim Öffnen des Kind-Sheets über `src/data` geladen. Die Speicherregel bleibt gleich: Gespeichert ist nur die ID. Für die Entfernung nach dem Neuladen lädt die App die JSON-Datei vom eigenen Origin, sobald eine ID gespeichert ist. Das ist kein Drittanbieter-Request und verrät nichts.

## Schritte

0. **Voraussetzung prüfen:** Die Nacharbeit zu Plan 0003 (B1, B2, B5, B6, B7) ist auf `main` und live. Sonst zuerst die.
1. Plan, `/plan-review`, Review einarbeiten (erledigt, siehe unten).
2. Eigener Branch im Worktree, `pnpm install`, `pnpm build && pnpm size` als Ausgangswert notieren.
3. **Domäne test-first:** `geo` → `reach` → `districts` → `filter`, jeweils erst der rote Test.
   - `NUERNBERG_BBOX` umziehen, `pnpm schema:check` muss grün bleiben.
   - Dann `src/data/geolocation.ts` und `preferences.ts`, `useOrigin`, `OriginPicker` verdrahten.
   - **Budget messen** und hier notieren. `pnpm check:fast` grün.
4. **UI:** Entfernung auf Kachel, im Detail und in der Statuszeile; Gruppe „Entfernung“ im Filter-Sheet; Umkreis-Hinweis. Nach jedem Block `pnpm check:fast` grün.
5. **E2E:** `startpunkt.spec.ts`, `mobile-ux.spec.ts`, `smoke.spec.ts`, `scripts/screenshots.ts`. `pnpm check` komplett grün, inklusive WebKit (lokal ggf. ohne `iphone-15`, siehe CLAUDE.md; CI testet WebKit immer).
6. **Doku:** `docs/architecture.md` (Privatsphäre-Invariante, `src/data` mit Geolocation), Plan 0003 E1 bekommt einen Verweis „umgesetzt in Plan 0004 (Entfernung) und 0005 (Karte)“.
7. **`/arch-review`:** Pflicht, weil neue Module dazukommen und der Plan über 200 Zeilen liegt. Befunde einarbeiten und hier anhängen.
8. **Commit und Push** auf den Branch, CI grün (`gh run watch`). Dann Fast-Forward nach `main`, CI auf `main` grün, Deploy.
9. **`/browser-review live`:** jede Zeile der Checkliste beantworten, besonders:
   - Der Geolocation-Dialog erscheint erst nach dem Tipp, iPhone und Android echt geprüft.
   - Im Netzwerk-Tab kein Request nach der Wahl des Startpunkts.
   - Meta-Zeile mit Entfernung bei 320 px und 200 %.
   - Kind-Sheet im Querformat.
   Ergebnis hier anhängen.

## Akzeptanzkriterien

- Startpunkt per Stadtteil und Standort, Entfernung auf Kachel, im Detail und in der Statuszeile, Umkreis-Filter samt Hinweis ohne Startpunkt: umgesetzt und per E2E abgedeckt.
- Kind-Sheet mit Startpunkt und Filter-Sheet mit Entfernung bestehen `expectMobileUx` hell und dunkel, dazu 320 px / 200 %.
- `pnpm check` grün, CI grün auf `main`, Budgets eingehalten (JS ≤ 90 kB, CSS ≤ 15 kB), Messwert nach Schritt 3 notiert.
- Privatsphäre, durch E2E belegt:
  - Ab der Wahl des Startpunkts entsteht kein Request.
  - Startpunkt nie in der URL.
  - Standort nach dem Neuladen weg, gespeichert nur die Stadtteil-ID.
- `docs/architecture.md` nachgeführt.

## Risiken

- **Startbudget:** siehe Backpressure, gemessen nach Schritt 3, mit Ausweg.
- **Geolocation auf iOS:** Safari fragt je nach Einstellung jedes Mal neu. Weil der Standort nicht gespeichert wird, passt das zusammen. Der Stadtteil ist der bequeme Dauerweg.
- **Luftlinie täuscht:** Ein Ort jenseits der Pegnitz oder ohne direkte Linie kann „nah“ wirken. Deshalb steht „Luftlinie“ in Statuszeile, Detail und Kind-Sheet, und ADR 0005 bleibt das Ziel.
- **Lange Meta-Zeile:** „Anbieter · Stadtteil · 1,4 km“ bricht bei 320 px öfter um. Darauf achten die Gates und der Browser-Review; die Entfernung bleibt als letzte Angabe sichtbar.

## Review (unabhängiger Subagent `plan-reviewer`, 2026-10-04) – Verdict: „Freigabe mit Änderungen“ → eingearbeitet

Der Review lief auf dem gemeinsamen Entwurf `0004-karte-luftlinie.md`. Hier steht, was diesen Plan betrifft; die Karten-Befunde stehen in Plan 0005.

- **M7 Scope-Schnitt** (vom Koordinator entschieden): Der Entwurf ist in Plan 0004 (Entfernung, ohne Drittanbieter und ohne neue Abhängigkeit) und Plan 0005 (Karte) geteilt. „Kartenmitte als Startpunkt“ gehört zu 0005. Die Nacharbeit zu 0003 (B1, B2, B5, B6, B7) ist als Voraussetzung eingetragen (Ausgangslage, Schritt 0).
- **Nutzerentscheidung 1** (Standort nur im Arbeitsspeicher): E3.
- **Nutzerentscheidung 3** (Umkreis 2/5/10 km): E7, `RADII_KM`.
- **Nutzerentscheidung 4** (kurze Stadtteil-Liste): E4 mit 35 festen IDs und OSM-Koordinaten in der Tabelle, Quelle ODbL im Code und im Kind-Sheet.
- **Nutzerentscheidung 2 und 5** (Kartengröße, Startansicht): betreffen Plan 0005.
- **M3** (Budget): Die Schätzung ist offengelegt, gemessen wird nach Schritt 3. Der Ausweg über `stadtteile.json` hat einen Satz zur Speicherregel (nur die ID, Laden vom eigenen Origin). Der frühere Ausweg „Orts-Liste in den Karten-Chunk“ entfällt hier; er betraf die Karte und ist in 0005 gestrichen.
- **M4** (Privatsphäre): `forbiddenInRequests` ist durch eine schärfere Prüfung ersetzt: Ab der Wahl des Startpunkts entsteht kein Request (E8, E2E 1 und 2). Die Kamera-Regel steht in 0005.
- **Minor** `coarsen`: Verfahren festgelegt (`Math.round(x·1000)/1000`, `-0` → `0`), Testwerte abseits von ,xxx5 (E2, Tests).
- **Minor** `?umkreis` ohne Startpunkt zählt nicht in `activeFilterCount` (E7, Test 4).
- **Minor** `architecture.md`: Geolocation in `src/data` und Privatsphäre-Invariante als Schritt 6 (E8).
- **Minor** `test.use({ tiles: "mock" })`: entfällt hier (kein Kachel-Request); in 0005 eingearbeitet.
- Die übrigen Befunde (B1 Theme-Wechsel, M1, M2, M5, M6 und die Karten-Minors) betreffen nur die Karte und sind in Plan 0005 eingearbeitet.

## Umsetzung (2026-10-04)

Branch `entfernung-0004`, zuerst auf „Plan 0007 Paket A“, danach auf `nacharbeit-0007` (Plan 0007 A+B) umgesetzt. Die Einzelheiten stehen in den Commit-Messages. Hier stehen die Abweichungen vom Plan, je mit einem Satz Begründung.

**Domäne und Daten**
- **`applyFilters` verlangt `T extends Offer & { venue: ReachTarget }` (E7):** Der Umkreis braucht den Ort. Die Unit-Tests filtern deshalb `SiteOffer`-Fixtures (Helfer `fixtureSiteOffers`), in `age.test.ts` ändert sich nur die erwartete Reihenfolge.
- **`withReachLimit` (E7):** Neu in `filter.ts`. Es setzt den Umkreis als Einfachwahl oder entfernt ihn. Ohne Umkreis fehlt der Schlüssel ganz, damit der Zustand `EMPTY_FILTER` gleicht. `toggleIn` bleibt auf die Mehrfachwahl beschränkt.
- **`LocationEnv { geolocation, isSecureContext }` statt nur der API (E3):** So ist auch der sichere Kontext ohne Browser testbar. `PositionApi` ist ein minimales Interface, in das `navigator.geolocation` passt, die Stubs brauchen deshalb keinen `as`-Cast.
- **Typ-Exporte erst bei Bedarf (knip):** `OriginSource` und `RadiusKm` bleiben modul-intern. `PositionProblem` wird exportiert, seit `OriginPicker` und `useOrigin` es brauchen.
- **Gesamt-Zeitlimit 15 s in `requestPosition` (Arch-Review m2):** Das Zeitlimit der API zählt erst ab der Freigabe. Bei offenem Berechtigungsdialog hinge die Suche sonst.
- **`preferences.ts` liefert die rohe Stadtteil-ID (Arch-Review M2):** Ob die ID gilt, prüft `useOrigin`. `src/data` importiert zur Laufzeit nur `geo` (ADR 0010).

**UI**
- **`KidSheet` in `KidSheet.tsx` (E5):** `Sheets.tsx` wäre mit `OriginPicker` und der neuen Filtergruppe bei ~275 Zeilen gelandet. Nach dem Rebase hat `KidSheet` dieselbe Hülle `.sheet-scroll` wie das Filter-Sheet (Plan 0007, H7).
- **Texte (E6):** `format.ts` hat zusätzlich `distanceNote` (Statuszeile) und `reachLimitLabel` („bis 5 km“, Filter-Sheet und Umkreis-Hinweis).
- **Live-Region im `OriginPicker` (E5):** ein `<div aria-live="polite">`, der den `.hint` nur bei Text enthält. Ein leerer `.hint` wäre ein leerer Rahmen.
- **Leere Option „Stadtteil wählen …“ ist `disabled` (E5):** Der einzige Weg zurück bleibt „Startpunkt entfernen“.
- **„Startpunkt wählen“ öffnet das Kind-Sheet mit Fokus auf der Stadtteil-Auswahl (E7):** Dafür setzt die Komponente das HTML-Attribut `autofocus`, das `showModal()` beachtet. Das funktioniert auch in WebKit.
- **Fokus-Rückweg (E7, beim ersten E2E-Lauf gefunden):** Nach der Wahl über den Umkreis-Hinweis verschwand der Auslöser, und der Fokus fiel auf `<body>`. `Dialog` hat dafür `fallbackFocus`, beim Kind-Sheet ist das „Alle Filter“.
- **„Für heute ist alles vorbei“ beachtet den Umkreis:** `matchesFilter` bekommt den Startpunkt. `dataEnd` bleibt ungefiltert.
- **Statuszeile (E6):** Der Entfernungshinweis steht in einer eigenen Zeile ohne „·“. Er brach bei 320–390 px ohnehin um und begann dann mit einem verwaisten Punkt. Für Screenreader trennt ein „. “ die beiden Sätze.
- **„Suche Standort …“ mit `aria-busy` statt `disabled` (Arch-Review m4):** Ein gesperrter Knopf verlöre den Fokus. Ein Tipp während der Suche tut nichts.
- **Zustand als Reducer (Arch-Review m1):** `originReducer` in `src/ui/origin-state.ts`. `useMyLocation` heißt jetzt `locateMe` (m5).

**Tests und Gates**
- **`startpunkt.spec.ts`:** Beim ersten Lauf grün, 35/35, auch in WebKit (`autofocus` mit `showModal()`, `grantPermissions`) und ohne Request nach der Wahl. Dazu kamen Fokus-Rückweg (mit und ohne Wahl), „Standort antwortet nie“ (15 s per `page.clock`, `aria-busy`, Fokus bleibt) und die Statuszeile ohne „·“.
- **`mobile-ux.spec.ts`:** Neue Ansichten `entdecken-startpunkt`, `kind-sheet-startpunkt`, `filter-sheet-entfernung`, `entdecken-umkreis-ohne-startpunkt` und `detail-entfernung`. Sie laufen hell, dunkel, dunkel per Darstellung und bei 320 px / 200 %.
- **`smoke.spec.ts`:** „Stadtteil als Startpunkt mit echten Daten“ mit Altstadt und `.meta .dist` auf `/^\d+(,\d)? k?m$/`, dazu den Gates aus Plan 0007 (`buttons: false`, `setTextScale`).
- **Text-Gate, Prüfung 3 (nach dem Rebase):** Text, der ganz aus dem sichtbaren Bereich des nächsten senkrechten Scroll-Containers hinausgescrollt ist, zählt nicht mehr als „stößt an die Rundung“. Das gescrollte Filter-Sheet meldete sonst „Filter“, „Art“ und „Format“, die unsichtbar über dem Sheet lagen. Der Kanarienvogel-Test „Text-Gate erkennt Text in der Rundung, auch im Scroll-Container des Sheets“ belegt, dass sichtbarer Text in der Ecke weiter rot wird.
- **`scripts/screenshots.ts`:** `kind` wählt zusätzlich Gostenhof. Neu sind `start-startpunkt` und `filter-entfernung`.
- **Playwright-Port per `PW_PORT`:** damit parallele Worktrees nicht über `reuseExistingServer` den Build eines anderen testen (CLAUDE.md, Stolperfallen).

**Ergebnis Schritt 5:** `PW_PORT=4273 pnpm check` ist grün, inklusive WebKit. Unter paralleler Last (Load Average 17–44 auf 16 Kernen) wurde der CPU-gedrosselte LCP-Test (`perf.spec.ts`, Smoke) einzeln rot (2,6–3,7 s). Einzeln wiederholt war er grün. Messwerte nach dem Rebase stehen in den Commit-Messages.

**Screenshots (320 und 390 px, hell und dunkel):**
- Kind-Sheet mit Startpunkt, Filter-Sheet mit „Entfernung“ und Entdecken mit Startpunkt sind sauber. Die Entfernung bricht nie zwischen Zahl und Einheit.
- Mit den Fixtures ändert „bis 5 km“ nichts, weil alle Orte höchstens 3 km von Gostenhof entfernt sind.
- Gefunden und behoben: der verwaiste „·“ in der Statuszeile.

## Arch-Review (2026-10-04) – Verdict: Nacharbeit nötig, keine Blocker → eingearbeitet

- **M1** `src/data` importiert erstmals Laufzeit-Code aus `src/domain`, das braucht eine Entscheidung und eine Regel. → ADR 0010 (`docs/adr/0010-data-nutzt-reine-domaenenhilfen.md`, angenommen) mit Verweis in `docs/architecture.md`. Dazu die dependency-cruiser-Regel `data-domain-runtime-allowlist` (von `^src/data/` ohne Tests nach `^src/domain/` außer `geo.ts`, Typ-Importe frei), belegt mit Kanarienvögeln in der Commit-Message.
- **M2** Die Prüfung der Stadtteil-ID gehört nicht in den Speicherzugriff. → Variante (a): `preferences.ts` liefert die rohe ID, `useOrigin` prüft sie. Der Test „unbekannte ID zählt nicht“ steht in `use-app-state.test.ts`. Die Allowlist enthält nur `geo`.
- **M3** Plan nachführen. → Budget-Messwerte (Tabelle unter „Backpressure“), Status, „Umsetzung“ und dieser Abschnitt.
- **m1** Die Reihenfolge-Logik in `useOrigin` ist nur indirekt getestet. → reiner `originReducer` (`src/ui/origin-state.ts`) mit Tests: späte Antwort nach Stadtteil-Wahl und nach „Entfernen“, nur die neueste Abfrage zählt, ein Fehler lässt den Startpunkt stehen.
- **m2** `requestPosition` kann ewig hängen. → eigenes Gesamt-Zeitlimit 15 s mit Ergebnis `timeout`, Unit-Test mit Fake-Timern und nie antwortendem Stub, dazu ein E2E mit `page.clock`.
- **m3** Zwei Zustände ohne Gate. → `entdecken-umkreis-ohne-startpunkt` (`./?umkreis=10`) und `detail-entfernung` (`distanceLong`) in `VIEWS`.
- **m4** `.btn:disabled` in `origin.css` traf jeden gesperrten Knopf. → `aria-busy="true"` am Standort-Knopf, CSS nur auf `.origin .btn[aria-busy="true"]`, E2E prüft `aria-busy` und Fokus.
- **m5** `useMyLocation` sah wie ein Hook aus. → `locateMe`.
- **m6** `PW_PORT` ist undokumentiert. → ein Satz in CLAUDE.md unter „Stolperfallen“. Der Standard von `scripts/screenshots.ts` bleibt.
- **m7** In `docs/architecture.md` fehlt Geometrie/Entfernung in der Domänen-Zeile, und „UI fasst `navigator.geolocation` nicht an“ ist ungeprüft. → Schichten-Tabelle ergänzt. Biome `noRestrictedGlobals` für `src/ui` und `main.tsx` verbietet `navigator`, `localStorage` und `fetch`, mit Kanarienvögeln belegt. Der Umweg über `window.navigator` ist als „prüft der Review“ gekennzeichnet.
- **Zusatz** (Screenshot-Befund): verwaister „·“ in der Statuszeile → eigene Zeile ohne Punkt (siehe „Umsetzung“).

## Browser-Review live (2026-10-04)

**Ziel:** https://zwergenplan.app/ mit echten Daten (`site.json` vom 2026-10-04 14:05, 333 Angebote, 82 Orte).
**Stand:** `bca0bd7`. Der CI-Lauf „CI & Deploy“ 37236933123 auf `main` ist grün. Das Live-Bundle `index-C6rMczj7.js` enthält `aria-busy`, das Gesamt-Zeitlimit `15e3`, „ca. 100 m“ und den Schlüssel `zwergenplan.entfernung-ab`.
**Methode:**
- Playwright gegen die Live-URL, in Chromium und WebKit, mit `de-DE`, `Europe/Berlin` und `reducedMotion: reduce`. Die Skripte liegen in `/home/suus/.claude/jobs/1aadb80d/tmp/`: `geo4.mjs`, `district4.mjs`, `radius4.mjs`, `layout4.mjs` und `plaus4.mjs`.
- `node scripts/screenshots.ts https://zwergenplan.app/ --views=kind,filter-entfernung,start-startpunkt` lief bei 100 % und mit `--text=200`. Das ergab 72 Bilder für 6 Viewports, jeweils hell und dunkel.
- Dazu kamen gezielte Bilder in `shots4/` (gescrollte Sheets, Meta-Zeile, Detail) und die Gates aus `e2e/mobile-ux.ts` auf der Live-Seite: `expectTextFits` mit `buttons: false`, `expectNoHorizontalScroll`, `expectTouchTargets` und `expectNoBrightIslands`.
- Lokal lief kein Server, es gab keine Code-Änderung.
- **Nicht geprüft:** echte Geräte (iPhone, Android) mit echtem Berechtigungsdialog. Die Abfrage-Logik ist per Spy belegt, den Dialog selbst sieht man nur auf dem Gerät.

### Checkliste
- **Lesbarkeit:**
  - Die Kachel liest sich als „Anbieter · Stadtteil · **2,1 km**“. Die Entfernung ist fett und steht immer als letzte Angabe.
  - Die Statuszeile hat zwei Zeilen: „333 Angebote ab heute“ und darunter „Entfernung als Luftlinie ab Gostenhof“.
  - Das Detail zeigt unter „Wo“ die Zeile „ca. 2,1 km Luftlinie ab Gostenhof“.
  - Was, wann, wo und frei bleibt in 2 Sekunden erfassbar (`review-0004-entdecken-390.png`, `shots4/detail-320-dark.png`).
- **Daumen-Erreichbarkeit:**
  - „Meinen Standort nutzen“ ist ein breiter Knopf, die Stadtteil-Auswahl ist voll breit, „Fertig“ steht unten fest.
  - Die Umkreis-Chips liegen im unteren Drittel des Filter-Sheets.
  - `expectTouchTargets` ist überall grün (Kind- und Filter-Sheet, 320/390/quer, 100 % und 200 %).
- **Zustände:**
  - Kein Startpunkt: „Noch kein Startpunkt – dann zeigen wir keine Entfernung.“
  - Standort, Verweigerung, „außerhalb“ und Zeitlimit zeigen jeweils ihren Hinweis.
  - Ohne Startpunkt sind die Umkreise gesperrt und zeigen den Hinweis.
  - `?umkreis` ohne Startpunkt zeigt den Hinweis.
  - Eine ungültige ID im Speicher zählt als „kein Startpunkt“.
  - Lange Anbieternamen brechen bei 320 px / 200 % auf 7–8 Zeilen um, die Entfernung bleibt aber zusammen. Abgeschnitten wird nichts (`shots4/meta-320-light-200.png`).
  - Laden und Fehler sind von Plan 0004 nicht berührt.
- **Dark Mode:** `expectNoBrightIslands` ist grün für Liste, Kind-Sheet, Detail, Filter-Sheet und den Umkreis-Hinweis, bei 320/390/quer und 100 %/200 %. Der grüne Erfolgshinweis ist im Dunkelmodus gedämpft. Helle Inseln gibt es keine.
- **Micro-Interactions:**
  - Die Chips zeigen `aria-pressed` und sind gefüllt bzw. gelb.
  - Gesperrte Chips haben Deckkraft 0,55 und den Cursor `not-allowed`.
  - Der Standort-Knopf zeigt „Suche Standort …“ mit `aria-busy` und `cursor: progress`.
  - Übergänge sind bei reduzierter Bewegung aus (Kontext `reduce`). Ruckler oder Layoutsprünge waren nicht zu sehen.
- **Konsistenz mit dem Design-System:**
  - „Entfernung ab“ nutzt dieselbe Gruppenüberschrift (Versalien) wie „Darstellung“.
  - Auswahl, Knöpfe, `.hint ok/bad` und Link-Knöpfe mit Wellenlinie folgen den bestehenden Mustern.
  - Die Gruppe „Entfernung“ sieht im Filter-Sheet aus wie „Kosten“.
  - Kleine Abweichung siehe H3.

### 1. Geolocation
| Prüfung | Chromium | WebKit |
|---|---|---|
| Spy auf `getCurrentPosition`/`watchPosition`: Aufrufe nach Laden / nach Öffnen des Kind-Sheets / nach Tipp | 0 / 0 / 1 | 0 / 0 / 1 |
| Ohne Berechtigung: `permissions.query` bleibt `prompt`, also keine Abfrage beim Laden; Tipp → „Standort nicht freigegeben. Wähle stattdessen einen Stadtteil.“ (Playwright verweigert sofort) | ✓ (28 ms) | ✓ (12 ms) |
| Mit Berechtigung und Stub 49.45213/11.07672: „Startpunkt: **Mein Standort**“, Hinweis „Entfernung ab deinem Standort (auf ca. 100 m gerundet).“, Statuszeile „… ab deinem Standort“, 40/40 Kacheln mit Entfernung | ✓ | ✓ |
| Verweigerung per Stub `{code: 1}`: Hinweis, Startpunkt bleibt leer | ✓ | ✓ |
| Standort in München: „Dein Standort liegt außerhalb von Nürnberg. Wähle einen Stadtteil.“ | ✓ | ✓ |
| Stub ohne Antwort, echte Wartezeit: nach 0,5 s und 14 s `aria-busy="true"`, „Suche Standort …“, nicht `disabled`, Fokus auf dem Knopf, ein zweites Enter tut nichts; nach 16 s „Standort gerade nicht verfügbar. …“, `aria-busy="false"`, Fokus bleibt | ✓ | ✓ |
| Neu laden: Statuszeile ohne Entfernung, 0 `.dist`, Kind-Sheet „Noch kein Startpunkt“, kein Abfrage-Aufruf | ✓ | ✓ |

Bild: `shots4/geo-standort-chromium.png`, als `review-0004-kind-standort.png` kopiert.

### 2. Stadtteil (Gostenhof, Altstadt, Langwasser; 390 px)
- Kind-Sheet: „Startpunkt: **Gostenhof**“ bzw. Altstadt oder Langwasser, „Startpunkt entfernen“ erscheint. Die Hinweis-Region bleibt leer, wie geplant.
- Statuszeile: „333 Angebote ab heute“ und „Entfernung als Luftlinie ab …“ stehen untereinander, Zeile 2 beginnt bei y = 233,6, wo Zeile 1 endet. Ein sichtbares „·“ gibt es nicht. Der Punkt „. “ steht nur in `.sr-only`, die Klasse existiert im Live-CSS.
- Kacheln: Alle 40 sichtbaren Kacheln haben eine Entfernung, bei allen drei Stadtteilen. **Alle 40 × 3 Werte stimmen mit meiner eigenen Haversine-Rechnung** auf den Daten-Koordinaten überein (Erdradius 6 371 008,8 m, Rundung wie in `roundedDistance`).
- Detail („Offene Tür für Groß und Klein“): „ca. 2,1 km Luftlinie ab Gostenhof“, „ca. 2,8 km … ab Altstadt“ und „ca. 5,2 km … ab Langwasser“.
- Nach dem Neuladen bleibt der Stadtteil gesetzt. `localStorage` enthält nur `zwergenplan.entfernung-ab=gostenhof` bzw. `altstadt` oder `langwasser`, also die ID ohne Namen und Koordinate. `sessionStorage` ist leer.
- Eine ungültige ID (`atlantis`) zählt als „kein Startpunkt“.

### 3. Privatsphäre
- **URL:** Sie enthält nie eine Koordinate oder einen Stadtteilnamen bzw. eine ID, auch nicht im Detail (`?angebot=…`) und nicht mit Umkreis (`?umkreis=2|5|10`).
- **Speicher:**
  - Beim Standort bleiben `localStorage` und `sessionStorage` leer.
  - Beim Stadtteil enthält `localStorage` nur die ID.
  - Ein Muster `\d{2}\.\d{2,}` kommt in keinem der Speicher vor.
- **Requests nach der Wahl:** 0, gezählt ab dem Tipp bzw. der Auswahl. Das gilt für den Standort in Chromium und WebKit, für die drei Stadtteile und für die Wahl über den Umkreis-Hinweis.
- **Hosts insgesamt:** nur `zwergenplan.app`, in allen Läufen.
- **Konsole:** keine Fehler. WebKit meldet einmal die bekannte Preload-Warnung zu `site.json`, die mit Plan 0004 nichts zu tun hat.

### 4. Umkreis (Startpunkt Altstadt, echte Daten)
| Wahl | Knopf im Sheet | Statuszeile | Badge | eigene Rechnung | größte Entfernung in der Liste |
|---|---|---|---|---|---|
| Egal | – | 333 | 0 aktiv | 333 | 9,4 km |
| bis 2 km | „167 Angebote zeigen“ | 167 | 1 aktiv | 167 | 1,9 km |
| bis 5 km | „274 Angebote zeigen“ | 274 | 1 aktiv | 274 | 4,5 km |
| bis 10 km | „333 Angebote zeigen“ | 333 | 1 aktiv | 333 | 9,4 km |

- Die Anzahl sinkt plausibel und stimmt genau mit meiner Rechnung überein. „bis 10 km“ ändert ab Altstadt nichts, weil der fernste Ort (Fischbach) 9,4 km entfernt ist. Ab Langwasser blieben bei 10 km 304 von 333 übrig.
- Das Badge zählt mit, die URL ist `?umkreis=N`, „Zurücksetzen“ führt zurück zu `/`.
- Ohne Startpunkt sind „bis 2/5/10 km“ `disabled`, „Egal“ ist aktiv, und „Erst einen Startpunkt wählen.“ ist sichtbar.
  - „Startpunkt wählen“ schließt das Filter-Sheet und öffnet das Kind-Sheet. Der Fokus liegt auf der Stadtteil-Auswahl.
- `?umkreis=10` ohne Startpunkt:
  - Statuszeile „333 Angebote ab heute“, der Hinweis „„bis 10 km“ braucht einen Startpunkt.“ steht außerhalb der Status-Region, Badge „0 aktiv“.
  - „Startpunkt wählen“ führt ins Kind-Sheet mit Fokus auf der Auswahl.
  - Nach Altstadt und „Fertig“ liegt der Fokus auf **„Alle Filter, 1 aktiv“**, der Hinweis ist weg, es gab 0 Requests.
- „Für heute ist alles vorbei“ im Kalender, Uhr auf 2026-10-04 20:00 fixiert. Heute gibt es nur Termine im Langwasserbad, 6,8 km entfernt, und alle sind vorbei.

  | Umkreis ab Altstadt | Leerzustand |
  |---|---|
  | ohne | „Für heute ist alles vorbei“ |
  | 2 km | „Freier Tag“ |
  | 5 km | „Freier Tag“ |
  | 10 km | „Für heute ist alles vorbei“ |

  Angebote außerhalb des Umkreises zählen also nicht mit (`shots4/kalender-heute-umkreis2.png`).

### 5. Layout
- **Meta-Zeile:**
  - Gemessen über Range-Rects an 40 Kacheln: Bei 320, 390 und quer, jeweils mit 100 % und 200 %, in hell und dunkel, **bricht keine Zahl von ihrer Einheit weg** (0 von 40). Keine Entfernung ragt aus der Kachel.
  - Die Entfernung steht in 20–32 von 40 Kacheln am Anfang der letzten Zeile, nach dem „·“ am Zeilenende. So war es gewollt (`shots4/meta-320-light-200.png`, `shots4/meta-390-light.png`).
  - Die Gates `expectTextFits` und `expectNoHorizontalScroll` auf der Liste sind überall grün.
- **Kind-Sheet:**
  - Bei 320 px scrollt es (913 statt 490 px), der Abschnitt „Entfernung ab“ ist vollständig erreichbar.
  - Quer (915×412) scrollt es (748 statt 285 px), Auswahl und Knöpfe sind voll breit (`shots4/kind-quer-light.png`).
  - Bei 200 % ist alles lesbar. „Meinen Standort nutzen“ bricht zweizeilig um, Icon und Text bleiben im Knopf (`shots4/kind-320-dark-200.png`).
  - Die Auswahl hat 17 px bzw. 34 px Schrift, also kein iOS-Zoom.
  - Touch-Ziele, horizontaler Scroll und helle Inseln sind grün. `expectTextFits` ist rot nur in der gescrollten Querlage, siehe H1.
- **Filter-Sheet, Gruppe Entfernung:**
  - Die Gruppe hat dieselbe Gestalt wie „Kosten“, die gewählte Option ist gefüllt bzw. im Dunkelmodus gelb.
  - Bei 320 px / 200 % stehen die Chips einzeln bzw. zu zweit, nichts wird abgeschnitten (`shots4/filter-320-light-200.png`).
  - Ohne Startpunkt sind die Chips gedimmt und der Hinweis steht darunter (`shots4/filter-ohne-startpunkt-412.png`).
- **Dunkelmodus:** keine hellen Inseln, siehe Checkliste.

### 6. Plausibilität (ab Altstadt = Hauptmarkt 49,454 / 11,077)
| Ort | Daten-Koordinate | eigene Haversine | Anzeige live | Gegenprobe mit unabhängig geschätzter Adresse ab Hauptmarkt |
|---|---|---|---|---|
| Langwasserbad, Breslauer Str. 251 | 49,4116 / 11,1444 | 6 779 m | „ca. 6,8 km“ | ≈ 7,0 km |
| Neues Museum, Klarissenplatz | 49,4477 / 11,0799 | 734 m | „ca. 700 m“ | ≈ 0,6 km |
| Haus der Begegnung, Fischbacher Hauptstr. 213 | 49,4198 / 11,1959 | 9 401 m | „ca. 9,4 km“ | ≈ 9,2 km |
| (zusätzlich) Kliniken Dr. Erler, Kontumazgarten | 49,4528 / 11,0687 | 615 m | „ca. 600 m“ | – |

Die Anzeige stimmt exakt mit der Haversine-Rechnung auf den Daten-Koordinaten. Die Gegenprobe weicht um höchstens 0,2 km ab. Das liegt an der Genauigkeit des Geocodings bzw. meiner Schätzung, nicht an der Rechnung.

### Befunde
**Blocker:** keine.

**Wichtig:**
- **W1 – Echte Geräte nicht geprüft** (Plan Schritt 9: „iPhone und Android echt geprüft“). Playwright belegt, dass die Abfrage erst nach dem Tipp startet (Spy 0 → 0 → 1) und der Berechtigungsstatus beim Laden `prompt` bleibt. Den echten Systemdialog auf iOS Safari und Android Chrome muss ein Mensch am Gerät einmal ansehen. Das ist offen, kein Fehler.

**Hinweis:**
- **H1 – Text-Gate meldet in gescrollten Sheets angeschnittene Überschriften.**
  - Betroffen sind Kind-Sheet quer („Entfernung ab“, bei 200 % „Startpunkt:“) und Filter-Sheet 320 px / 200 % („Kosten“), jeweils mit der Meldung „stößt an die Rundung von dialog.dlg“.
  - Ursache ist meine Scroll-Position: Die Zeile ist halb über den oberen Rand des Scroll-Containers gerollt. Das ist normales Scrollen und kein sichtbarer Defekt (`shots4/kind-quer-light.png`, `shots4/filter-320-light-200.png`).
  - Die Ausnahme in Prüfung 3 gilt nur für *ganz* hinausgerollten Text. Das ist kein Problem, solange die CI-Ansichten oben stehen. Wenn man Sheets künftig gescrollt prüft, kann man die Regel auf „teilweise hinausgerollt“ erweitern; dafür eine Idee in `docs/ideas.md` anlegen.
- **H2 – „Freier Tag“ trotz Terminen außerhalb des Umkreises.** Das Verhalten entspricht dem Plan: Der Umkreis gilt auch für den Leerzustand. Der Text „Kein Sticker für diesen Tag“ verschweigt aber, dass ein Filter wirkt. Bei anderen Filtern ist es genauso, das ist also nicht neu durch Plan 0004. Der Hinweis „Mit deinen Filtern nichts – Filter ändern?“ wäre eine Idee für `docs/ideas.md` (`shots4/kalender-heute-umkreis2.png`).
- **H3 – „Startpunkt entfernen“ steht bei 200 % zentriert, bei 100 % linksbündig.** Der Link-Knopf bricht zweizeilig um und erbt `text-align: center` (`shots4/kind-320-dark-200.png`). Das ist kosmetisch.
- **H4 – Silbentrennung in langen Anbieternamen** („Auferstehungskirc-he“) bei 320 px / 200 % (`shots4/meta-320-light-200.png`). Das ist ein Altbestand aus den Daten bzw. dem Zeilenumbruch und hat nichts mit Plan 0004 zu tun. Die Entfernung bleibt intakt.
- **H5 – Die Liste ist nicht nach Entfernung sortiert.** Das ist laut Plan kein Ziel, nur zur Einordnung: „bis 2 km“ ist der Weg zu nahen Angeboten.

**Verdict:** Plan 0004 ist live **ohne Blocker abgenommen**. Alle Prüfungen zu Geolocation, Stadtteil, Privatsphäre, Umkreis, Layout und Plausibilität sind grün, in Chromium und WebKit. Offen bleibt nur die Sichtprüfung des echten Berechtigungsdialogs auf iPhone und Android (W1).

**Screenshots:**
- `/home/suus/.claude/jobs/1aadb80d/tmp/review-0004-kind-standort.png`: Kind-Sheet mit „Mein Standort“ und dem Hinweis „auf ca. 100 m gerundet“.
- `/home/suus/.claude/jobs/1aadb80d/tmp/review-0004-entdecken-390.png`: Entdecken bei 390 px mit zweizeiliger Statuszeile und Entfernung auf den Kacheln.
- weitere unter `/home/suus/.claude/jobs/1aadb80d/tmp/shots4/`.
