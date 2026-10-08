# Plan 0024 – Karte im Zwergenplan-Look, Marker mit Kategorie-Symbol

Status: in Umsetzung – umgesetzt und live seit d5fab1b; ins Archiv nach dem Browser-Review live (Plan 0027, Etappe 6). Früherer Status: umgesetzt (Branch `karte-look-0024`)
Datum: 2026-10-08
Bezug: ADR 0008 (Karte, OpenFreeMap, Kamera-Regel), ADR 0012 (Budgets), Plan 0005 (Karte), Plan 0008 (E15 Cluster-Determinismus, E16 deutsche Labels)

**Kein Plan-Review** (Nutzerentscheid: pragmatisch, kurzer Plan). Die Änderung bleibt in `src/ui/map/`, ohne neue Abhängigkeit, ohne Schemaänderung und ohne neuen Request.

## Ziel

Nutzerwunsch: „Die Karte sieht vom Styling her noch etwas trist aus. Kann man die auch im Design wie die restliche Anwendung customizen? Auch wäre es cool, wenn die Marker die gleichen Icons wie Bewegung, Wasser, Treffs, Krabbeln usw. hätten.“

1. Die Grundkarte (Positron bzw. Dark von OpenFreeMap) bekommt die Farben der App: Land, Wasser, Grün, Straßen, Gebäude und Beschriftung aus den Tokens, hell und dunkel getrennt. Unruhige Details verschwinden.
2. Jeder Ort zeigt als Marker einen Sticker in der Farbe seiner häufigsten Kategorie mit deren Form (wie `Shape` in der Liste). Mehr als ein Angebot: kleine Zahl als Badge. Cluster bleiben runde Kreise mit Zahl.

## Entscheidungen

- **E1 Einfärben statt eigener Stil.** Stil-URL, Host, Kacheln, Glyphen und Sprites bleiben unverändert (ADR 0008). Nach jedem `style.load` (wie die deutschen Labels) ändert `src/ui/map/basemap.ts` nur Paint-Eigenschaften und die Sichtbarkeit. Kein neuer Request, kein Eingriff in `guardTileRequest`.
- **E2 Zuordnung rein und robust.** `basemapChanges(layers, palette)` ordnet jeden Layer des Stils über `type`, `source-layer` (OpenMapTiles-Schema) und Hinweise in der ID einer Rolle zu (Land, Wohngebiet, Wasser, Grün, Gebäude, Straße, Randlinie, Nebenstraße, Weg, Bahn, Ortsname, Nebenbeschriftung) oder blendet ihn aus. Unbekannte Layer bleiben still unverändert; fehlende Layer gibt es nicht, weil die Liste aus `map.getStyle()` kommt. Getestet mit den echten Layer-Listen von Positron und Dark (Stand 2026-10-08) und der Fixture.
- **E3 Ausgeblendet** werden Straßenschilder (Shields), Einbahnpfeile, Flughafen- und Flugfeld-Layer, Grenzen sowie Länder-, Staaten- und Kontinentnamen. Straßen-, Wasser- und Ortsnamen bleiben.
- **E4 Palette aus Tokens.** `readMapTokens()` (bisher `readMapColors`) liest die Tokens weiter erst im `style.load`-Handler (Zeitpunkt-Hinweis E10 aus Plan 0005) und die Kategorie-Farben `--k` über ein kurzlebiges Element mit Klasse `k-<kategorie>`. `basemapPalette(tokens, dark)` mischt daraus Hex-Farben (`mixHex`, rein): Land zwischen `--bg` und `--surface`, Wasser aus der Wasser-, Grün aus der Natur-Farbe, Straßen in `--surface` bzw. `--rim`, Beschriftung in `--ink`/`--muted` mit Halo in Landfarbe. Hell und dunkel haben eigene Mischverhältnisse. MapLibre versteht kein `color-mix()`, deshalb rechnet JS.
- **E5 Kategorie je Ort.** `mainCategory(offers)` in `geojson.ts` (rein): zählt über alle Angebote des Ortes `categoriesOf(topics)`, die häufigste gewinnt, bei Gleichstand die frühere in `CATEGORIES`. Rückfall wie `leadCategory` (`treffs-cafes`), nur für den Typ. Das Ergebnis steht als Property `kategorie` im GeoJSON; die Quelle bleibt nach `key` sortiert (Plan 0008, E15). Ein gewählter Kategoriefilter beeinflusst die Wahl nicht eigens (siehe Offene Fragen). Die Funktion liegt im Karten-Chunk (`geojson.ts`), nicht in `src/domain/topics.ts`, weil topics.ts zum Start-Chunk gehört und nur die Karte sie braucht.
- **E6 Symbole lokal gerendert.** `marker-images.ts` zeichnet die Pfade aus `CATEGORY_UI` per Canvas/`Path2D` in `--on-color` und registriert sie als `kategorie-<kategorie>` mit `pixelRatio = devicePixelRatio` per `map.addImage`, nach jedem `style.load` neu (ein Stilwechsel verwirft Bilder). Keine Sprites von außen.
- **E7 Marker-Layer** (Reihenfolge von unten): `orte-cluster-schatten`, `orte-cluster`, `orte-cluster-zahl`; `orte-punkt-schatten` (Versatz 2 px in `--shadow`, wie die harten Schatten der App), `orte-punkt` (Kreis r = 15 in Kategorie-Farbe, Rand 2 px `--line`), `orte-punkt-symbol` (Bild), `orte-punkt-badge` und `orte-punkt-zahl` (nur bei mehr als einem Angebot, oben rechts, `--primary`/`--on-primary`). Getippt wird weiter über `PLACE_LAYERS = ["orte-cluster", "orte-punkt"]` und das 44-px-Rechteck (`nearestHit`), also bleibt das Touch-Ziel ≥ 44 px. Startpunkt-Layer unverändert und zuoberst.
- **E8 Unverändert:** Kamera-Regeln (ADR 0008), Start-JS und Start-CSS (alles im Karten-Chunk), Schrift „Noto Sans Regular“ (keine weiteren Glyphen-Stacks). Für die spätere Merkliste-Karte bleibt `MapView` unverändert generisch (Orte mit Angeboten rein, Tipp raus).

## Tests

- Unit: `geojson.test.ts` (`mainCategory`: häufigste, Gleichstand nach `CATEGORIES`, Mehrfachkategorien eines Themas; `kategorie` im GeoJSON, Sortierung bleibt), `basemap.test.ts` (Rollen für Positron, Dark und Fixture; Ausblenden; unbekannte Layer unverändert; `mixHex`; Palette hell ≠ dunkel; Kontrast Straßennamen gegen Land ≥ 4,5 : 1 in beiden Themes).
- E2E `karte.spec.ts`: Marker-Bilder für alle 12 Kategorien registriert (`hasImage`), auch nach dem Stilwechsel; Ort-Features tragen `kategorie`; Grundkarte eingefärbt (Hintergrund weicht vom Fixture-Stil ab, hell ≠ dunkel); Cluster-Farbe = `--primary`. Bestehende Tests (Tippen, Kamera, Wächter) bleiben grün.
- Sichtprüfung: Screenshots hell/dunkel auf Mobile-Viewport (lokal, nicht im Repo).

## Arch-Review (Subagent, 2026-10-08)

Kein Blocker, kein Mittel. Gering, alle umgesetzt: (1) Einfärben nach den eigenen Layern und mit Rückfall, damit ein Farbfehler nie Marker oder Tippen kostet; (2) Kommentar zum `error`-Ereignis korrigiert; (3) Ort von `mainCategory` begründet (E5); (4) Erklärung der +8 B am Build geprüft; (5) E2E prüft das Badge (nur bei mehr als einem Angebot).

## Ergebnis

Gemessen mit size-limit (gzip) gegen `a666dbe`:

| Budget | vorher | nachher | Delta |
|---|---|---|---|
| Karte JS (lazy), Budget 450 kB | 425,45 kB | 427,19 kB | +1,74 kB |
| JS (initial), Budget 100 kB | 93,244 kB | 93,252 kB | +8 B |
| CSS, Karte CSS | 11,42 / 10,77 kB | unverändert | 0 |

Das Start-JS enthält keinen neuen Code. Die +8 B entstehen aus zwei weiteren Exporten des Einstiegs, die der Karten-Chunk jetzt mitbenutzt (am Build verglichen: nur die `export{…}`-Liste und die Chunk-Hashes in den `import()`-Pfaden unterscheiden sich), und aus geänderten Chunk-Hashes. Eine Kopie der Logik im Karten-Chunk wäre größer und doppelt.

Stolperstein: Ein Bezeichner im Karten-Code, der genau wie die Tailwind-Schatten-Utility hieß, ließ Tailwind diese Utility ins Start-CSS schreiben (+28 B), weil Tailwind alle Quellen im Repo (auch Markdown) nach Klassennamen durchsucht. Deshalb heißen Token und Funktion `shadowColor` bzw. `dropShadow`, und auch dieser Plan nennt das Wort nicht allein.

Sichtprüfung (Pixel 7, hell/dunkel, echte OpenFreeMap-Kacheln, Zoom 13 und 15,5): Land in Papierblau bzw. Nachtblau, Pegnitz und Parks in Pastell aus den Kategorie-Farben, Straßennamen lesbar, Marker als farbige Sticker mit Symbol, Rand und Versatz-Schatten, Badge mit Zahl.

## Offene Fragen

- Soll ein gewählter Kategoriefilter die Marker-Kategorie bestimmen (wie `leadCategory` mit `focus`)? Heute zählt nur die Häufigkeit unter den sichtbaren Angeboten.
