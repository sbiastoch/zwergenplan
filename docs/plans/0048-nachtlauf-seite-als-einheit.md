# Plan 0048 – Nachtlauf: die Programmseite als Einheit, ein Wächter, ein Abruf

Status: in Umsetzung (S0 erledigt, Nachtrag 1 reviewt; S1 auf Branch `nachtlauf-s1`, Nachtrag 2: Effort)
Datum: 2026-10-26
Bezug:
- **ADR 0033** (`docs/adr/0033-crawling-architektur.md`): Punkte 1 (ein Abruf), 2 (Einheit Seite), 3 (Zustand und Gesundheit), 5 (Wächter) und 7 (Grenzen nach Qualität). Dieser Plan setzt sie um.
- Ersetzt Plan 0047 (`docs/plans/archiv/0047-neue-angebote-zuverlaessig.md`). Dessen Messungen gelten weiter. Übernommen werden die Diagnose zu `carryReason`/`statusOf` und der abgeschottete Job für das Issue.
- ADR 0026, Punkte 2, 4 und 5; ADR 0022 und ADR 0031 (stabile IDs); Plan 0032, E3–E6 (Abruf, Schlüssel, Zustand, Bericht); Plan 0038 (Zuordnung, Restpunkte in `docs/ideas.md`).
- Skill `babyevents-nuernberg`, Abschnitte 1 (Bericht sichten), 3 (Katalog pflegen) und 5 (Modell wechseln).

## Voraussetzungen

- **Doku auf `main`:** erledigt mit `68efab0` (2026-10-26). Vor S1 kommen ADR 0033, die Pläne 0045–0050 (0045 und 0047 im Archiv) und die Pläne, auf die sie verweisen (etwa 0039 und 0042), als reiner Doku-Commit nach `main`. `node scripts/check-docs.ts` auf `main` ist grün.
- **Basis `main`.** Umgesetzt wird auf einem eigenen Branch von `main`.
- **Konflikt mit Branch `plan-0039`:** Plan 0042 ändert dort `scripts/pipeline/io/fetch-inputs.ts` und `scripts/pipeline/lib/fetch.ts` (`follow`, `withFollowPages`, `siteOf`) und bringt `partChars`. Kommt `plan-0039` zuerst auf `main`, baut S1 darauf auf. Sonst löst der spätere Rebase von `plan-0039` die Konflikte; Folgeseiten gehören dann zur Einheit ihrer Programmseite (E1).
- **Katalogfehler:** erledigt. `die-familienbox` steht seit `84a2bad` (2026-10-26) unter der neuen URL; `zentrum-kobergerstrasse` hat sich selbst erholt (TLS wieder gültig, Nachtlauf 2026-10-26 ohne Fehler).
- **Modell gewählt, nicht gewechselt:** erledigt am 2026-10-26, gewählt ist **Opus**, mit Effort `xhigh` seit Nachtrag 2 (2026-10-27; Abschnitt „Umsetzung“). Gewechselt wird **mit der Umstellung in S1** (E7): `LLM_MODEL_EXTRACT=opus`, `LLM_MODEL_FALLBACK=opus` und `LLM_EFFORT_EXTRACT=xhigh` in beiden Workflows. Den Fallback auf Opus zu setzen heißt: Der zweite Versuch nach einem Einbruch nimmt kein schwächeres Modell (Sonnet hatte im Eval weniger Recall). Heute schaltet gleiches Modell den zweiten Versuch ab (`strongRetry: model !== fallbackModelOf(…)` in `scripts/pipeline/cli.ts`); S1 ändert das (E5). So gibt es nur eine Neuextraktion und nur eine Gelegenheit, IDs zu verlieren (ADR 0033, Konsequenz „IDs“).

## Anlass

Der Nutzer will vor allem, dass neue Angebote bekannter Anbieter zuverlässig auftauchen und ein Ausfall nicht still bleibt (2026-10-25). Kosten sind kein Kriterium, auch das Kontingent nicht (2026-10-26). Das Gesamt-Review vom 2026-10-25 zeigte: Die Sonderlogik des Vorgängerplans 0047 stammt daher, dass Abruf, Schlüssel und Zustand je Anbieter gelten. ADR 0033 macht deshalb die Programmseite zur Einheit.

## Ausgangslage (gemessen 2026-10-25/26)

- **Seiten je Anbieter** (`data/providers.yaml` auf `plan-0039`, alle Regionen): 107 abgerufene Anbieter.
  - 60 haben eine Seite, 47 mehrere; das sind 185 von 245 Seiten.
  - Die meisten Seiten haben `studio-herzschlag` (14), `fbs-nuernberg` (12), `zoff-harmonie` (8) und `die-familienbox` (7).
  - Drei Anbieter haben Seiten mit `use: verfuegbarkeit`: `hebamme-eva-kauper-wunderwerk`, `dance-maxx-nuernberg`, `wolf-pack-yoga`.
  - 97 Seiten tragen einen `hint`.
  - Seitenarten: 192 `html`, 32 `html` mit Browser, 10 `ical`, 6 `json-api`, 5 `pdf`.
- **Ein Seitenausfall sperrt den Anbieter:** `assembleProvider` (`scripts/pipeline/lib/fetch.ts`) setzt bei der ersten gescheiterten Seite `fehler`. `failed()` (`scripts/pipeline/lib/refresh.ts`) behält dann den alten Stand. Neue Kurse der übrigen Seiten kommen nicht an (`die-familienbox` vom 2026-10-22 bis 2026-10-26).
- **`sourceUrl` ist nicht verlässlich:** Bei `die-familienbox` tragen alle 24 Events die erste Seite.
- **Teile und Dubletten heute:**
  - `splitInput` und `mergeParts` (`scripts/pipeline/lib/split.ts`) zerlegen große Eingaben und vereinigen sie wieder. `mergeParts` legt dabei dasselbe Angebot aus zwei Teilen zusammen, **bevor** der Build läuft.
  - Schritt 3 des Builds (`scripts/pipeline/lib/build-offers.ts`, gleicher Fensterschlüssel) bricht mit einem Fehler ab, wenn ein regelmäßiges Angebot mit gleichem Titel und Ort aus zwei gleichrangigen Quellen andere Merkmale hat. Dann wird kein `data/offers.json` geschrieben.
  - `dropSameSourceDuplicates` (Schritt 4b) läuft erst danach.
- **Katalogauszug:** `catalogExcerpt` (`scripts/pipeline/lib/normalize.ts`) enthält den ganzen Eintrag samt aller `hint`. Er steckt im Schlüssel **und** in der Nachricht ans Modell (`extractMessage`, `scripts/pipeline/lib/extract.ts`).
- **IDs bei einer Neuextraktion** (Probe 2026-10-26, `die-familienbox` mit neuer URL, Sonnet statt Haiku): Nur 16 von 24 IDs blieben, obwohl es meist dieselben Kurse waren. Die Gründe:
  - **Kürzere Reihe:** 38 statt 53 künftige Termine. Die Reihe ist ein Anfangsstück der alten, aber nur 0,72 der Beginnzeiten stimmen überein; Stufe 1 verlangt 0,8.
  - **Formatwechsel** `kurs`/`regelmaessig`, den Stufe 2 nicht zulässt.
  - **Geänderte Altersangabe.**
- **Meldung:** Die Ampel wird gelb bei einem Ausfall und rot erst über 20 % (`scripts/pipeline/lib/report.ts`). `staleHints` meldet nach 14 Tagen im Bericht des Entdeckens. Ein Issue gibt es nicht.
- **Abruf:** Browser-User-Agent (`UA` in `scripts/pipeline/io/http.ts`), kein robots.txt. Je Lauf höchstens 4 Abrufe gleichzeitig, 2 je Host (`LIMITS` in `scripts/pipeline/io/fetch-inputs.ts`). Nominatim sperrt `/search` per robots.txt für alle Crawler (abgerufen 2026-10-26), erlaubt die API aber nach seiner Usage Policy.
- **Impressum:** Es entsteht aus `imprintPage()` in `scripts/lib/share-pages.ts`; `public/impressum/` ist gitignored.
- **Grenzen:** `NIGHT_BRAKES` 150 Aufrufe und 3 Mio. Tokens (`scripts/pipeline/lib/cost.ts`), `DEFAULT_BUDGET_MIN` 50 (`scripts/pipeline/io/nightly.ts`), `CONCURRENCY` 3 Anbieter. Zeitbudget und Bremse prüft der Lauf nur vor jedem Anbieter. Der Job `nachtlauf` hat fest `timeout-minutes: 90` (`.github/workflows/nightly.yml`).

## Ziel

1. **Seitenausfall kostet nur die Seite.** Fällt eine von mehreren Seiten aus, erscheinen in **derselben Nacht** neue Angebote der übrigen Seiten. Keine ID aus dem Vorstand der ausgefallenen Seite fehlt, solange der Ausfall vorübergehend ist oder weniger als 14 Tage ununterbrochen `dauerhaft`. Gemessen mit einem Test über mehrere Nächte und in der Woche nach S1 im Bericht (verlorene IDs bei Anbietern mit ausgefallener Seite: 0).
2. **Nicht schlechter als heute.** Die Extraktion je Einheit wird mit der Extraktion je Anbieter verglichen, mit demselben Modell (S0, je zwei Läufe). Bedingungen:
   - Sie liefert mindestens so viele Angebote des Vorstands wieder (Recall gegen `data/offers.json`, höchstens 1 Prozentpunkt darunter).
   - Sie hat höchstens 1 Prozentpunkt mehr Dubletten (gleicher Anbieter, Ort und Beginn, ähnlicher Titel).
   - Kein Build-Fehler.
   - Kein Anbieter hat mehr als 10 % weniger Angebote ohne erklärten Grund.
3. **Kein stiller Ausfall.** Im Wächter-Issue stehen:
   - jede Seite, die an zwei aufeinanderfolgenden Kalendertagen scheitert;
   - jede entfernte Seite;
   - jede Seite, die robots.txt sperrt;
   - jeder zurückgehaltene Einbruch;
   - jeder Anbieter, der keine künftigen Angebote mehr hat (14 Tage lang);
   - jede noch nicht umgestellte Rohdatei.

   Ist nichts offen, ist das Issue geschlossen.
4. **Ein Abruf.** Jeder Seitenabruf nennt uns im User-Agent und beachtet robots.txt. Wie viele Katalogseiten das kostet, ist vor dem Einschalten gemessen und entschieden (S3, N1).
5. **Umstellung ohne Verlust.** Nach höchstens drei Nächten der Umstellung steht jeder Anbieter im neuen Format oder steht mit Grund im Bericht, ab S2 im Wächter.
6. **IDs halten.** Bei der Umstellung behalten mindestens 95 % der Angebote, deren Kurs es weiter gibt, ihre ID, und kein Angebot übernimmt die ID eines anderen.
   - „Derselbe Kurs“ heißt: gleicher Anbieter und Ort, ähnlicher Titel (`similarTitle` oder `sameCoreTitle`) und dazu gleicher erster künftiger Beginn auf die Minute oder gleiche Wochentage und Uhrzeiten.
   - Gemessen in S0 offline und nach der Umstellung im Bericht.

## Nicht-Ziele

- **Neue Programmseiten finden:** Plan 0049 (Seitenfinder).
- **Neue Anbieter:** Plan 0050.
- **Plätze per Rezept:** Plan 0046, zurückgestellt.
- **ID-Wechsel bei Umformulierung von Nacht zu Nacht** (103 in 12 Nächten, Plan 0047): E11 behandelt nur die Fälle, die bei einer Neuextraktion auftreten (kürzere oder längere Reihe, Formatwechsel). Andere Fälle werden nach S1 neu gemessen, dann folgt bei Bedarf ein eigener Plan.
- **`checkedAt` je Event:** `checkedAt` wird je Einheit genauer (E6), mehr nicht.
- **`Crawl-delay`:** später, wenn eine Website es verlangt.

## Entscheidungen

### E1 – Einheit

- **Einheit** (`scripts/pipeline/lib/units.ts`, neu, rein):
  - je Programmseite mit `use: termine` ohne `blocked`, samt ihrer Folgeseiten (`follow`, sobald Plan 0042 auf `main` ist);
  - dazu als **Beilage** alle Seiten mit `use: verfuegbarkeit` ohne `blocked` desselben Anbieters;
  - die Kandidaten der Sammelkalender als Einheit `kandidaten`. Sie besteht, wenn der Anbieter in dieser Nacht Kandidaten hat, wenn er nur über Kandidaten läuft (`coveredBy`, `skipCrawl`) oder wenn der Vorzustand sie hat. Ohne Kandidaten in dieser Nacht gilt sie als leere Eingabe; der Einbruchschutz greift wie bei jeder Einheit (E5).
- **Kennung:** `seite:<URL aus dem Katalog>`, also die **Vorlage** mit `{von}`/`{bis}`, nicht die ausgefüllte URL, damit sie über die Nächte gleich bleibt. Bei `request` kommt `#<die ersten 8 Zeichen des SHA-256 des Bodys der Vorlage>` dazu. Für die Sammelkalender heißt die Einheit `kandidaten`. `data:validate` prüft, dass die Kennungen je Anbieter eindeutig sind.
- **Geänderte URL im Katalog:** Die Einheiten mit alter Kennung („verwaist“) bleiben in Zustand und Build, bis jede Seite des Anbieters eine Einheit mit `inputHash` hat.
  - Die erste Extraktion einer neuen Einheit wird gegen die Summe der künftigen Angebote der verwaisten Einheiten geprüft, mit der Einbruchregel aus E5.
  - Bei einem Einbruch, etwa einer Soft-404, wird sie `pending`, und die verwaisten Einheiten bleiben.
  - So kostet eine neue URL, die scheitert oder leer ist, keine Angebote.
- **Reihenfolge:** wie im Katalog, `kandidaten` zuletzt. Sie bestimmt die Reihenfolge in `mergeParts` und die Batches im Build (E6).
- **Eingabe je Einheit:**
  - `## Seite 1: <url> (<art>)` für die eigene Seite, dann die Beilagen als weitere `## Seite k:`;
  - bei `kandidaten` der Abschnitt `## Kandidaten (n)` wie heute.

  `MAX_INPUT_CHARS` gilt je Einheit. Große Einheiten zerlegt `splitInput` wie heute (`partChars` je Einheit).
- **Status der Einheit:**
  - `fehler`, wenn ihre eigene Seite oder eine Folgeseite scheitert;
  - bei `kandidaten` `fehler`, wenn ein relevanter Sammelkalender ausfällt (`adapterFailure` wie heute, nur noch für diese Einheit).
- **Beilagen sind optional.** Scheitert eine Beilage, extrahiert jede Einheit ohne sie. Der Schlüssel ändert sich dadurch von selbst. Die Verfügbarkeit fehlt dann, die Termine nicht.
  - Der Zustand der Beilage steht getrennt in `beilagen` (E4) und hat einen eigenen Befund im Wächter.
  - „Entfernt“ (E5) greift nie wegen einer Beilage.
  - Alle drei Beilagen im Katalog sind Browser-Widgets auf Plattformen mit Bot-Schutz. Wäre die Beilage Pflicht, sperrte sie alle Seiten des Anbieters.

### E2 – Abruf je Einheit

- `fetchInputs` (`scripts/pipeline/io/fetch-inputs.ts`) ruft jede Seite einmal ab, wie heute, auch eine Beilage, die in mehreren Einheiten steht. Je Anbieter liefert es `units: FetchedUnit[]` statt eines Gesamttexts: `id`, `status`, `reason`, `klasse` (E8), `pages: {url, text}[]`, `candidates`, `text`, `allowedUrls`.
- `assembleProvider` (`scripts/pipeline/lib/fetch.ts`) wird zu `assembleUnit`, mit derselben Logik für eine Einheit. `HashesFile` und `renderFetchMarkdown` zählen je Einheit.
- `FetchedProvider` (`scripts/pipeline/lib/refresh.ts`) behält `via`, `ownAdapter` und `adapterIssues` auf Anbieterebene und bekommt `units`.

### E3 – Schlüssel und Nachricht je Einheit

- Neue Funktion `unitExcerpt(provider, unit)` (`scripts/pipeline/lib/units.ts`): der Eintrag ohne `notes`. `programme` nennt **alle** Seiten des Anbieters (`url`, `kind`, `render`, `use`), `hint` aber nur bei den Seiten der Einheit (eigene Seite und Beilagen). Venues, Name, `availability` und `partChars` bleiben drin. Bei `kandidaten` stehen alle Seiten ohne `hint` drin (Nachtrag 1, S0: Ohne die Liste der übrigen Seiten ließ das Modell bei `studio-herzschlag` die Kurse externer Kursleitungen weg, weil es nicht sah, dass der Katalog deren Seiten diesem Anbieter zuordnet; 12 von 43 Angeboten fehlten).
  - Wie heute die Nachricht nennt der Auszug keine Seiten mit `use: info` oder `blocked`.
  - Eine neue oder gestrichene Seite ändert damit den Schlüssel aller Einheiten des Anbieters, und der Anbieter wird ganz neu extrahiert. Das wird bewusst hingenommen (Review 3, M3): Der Kontext der übrigen Seiten wiegt schwerer (S0, `studio-herzschlag`). Plan 0049 hängt Seiten automatisch an; dort steht die Folge unter „Risiken“, und der Pflegelauf misst die ID-Verluste je Anhang. Wird das zum Problem, nennt der Auszug statt der Seiten nur deren Hosts, geprüft im Eval an `studio-herzschlag`.
  - **Felder:** `ExtractInput` (`scripts/pipeline/lib/extract.ts`) bekommt `excerpt: Anbieter` (der Auszug für Nachricht und Schlüssel) neben `provider` (der volle Eintrag für die Prüfung).
  - **Build-Probelauf** (`checkExtraction`, `scripts/pipeline/lib/extract.ts`) und Prüfung der Antwort laufen gegen den **vollen** Katalogeintrag, nicht gegen den Auszug. Sonst verletzt eine Einheit `kandidaten` die Schemaregel „mindestens eine Terminseite“ (S0: alle 24 `kandidaten`-Einheiten scheiterten so).
  - **Teilzeile:** Bei einer aufgeteilten Einheit sagt `extractMessage` künftig „Die Eingabe **dieser Seite** ist auf N Aufrufe verteilt“ statt „dieses Anbieters“. Sonst kann das Modell aus der Seitenliste schließen, Kurse stünden anderswo (Vermutung zu `geburtshaus-nuernberger-nest`, S0). Der Prompt-Hash ändert sich nicht, der Text der Nachricht schon.
- Heute gibt es zwei Auszüge: `catalogExcerpt` in `scripts/pipeline/lib/normalize.ts` (Schlüssel) und einen in `scripts/pipeline/lib/extract.ts` (Nachricht). Neu ist der **Schlüssel** `unitExcerpt`, und die **Nachricht** ist eine Projektion davon ohne Koordinaten, `publicId` und `partChars` (`messageExcerpt(unitExcerpt(…))`). Ein Test prüft, dass jede Änderung der Nachricht auch den Schlüssel ändert. Eine geänderte `hint` extrahiert so nur ihre Einheit neu, und das Modell sieht nur die Hinweise seiner Seite.
- `extractKey` (`scripts/pipeline/lib/normalize.ts`) bleibt, bekommt aber die Seiten bzw. Kandidaten der Einheit. Prompt, Schema und Modell gehen wie heute in den Schlüssel; `dated` bleibt je Einheit.

### E4 – Zustand `ProviderRaw` Version 2

`scripts/pipeline/lib/raw.ts`, Export `schema/provider-raw.schema.json` über `pnpm schema:export`:

```ts
ProviderRawV2 = {
  version: 2,
  units: Record<UnitId, UnitState>,   // Kennung wie E1
  beilagen?: Record<UnitId, {         // Zustand der Beilagen (E1), nur Abruf
    status: "ok" | "fehler", reason?, klasse?, klasseSince?, failingSince?, checkedAt,
  }>,
}
UnitState = {
  events: RawEvent[],
  inputHash?, dated?, model?, changedAt?,   // nur zusammen, wie heute
  status: "ok" | "keine-termine" | "fehler",
  reason?,                                  // Pflicht bei fehler
  klasse?: "dauerhaft" | "gesperrt" | "voruebergehend",  // nur bei fehler aus dem Abruf
  klasseSince?: Instant,                    // Beginn der aktuellen Klasse, nur mit klasse
  checkedAt: Instant,
  failingSince?: Instant,                   // nur bei fehler
  emptySince?: Instant,                     // Events vorhanden, aber keine künftigen (E5)
  sources?: Source[],                       // nur bei kandidaten
  pending?: { inputHash, dated?, model, events },
}
```

- Die Regeln aus `ProviderRaw.superRefine` gelten je Einheit. Dazu kommen: `klasse` und `klasseSince` nur gemeinsam und nur bei `fehler`; `sources` nur bei `kandidaten`.
- **Status des Anbieters** wird berechnet, nicht gespeichert (`providerStatus(raw)` in `scripts/pipeline/lib/raw.ts`):
  - `fehler`, wenn alle Einheiten `fehler` sind;
  - `keine-termine`, wenn keine Einheit Events hat;
  - sonst `ok`, dazu die Zahl der Einheiten im Fehler.
- **Übergang:** `ProviderRaw` ist bis S5 die Vereinigung aus dem heutigen Schema (V1, ohne `version`) und V2. `data:validate` prüft beide.
- **Rückweg:** Alter Code kann V2 nicht lesen (`readRawDir` in `scripts/pipeline/io/files.ts` wirft). Muss S1 zurück, werden die Code-Commits **und** alle Daten-Commits seit dem Deploy per `git revert` zurückgenommen, also die der Nachtläufe und die des Entdeckens, das neue Anbieter dann ebenfalls in V2 schreibt. Die V1-Dateien kommen so zurück; das steht im Skill, Abschnitt 1.

### E5 – Regeln je Einheit

- `planRefresh` und `applyOutcome` (`scripts/pipeline/lib/refresh.ts`) arbeiten je Einheit mit denselben Regeln wie heute je Anbieter:
  - Abruffehler → alter Stand mit `fehler`, ohne neuen Schlüssel;
  - gleicher Schlüssel → unverändert;
  - `pending` mit gleichem Schlüssel → übernehmen;
  - leere Eingabe → leer;
  - sonst extrahieren;
  - Einbruch → `pending`; vorher ein zweiter Versuch mit dem Fallback-Modell, **auch wenn es gleich dem Hauptmodell ist** (Review 3, M1: S0 zeigt starke Streuung zwischen zwei Läufen, ein zweiter Versuch fängt einen Teil davon). `strongRetry` ist in `cli.ts` immer an; der Kommentar in `io/nightly.ts` (`strongRetry`) wird angepasst. Test in `io/nightly.test.ts`: Einbruch mit `LLM_MODEL_EXTRACT` = `LLM_MODEL_FALLBACK` → zweiter Aufruf, erst danach `pending`.

  `RefreshContext` bekommt `unit` und `prev: UnitState | undefined`. `prevOfferCount` gibt es nur noch für die Umstellung (E7).
- **Einbruch je Einheit:**
  - heutige Regel: mindestens 3 alte künftige Angebote, und es bleibt weniger als die Hälfte;
  - **neu:** mindestens 1 altes und 0 neue. So löscht eine leere Antwort auf einer kleinen Seite keine Angebote samt IDs.
- **Neue Einheit** (neue Seite im Katalog, ohne Vorzustand): extrahieren ohne Einbruchprüfung, wie heute ein neuer Anbieter.
- **Entfallene Einheit:** siehe E1, „geänderte URL“. Eine Seite, die nur gestrichen oder `blocked` wurde, entfällt sofort.
- **Fehlerklasse über die Nächte:** Bleibt die Klasse gleich, bleibt `klasseSince`. Wechselt sie, beginnt `klasseSince` neu. `failingSince` zählt die ganze Fehlerserie wie heute.
- **Entfernte Seite** (ADR 0033, Punkt 3): Scheitert die **eigene Seite oder eine Folgeseite** mit `klasse: dauerhaft`, und liegt `klasseSince` mindestens 14 Kalendertage vor `today` (Europe/Berlin, `berlinIsoDate`), dann:
  - setzt die Regel `events: []` und löscht `inputHash`, `dated`, `model` und `changedAt`;
  - bleibt der Status `fehler`, Grund „entfernt: <Grund> seit <Datum>“.

  Kehrt die Seite zurück, wird sie extrahiert, auch mit unverändertem Inhalt; ohne gelöschten Schlüssel bliebe sie still leer.
- **`emptySince`** (ADR 0033, Punkt 3: „hatte künftige Events und hat keine mehr“):
  - gesetzt in **jedem** Pfad, auch bei „unverändert“ und bei einem übernommenen `pending`, wenn die Einheit keine künftigen Termine mehr hat und der Vorzustand Events hatte;
  - gelöscht, sobald es wieder künftige Termine gibt.

  „Künftig“ rechnet eine neue Funktion `hasFuture(events, today, freeDays)` über `expandSchedule`. Damit zählen Regeln mit abgelaufenem `until` oder erschöpftem `count` nicht, anders als `eventUnits`, das wöchentliche Regeln immer als 1 zählt. Eine unveränderte Seite, deren Kurse ablaufen, fällt so auf, ebenso ein Einbruch auf `[]`, der übernommen wurde.
- `refreshProvider` (`scripts/pipeline/io/refresh.ts`):
  - bearbeitet die Einheiten eines Anbieters nacheinander;
  - fragt vor jeder Einheit `mayContinue()` (Zeitbudget, Bremse, Abbruch);
  - schreibt die Datei **einmal** am Ende. Nach einem Abbruch schreibt sie die fertigen Einheiten neu und die übrigen mit altem Zustand; jede Einheit ist für sich gültig;
  - meldet je Einheit ein `RefreshResult` wie heute und je Anbieter eine Zusammenfassung.

### E6 – Build je Einheit

- `batchesFromRaw` (`scripts/pipeline/lib/build-offers.ts`):
  - gleicht zuerst die Einheiten eines Anbieters gegeneinander ab (E12) und vereinigt dann die Events aller Einheiten mit `mergeParts`, wie heute die Teile einer großen Eingabe. Dasselbe Angebot von zwei Seiten wird so vor Schritt 3 zusammengelegt, und der Build bricht nicht ab;
  - **Reihenfolge** dabei: zuerst Einheiten mit `ok`, dann solche im Fehler, jeweils in Katalogreihenfolge. Bei regelmäßigen Angeboten gewinnt in `mergeParts` das frühere Event, also der frische Stand;
  - lädt die freien Tage, die `mergeParts` braucht, schon vor `batchesFromRaw` (heute erst in `buildFromRaw`, `scripts/pipeline/io/nightly.ts`);
  - legt jedes übrige Event in den Batch seiner Einheit (`name` `<id>#<nn>` mit Katalogindex, zweistellig mit Null aufgefüllt; `checkedAt` der Einheit). `availability.checkedAt` eines Angebots ist damit die Prüfzeit seiner Seite;
  - lässt Einheiten, deren Kennung nicht mehr zum Katalog passt, nach E1 („geänderte URL“) stehen oder mit Hinweis entfallen.
- Der Status je Anbieter im `BuildInput` kommt aus `providerStatus`. `extracted` enthält Anbieter, bei denen eine Einheit `inputHash` hat.
- Schritt 7 („Übernahme aus dem Altbestand“) bleibt **unverändert**: Ausgefallene Einheiten tragen ihre alten Events selbst.
- Das Eval (`scripts/pipeline/io/eval.ts`) gleicht die Einheiten eines Falls ebenso ab, mit `matchUnits` ohne Vorstand (E12) und dann `mergeParts`, bevor es wertet.

### E7 – Umstellung vom alten Format, zusammen mit dem Modellwechsel

- Die Umstellung kommt mit dem Commit, der `LLM_MODEL_EXTRACT` (und bei Bedarf `LLM_MODEL_FALLBACK`) in beiden Workflows auf das gewählte Modell setzt (Skill, Abschnitt 5).
- Liest `refreshProvider` eine V1-Datei, ist **jede** Einheit neu. Der Anbieter wechselt nur dann in V2, wenn in diesem Lauf
  - alle Einheiten ein gültiges Ergebnis haben (extrahiert oder leer) und
  - die Summe ihrer künftigen Angebote (`eventUnits`) nicht unter die Hälfte der alten fällt (bei mindestens 3 alten).
- Sonst bleibt die V1-Datei **unverändert**. Der Bericht nennt „Umstellung ausstehend“ mit Grund, und der Wächter meldet jede V1-Datei (E10).
- **Erzwingen nach Prüfung:** Die neue Eingabe `umstellen` von `nightly.yml` gibt `--umstellen <id,…>` an `pipeline nightly` weiter. Das stellt diese Anbieter auch bei einem Einbruch oder mit einer dauerhaft scheiternden Seite um; die Einheit dieser Seite beginnt dann leer mit `fehler`. Daten schreibt so weiter nur der Workflow, nie ein lokaler Lauf (CLAUDE.md, „Daten“).
- **Grenzen der Umstellung:**
  - `nightly.yml` bekommt die Eingabe `timeout` für `timeout-minutes` des Jobs `nachtlauf`, als `${{ fromJSON(inputs.timeout || '90') }}`, weil die Eingaben beim Zeitplan leer sind;
  - die Umstellung läuft per `workflow_dispatch` mit `timeout=120`, `budget_min=90`, `max_calls=500`, `max_tokens=10000000` (Nachtrag 2: S0 maß mit Effort `medium` 237 Aufrufe, 4,5 Mio. Tokens samt Cache und etwa 24 Minuten mit 3 Anbietern parallel; `xhigh` braucht im Eval 1,65-mal so lange und 1,7-mal so viele Ausgabe-Tokens, also etwa 40 Minuten und 4,8 Mio. Tokens; je das Doppelte, Zeit mit Abruf). Der Trockenlauf in S1 misst die Werte im Runner; weichen sie ab, gelten seine. Kommt Düsseldorf vorher auf `main`, wird mit dessen Katalog neu gerechnet: Aufrufe = Zahl der Einheiten × 1,15 (S0: 237 Aufrufe für 207 Einheiten), Tokens und Minuten anteilig, je verdoppelt. Die Umstellung läuft per `workflow_dispatch` **vor** dem nächsten Zeitplan (01:30 UTC), sonst beginnt die Nacht mit den alten Grenzen (150 Aufrufe, 3 Mio. Tokens, 50 Minuten);
  - `budget_min` bleibt mindestens 20 Minuten unter `timeout`.

  Wer in einer Nacht nicht fertig wird, stellt in der nächsten um; bis dahin gilt sein alter Stand.

### E8 – Ein Abruf: User-Agent, robots.txt, Fehlerklasse

- **User-Agent** `Mozilla/5.0 (compatible; zwergenplan/1.0; +https://zwergenplan.app/impressum/)` für alle Seitenabrufe in `scripts/pipeline/io/http.ts` und im Browser (`scripts/pipeline/io/browser.ts`, Kontext-Option). Nominatim bekommt denselben Kontakt (`scripts/pipeline/io/geocode.ts`).
- **Impressum:** Ein Absatz zum Abruf in `imprintPage()` (`scripts/lib/share-pages.ts`): Zweck, Token `zwergenplan`, robots.txt wird beachtet, Kontakt. Test in `scripts/lib/share-pages.test.ts`. `/browser-review` der Impressumsseite lokal und nach dem Deploy live.
- **robots.txt:** `scripts/pipeline/lib/robots.ts` (neu, rein) nach RFC 9309:
  - die Gruppe `zwergenplan` ersetzt `*`; gleiche Gruppen werden zusammengeführt;
  - die längste passende Regel gilt, bei Gleichstand `Allow`; Muster mit `*` und `$`;
  - Antwort 4xx → alles erlaubt; 5xx, 429 oder nicht erreichbar → alles gesperrt für diesen Lauf.

  Ein Cache je Host und Lauf liegt in `scripts/pipeline/io/robots.ts` (neu); Weiterleitungen der robots.txt selbst werden verfolgt.
- **Wo geprüft wird:** nur bei **Seitenabrufen**, nicht in `fetchJson` allgemein. Das sind:
  - `fetchTask` und `withFollowPages` (jede Station einer Weiterleitung);
  - der Browser. `page.route` sieht nur die erste Anfrage, Weiterleitungen folgt der Browser selbst. Deshalb löst `http.ts` die Kette vorher auf und prüft jede Station, dann folgt `goto(finalUrl)`, und `page.url()` wird gegengeprüft;
  - die Sammelkalender (`scripts/pipeline/io/sources.ts`);
  - später Seitenfinder und Quellen des Entdeckens (Pläne 0049, 0050).

  **Ausgenommen** sind APIs mit eigenen Nutzungsregeln: Nominatim, OpenHolidays, GTFS-Feeds. Die Liste steht im Code mit Begründung, ein Test hält sie fest.
- Eine gesperrte Seite scheitert mit „robots.txt sperrt <Pfad>“, `klasse: gesperrt`. Ist robots.txt nicht erreichbar, gilt `klasse: voruebergehend`.
- **Fehlerklasse** strukturiert am Ergebnis des Abrufs: `PageOutcome` bekommt `klasse`, gesetzt dort, wo der Fehler entsteht:
  - HTTP 404/410 → `dauerhaft`;
  - robots.txt verbietet → `gesperrt`;
  - sonst `voruebergehend`, auch Bot-Schutz und eine nicht erreichbare robots.txt.

  Den Grundtext parst niemand. Bis S3 setzt S1 die Klasse für HTTP-Status und Bot-Schutz.
- **Einschalten erst nach Messung** (S3): Ein Schalter `--abruf=alt|neu` (Standard `alt`, Eingabe `abruf` in `nightly.yml`) hält das alte Verhalten, bis N1 entschieden ist. Danach entfallen Schalter und Browser-UA.

### E9 – Grenzen

- **Ab S1** gilt: `timeout-minutes` aus der Eingabe (E7). `mayContinue` prüft Zeitbudget und Bremse vor jeder Einheit, nicht nur vor jedem Anbieter.
- **Nach sieben Nächten im neuen Format (S4):** Ein Commit setzt `NIGHT_BRAKES`, `DEFAULT_BUDGET_MIN`, `CONCURRENCY` und den Standard von `timeout` auf das Doppelte des größten gemessenen Werts, aufgerundet. Bremsen schützen vor Schleifen, nicht vor Kosten (ADR 0033, Punkt 7).
- `CallRecord` bekommt `unit` (wie `part`), damit `kosten.jsonl` je Seite zählt.

### E10 – Wächter

- **Befunde** berechnet `watchFindings({ raws, catalog, today, discoverStates? })` in `scripts/pipeline/lib/watch.ts` (neu, rein) aus dem Zustand. `today` kommt aus `nightly.json`; Kalendertage rechnet `berlinIsoDate`. Arten:
  - `seite`: Einheit oder Beilage `fehler` mit `failingSince` mindestens einen Kalendertag vor `today` (zwei Nächte), außer `entfernt` und `gesperrt`;
  - `entfernt`: die Regel aus E5 hat gegriffen;
  - `gesperrt`: `klasse: gesperrt`, sofort;
  - `einbruch`: `pending`;
  - `leer`: keine Einheit des Anbieters hat künftige Events, mindestens eine hat `emptySince`, und das späteste liegt höchstens 14 Tage zurück;
  - `anbieter`: alle Einheiten `fehler` seit mindestens einem Tag (eine Zeile statt einer je Seite);
  - `umstellung`: Rohdatei noch V1.

  `discoverStates` bleibt in diesem Plan leer; Plan 0050 hängt die Art `klaerfall` an.
- **Text:** `watchIssue(findings, today)` im selben Modul, als Liste (keine Tabelle).
  - Je Befund: Anbieter-ID, Art, Seite, Grund, seit wann.
  - Fremder Text (Gründe, URLs) nur in Code-Spans; Backticks und Zeilenumbrüche werden ersetzt, `@` entschärft.
  - Je Zeile höchstens 200 Zeichen, gesamt unter 60 000.
  - Letzte Zeile ein Marker `<!-- waechter: schluessel:art,… -->`, der nur `^[a-z0-9:,#-]*$` enthält. Der Schlüssel ist die Anbieter-ID, bei Befunden einer Seite `<id>#<die ersten 8 Hex-Zeichen des SHA-256 der Kennung>`. So bekommt auch die zweite ausgefallene Seite eines Anbieters einen Kommentar. Plan 0050 nutzt für Klärfälle `k<hash8>`.
- **Ablauf** in `.github/workflows/nightly.yml`:
  - Der Job `nachtlauf` schreibt `waechter.md` (`pnpm pipeline status --waechter`) und lädt sie als Artefakt `waechter` hoch.
  - Neuer Job `waechter`:
    - `needs: [modus, nachtlauf, veroeffentlichen]`;
    - `if: always() && needs.modus.outputs.modus == 'live' && needs.nachtlauf.result == 'success'`;
    - `permissions: issues: write` und sonst nichts, kein Checkout.

    Schritte: `actions/download-artifact`, dann Shell mit `gh` und `jq`. Dabei immer `--repo "$GITHUB_REPOSITORY"`, `GH_TOKEN` nur in diesem Schritt, Werte über `env`, Text per `--body-file`. Kein `continue-on-error`: Scheitert der Wächter, wird der Lauf rot und fällt auf. Der Job steht nach `veroeffentlichen`, kann den Push also nicht verhindern.
  - Logik:
    - Label `waechter` anlegen (`gh label create … --force`);
    - Issue suchen mit `gh issue list --app github-actions --label waechter --state all`;
    - ohne Befund das offene Issue mit dem Text „Nichts offen (<Datum>)“ schließen;
    - sonst das offene bearbeiten, ein geschlossenes wiedereröffnen oder ein neues anlegen;
    - zusätzlich ein Kommentar, wenn der Marker ein Paar enthält, das im alten fehlte.
- `staleHints` (`scripts/pipeline/lib/discover.ts`) entfällt.
- **Ampel:** `fehler` zählt für die 20-%-Regel nur, wenn der ganze Anbieter scheitert. Eine einzelne Seite im Fehler macht gelb.

### E11 – IDs über die Neuextraktion halten

Vor der Umstellung (S1) wird die Zuordnung in `scripts/pipeline/lib/stable-ids.ts` robuster, nach ADR 0033, Punkt 8. Das ändert ADR 0022, Punkt 3; die Begründung steht im Code und im Commit nach ADR 0004.

- **Stufe 1, gemeinsamer Zeitraum: gestrichen (Nachtrag 1).** S0 hat ihn mit Opus über die volle Umstellung gemessen: 7 Zuordnungen, alle richtig, aber nur in einem von zwei Läufen eine zusätzlich gehaltene ID (+0 bzw. +1 von 347–350). Dieselben Paare trifft Stufe 2 schon heute (gleicher erster Beginn). Nach ADR 0033, Punkt 8 („nur, was die Messung trägt“) bleibt Stufe 1 unverändert. Kommt der Fall der Probe vom 2026-10-26 (kürzere Reihe bei anderem ersten Termin) nach S1 im Bericht vor, folgt ein eigener Nachtrag.
- **Stufe 2, Formatwechsel `kurs` ↔ `regelmaessig`:** wird eingebaut (S0: +2 bzw. +1 gehaltene IDs, keine falsche Übernahme). Zulässig, wenn außerdem
  - der erste künftige Beginn auf die Minute gleich ist,
  - `conflictingLabels` nichts findet
  - und kein anderer Kandidat in Frage kommt.

  Das ist ein Restpunkt aus Plan 0038 (`docs/ideas.md`); ADR 0031 hatte ihn vertagt. `einmalig` bleibt ausgenommen.
- **Messung vor dem Einbau** (S0): Die Umstellung wird offline nachgespielt (alter Stand gegen neue Extraktion je Einheit mit dem gewählten Modell), mit heutiger Zuordnung und mit jeder Erweiterung einzeln.
  - Eingebaut wird eine Erweiterung nur, wenn sie IDs hält und **keine falsche Übernahme** erzeugt (Ziel 0; ein Mensch prüft jede neue Übernahme der Messung).
  - Ziel 6 gilt für die eingebauten Erweiterungen.
  - Verfehlt S0 Ziel 6, nennt es die übrigen Ursachen, und ein Nachtrag vor S1 entscheidet.

### E12 – Abgleich zwischen Einheiten (Nachtrag 1)

S0 zeigte: Je Einheit entstehen deutlich mehr Dubletten als je Anbieter (19–26 % der Angebote statt 12–14 %), weil zwei Seiten dasselbe Angebot verschieden beschreiben. `mergeParts` legt nur Fassungen mit gleichem Format, Alter, erstem Termin und Wochentagen zusammen. Beispiele: PEKiP bei `die-familienbox` einmal als `kurs`, einmal als `regelmaessig`; Abenteuerturnen bei `fbs-nuernberg` als `einmalig` und als `regelmaessig`; die Kursdurchgänge der Beilage bei `hebamme-eva-kauper-wunderwerk` neben der Wochenfassung der Terminseite.

- **Neue reine Funktion** `matchUnits(units, { previous, horizon, freeDays })` in `scripts/pipeline/lib/units.ts`, aufgerufen in `batchesFromRaw` je Anbieter **vor** `mergeParts`. `batchesFromRaw` bekommt dafür den Vorstand (`data/offers.json`), das Eval keinen (dann zählt Schritt 1 der Auswahl für alle gleich).
- **Nicht beteiligt** ist die Einheit `kandidaten`: Ihre Dubletten mit eigenen Seiten regelt der Build wie heute nach Rang (Anbieterseite vor Sammelkalender). Einheiten im Fehler nehmen nur als Verlierer teil; ihre Fassung verdrängt nie die einer Einheit mit `ok`.
- **Zwillinge:** zwei Events aus **verschiedenen** Einheiten desselben Anbieters mit
  - gleichem Ort,
  - gleichem Kerntitel (`sameCoreTitle`) ohne widersprechende Kennungen (`conflictingLabels`),
  - verträglichem Alter (`compatibleAge`),
  - und mindestens 80 % der künftigen Beginnzeiten des kleineren im größeren. „Künftig“ heißt hier für alle Formate: Termine ab `horizon.from` aus `expandSchedule(schedule, { to: expansionWindow(e, horizon.to), freeDays, from: horizon.from })`, also anders als `mergeParts` auch bei Kursen nur künftige,
  - **und** verschiedenem Format, Alter oder Terminart (`schedule.kind`). Gleich gebaute Fassungen bleiben `mergeParts` überlassen, das ihre Termine vereinigt statt eine zu verwerfen.
- **Ablauf:** Die Einheiten werden in der Reihenfolge von E6 durchlaufen, ihre Events in Antwortreihenfolge. Jedes Event wird mit den bisher **behaltenen** Events früherer Einheiten verglichen; das erste passende ist sein Zwilling. Verliert das neue, entfällt es. Gewinnt es, entfällt der Zwilling und das neue tritt an seine Stelle; ein verworfenes Event ist danach für niemanden mehr Zwilling.
- **Welche bleibt:** die Fassung mit dem höheren Wert
  `passung(e) = Anteil der künftigen Termine von e, die in irgendeinem Angebot des Vorstands stehen (gleicher Anbieter und Ort, similarTitle zu e; Beginn auf die Millisekunde) + 0,5, wenn eines dieser Angebote das Format von e hat`;
  bei gleichem Wert die mit mehr künftigen Terminen; dann die frühere (behaltene).

  Ohne Vorrang des Vorstands verlor S0 bei `theater-mummpitz` 13 IDs: Die Konzerte stehen dort als einzelne Termine (`einmalig`), eine Seite fasste sie als `regelmaessig` zusammen.
- Jede Entscheidung wird ein Hinweis im Bericht („„…“ entfällt, gleich „…“ aus Einheit k“). In S0 waren es 31–43 je Lauf; eine Stichprobe von gut 30 (alle bei `die-familienbox`, `fbs-nuernberg`, `hebamme-eva-kauper-wunderwerk`, `theater-mummpitz`, `ev-*`) ist von Hand geprüft, alle sind echte Zwillinge. Nicht alle Entscheidungen sind geprüft; S1 prüft die Hinweise des Trockenlaufs ganz.
- Konstante `SAME_UNIT_SESSIONS = 0.8` mit Begründung im Code (ADR 0004).

## Dateien

| Datei | Änderung | Schritt |
|---|---|---|
| `scripts/pipeline/lib/units.ts` (neu) | Einheiten, Kennung, Beilagen, `unitExcerpt`, `matchUnits` (E12) | S1 |
| `scripts/pipeline/lib/normalize.ts`, `scripts/pipeline/lib/extract.ts`, `scripts/pipeline/io/extract.ts` | Schlüssel und Nachricht mit `unitExcerpt`; `CallRecord.unit`; Eingabe je Einheit | S1 |
| `scripts/pipeline/lib/fetch.ts`, `scripts/pipeline/io/fetch-inputs.ts` | `assembleUnit`, Einheiten im Abruf, Bericht je Einheit | S1 |
| `scripts/pipeline/lib/raw.ts`, `schema/provider-raw.schema.json` | V2, `providerStatus`, Übergangsschema | S1, S5 |
| `scripts/pipeline/lib/refresh.ts`, `scripts/pipeline/io/refresh.ts` | Regeln je Einheit, Einbruch 1 → 0, Fehlerklasse, entfernte Seite, `emptySince`, `mayContinue`, Umstellung | S1 |
| `scripts/pipeline/lib/build-offers.ts` | `mergeParts` je Anbieter, Batch je Einheit, Status aus `providerStatus` | S1 |
| `scripts/pipeline/lib/stable-ids.ts` | E11 | S1 |
| `scripts/pipeline/io/nightly.ts`, `scripts/pipeline/lib/report.ts`, `scripts/pipeline/lib/cost.ts` | Ablauf, Bericht und Ampel je Einheit; `--umstellen`; Grenzen | S1, S4 |
| `scripts/pipeline/io/eval.ts` | Fälle in Einheiten zerlegen (nach `## Seite k:` und Katalog), je Einheit extrahieren, mit `mergeParts` vereinigen, werten wie heute | S1 |
| `scripts/pipeline/io/discover.ts`, `scripts/pipeline/lib/discover.ts` | Ertragsbeweis je Einheit (V2); `staleHints` entfällt | S1, S2 |
| `scripts/pipeline/io/files.ts` | V1 und V2 lesen und schreiben | S1 |
| `scripts/pipeline/cli.ts` | `nightly --umstellen`, `--abruf`, Modus `messen`; `status --waechter`; `extract --from` je Einheit | S1–S3 |
| `scripts/validate-data.ts` | V1 und V2, Events je Einheit dem Anbieter zugehörig, Kennungen je Anbieter eindeutig | S1 |
| `.github/workflows/nightly.yml`, `scripts/lib/nightly-workflow.test.ts` (neu) | Eingaben `timeout`, `umstellen`, `abruf`, `LLM_MODEL_EXTRACT`; Artefakt und Job `waechter`; Test der Rechte und Eingaben | S1, S2, S3 |
| `scripts/pipeline/lib/watch.ts` (neu) | `watchFindings`, `watchIssue` | S2 |
| `scripts/pipeline/lib/robots.ts`, `scripts/pipeline/io/robots.ts` (neu) | robots.txt parsen und prüfen, Cache je Host | S3 |
| `scripts/pipeline/io/http.ts`, `scripts/pipeline/io/browser.ts`, `scripts/pipeline/io/sources.ts`, `scripts/pipeline/io/geocode.ts` | User-Agent; robots.txt bei Seitenabrufen; Ausnahmen der APIs | S3 |
| `scripts/lib/share-pages.ts`, `scripts/lib/share-pages.test.ts` | Absatz im Impressum | S3 |
| `docs/architecture.md`, `CLAUDE.md` („Daten“), Skill (Abschnitte 1, 3, 5), Statuszeilen von ADR 0022, 0026 und 0031 | Doku | S1–S5 |

## Tests (test-first)

- `lib/units.test.ts`:
  - Kennung aus der Vorlage, nicht der ausgefüllten URL, und mit Body-Hash bei `request`;
  - Beilagen in jeder Einheit;
  - `blocked` und `use: info` ausgenommen;
  - `coveredBy` nur `kandidaten`;
  - Reihenfolge;
  - `unitExcerpt` nennt alle Seiten, `hint` nur die der Einheit; eine geänderte `hint` einer anderen Seite ändert ihn nicht, eine neue Seite schon;
  - `matchUnits` (E12): PEKiP `kurs`/`regelmaessig` aus zwei Einheiten → eines; **1:n** wie `theater-mummpitz` (eine `regelmaessig`-Zusammenfassung mit 7 Terminen gegen eine `einmalig`-Fassung mit denselben 7 Terminen, Vorstand 7 einzelne `einmalig`-Angebote) → die `einmalig`-Fassung bleibt, auch wenn die Zusammenfassung aus der früheren Einheit kommt; `kandidaten` nimmt nicht teil; Einheit im Fehler verliert immer; Vorrang der Fassung mit dem Format des Vorstands (`einmalig`-Konzerte gegen `regelmaessig`-Zusammenfassung); ohne Vorstand die mit mehr Terminen; gleich gebaute Fassungen bleiben für `mergeParts`; Parallelgruppen mit anderem Alter (`compatibleAge` falsch) und „Gruppe A/B“ bleiben beide; Zwillinge aus derselben Einheit bleiben.
- `lib/extract.test.ts`: Die Nachricht enthält `unitExcerpt`, nicht `catalogExcerpt`. Schlüssel und Nachricht nutzen denselben Auszug.
- `lib/normalize.test.ts`: Schlüssel je Einheit; Kandidaten nur in `kandidaten`.
- `lib/fetch.test.ts`:
  - `assembleUnit` mit gescheiterter Beilage → `fehler`;
  - `failureClass` für 404, 410, 500, Zeitüberschreitung, TLS, Bot-Schutz und robots.txt.
- `lib/raw.test.ts`:
  - V2-Regeln je Einheit, darunter `klasse` mit `klasseSince`;
  - `providerStatus` für alle, keine und einige Einheiten im Fehler;
  - V1 bleibt gültig bis S5.
- `lib/refresh.test.ts`:
  - jede heutige Regel je Einheit;
  - Einbruch 1 → 0 hält zurück;
  - neue Einheit ohne Einbruchprüfung, außer gegen verwaiste Einheiten: Soft-404 nach URL-Wechsel → `pending`, die verwaisten bleiben;
  - `kandidaten` ohne Kandidaten → leere Eingabe mit Einbruchschutz;
  - Klassenwechsel setzt `klasseSince` neu: 10 Tage HTTP 500, dann 404, an Tag 14 nicht entfernt;
  - 14 Tage 404 → entfernt, Schlüssel gelöscht;
  - **Rückkehr mit gleichem Inhalt → extrahiert, nicht „unverändert“**;
  - gescheiterte Beilage → Einheit extrahiert ohne sie, `beilagen` hält den Fehler, nie „entfernt“;
  - `emptySince`:
    - gesetzt bei „unverändert“, wenn die Kurse ablaufen;
    - gesetzt nach übernommenem Einbruch auf `[]`;
    - gesetzt bei wöchentlicher Regel mit abgelaufenem `until`;
    - nicht gesetzt bei einer Einheit, die nie Events hatte;
    - gelöscht bei neuen künftigen Terminen.
- `io/refresh.test.ts`:
  - Abbruch über `mayContinue` nach zwei von drei Einheiten → zwei neue, eine alte, Datei gültig;
  - geänderte URL → alte Einheit bleibt, bis die neue `inputHash` hat;
  - Umstellung: alle gelungen → V2; eine gescheitert → V1 unverändert; Einbruch → V1 unverändert mit Bericht; `--umstellen` → V2, auch mit dauerhaft scheiternder Seite.
- `lib/build-offers.test.ts`:
  - **dasselbe regelmäßige Angebot aus zwei Einheiten mit anderem `cost` → kein Build-Fehler, ein Angebot;**
  - dasselbe Angebot aus einer Einheit im Fehler und einer mit `ok` → es bleibt die Fassung der Einheit mit `ok`;
  - Batch je Einheit mit eigenem `checkedAt`;
  - Reihenfolge mit 11 Einheiten (`#02` vor `#10`);
  - Anbieter mit einer Einheit im Fehler → deren alte Events bleiben, neue der anderen kommen, keine ID fehlt;
  - Schritt 7 unverändert.
- `lib/stable-ids.test.ts` (E11):
  - `kurs` → `regelmaessig` mit gleichem ersten Beginn → ID bleibt (Fälle aus S0: „Babymassage (montags)“ 53 → 38 Termine, „Eltern-Kind-Tanz samstags“);
  - mit Konkurrenten → neue ID;
  - `conflictingLabels` → neue ID.
- `io/nightly.test.ts` mit Fake-Abruf über mehrere Nächte (Ziel 1):
  - Nacht 1: Seite B fällt aus (404), Seite A bringt einen neuen Kurs → er erscheint, alle IDs von B bleiben;
  - Nacht 2: gleich → unverändert, kein Modellaufruf;
  - **Rückkehr von B vor Tag 14** → IDs von B bleiben;
  - **zweiter Fall: B bis Tag 15** → Bs Angebote fehlen; Rückkehr danach → neue IDs (die Zuordnung kennt nur die Vornacht).
- `io/eval.test.ts`: Fall mit zwei Seiten und Beilage wird in Einheiten zerlegt, mit `matchUnits` (ohne Vorstand) und `mergeParts` vereinigt und gewertet.
- `lib/extract.test.ts`, zusätzlich: Einheit `kandidaten` besteht den Build-Probelauf mit vollem Eintrag; Auszug der Einheit `kandidaten` ohne `hint`; Teilzeile nennt „dieser Seite“.
- `lib/watch.test.ts` (S2):
  - `seite` erst ab dem zweiten Kalendertag, auch bei Bot-Schutz;
  - `gesperrt` sofort;
  - `entfernt`;
  - `einbruch`;
  - `leer` nur, wenn keine Einheit künftige Events hat, 14 Tage;
  - `anbieter` statt je Seite;
  - `umstellung` je V1-Datei;
  - gescheiterte Beilage ab dem zweiten Tag;
  - Marker mit `id#hash8`: Fällt eine zweite Seite desselben Anbieters aus, entsteht ein neues Paar;
  - Tage nach Europe/Berlin;
  - Text nur in Code-Spans, ohne Backticks, Zeilenumbrüche und `@`;
  - Marker geprüft;
  - Längen;
  - leere Befunde → leerer Text;
  - der Durchlauf über mehrere Nächte aus `io/nightly.test.ts` erzeugt die erwarteten Befunde.
- `scripts/lib/nightly-workflow.test.ts` (Muster `scripts/lib/push-schedule.test.ts`):
  - `waechter` hat genau `issues: write`, keinen Checkout, `always()`, `--repo`, `--body-file`, `--app github-actions`;
  - `waechter` hat kein `continue-on-error`;
  - `nachtlauf` hat kein Schreibrecht;
  - `timeout-minutes` ist `fromJSON(inputs.timeout || '90')`, also auch beim Zeitplan gültig;
  - `umstellen` und `abruf` werden weitergegeben.
- `lib/robots.test.ts` (S3):
  - eigene Gruppe ersetzt `*`, gleiche Gruppen zusammengeführt;
  - längste Regel, Gleichstand `Allow`;
  - `*` und `$`;
  - leere Datei;
  - 4xx erlaubt, 5xx/429 sperrt;
  - Pfad mit Query und Prozent-Kodierung.
- `io/robots.test.ts`, `io/http.test.ts` (S3):
  - User-Agent gesetzt;
  - robots.txt je Weiterleitung geprüft und selbst weitergeleitet;
  - gesperrt → „robots.txt sperrt“, `klasse: gesperrt`;
  - robots.txt nicht erreichbar → `klasse: voruebergehend`;
  - Nominatim und OpenHolidays ohne robots-Prüfung;
  - Browser: Kette über `http.ts` vorab geprüft, `goto(finalUrl)`, abweichende `page.url()` → Fehler.
- `scripts/lib/share-pages.test.ts` (S3): Absatz zum Abruf im Impressum.

## Schritte

Jeder Schritt mit `pnpm verify` und `pnpm e2e:local --affected` (Daten und Schema zusätzlich mit `--smoke`), jeder mit `/arch-review`; S3 wegen des Impressums mit `/browser-review`.

- **S0 – Messen (ohne Änderung im Repo, Wegwerf-Skripte im Job-Verzeichnis).**
  1. **Einheit gegen Anbieter** mit dem gewählten Modell, je zwei Läufe:
     - Für alle Anbieter mit mehr als einer **Einheit** auf `main` werden die Eingaben eines Abrufs (`pnpm pipeline fetch`) zweimal extrahiert: je Anbieter wie heute und je Einheit nach E1, mit `unitExcerpt` und `mergeParts` nach E6. Dazu gehören auch Anbieter mit einer Seite und Kandidaten aus Sammelkalendern; 28 Rohdateien haben `sources`, etwa `stadtbibliothek-nuernberg`. Bei ihnen sieht das Modell Seite und Kandidaten künftig getrennt, und `sternenhaus-kuf` zeigt, dass dabei Dubletten mit anderem Titel entstehen können.
     - Beide Varianten laufen durch `buildOffers` gegen `data/offers.json`.
     - Verglichen werden je Anbieter: Angebote, Vorstand-IDs wiedergefunden, Dubletten, Build-Fehler, Aufrufe, Tokens, Dauer.
     - Verfehlt ein Anbieter Ziel 2, wird die Ursache benannt (fehlender Kontext einer anderen Seite, Dublette mit anderem Titel), und ein Nachtrag regelt sie vor S1.
  2. **IDs** (E11, Ziel 6): dieselben Läufe mit heutiger Zuordnung und mit jeder Erweiterung einzeln (Prototyp im Skript). Gezählt werden gehaltene IDs und falsche Übernahmen; jede neue Übernahme prüft ein Mensch.
  3. **Laufzeit:** Aufrufe und Minuten einer vollen Umstellung, daraus `timeout`, `budget_min` und die Bremsen für E7.
  4. Ergebnis in den Abschnitt „Umsetzung“.
- **S1 – Einheit Seite, IDs, Umstellung (E1–E7, E9, E11).**
  - Code mit Tests, dazu das Eval je Einheit.
  - Vor dem Merge nach `main`:
    - ein Eval-Lauf je Einheit mit dem gewählten Modell gegen die letzte Zeile in `evals/results.md` (Ziel 2);
    - ein Trockenlauf per `workflow_dispatch` von `nightly.yml` auf dem Branch (`modus=trocken`, Grenzen aus S0), also mit der IP des Runners und der gepinnten CLI. Verglichen wird `offers.json` aus dessen Artefakt mit `main` (Angebote je Anbieter, Ziel 6).
  - Dann Deploy mit gesetztem Modell und die Umstellung per `workflow_dispatch` mit den Grenzen aus S0.
  - Abnahme: Ziele 5 und 6 nach höchstens drei Nächten; Ziel 1 im Test und in der Woche danach.
- **S2 – Wächter (E10).** Abnahme: Das Issue entsteht live bei einem echten Befund, sonst über eine noch nicht umgestellte Datei oder eine vorübergehend gestellte Lage. Es schließt sich, wenn nichts offen ist.
- **S3 – Ein Abruf (E8).**
  - robots.txt, User-Agent, Fehlerklasse, Impressum, Schalter `--abruf` (Standard `alt`).
  - **Messung im Runner** (die IP zählt für den Bot-Schutz): ein `workflow_dispatch` mit dem neuen Modus `messen`. Er ruft nur ab, ohne Modell und ohne Schreiben, und zwar alle Katalogseiten und Sammelkalender im selben Lauf einmal mit altem und einmal mit neuem Abruf. Gesucht sind gesperrte Seiten, Seiten, die mit dem neuen User-Agent anders antworten (Status, Länge ±20 %), und Bot-Schutz. Ergebnis in „Umsetzung“, dann N1.
  - Wegen `share-pages.ts` zusätzlich `pnpm e2e:local --affected --smoke`.
  - Danach Standard `neu`; Schalter und Browser-UA entfallen. Nach dem Deploy `/browser-review live` der Impressumsseite.
- **S4 – Grenzen (E9)** nach sieben Nächten im neuen Format.
- **S5 – Abschluss.**
  - Sind alle Rohdateien V2, entfallen V1-Schema und Umstellungscode.
  - Eine Woche Bericht mit den Zielen 1, 3, 5 und 6.
  - ID-Wechsel von Nacht zu Nacht neu messen (Nicht-Ziele).
  - Live-Prüfung (CI grün, `meta.json`).
  - Restpunkte nach `docs/ideas.md`; Statuszeilen von ADR 0026 und ADR 0031; Plan archivieren.

## Nutzerentscheide (offen)

- **N1 – Seiten, die robots.txt sperrt oder die den neuen User-Agent abweisen** (nach der Messung in S3). Empfehlung: robots.txt achten. Eine gesperrte Seite bekommt `blocked` mit Grund, und der Anbieter wird über den Seitenfinder (Plan 0049) oder von Hand anders erschlossen. Alternative: eine Ausnahme je Seite im Katalog mit Begründung. Zu entscheiden nur, wenn die Messung Seiten findet.
- **N2 – Entfernte Seite nach 14 Tagen** (ADR 0033, Punkt 3). Empfehlung: ja, wie im ADR. Alternative: Bestand bleibt unbegrenzt wie heute, und nur der Wächter meldet.
- **N3 – `sternenhaus-kuf` mit Opus: entschieden am 2026-10-26** (Nutzer: Empfehlung angenommen). Haiku hatte 54 `einmalig`-Events (97 Angebote) mit dem Katalogalter 24–36 Monate übernommen; die Kalender-API nennt kein Alter. Das Familienprogramm 2026 (`nuernberg.de/…/2026_sternenhaus_familienprogramm.pdf`) weist je Stück ein Alter aus: nur „WiWaWaldtraum“ (Purzeltraumtheater) und „Schneeflocken, wippediwapp“ (Lucia Ruf) sind 2+, alle übrigen 3+ bis 8+ (auch „Baby Dronte“, laut Theater Mummpitz 4+). Umgesetzt im Katalog: `hint` der API-Seite nennt genau diese zwei Stücke, `verified` 2026-10-26, Notiz zur jährlichen Pflege. Trockenlauf mit Haiku (zweiter Versuch Sonnet) und mit Opus: je genau diese zwei Stücke; der Einbruchschutz hält das eine Nacht als `pending` und übernimmt es in der zweiten. Damit braucht die Umstellung für diesen Anbieter kein `--umstellen`.

## Kosten

Nach Nutzervorgabe kein Kriterium. Die Umstellung extrahiert einmal alles neu, zusammen mit dem Modellwechsel. Danach extrahiert eine Nacht nur Einheiten mit geänderter Seite statt ganzer Anbieter. Mehr Aufrufe kosten kleine Einheiten mit festem Anteil an Prompt und Auszug, die heute zusammen in einem Aufruf liefen. S0 misst die Bilanz.

## Risiken

- **Fehlender Kontext zwischen Seiten:** Eine Seite nennt den Kurs, eine andere Zeit oder Ort. Abhilfe:
  - Beilage für `use: verfuegbarkeit`;
  - S0 misst je Anbieter;
  - ein Nachtrag vor S1 regelt gefundene Fälle;
  - Venues und Hinweise der Seite stehen im Auszug.
- **Dubletten zwischen Seiten mit verschiedenen Titeln** (Übersicht und Detailseite). Abhilfe: `mergeParts` je Anbieter (E6), danach `dropSameSourceDuplicates`; S0 misst.
- **Bruch der IDs bei der Umstellung.** Abhilfe:
  - eine Neuextraktion für Modell und Einheit;
  - E11 vorher;
  - Ziel 6 offline gemessen, bevor umgestellt wird.
- **Umstellung bleibt hängen** (ein Anbieter mit dauerhaft scheiternder Einheit). Abhilfe: Wächter (`umstellung`), Eingabe `umstellen` nach Prüfung. S5 wartet, bis alle umgestellt sind.
- **Rückweg nötig.** Abhilfe: Revert von Code und Daten-Commits (E4), im Skill beschrieben.
- **robots.txt kostet Seiten.** Abhilfe: Messung im Runner vor dem Einschalten, N1, Schalter.
- **Entfernte Seite war nur lange kaputt.** Abhilfe: 14 Tage Meldung vorher; die Rückkehr extrahiert neu. Die Zuordnung vergleicht nur mit der Vornacht. Kehrt eine Seite nach Tag 14 zurück, bekommen ihre Angebote deshalb neue IDs, und alte Links laufen ins Leere. Das ist bewusst so: Ein Link ins Leere ist besser als einer auf einen Kurs, der nicht mehr gilt. N2 lässt den Nutzer anders entscheiden.
- **Issue als Angriffsfläche.** Abhilfe: eigener Job mit nur `issues: write`, kein Checkout, Text als Datei, fremder Text nur in Code-Spans, geprüfter Marker.

## Umsetzung

### Modellwahl (2026-10-26)

Eval nach Skill, Abschnitt 5, je zwei Läufe, Modell allein, Prompt-Hash `7b31b918b80b` (Zeilen in `evals/results.md`):

| Modell | Termine R | Termine P | Angebote R | Angebote P | format | Dauer |
|---|---|---|---|---|---|---|
| Opus | 100 / 100 % | 75 / 75 % | 100 / 100 % | 74 / 74 % | 100 / 94 % | 496 / 523 s |
| Sonnet | 97 / 99 % | 95 / 70 % | 96 / 98 % | 83 / 74 % | 87 / 89 % | 289 / 342 s |
| Haiku (12.10.) | 99 / 89 % | 95 / 86 % | 96 / 91 % | 85 / 92 % | 94 / 94 % | 565 / 579 s |

- **Gewählt: Opus** nach ADR 0033, Punkt 7 (Recall vor Precision): als einziges Modell 100 % in beiden Läufen und die besten Feldwerte.
- **Befund zur Präzision:** Die schwächere Präzision stammt fast nur aus zwei Fallen, in denen jedes Modell Termine erfindet, die die Seite nicht nennt.
  - `nuebad-flipper`: Opus schreibt Schwimmkurse ab dem ersten Termin ohne Ende fort (139 falsche Termine, in beiden Läufen), Sonnet in einem von zwei Läufen (168).
  - `sv-johannis-07`: Opus macht Blockkurse ohne Startdatum zu regelmäßigen Angeboten (27), Sonnet rät den 4. Januar als Start (8).

  Das betrifft den Prompt, nicht die Wahl; siehe „Restpunkte“.

### S0 – Messung (2026-10-26)

Wegwerf-Skripte unter `runs/s0-0048/` (gitignored): `s0.ts` (Abruf, Einheiten nach E1, Extraktion je Anbieter = P, je Einheit = U, je Einheit mit allen Seiten im Auszug = V), `score.ts` (Build mit `buildOffers` gegen `data/offers.json` vom 2026-10-26, Prototyp von E11 und E12 in `runs/s0-0048/proto/`), `compare.ts`. Ein Abruf am 2026-10-26 nachmittags, alle Seiten ok. Modell Opus, je Variante zwei Läufe.

**1. Einheit gegen Anbieter** (42 Anbieter mit mehr als einer Einheit, 167 Einheiten; verglichen auf den 41, die in allen Läufen vollständig sind; 365 künftige Angebote im Vorstand):

| Variante | Vorstand wiedergefunden | Angebote | Dubletten | Aufrufe | Modell-Minuten |
|---|---|---|---|---|---|
| P (je Anbieter) | 260 / 260 | 322 / 325 | 11,8 / 13,8 % | 96 | 38 / 40 |
| U (je Einheit, Auszug nur eigene Seiten) | 260 / 258 | 315 / 314 | 19,4 / 22,3 % | 199 | 48 |
| U + E12 + Formatwechsel | 260 / 258 | 301 / 297 | 11,6 / 6,7 % | 199 | 48 |
| V (je Einheit, Auszug alle Seiten) | 264 / 260 | 344 / 330 | 25,6 / 19,4 % | 199 | 49 |
| **V + E12 + Formatwechsel** | **264 / 260** | **321 / 310** | **8,4 / 6,1 %** | 199 | 49 |

- „Wiedergefunden“ heißt derselbe Kurs nach Ziel 6. Von den 105 nicht wiedergefundenen sind 97 `sternenhaus-kuf` (N3); ohne ihn findet V 264 bzw. 260 von 268 (97–99 %), P 260 von 268 (97 %).
- „Dubletten“: Angebote desselben Anbieters am selben Ort mit gemeinsamem Beginn und ähnlichem Titel; das zählt auch Parallelgruppen zur selben Zeit mit, deshalb hat schon P 12–14 %.
- **Ziel 2 mit V + E12 + Formatwechsel erfüllt bis auf einen Anbieter:** Recall mindestens wie P, weniger Dubletten, kein Build-Fehler. Weniger als 90 % der Angebote von P haben zwei Anbieter:
  - `mutherstudio` (V 8/6 gegen P 11/7): schwankt schon zwischen den beiden P-Läufen, Vorstand vollständig wiedergefunden.
  - `geburtshaus-nuernberger-nest` (V 6/6 gegen P 8/8): Zwei Kurse 2027 aus dem zweiten Teil der hebamio-Liste (`bauersachs.hebamio.de/kursliste`, 32 000 Zeichen, zwei Teile) fehlen in beiden V-Läufen, in U und P sind sie da. Ursache nicht geklärt, Vermutung: die Teilzeile „Die Eingabe dieses Anbieters ist auf N Aufrufe verteilt … die übrigen kommen aus den anderen Teilen“ zusammen mit der Seitenliste (E3, Teilzeile). Damit ist die vierte Bedingung von Ziel 2 hier **nicht** erfüllt. Abnahme in S1: Die Seite wird ein Eval-Fall (`pnpm eval freeze geburtshaus-nuernberger-nest --kind html`), und das Eval je Einheit findet beide Kurse in 2 von 2 Läufen. Sonst folgt vor dem Merge ein Nachtrag.
- **Kontext zwischen Seiten:** U verlor bei `studio-herzschlag` 12 von 43 Angeboten. Die Übersichtsseite markiert Kurse externer Kursleitungen mit „*“; ohne die übrigen Seiten im Auszug ließ das Modell sie weg. V behebt das (E3, Nachtrag 1).
- **Streuung:** Zwei Läufe derselben Variante unterscheiden sich stärker als die Varianten, etwa `theater-mummpitz` 13 gegen 2 Angebote in P oder 96 gegen 87 % gehaltene IDs zwischen P1 und P2. Der Einbruchschutz (E5) und der Wächter bleiben deshalb wichtig.

**2. IDs** (Ziel 6), volle Umstellung = U über alle 77 Anbieter mit Eingabe, 458 künftige Angebote im Vorstand, davon 347–350 als derselbe Kurs wiedergefunden:

| Zuordnung | gehalten | echt verloren | falsche Übernahmen |
|---|---|---|---|
| heute | 96,6 / 96,8 % | 12 / 11 | 0 |
| + gemeinsamer Zeitraum | +0 / +1 ID | | 0 (7 Zuordnungen geprüft) |
| + Formatwechsel | +2 / +1 ID | | 0 (2 Zuordnungen geprüft) |
| + E12 + Formatwechsel | 97,4 / 97,4 % | 9 / 9 | 0 |

- „Gehalten“ zählt auch den Fall, dass zwei Fassungen eines Kurses im Vorstand (Zwillinge) zu einem Angebot zusammenfallen und dieses die ID eines der beiden trägt.
- Alle Übernahmen außerhalb des Kriteriums „derselbe Kurs“ (2 bzw. 5) sind von Hand geprüft: dieselbe Gruppe zur selben Zeit unter anderem Titel („Miniclub Freitag 9:00 Uhr (0–3 Jahre)“ → „Miniclub freitags vormittags“).
- Echt verloren bleiben vor allem `einmalig` → `regelmaessig` (`neues-museum-baby-museum`, bewusst ausgeschlossen) und ein anderer Jahrgang unter ähnlichem Titel (BRK-PEKiP, zu Recht neu).
- Ergebnis: Ziel 6 ist schon mit der heutigen Zuordnung erfüllt. Eingebaut wird der Formatwechsel; der gemeinsame Zeitraum entfällt (E11).
- Gemessen ist die volle Umstellung mit U. Gewählt ist V; V lief nur über die 42 Anbieter mit mehreren Einheiten (bei einer Einheit sind U und V bis auf die Liste der übrigen Seiten gleich). Dort hält V + E12 + Formatwechsel 97,0 bzw. 95,4 % der IDs, U + E12 + Formatwechsel 96,5 bzw. 96,5 %; beides ohne falsche Übernahme (V: 0 bzw. 1 Übernahme außerhalb des Kriteriums, dieselbe Gruppe).

**3. Laufzeit der vollen Umstellung** (U über alle Anbieter, zwei Läufe gleich): 237 Aufrufe, 4,1 Mio. Tokens Eingabe samt Cache und 0,42 Mio. Ausgabe, 71 Minuten Modellzeit; mit 3 Anbietern parallel und den Einheiten eines Anbieters nacheinander (E5) etwa 24 Minuten. Längster Anbieter `fbs-nuernberg` mit 12,7 Minuten, längster Aufruf 6,2 Minuten. Grenzen daraus in E7. Je Anbieter (P) wären es 97 Aufrufe und 15 Minuten.

**Weitere Befunde aus S0:**
- **Einheit `kandidaten`** scheiterte im Build-Probelauf am gekürzten Auszug (E3, Nachtrag 1).
- **Zeichensatz:** Die Kalender-API von `nuernberg.de` (`sternenhaus-kuf`) meldet `charset=ISO-8859-1`, liefert aber UTF-8; `charsetOf` in `scripts/pipeline/io/http.ts` folgt dem Header, der Text enthält „ErzÃ¤hlt“. Behoben als Kleinänderung `72c42d6` (2026-10-26).

### Restpunkte (kommen bei S5 nach `docs/ideas.md`)

- **Erfundene Folgetermine** (Fallen `nuebad-flipper`, `sv-johannis-07`): Der Prompt verbietet geratene Werte, Opus schreibt Kurse trotzdem fort, wenn nur der erste Termin oder nur Wochentag und Uhrzeit bekannt sind. Eine Prompt-Änderung braucht eigene Eval-Läufe (Skill, Abschnitt 5); nach der Umstellung messen, ob es live vorkommt.

### Nachtrag 1 (2026-10-26, nach S0)

Ändert E3 (Auszug mit allen Seiten, Probelauf gegen den vollen Eintrag), E6 und neu E12 (Abgleich zwischen Einheiten), E11 (nur Formatwechsel), E7 (Grenzen) und die Voraussetzung „Modell“ (Opus, Fallback Opus). Neu ist N3. ADR 0033 hat dazu einen eigenen „Nachtrag 1“ (Punkte 2 und 8, Abgrenzung zu ADR 0031, Punkt 1). Review 3 unten.

### Nachtrag 2 (2026-10-27): Effort

**Anlass:** Der Nutzer will zur Modellwahl auch einen passenden Effort (2026-10-27). Die Wahl in „Modellwahl“ lief ohne `--effort`, also mit dem Standard der CLI.

**Befund:** Ohne `--effort` liest die CLI lokal `effortLevel` aus `~/.claude/settings.json`, denn bei lokaler Anmeldung behält `io/llm.ts` das echte `HOME`. Auf diesem Rechner stand dort für Opus 5.5 `medium`, für Haiku 5.5 `xhigh` und sonst `high`. Im Runner mit leerem `HOME` gilt der Modellstandard; laut Doku der CLI (`code.claude.com/docs/en/model-config`) ist das `medium` für Opus, Sonnet und Haiku 5.5. Die Opus-Zeilen der Modellwahl liefen also mit `medium` wie der Runner; die Haiku-Zeilen vom 12.10. liefen lokal mit `xhigh`, der Nachtlauf mit `medium`. `CLAUDE_CODE_EFFORT_LEVEL` hätte Vorrang vor dem Flag, wird aber von `llmEnv` nicht durchgereicht. Die gepinnte CLI 2.1.296 kennt `--effort` mit denselben Stufen.

**Verdrahtung** (`ccfa40b`): `LlmCall.effort` wird `--effort`; `LLM_EFFORT_EXTRACT` gilt für Haupt- und Fallback-Modell, leer heißt Standard der CLI, ein ungültiger Wert bricht ab. Im Cache-Schlüssel wird der Modellteil zu `modell/effort`; ohne Effort bleibt er, wie er war, damit vor der Umstellung nichts neu extrahiert wird. `pnpm eval --effort E` schreibt das Etikett `opus (Effort E)`.

**Messung:** `pnpm eval --model opus --fallback opus --effort E`, je Stufe zwei Läufe, 12 Fälle, Prompt-Hash `7b31b918b80b` (Zeilen in `evals/results.md`):

| Effort | Termine R | Termine P | Angebote R | Modellzeit | längster Aufruf |
|---|---|---|---|---|---|
| low | 96 / 95 % | 76 / 76 % | 96 / 96 % | 335 / 350 s | 67 s |
| medium | 100 / 100 % | 75 / 75 % | 98 / 100 % | 479 / 455 s | 78 s |
| high | 98 / 100 % | 77 / 75 % | 98 / 100 % | 506 / 530 s | 88 s |
| xhigh | 100 / 100 % | 75 / 77 % | 100 / 100 % | 795 / 777 s | 130 s |
| max | 100 / 44 % | 75 / 59 % | 100 / 54 % | 3 837 / 3 699 s | 900 s |

- `max` scheitert: Im zweiten Lauf erreicht `die-familienbox` das Zeitlimit je Aufruf (15 Minuten, `TIMEOUT_MS`), und die Laufzeit ist achtmal so hoch.
- `low` verliert Recall (`ev-langwasser-miniclubs` 85 bzw. 63 %, `ev-st-andreas-thon` 92 %).
- `medium` und `xhigh` haben gleichen Termin-Recall; `xhigh` ist in keinem Lauf schlechter und hat bei den Angeboten 100/100 %. Die Präzision bleibt bei allen Stufen bei rund 75 %, sie hängt an den Fallen (`nuebad-flipper`, `sv-johannis-07`, Restpunkt).

**Entscheidung: `xhigh`** nach ADR 0033, Punkt 7 (Recall zuerst, Kosten kein Kriterium). Die längere Laufzeit trägt das Budget: Der längste Aufruf aus S0 (6,2 Minuten mit `medium`) käme auf etwa 10,5 Minuten und bliebe unter dem Zeitlimit je Aufruf; die Grenzen der Umstellung (E7) sind angehoben. Das Eval je Einheit in S1 und der Trockenlauf laufen mit `xhigh`.

**Folgen:** `LLM_MODEL_EXTRACT=opus`, `LLM_MODEL_FALLBACK=opus`, `LLM_EFFORT_EXTRACT=xhigh` in `nightly.yml` und `discover.yml`, festgehalten in `scripts/lib/nightly-workflow.test.ts`. Der Skill (Abschnitt 5) verlangt künftig bei jeder Eval die Angabe des Effort.

### S1 – Umsetzung (2026-10-27, Branch `nachtlauf-s1`)

Commits: `ccfa40b` (Effort, Nachtrag 2), `ad02ff2` (E11), `7a4e757` (`lib/units.ts`), `939401d` (Kern: E1, E2, E4–E7, E9), `2acd9cc` (Eval je Einheit), `6932e9b` (Workflow, eindeutige Seiten), `1346a9a` (Eval-Fall `geburtshaus-nuernberger-nest`), `84f8533` (Doku), `55f657f` (Nacharbeit Arch-Review).

Abweichungen vom Plan, jede mit Test:

- **E2, `assembleUnit`:** Es gibt keine eigene Funktion. `unitInputs` (`scripts/pipeline/io/fetch-inputs.ts`) ruft `assembleProvider` je Einheit mit deren Seiten auf; die Logik ist dieselbe. `hashes.json` und `report.md` des Abrufs bleiben je Anbieter: Sie sind Messbericht und Eingabe der Probe `pipeline extract --from`. Ebenso behält `FetchedProvider` die Gesamtsicht (`pages`, `candidates`, `allowedUrls`, `text`) für Probe, `eval freeze` und den Ertragsbeweis des Entdeckens.
- **E1, gescheiterte Beilage:** Die Einheit wird ohne sie extrahiert und bleibt `ok`, wie E1 sagt. Die Testzeile unter `lib/fetch.test.ts` („`assembleUnit` mit gescheiterter Beilage → `fehler`“) widersprach E1 und gilt nicht.
- **E7, Anbieter ohne Rohdatei:** Hat ein Anbieter keine Datei in `data/raw`, aber Angebote im Vorstand, gilt er als umzustellen: Geprüft wird gegen die Zahl seiner Angebote in `data/offers.json` (`prevOfferCount`). Sonst würde er ohne jede Einbruchprüfung extrahiert. Ohne Vorstand (neuer Anbieter) gibt es keine Prüfung.
- **E5/E10, Ergebnis je Anbieter:** Neue Werte `teilausfall` (einzelne Seiten im Fehler, gelb, nicht in der 20-%-Regel) und `umstellung-ausstehend` (gelb, Grund unter `migrations` in `nightly.json`). `fehler` bzw. `ausgefallen` heißt jetzt: alle Einheiten scheitern. Das Ergebnis je Einheit steht unter `units` in `nightly.json`.
- **E4, `removedAt`:** neues Feld in `UnitState` (Arch-Review M1). Ohne es übernahm der Build bei einem Anbieter mit nur einer Seite deren Angebote nach 14 Tagen 404 für immer aus dem Vorstand, weil die Datei dann weder Events noch `inputHash` hatte.
- **E5, Risiken: ID nach Tag 15.** Kehrt eine entfernte Seite zurück, bekommen ihre Angebote nicht unbedingt neue IDs: Eine neue ID folgt aus dem Schlüssel (Titel, Ort), und die alte ist in der Vornacht nicht belegt. Bei unverändertem Titel kommt dieselbe ID zurück; ein alter Link zeigt dann wieder auf denselben Kurs. Der Satz unter „Risiken“ ist entsprechend zu lesen.
- **E6, Batch-Namen:** `<id>#<nn>` mit dem Katalogindex der eigenen Seite; verwaiste Einheiten danach, `kandidaten` zuletzt. Die Reihenfolge „ok vor Fehler“ gilt in `matchUnits` und `mergeParts`, wo sie wirkt.
- **E6, Eval:** Das Eval extrahiert immer je Einheit (`caseUnits`, `lib/units.ts`). Eine Einheit mit Fehler macht den Fall zum Fehler.

**Arch-Review (2026-10-27), Verdict: Nacharbeit nötig.** Blocker B1 (Modell und Effort fehlen in den Workflows) wird mit Nachtrag 2 behoben. Übernommen und behoben in `55f657f`: M1 (entfernte Seite bei nur einer Seite), M2 (`--umstellen` mit offener Einheit schreibt nicht), M4 (fehlende Tests für Beilage, Fehlerklasse, Teilzeile, Kopplung Nachricht/Schlüssel), m1–m4 und m6. M3 (Effort ohne Plan) wird mit Nachtrag 2 behoben. m5 (Abweichung bei `assembleUnit`) steht oben.

## Review (2026-10-26) – Verdict: Überarbeiten

Unabhängiger Review des Entwurfs mitsamt ADR 0033. Alle Befunde sind am Code nachgeprüft. Die Begründung steht jeweils in der genannten Entscheidung.

**Blocker**
- **B1 Dubletten über Einheiten brechen den Build** (Schritt 3, `build-offers.ts` Z. 379–389; `mergeParts` fehlte): übernommen.
  - E6: `mergeParts` je Anbieter vor dem Build, das Eval ebenso.
  - Test „anderes `cost` → kein Build-Fehler“.
  - Ziel 2 und S0 zählen Build-Fehler.

**Major**, alle übernommen:
- **M1 Schlüssel und Nachricht:** `unitExcerpt` für beide (E3, Test).
- **M2 „entfernt“ zählte die ganze Fehlerserie:** `klasseSince` (E4, E5, Test 500 → 404).
- **M3 Test widersprach dem Plan:** zwei Fälle, Rückkehr vor und nach Tag 14.
- **M4 robots.txt in `http.ts` sperrte Nominatim:** Prüfung nur bei Seitenabrufen, APIs ausgenommen, Messung im Runner samt Sammelkalendern (E8, S3). ADR 0033, Punkt 1 angepasst.
- **M5 `emptySince`:** in jedem Pfad, `leer` über künftige Events (E5, E10).
- **M6 Umstellung im Wächter:** Art `umstellung`.
- **M7 Job-Limit:** Eingabe `timeout`, `mayContinue` je Einheit (E7, E9).
- **M8 Einbruchschutz kleiner Seiten:** Regel „1 → 0“ (E5).
- **M9 Impressum:** `imprintPage()` in `share-pages.ts` mit Test.
- **M10 `check-docs` auf `main`:** Doku-Commit als Voraussetzung.

**Minor**, übernommen:
- Batch-Index mit Nullen;
- `kandidaten` ohne Kandidaten;
- alte Einheit bleibt bis zum Ersatz;
- `--umstellen` auch bei dauerhaft scheiternder Seite, Eingaben in `nightly.yml`;
- Body-Hash in der Kennung;
- robots-Tests (`*`, `$`, Gruppen, Weiterleitung, Browser);
- Bot-Schutz als `voruebergehend`, gemeldet ab Tag 2;
- Wächter-Test in S2, `berlinIsoDate`, `today` aus `nightly.json`;
- Modellwechsel geklärt: zusammen mit der Umstellung, wegen der ID-Probe vom 2026-10-26 (E7, E11);
- Rückweg (E4).

**Scope**, übernommen: Reihenfolge Einheit (S1), Wächter (S2), Abruf (S3); `Crawl-delay` gestrichen. **Abgelehnt:** den Befund `leer` zu verschieben. Grund: „kein stiller Ausfall“ ist ein Hauptziel des Nutzers, und mit M5 kostet `leer` nur eine Zeile in `watchFindings`.

**Neu nach dem Review:** E11 und Ziel 6. Grund ist die Probe vom 2026-10-26: Nur 16 von 24 IDs blieben bei `die-familienbox` mit neuem Modell. Das ist noch nicht unabhängig geprüft; deshalb folgt Review 2.

## Review 2 (2026-10-26) – Verdict: Freigabe mit Änderungen

Zweiter, unabhängiger Review samt ADR 0033. Kein Blocker. Die Befunde sind am Code nachgeprüft. Übernommen:

**Major**
1. **Ausgefallene Beilage sperrte alle Einheiten und löschte nach 14 Tagen den Bestand** (alle drei Beilagen sind Browser-Widgets mit Bot-Schutz): Beilagen sind optional, mit eigenem Zustand `beilagen` und eigenem Befund. „Entfernt“ greift nur bei der eigenen Seite (E1, E4, E5, Tests).
2. **Entfernte Seite blieb nach der Rückkehr leer** (gleicher Schlüssel → „unverändert“): Beim Entfernen wird auch der Schlüssel gelöscht. Test „Rückkehr mit gleichem Inhalt“ (E5).
3. **`emptySince` war enger als das ADR:** jetzt „hatte Events, hat keine künftigen“ über `hasFuture` mit `expandSchedule`; Tests für einen übernommenen Einbruch und für `until` (E5).
4. **Geänderte URL umging den Einbruchschutz:** Die neue Einheit wird gegen die verwaisten geprüft (E1, Test Soft-404).
5. **E11 hätte IDs vertauschen können:** Der gemeinsame Zeitraum gilt nur bei ähnlichem Titel. Dazu ein Negativtest; S0 zählt falsche Übernahmen mit dem Ziel 0. Ziel 6 verlangt einen ähnlichen Titel.
6. **E11 ändert ADR 0022, Punkt 3:** ADR 0033 hat dafür einen eigenen Punkt 8. Er grenzt gegen ADR 0031 ab (Formatwechsel dort vertagt, die „Überdeckung“ aus anderem Grund verworfen); die Statuszeilen von ADR 0022 und 0031 werden nachgezogen.
7. **S0 übersah die neue Einheit `kandidaten`:** S0 läuft über alle Anbieter mit mehr als einer Einheit.
8. **robots.txt im Browser über `page.route`** sieht keine Weiterleitungen: Die Kette wird vorab über `http.ts` geprüft, dann `goto(finalUrl)` und `page.url()` gegengeprüft (E8, Test).

**Minor**, übernommen:
- Reihenfolge in `mergeParts`: `ok` vor Fehler.
- Body-Hash über die Vorlage, Kennungen in `data:validate` eindeutig.
- `fromJSON(inputs.timeout || '90')`.
- Wächter ohne `continue-on-error`, Marker `id#hash8`, Text beim Schließen.
- Ziel 5 im Bericht, ab S2 im Wächter.
- Rückweg samt Entdecken-Commits.
- Ferien vor `batchesFromRaw`, `io/files.ts` in der Tabelle.
- Fehlerklasse strukturiert am `PageOutcome`.
- Messung in S3 per Modus `messen` mit beiden User-Agents, dazu `--smoke`.
- Auszug: Nachricht als Projektion des Schlüssel-Auszugs.

**Scope:**
- **Übernommen:**
  - Trockenlauf in S1 per `workflow_dispatch` auf dem Branch statt lokal;
  - „Bericht nennt Seiten ohne Ertrag“ beim Entdecken gehört zu Plan 0050.
- **Abgelehnt:** S3 (User-Agent, robots.txt) in einen eigenen Plan auszulagern. Grund: Das Gesamt-Review vom 2026-10-25 hat gerade die Aufteilung in viele Pläne als Problem benannt. S3 ist ein abgegrenzter Schritt am Ende dieses Plans, mit eigenem Schalter und eigener Messung; ein eigener Plan brächte nur weitere Querverweise.

Kein Blocker offen; der Plan ist nach dem Skill fertig für die Umsetzung, sobald die Voraussetzungen erfüllt sind.

## Review 3 (2026-10-26) – Verdict: Freigabe mit Änderungen

Unabhängiger Review von „Umsetzung“ und „Nachtrag 1“. Kein Blocker. Alle Befunde am Code nachgeprüft und übernommen:

**Major**
1. **Fallback Opus schaltete den zweiten Versuch ab** (`strongRetry` in `cli.ts` nur bei verschiedenem Modell): Der zweite Versuch nach einem Einbruch läuft künftig auch mit gleichem Modell, mit Test (E5, Voraussetzung „Modell“).
2. **E3 und E12 widersprachen ADR 0033 (Punkte 2, 8) und ADR 0031, Punkt 1:** ADR 0033 hat einen „Nachtrag 1“; E12 ist dort auf verschiedene Einheiten desselben Anbieters begrenzt und gegen ADR 0031 abgegrenzt.
3. **Jede neue Seite extrahiert den Anbieter neu:** bewusst hingenommen, in E3 und in Plan 0049 („Risiken“) mit Messung der ID-Verluste je Anhang und Ausweg (nur Hosts).
4. **Regel von E12 nicht nachbaubar:** Ablauf (gierig in Einheitenreihenfolge), Formel `passung` und Fenster (nur künftige Termine, auch bei Kursen) stehen wörtlich in E12; Test für den 1:n-Fall `theater-mummpitz`.
5. **Ziel 2 als erfüllt markiert trotz `geburtshaus-nuernberger-nest`:** jetzt „bis auf einen Anbieter“; Teilzeile auf „diese Seite“ (E3); Abnahme im Eval je Einheit, 2 von 2 Läufen, sonst Nachtrag vor dem Merge.

**Minor**, übernommen:
- Auszug ohne `info` und `blocked`; eigenes Feld `excerpt` in `ExtractInput`.
- Tests für `kandidaten` (Probelauf mit vollem Eintrag, Auszug ohne `hint`).
- Eval: `matchUnits` ohne Vorstand, dann `mergeParts` (E6, Tests).
- E12 ohne `kandidaten`; Einheiten im Fehler verlieren immer.
- Zahl der E12-Entscheidungen (31–43 je Lauf) und Umfang der Prüfung von Hand genannt.
- Ziel 6 für V nachgerechnet (97,0 / 95,4 % auf den Anbietern mit mehreren Einheiten).
- E7: Rechenweg für einen größeren Katalog; Umstellung vor 01:30 UTC.
- Zeichensatz vor N3: behoben in `72c42d6`; `sternenhaus-kuf` wird vor N3 auf heilem Text neu gemessen.
- N3: Zahlen erklärt (54 Events, 97 Angebote; 2 von 100 Terminen mit Alter).
- „Doku auf `main`“ als erledigt markiert.

Kein Blocker offen. N3 ist entschieden und umgesetzt (2026-10-26); S1 kann beginnen.
