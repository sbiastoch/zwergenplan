# Plan 0014 – Das Kategorie-Etikett folgt dem Filter

Status: Review eingearbeitet, freigegeben zur Umsetzung
Datum: 2026-10-06
Bezug: Plan 0003 (E9 Kachel, E10 Kategorien), `src/domain/topics.ts`, `src/ui/categories.ts`

## Ziel

Nutzermeldung (2026-10-06): „Die Filter scheinen nicht immer richtig zu funktionieren. Teilweise tauchen dann noch Angebote aus anderen Kategorien auf.“

- Wer eine oder mehrere Kategorien wählt (Sticker-Leiste oder Filter-Sheet), sieht auf jeder Kachel, im Detail und in den Kalender-Punkten eine **der gewählten** Kategorien als Etikett (Pille, Farbe, Form).
- Ohne Kategoriefilter bleibt alles wie heute.
- Was gefiltert wird, ändert sich nicht.

## Nicht-Ziele

- **Mehrere Etiketten je Kachel.** Das bräuchte mehr Platz auf der Kachel (360 px, Text-Gates) und ein neues Design. Kommt als Idee nach `docs/ideas.md`.
- **Themen in den Daten nachschärfen.** Einzelne Zuordnungen wirken großzügig, zum Beispiel „Lesestunde für Klein und Groß“ mit `vorlesen,museum,theater`. Das ist Datenpflege im Skill `babyevents-nuernberg` und hat mit dem Fehler nichts zu tun.
- Die Zuordnung Themen → Kategorien (`TOPIC_CATEGORIES`) bleibt unverändert.

## Ausgangslage

### Der Filter ist richtig, das Etikett nicht

- `matchesFilter` (`src/domain/filter.ts`) lässt ein Angebot durch, wenn **irgendeine** seiner Kategorien (`categoriesOf(offer.topics)`) gewählt ist. Das ist gewollt, denn ein Babykonzert ist Musik und Bühne zugleich.
- Die Kachel zeigt genau eine Kategorie: `primaryCategory(topics)` (`src/ui/categories.ts:40`), also immer die **erste** in der festen Reihenfolge von `CATEGORIES`. Der Filter wird dabei nicht beachtet.
- Folge: Wer „Bühne & Konzert“ wählt, sieht das Herbst-Babykonzert (`konzert,musik`) mit dem Etikett „Musik & Singen“. Für die Nutzerin sieht das so aus, als sei ein Musik-Angebot durchgerutscht.
- Dieselbe Funktion bestimmt die Pille und Farbe der Kachel (`OfferCard.tsx`), den Kopf des Details (`DetailDialog.tsx`) und die Punkte in Wochenleiste und Monatsraster (`CalendarView.tsx`).

### Ausmaß in den echten Daten (`data/offers.json`, Stand `5c3c140`)

96 von 333 Angeboten haben mehr als eine Kategorie. Mit nur einer gewählten Kategorie tragen so viele Treffer ein fremdes Etikett:

| Filter | fremdes Etikett | Beispiel |
|---|---|---|
| Musik & Singen | 46 | Zumbini (`musik,tanz`) → „Bewegung“ |
| Treffs & Cafés | 15 | Krabbelgruppe TabeaHaus (`krabbelgruppe,elterntreff`) → „Krabbeln“ |
| Kreativ & Basteln | 11 | BabySinne (`kreativ,spielgruppe`) → „Krabbeln“ |
| Beratung & Gesundheit | 11 | Rückbildung (`rueckbildung,hebamme`) → „Bewegung“ |
| Bühne & Konzert | 9 | Jazz für Kinder (`konzert,musik,theater`) → „Musik“ |
| Bewegung & Turnen | 7 | BewegungsOase (`bewegung,elterntreff`) → „Treffs“ |
| Bücher & Vorlesen | 3 | Bücherzwerge (`bibliothek,vorlesen,singen`) → „Musik“ |
| Natur & Draußen, Museum | je 1 | Waldkrabbelgruppe → „Krabbeln“ |

Babykurse, Krabbel- & Spielgruppen und Wasser stehen in der Reihenfolge vorn oder haben keine Überschneidungen und sind deshalb nicht betroffen. Das erklärt das „nicht immer“.

### Fixtures, mit denen der Fehler im E2E nachstellbar ist (`tests/fixtures/offers.json`)

- „Babykonzert im Advent“ (`konzert,musik`): Mit `?kat=buehne` zeigt die Kachel heute „Musik & Singen“.
- „Krabbelreime & Fingerspiele“ (`vorlesen,singen`): Mit `?kat=buecher` zeigt die Kachel heute „Musik & Singen“.
- „Offener Krabbeltreff“ (`krabbelgruppe,elterncafe`): Mit `?kat=treffs-cafes` zeigt die Kachel heute „Krabbel- & Spielgruppen“.

## Entscheidungen

### E1 – Leitkategorie mit Fokus, in der Domäne

Neue reine Funktion in `src/domain/topics.ts`:

```ts
/**
 * Leitkategorie eines Angebots – bestimmt Etikett, Farbe und Form. Liegt eine seiner Kategorien im Fokus
 * (gewählter Kategoriefilter), gewinnt die erste davon, sonst die erste überhaupt (feste Reihenfolge).
 */
export function leadCategory(topics: readonly Topic[], focus: readonly Category[]): Category
```

- `focus` ist Pflicht und hat keinen Standardwert (Review, Finding 1). Jede Aufrufstelle muss sich entscheiden. Sonst kompiliert ein vergessener Fokus still und zeigt das alte Etikett.

- Die Reihenfolge ist immer die von `CATEGORIES`, nicht die der Auswahl. Damit hängt das Etikett nicht davon ab, in welcher Reihenfolge jemand die Sticker angetippt hat. Die URL ist ohnehin kanonisch sortiert (`filterToSearch`).
- Ohne passende Kategorie im Fokus gilt die erste Kategorie des Angebots. Das passiert, wenn kein Filter aktiv ist oder keine Kategorie des Angebots gewählt ist (Merkliste).
- Der Rückfall `"treffs-cafes"` bei leerem `categoriesOf` bleibt. Das Schema verbietet Angebote ohne Kategorie (`schema.ts`, `refine`), der Rückfall dient nur dem Typ.
- `primaryCategory` in `src/ui/categories.ts` fällt weg. Grund: `docs/architecture.md`, „Geschäftslogik gehört nach `src/domain`“. Diese Auswahl hängt vom Filterzustand ab und ist damit Filterlogik.

### E2 – Ein Weg durch die UI: `CardContext.categoryOf`

- `CardContext` (`src/ui/OfferCard.tsx`) bekommt `categoryOf: (offer: SiteOffer) => Category`.
- `App.tsx` setzt es auf `(offer) => leadCategory(offer.topics, route.filter.categories)`.
- Wer es nutzt:
  - `OfferCard` statt `primaryCategory(offer.topics)`.
  - `CalendarView`: Wochenleiste und Monatsraster. `WeekStrip` und `MonthGrid` bekommen dafür `categoryOf` als Prop; `ctx` haben sie heute nicht.
  - `DetailContent`: neues Prop `category: Category`, das `Overlays.tsx` mit `ctx.categoryOf(detailOffer)` füllt. `DetailContent` kennt `ctx` heute nicht und soll es nicht bekommen.
- Kachel, Detail und Kalender zeigen damit dasselbe Etikett. Das gilt in allen Ansichten, die `ctx` bekommen: Liste, Kalender, Merkliste, Orts-Sheet und Anbieter-Sheet.

### E3 – Merkliste und Anbieter-Sheet ohne Sonderfall

Die Merkliste filtert nicht nach Kategorie, nutzt aber denselben `ctx`. Liegt ein gemerktes Angebot in einer gewählten Kategorie, trägt es dort deren Etikett, sonst seine erste.

**Abwägung (Review, Finding 4):** Der Filter bleibt beim Tabwechsel in der URL (`App.tsx`), in der Merkliste sind Sticker-Leiste und Schnellfilter aber ausgeblendet. Nach „Bühne“ trägt das gemerkte Babykonzert dort „Bühne & Konzert“, ohne dass der Grund sichtbar ist. Die Alternative wäre, der Merkliste den Fokus `[]` zu geben. Dann zeigte aber das Detail, das `Overlays.tsx` für alle Ansichten mit demselben `ctx` füllt, ein anderes Etikett als die Kachel, von der man kam. Sonst bräuchte das Detail einen eigenen Fokus je Herkunft. Wir nehmen deshalb die Regel „dasselbe Angebot sieht zu jedem Zeitpunkt überall gleich aus“. Das Etikett ist auch in der Merkliste richtig, denn das Angebot gehört zur gezeigten Kategorie. Die Browser-Prüfung (Schritt 7) sieht sich diesen Fall an. Wirkt er dort verwirrend, wird das ein eigener Plan.

## Struktur

| Datei | Änderung |
|---|---|
| `src/domain/topics.ts` | `leadCategory` (E1) |
| `src/domain/topics.test.ts` | neu, Unit-Tests zu `leadCategory` |
| `src/ui/categories.ts` | `primaryCategory` und der Import von `categoriesOf`/`Topic` fallen weg |
| `src/ui/OfferCard.tsx` | `CardContext.categoryOf`, Kachel nutzt es |
| `src/ui/App.tsx` | `ctx.categoryOf` aus `route.filter.categories` |
| `src/ui/CalendarView.tsx` | Punkte über `categoryOf` |
| `src/ui/DetailDialog.tsx`, `src/ui/Overlays.tsx` | Prop `category` |
| `e2e/app.spec.ts` | E2E-Tests (siehe unten) |
| `docs/ideas.md` | Idee „mehrere Etiketten je Kachel“ |
| `docs/plans/0003-design-stickerheft.md` | Hinweis „geändert durch Plan 0014, E1“ an E9 (Pille) und E14 (Formpunkte) |

Keine neue Abhängigkeit, kein neues Modul, keine Schemaänderung. Erwartet sind deutlich unter 200 Zeilen, also kein `/arch-review` nötig (CLAUDE.md, Schritt 4).

## Tests

Test-first. Der Unit-Test ist zuerst rot, weil `leadCategory` noch fehlt. Der E2E-Test ist rot, weil er heute „Musik & Singen“ findet.

**Unit (`src/domain/topics.test.ts`)**

- Ohne Fokus: erste Kategorie in fester Reihenfolge (`["konzert","musik"]` → `musik`).
- Fokus trifft eine spätere Kategorie: `["konzert","musik"]` mit `["buehne"]` → `buehne`.
- Fokus trifft nicht: `["konzert","musik"]` mit `["wasser"]` → `musik`.
- Fokus trifft zwei: `["tanz"]` (bewegung, musik) mit `["musik","bewegung"]` → `bewegung`. Die feste Reihenfolge gilt, nicht die der Auswahl.
- Reine Merkmale ohne Kategorie werden übergangen: `["mehrsprachig","musik"]` → `musik`.

**E2E (`e2e/app.spec.ts`, Fixture-Daten, alle Geräte)**

- `./?kat=buehne`: Die Kachel „Babykonzert im Advent“ zeigt „Bühne & Konzert“. Nach Tipp auf den Titel (`getByRole("heading").getByRole("button")`, wie `e2e/pwa.spec.ts`) zeigt auch `page.getByRole("dialog", { name: "Babykonzert im Advent" }).locator(".catname")` „Bühne & Konzert“.
- `./?kat=buecher`: Die Kachel „Krabbelreime & Fingerspiele“ zeigt „Bücher & Vorlesen“. Danach läuft `expectMobileUx(page)`, denn diese Pille erscheint auf Fixture-Kacheln zum ersten Mal (Review, Finding 3). Das Theme deckt der Geräte- bzw. Farbschema-Lauf der Suite ab, wie bei den anderen `expectMobileUx`-Aufrufen in `app.spec.ts`.
- `./?kat=treffs-cafes`: Die Kachel „Offener Krabbeltreff“ zeigt „Treffs & Cafés“, ebenfalls mit `expectMobileUx(page)`.
- Kalender (Review, Finding 1b): `./?kat=buehne`, Tab Kalender, „Ganzen Monat zeigen“, bis Dezember blättern. Der Tag 6. Dezember im Monatsraster enthält `span.k-buehne` und kein `span.k-musik`.
- `./` ohne Filter: „Babykonzert im Advent“ zeigt weiter „Musik & Singen“. Das sichert ab, dass sich ohne Filter nichts ändert.
- Prüft nur die Pille der jeweiligen Kachel (`offers(page).filter({ hasText })`, darin `.pill`) bzw. `.catname` im Dialog. Die bestehenden Layout- und Text-Gates decken die Darstellung ab, längere Labels gibt es nicht, denn es sind dieselben zwölf.

Die Kalender-Punkte prüft der Kalender-Test oben. Der Pflichtparameter `focus` sorgt zusätzlich dafür, dass keine Aufrufstelle ihn still vergisst.

## Schritte

1. Unit-Test `topics.test.ts` schreiben (rot), dann `leadCategory` (grün).
2. E2E-Test schreiben (rot gegen den alten Stand).
3. `CardContext.categoryOf`, `App.tsx`, `OfferCard`, `CalendarView`, `DetailContent`/`Overlays`. `primaryCategory` entfernen.
4. `docs/ideas.md` ergänzen, Hinweise in Plan 0003 setzen.
5. `pnpm check:fast` grün. E2E lokal mit eigenem Port (`PW_PORT=4273`) für `app.spec.ts`. Dazu `pnpm build && pnpm size`: Das Start-JS hat nur rund 0,27 kB Reserve (ADR 0013, Budget 92 kB). Die Differenz kommt in den Abschnitt „Ergebnis“ (Review, Finding 2).
6. Commit auf Branch `fix-filter-etikett`, Push, CI grün, Fast-Forward nach `main`, CI auf `main` grün (`gh run watch`).
7. `/browser-review live`: Mit `?kat=buehne`, `?kat=musik` und `?kat=treffs-cafes` stimmen die Etiketten, im Detail ebenso; ohne Filter alles wie vorher; hell und dunkel, 360 px. Dazu die Merkliste mit aktivem Filter (E3).

## Akzeptanzkriterien

- Mit genau einer gewählten Kategorie trägt jeder Treffer in Liste, Kalender, Detail, Orts-Sheet und Anbieter-Sheet deren Etikett.
- Mit mehreren gewählten Kategorien trägt jeder Treffer eine davon, und zwar die erste in fester Reihenfolge.
- Ohne Kategoriefilter ändert sich keine Kachel.
- `pnpm check:fast` und CI grün, die neuen Tests waren vor dem Fix rot.

## Risiken

- **Etikett wechselt beim Antippen eines Stickers.** Eine Kachel kann beim Filtern Farbe und Form wechseln, zum Beispiel Babykonzert von Musik zu Bühne. Das ist gewollt: Es bestätigt die Wahl. Eine Animation gibt es nicht, weil sich nur die Klasse ändert.
- **Memo-Abhängigkeiten.** `ctx` wird in `App.tsx` bei jedem Rendern neu gebaut, also ist `categoryOf` immer aktuell. Es gibt kein Memo, das veralten kann.

## Review (2026-10-06, plan-reviewer, Runde 1) – Verdict: Freigabe mit Änderungen → eingearbeitet

Keine Blocker. Alle Findings übernommen:

1. **Major: Kalender-Punkte ohne Gate.** Mit `focus = []` als Standard wäre ein vergessener Fokus still durchgegangen. → `focus` ist Pflicht (E1), dazu ein E2E-Test für das Monatsraster (Tests).
2. **Minor: Start-JS-Budget.** `check:fast` misst die Größe nicht. → In Schritt 5 kommen `pnpm build && pnpm size` dazu, die Differenz wird festgehalten.
3. **Minor: Neue Pillen durch die Text-Gates.** „Bücher & Vorlesen“ und „Treffs & Cafés“ erscheinen auf Fixture-Kacheln erstmals. → `expectMobileUx` in beiden Tests, dazu der dritte Fixture-Fall `?kat=treffs-cafes`.
4. **Minor: Ein unsichtbarer Filter ändert Etiketten in der Merkliste.** → Die Abwägung steht jetzt in E3. Wir bleiben bei „überall gleich“, weil sonst Detail und Kachel auseinanderliefen. Schritt 7 prüft den Fall im Browser.
5. **Minor: Plan 0003 beschreibt den alten Stand.** → Hinweise an E9 und E14 (Struktur, Schritt 4).
6. **Minor: Dialog-Selektor zu offen.** → Rolle und Name des Dialogs, Titel per `heading` → `button` (Tests).
