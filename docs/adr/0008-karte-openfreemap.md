# ADR 0008 – Karte mit MapLibre GL und OpenFreeMap, Startpunkt bleibt auf dem Gerät

Status: Entwurf (2026-10-04), wird mit Plan 0005 angenommen. Ergänzt ADR 0001 (Stack), ADR 0005 (Fallback ohne GPS) und die Privatsphäre-Invariante in `docs/architecture.md`. Details in Plan 0005, der Startpunkt selbst in Plan 0004.

## Kontext

Plan 0005 bringt eine Karte der Orte. Kartenkacheln braucht es dafür so oder so: von einem Drittanbieter oder selbst gehostet. Die Invariante „keine Drittanbieter-Requests“ kündigt für OpenFreeMap schon eine Ausnahme an. Diese ADR legt fest, welcher Weg es wird, was an den Kachel-Host geht und was nie, und wie die Tests das absichern.

Geprüft am 2026-10-04:

- **MapLibre**: `maplibre-gl` 6.12.0, Lizenz BSD-3-Clause, reines ESM. Lazy gebündelt sind das ca. 284 kB gzip im Hauptthread, ca. 144 kB im Worker und ca. 11 kB CSS.
- **OpenFreeMap**:
  - kostenlos, ohne Schlüssel und Registrierung, ohne Cookies;
  - Zugriffslogs laut Datenschutzerklärung ohne IP-Adressen, Fehlerlogs mit IP (7 Tage), bei Sicherheitsvorfällen bis 30 Tage;
  - CDN ist Cloudflare;
  - ohne SLA („may discontinue it at any time“);
  - alle Ressourcen der Stile `positron` und `dark` (Stil, TileJSON, Vektorkacheln, Glyphen, Sprites, Raster) liegen auf **einem** Host, `tiles.openfreemap.org`, ohne Querystring;
  - Pflicht-Attribution: „OpenFreeMap © OpenMapTiles Data from OpenStreetMap“.

## Alternativen

**Selbst gehosteter PMTiles-Extrakt auf GitHub Pages** (Protomaps-Basiskarte). Gemessen am 2026-10-04 mit `pmtiles extract --dry-run` (go-pmtiles 1.31.2) gegen den Protomaps-Build `20261003.pmtiles`:

| Ausschnitt | Zoom | Archivgröße |
|---|---|---|
| Stadt Nürnberg, bbox 10,98,49,36,11,27,49,55 (deckt alle heutigen Orte) | 0–15 | **19 MB** (1 058 Kacheln) |
| Stadt Nürnberg, wie oben | 0–14 | **9,6 MB** |
| ganze Daten-BBOX aus `schema.ts` (10,85–11,30 / 49,30–49,65, mit Fürth/Erlangen) | 0–15 | **37 MB** |

Weitere Befunde zu dieser Alternative:

- **Range-Requests** auf GitHub Pages: Ein `GET` mit `Range: bytes=0-99` auf eine Binärdatei der Live-Seite liefert `206 Partial Content` (geprüft an der woff2-Schrift). Bei JSON antwortet Pages mit `200` und voller, gzip-komprimierter Datei. Ein `.pmtiles`-Archiv ist binär und würde funktionieren; das wäre vor einer Wahl noch einmal direkt zu prüfen.
- **Zusatz-JS**: `pmtiles` 4.5.0 und `@protomaps/basemaps` 5.7.2 (Stil-Layer, Varianten hell/dunkel, beide BSD-3-Clause) kosten gebündelt ca. **16 kB gzip** zusätzlich im Karten-Chunk.
- **Glyphen und Sprites** müssten wir selbst hosten (Protomaps `basemaps-assets`): Noto Sans in den nötigen Unicode-Bereichen und je ein Sprite für hell und dunkel, geschätzt einige hundert kB. Das ist nicht gemessen.
- **Aktualisierung**:
  - Die Protomaps-Builds sind täglich, ältere verschwinden.
  - Ins Repo darf das Archiv nicht: 19–37 MB je Aktualisierung würden die Git-Historie aufblähen.
  - Bleibt ein CI-Schritt, der bei jedem Deploy (mit Cache) den neuesten Build extrahiert. Das ist eine Netz-Abhängigkeit im Build an `build.protomaps.com`, nicht im Browser.
- **Vorteil**: kein einziger Drittanbieter-Request im Browser. Die Ausnahme in der Privatsphäre-Invariante, die Wächter-Ausnahme in E2E und die Kamera-Regel unten wären überflüssig. Offline-Caching wäre später möglich.

**Entscheidung über die Alternative:** jetzt **verworfen**, als Ausweichweg festgehalten.

- Der Nutzer hat MapLibre + OpenFreeMap vorgegeben.
- OpenFreeMap loggt in den Zugriffslogs keine IP-Adressen.
- Mit den Regeln unten erfährt OpenFreeMap nicht mehr als „jemand sieht sich Nürnberg an“.
- Selbsthosten kostet dagegen einen neuen CI-Schritt mit Fremdabhängigkeit, 19–37 MB im Deploy-Artefakt, eigene Glyphen und Sprites, 16 kB mehr JS und ein zweites Stil-Schema.
- Ausweichweg: Fällt OpenFreeMap aus oder ändert seine Bedingungen, wird die Alternative zur Folge-ADR. Code-seitig hängt dann alles an `src/data/tiles.ts` und am Stil in `src/ui/map/`.

**Ebenfalls verworfen:** Raster-Kacheln von `tile.openstreetmap.org`. Deren Nutzungsrichtlinie schließt Apps mit nennenswertem Verkehr aus, ein Dark-Stil fehlt, und es wäre ebenfalls ein Drittanbieter.

## Entscheidung

- **Bibliothek**: `maplibre-gl` (exakt gepinnt), **nur per dynamischem Import**, sobald jemand die Karte öffnet.
  - Nur `src/ui/map/` darf `maplibre-gl` importieren, und von außen erreicht man `src/ui/map/` nur per `import()` (dependency-cruiser).
  - Eigene Budgets für den Karten-Code, das Startbudget (JS 90 kB, CSS 15 kB) bleibt.
- **Einziger Drittanbieter**: `https://tiles.openfreemap.org`. Andere fremde Origins bleiben verboten.
  - `transformRequest` lehnt jede andere URL ab, ebenso jede URL mit Querystring oder Fragment.
- **Was an OpenFreeMap geht**:
  - IP-Adresse und User-Agent (technisch unvermeidbar);
  - als Referrer nur der Origin der Seite (siehe unten);
  - die angefragten Kachelkoordinaten `z/x/y`. Sie verraten grob, welchen Ausschnitt jemand ansieht.
- **Was nie an OpenFreeMap geht**:
  - der Standort oder Startpunkt, weder als Parameter noch **mittelbar über die Kachelwahl**;
  - Geburtsdatum, Merkliste, Filter, Angebots-IDs.
- **Kamera-Regel** (daraus folgend): Die Karte zentriert oder zoomt **nie** auf einen Startpunkt aus Standort (GPS) oder Kartenmitte. Sie zeichnet ihn nur als lokalen Layer, der keine Kacheln anfordert.
  - Der Ausschnitt beim Öffnen ist immer `fitBounds` über die sichtbaren Orte, also über öffentliche Daten.
  - Auf einen **Stadtteil** darf die Karte fahren. Der ist grob, öffentlich und ohnehin einer von 35 festen Punkten.
  - Verschiebt jemand die Karte selbst zu sich nach Hause, ist das seine Handlung. Das unterscheidet sich nicht von jeder anderen Kartennutzung.
- **Nur in der Kartenansicht**: Solange die Karte nicht offen ist, geht kein Request an OpenFreeMap, und der Karten-Code wird nicht geladen. Das Umschalten auf „Karte“ ist die ausdrückliche Handlung, eine zusätzliche Einwilligung gibt es nicht. Unter der Karte steht: „Kartenbilder kommen von OpenFreeMap. Dein Standort bleibt auf dem Gerät.“
- **Referrer**: Wir bleiben beim Browser-Standard `strict-origin-when-cross-origin`. OpenFreeMap sieht damit `https://sbiastoch.github.io/`, aber weder Pfad noch Querystring (also keine Filter und kein `angebot=`).
  - Abgewogen gegen `no-referrer` für die ganze Seite: Das würde auch die Links zu den Anbietern betreffen. Die Information „diese Seite nutzt OpenFreeMap“ ist ohnehin öffentlich (Repo).
  - MapLibre erlaubt keinen Referrer-Wert pro Request. Ein Wechsel ginge nur über `<meta name="referrer">` für alles.
- **Kein Cache durch uns**: Kacheln werden nicht vorab geladen und von einem künftigen Service Worker nicht gecacht. Offline zeigt die Karte einen Hinweis, die Orts-Liste funktioniert weiter.
- **Startpunkt ohne GPS** (ADR 0005 nennt „Stadtteil oder Haltestelle wählen, oder auf die Karte tippen“): Statt „auf die Karte tippen“ gibt es „**Kartenmitte als Startpunkt**“ mit Fadenkreuz.
  - Ein Tipp öffnet auf der Karte schon Marker und Cluster.
  - Die Kartenmitte ist auch mit Tastatur und Bildschirmleser bedienbar.
  - Haltestellen kommen erst mit der ÖPNV-Matrix.
- **Tests** laufen deterministisch und offline:
  - E2E leitet `tiles.openfreemap.org` auf Fixtures um.
  - Der Drittanbieter-Wächter erlaubt diesen Host nur in Tests, die das ausdrücklich anfordern, und nur solange die Karte im DOM ist.
  - Jede Anfrage wird geprüft: kein Querystring, kein Kachel-Request nach dem Setzen eines Startpunkts aus Standort oder Kartenmitte.

## Konsequenzen

- Fällt OpenFreeMap aus, gibt es keine Karte. Entfernungen, Liste und Orts-Liste bleiben, weil sie ohne Kacheln rechnen. Ausweichweg ist die PMTiles-Alternative oben, als neue ADR.
- Beim ersten Öffnen der Karte kommen ca. 440 kB gzip JS dazu (Hauptthread ca. 284 kB, Worker ca. 144 kB; der Worker bündelt den gemeinsamen MapLibre-Code ein zweites Mal), plus ca. 11 kB CSS. Danach liegt alles im HTTP-Cache.
- Die Datenschutzlage hängt an der Erklärung eines Dritten. Die Attribution und der Satz unter der Karte nennen ihn.
- ADR 0005 (ÖPNV-Fahrzeit) bleibt das Ziel. Die Luftlinie aus Plan 0004 ist die Zwischenstufe.
