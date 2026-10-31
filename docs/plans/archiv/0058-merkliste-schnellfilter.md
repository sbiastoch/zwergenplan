# Plan 0058 – Schnellfilter statt Abschnitte in der Liste der Merkliste

Status: abgeschlossen, live seit 1f8fba7 (2026-10-31)

## Anlass

Nutzerwunsch (2026-10-31): „Die Abschnitte in der Listenansicht der Merkliste sollten besser Quick-Filter sein. Zusammen mit Filter für Kurs und Einmaliges.“

Heute gruppiert die Liste der Merkliste in der Standardsortierung „Was ist zu tun“ in fünf Abschnitte (Plan 0057, E8; `savedSections` in `src/domain/saved.ts`): Demnächst, Rechtzeitig anmelden, Spontan möglich, Läuft gerade, Später. Die Chipzeile darüber hat „Nur fest eingeplant“, „Vormittags“ und „Nachmittags“ (Plan 0057, E5).

Entscheidungen des Nutzers (Rückfrage am 2026-10-31):

1. **Chips der Liste**: Demnächst · Anmelden · Spontan · Läuft gerade · Kurse · Einmalig · Nur fest eingeplant. „Vormittags“ und „Nachmittags“ stehen in der Liste nur noch im Filter-Sheet. „Später“ entfällt.
2. **Sortierung „Was ist zu tun“ entfällt.** Standard wird „Nächste Termine“ mit Tagesköpfen. Die Kachel-Zusätze bleiben: Marke „in N Tagen“ und „Endet … · Anschluss suchen“.
3. **Die neuen Chips wirken nur in der Liste.** In Karte und Kalender bleibt die Chipzeile wie heute. Das gilt auch für „Kurse“ und „Einmalig“ (E1).

## Ziel

Die Liste der Merkliste zeigt die Angebote nach der gewählten Sortierung. Was früher Abschnitte waren, wählt man über Chips aus. Kombinationen wie „Demnächst“ + „Anmelden“ („was muss ich bald anmelden?“) oder „Einmalig“ + „Demnächst“ werden damit möglich.

## Nicht-Ziele

- Keine Listen-Chips in Karte oder Kalender und keine Listen-Chips im Filter-Sheet.
- Nichts in der URL oder im `localStorage`; die Chips leben im Speicher wie der Merklisten-Filter (Plan 0057, E5).
- Startseite, Export, Statuszeilen-Texte und Kalender bleiben unverändert.

## Entscheidungen

### E1 – Chips und ihre Bedeutung

Die Abschnitte waren eine Zerlegung, in der jedes Angebot genau einmal stand (erste zutreffende Regel, `sectionOf`). Als Filter wäre das an einer Stelle irreführend. Ein Kurs mit Anmeldung, der in 5 Tagen beginnt, stand in „Demnächst“ und fehlte unter „Rechtzeitig anmelden“, obwohl gerade er am dringendsten anzumelden ist. Die Chips prüfen deshalb je eine Eigenschaft am gezeigten Termin (`item.session`). „Demnächst“ behält dabei die Ausschlüsse von früher (Review B1). Sonst passte jedes wöchentliche Angebot, denn sein nächster Termin liegt immer in 14 Tagen.

| Chip | Wert | passt, wenn |
|---|---|---|
| Demnächst | `demnaechst` | kein laufender Kurs, nicht „regelmäßig ohne Anmeldung“, gezeigter Termin beginnt bis einschließlich zum 14. Berliner Kalendertag nach heute (`SOON_DAYS`) |
| Anmelden | `anmelden` | `registration === "mit-anmeldung"` und kein laufender Kurs (`!courseRunning`) |
| Spontan | `spontan` | `registration === "ohne-anmeldung"`, auch ein laufender Kurs ohne Anmeldung, denn dort kann man einfach hingehen (Review m1, bewusst) |
| Läuft gerade | `laeuft` | `courseRunning(offer, now)` |
| Kurse | `kurse` | `offer.format === "kurs"` |
| Einmalig | `einmalig` | `offer.format === "einmalig"` |

- **Alle sechs Chips sind Listen-Chips** (Entscheidung 3; Review M1, M2).
  - Sie haben einen eigenen Zustand im Speicher, stehen **nicht** im Filter-Sheet und zählen nicht im Badge. In Karte und Kalender wirken sie nicht.
  - Auch „Kurse“ und „Einmalig“ schreiben nicht in `formats`. So gibt es keine zweite Wahrheit neben dem Sheet und keine unsichtbare Wirkung in den anderen Darstellungen.
  - Widersprechen sich Chip und Sheet (etwa „Spontan“ und Sheet „mit Anmeldung“), ist die Liste leer. Der Leerzustand bietet „Filter zurücksetzen“, das beides leert.
- **Kombination** wie im Filter-Sheet: innerhalb einer Gruppe ODER, zwischen Gruppen UND.
  - Gruppen: **Zeit** (Demnächst, Läuft gerade), **Anmeldung** (Anmelden, Spontan), **Format** (Kurse, Einmalig).
  - Beispiel: „Demnächst“ + „Anmelden“ = mit Anmeldung, Termin in 14 Tagen, kein laufender Kurs.
  - „Demnächst“ + „Läuft gerade“ = beides zusammen; „Kurse“ + „Einmalig“ = beides zusammen.
- **Reihenfolge der Chipzeile**:
  - in der Liste: Filter (Badge) · Demnächst · Anmelden · Spontan · Läuft gerade · Kurse · Einmalig · Nur fest eingeplant;
  - in Karte und Kalender unverändert: Filter · Nur fest eingeplant · Vormittags · Nachmittags.
- Wer in Karte oder Kalender eine Tageszeit wählt, sieht sie in der Liste nur am Badge (Review m2, bewusst). Gewählte Listen-Chips bleiben beim Wechsel zurück in die Liste gewählt.
- „Später“ gibt es als Chip nicht.

### E2 – Domäne (`src/domain/saved.ts`)

```ts
/** Schnellfilter der Liste der Merkliste (Plan 0058, E1); nie in der URL */
export type SavedListChip = "demnaechst" | "anmelden" | "spontan" | "laeuft" | "kurse" | "einmalig";
/** Reihenfolge der Chipzeile; App baut die Chips daraus */
export const SAVED_LIST_CHIPS: readonly SavedListChip[] = [
  "demnaechst", "anmelden", "spontan", "laeuft", "kurse", "einmalig",
];

/** Passt ein gemerktes Angebot am gezeigten Termin zu den Chips (ODER je Gruppe, UND zwischen Gruppen)? Ohne Chip passt alles. */
export function matchesListChips(item: Occurrence, chips: readonly SavedListChip[], now: Date): boolean;

/** „Demnächst“ (E1): dieselbe Regel für Chip und Kachel-Marke */
export function isSoon(item: Occurrence, now: Date): boolean;
```

- Entfallen (knip): `savedSections`, `SECTION_ORDER` und `sectionOf`, dazu der Typ `SavedSection` in `src/domain/listing.ts` und die Art `{ kind: "abschnitt" }` in `ListGroupHead`.
- `SavedSort` wird `"termine" | "nah" | "gemerkt"`.
- `courseRunning`, `followUpFilter` und `SOON_DAYS` bleiben.

### E3 – Zustand und Ansichten

- **App** (`src/ui/App.tsx`): `const [listChips, setListChips] = useState<readonly SavedListChip[]>([])` neben `savedFilter`, und `useState<SavedSort>("termine")`.
  - `savedChips` wird je Darstellung gebaut: in der Liste die sechs Chips aus `SAVED_LIST_CHIPS` plus „Nur fest eingeplant“, sonst die drei bisherigen.
  - Beschriftungen in `src/ui/format.ts`: `LIST_CHIP_LABELS: Record<SavedListChip, string>` = Demnächst, Anmelden, Spontan, Läuft gerade, Kurse, Einmalig.
- **`useOfferViews`** bekommt `listChips` (Standard `[]`). Neu ist (Review M5):
  - `savedListVisible`: auf dem Tab `merkliste` mit Chips `savedVisible.filter((i) => matchesListChips(i, listChips, now))`, sonst `savedVisible`.
  - `savedListVisibleList` enthält deren Angebote.
  - `savedGroups` nimmt für „Zuletzt gemerkt“ `savedListVisible`, für „Nächste Termine“ und „Nächstgelegen“ `savedListVisibleList`. Beide Gruppierungen wählen den gezeigten Termin mit derselben Regel wie `savedVisible`. Der Chip-Filter am Termin passt also zur Kachel.
  - **`savedFiltered`** ist auf dem Tab `merkliste` zusätzlich `true`, wenn ein Chip gewählt ist. Daran hängen:
    - die Statuszeile („2 von 8 gemerkten Angeboten passen“);
    - der Leerzustand „Nichts, was zu deinem Filter passt“;
    - der Export-Name „…, auch ausgeblendete“. Das ist gewollt, denn der Export nimmt weiter alle fest eingeplanten (Review m3).
  - **`savedFilterCount`** (Badge) zählt die Chips **nicht**. Das Badge zählt, was im Sheet steht.
  - `savedListVisible` ist neu Teil von `OfferViews`. SavedView bekommt in der Liste `savedListVisible` als `visible`, sonst wie heute. So nennen Statuszeile und Leerzustand dieselbe Zahl.
  - **Sheet-Zähler** (Review M3): `resultCount` des Sheets `saved-filter` (`App.tsx`, heute `views.savedVisible.length`) wird `views.savedListVisible.length`. In Karte und Kalender ist das `savedVisible`.
- **Zurücksetzen**:
  - „Filter zurücksetzen“ (Leerzustand, Kalender) und `resetSavedFilter` leeren auch `listChips`.
  - „Zurücksetzen“ im Sheet leert nur die Sheet-Werte, wie heute.
- **Sortierung**: „Nächste Termine“ (Tagesköpfe), „Nächstgelegen“, „Zuletzt gemerkt“.
  - `SortMenu` bekommt `plain="termine"`.
  - `sortNote` entfällt für `termine`.
  - `SAVED_SORT_TITLES.zutun` entfällt.

### E4 – Kachel-Zusätze ohne Abschnitte

`ListView` bekommt statt `onFollowUp` den Prop `savedExtras?: { now: Date; onFollowUp: (offer) => void }`, nur von der Merkliste gesetzt. Je Kachel, in jeder Sortierung:

- `isSoon(item, now)` → Marke `daysUntilLabel(…)` („heute“, „morgen“, „in N Tagen“). Nach der Regel aus E1 tragen laufende Kurse und Regelmäßiges ohne Anmeldung sie nie, Kacheln unter „Demnächst“ immer.
- `courseRunning(item.offer, now)` → Fußzeile „Endet …“ mit „Anschluss suchen“ (`endsLabel`, `followUpFilter`), wie bisher.

Entfallen:

- `sectionHeading` und `SECTION_HEADINGS` (`format.ts`);
- die Zahlmarke `.section-count` (`list.css`).

Kommentare und JSDoc, die noch den „Abschnitt“ nennen, verweisen danach auf Plan 0058 (Review m6): `OfferCard.tsx` bei `soon`/`followUp`, `card.css` bei `.soon` und der Fußzeile, `ListView.tsx`.

### E5 – Mobile-UX und Barrierefreiheit

- Die Chipzeile scrollt waagrecht wie heute (`QuickFilters`). In der Liste hat sie 8 Elemente. Es gibt keine neue Komponente und keine neue CSS-Regel.
- Im Browser-Review wird bei 320 px geprüft, ob der Anschnitt das Scrollen erkennbar macht (Review m8).
- Chips sind `aria-pressed`-Knöpfe in der Gruppe der Chipzeile, mit der Legende wie heute. Nach einem Chip-Tipp meldet die Statuszeile (`role="status"`) die neue Zahl, wie bei den übrigen Chips.

### E6 – Start-Budget und Doku

- Erwartet sind beim Start-JS etwa −0,3 bis +0,2 kB, beim CSS −0,1 kB. Gemessen wird mit `pnpm build` im Commit. Eine Zeile in ADR 0012 kommt nur dazu, wenn die Budget-Prüfung es verlangt.
- `docs/architecture.md` (Satz „Merklisten-Filter und -Sortierung … nur als React-State in `App`“) nennt danach auch die Schnellfilter der Liste (Plan 0058; Review m6).

## Tests (test-first für die Domäne)

1. **`src/domain/saved.test.ts`** (ersetzt die Tests zu `savedSections`):
   - je Chip allein:
     - Demnächst: Tag 14 drin, Tag 15 draußen, an der Berliner Mitternacht. Laufender Kurs und Regelmäßiges ohne Anmeldung sind draußen, Regelmäßiges mit Anmeldung ist drin.
     - Anmelden: Ein laufender Kurs mit Anmeldung ist draußen.
     - Spontan: Ein laufender Kurs ohne Anmeldung ist drin.
     - Läuft gerade, Kurse, Einmalig.
   - Kombinationen: „Demnächst“ + „Anmelden“ ergibt die Schnittmenge. „Demnächst“ + „Läuft gerade“, „Anmelden“ + „Spontan“ und „Kurse“ + „Einmalig“ ergeben die Vereinigung.
   - Ohne Chip passt alles. `isSoon` prüft den gezeigten Termin, nicht den ersten.
2. **`src/ui/use-offer-views.test.ts`**:
   - `listChips` filtert auf `merkliste` in allen drei Sortierungen, nicht auf Karte oder Kalender.
   - Mit Chip wird `savedFiltered` wahr, `savedFilterCount` bleibt gleich.
   - `savedListVisible` hat so viele Einträge, wie `savedGroups` Kacheln hat.
   - Ohne `savedSort` ist der Standard „Nächste Termine“.
3. **`src/ui/format.test.ts`**: Die Tests zu `sectionHeading` entfallen, die zu `daysUntilLabel` und `endsLabel` bleiben.
4. **E2E `e2e/merkliste-liste.spec.ts`**:
   - Der Block „Was ist zu tun (E8)“ wird „Schnellfilter der Liste (Plan 0058)“:
     - Chipzeile der Liste in der Reihenfolge aus E1, in der Karte die drei bisherigen.
     - „Demnächst“ zeigt PEKiP und den Schnupper-Workshop mit den Marken „in 8 Tagen“ und „in 12 Tagen“, die Statuszeile meldet „2 von 8 …“. Der Krabbeltreff (regelmäßig ohne Anmeldung) fehlt.
     - Ohne Chip in „Nächste Termine“ stehen dieselben zwei Marken und keine weiteren (Review m7).
     - „Demnächst“ + „Anmelden“ zeigt die Schnittmenge. Der Sheet-Knopf nennt dieselbe Zahl wie die Statuszeile (Review M3), das Badge bleibt ohne Zahl.
     - Mit „Kurse“ in den Kalender und zurück: Im Kalender wirkt der Chip nicht, in der Liste ist er weiter gedrückt (Review m2).
     - Leerzustand: Eine Kombination ohne Treffer im Fixture-Bestand führt zum Leerzustand. Dessen „Filter zurücksetzen“ leert auch die Chips.
     - „Läuft gerade“: Fußzeile „Endet …“ und „Anschluss suchen“ wie bisher, mit Chip statt Abschnittskopf. Der laufende PEKiP trägt keine Marke (Review m7).
   - Sortiertests (um Z. 130–185): Standard ist „Nächste Termine“, es gibt drei Optionen und kein „Was ist zu tun“.
   - Tageszeit-Chips in der Liste (Z. 47–48, 83, 95–122, 281, 360): Die Tageszeit wird über das Sheet oder in der Karte gewählt. Z. 116–122 erwarten die Reihenfolge nach Terminen statt nach Abschnitten.
5. **Weitere Specs** (Review M4):
   - `e2e/saved.spec.ts` (um Z. 73–77 und 719): Tagesköpfe statt Abschnitte;
   - `e2e/sortierung.spec.ts` (Z. 163): „Sortierung: Nächste Termine“;
   - `e2e/mobile-ux.spec.ts` (um Z. 241–246): statt „Vormittags“ der Chip „Läuft gerade“ bzw. die Liste ohne Chip.
6. **`scripts/screenshots.ts`** (Review M4): Die Ansicht `merkliste-zutun` wird `merkliste-chips` mit gewähltem Chip „Demnächst“. Die Ansicht mit der Region „Läuft gerade“ tippt den Chip „Läuft gerade“.
7. **Prüfen**:
   - `pnpm verify`;
   - E2E gezielt (Review m5): `pnpm e2e:local e2e/merkliste-liste.spec.ts e2e/saved.spec.ts e2e/sortierung.spec.ts e2e/mobile-ux.spec.ts`;
   - danach `/browser-review`: Liste mit und ohne Chip, hell und dunkel, 320 px und 200 % Text.

## Schritte

- **S1** (ein Commit): E1–E6 mit den Tests 1–7. Danach `/browser-review`, Push auf den Branch, CI grün, Fast-Forward nach `main`, `/browser-review live`.

## Risiken

- **Gewohnheit**: Wer die Abschnitte kannte, sieht nun Tagesköpfe. Die Chips tragen dieselben Namen und fangen das ab.
- **Chip und Sheet können sich widersprechen** (etwa „Kurse“ als Chip und Format „Einmalig“ im Sheet). Die Liste ist dann leer, und der Leerzustand setzt beides zurück.

## Review (2026-10-31) – Verdict: Überarbeiten

Alle Punkte übernommen:

- **B1** „Demnächst“ schließt wie bisher laufende Kurse und Regelmäßiges ohne Anmeldung aus. Marke und Chip folgen derselben Regel (`isSoon`). Test 1 und Test 4 sind neu gezählt (2 von 8).
- **M1, M2** Alle sechs Chips sind Listen-Chips außerhalb des Sheets, auch Kurse und Einmalig (E1). Es gibt keine zweite Wahrheit und keine Wirkung in Karte und Kalender.
- **M3** Der Sheet-Zähler nimmt `savedListVisible` (E3); ein E2E-Schritt prüft es.
- **M4** Screenshot-Skript und alle Stellen in den Specs sind aufgezählt (Tests 4–6).
- **M5** `savedListVisibleList` gilt für „Nächste Termine“ und „Nächstgelegen“ (E3). Test 2 prüft alle Sortierungen.
- **m1** „Spontan“ nimmt laufende Kurse ohne Anmeldung bewusst mit (E1).
- **m2** Eine Tageszeit aus Karte oder Kalender ist in der Liste nur am Badge sichtbar, bewusst. Listen-Chips überstehen den Darstellungswechsel (E1, Test 4).
- **m3** Der Export-Name „auch ausgeblendete“ ist gewollt (E3).
- **m4** `SAVED_LIST_CHIPS` nutzt App (E2, E3).
- **m5** Die Specs sind ausdrücklich genannt (Test 7).
- **m6** `architecture.md` und die Kommentare werden angepasst (E4, E6).
- **m7** Test 4 prüft die Marke in „Nächste Termine“ und dass der laufende Kurs keine trägt.
- **m8** Der Anschnitt bei 320 px wird im Browser-Review geprüft (E5).

## Review 2 (2026-10-31) – Verdict: Freigabe mit Änderungen

Keine Blocker. Alle Punkte übernommen; sie ergänzen die Tests 1–7 und E3:

- **M1** Unter Tagesköpfen zeigen Kacheln nur die Uhrzeit (`dated = group.kind !== "termin"`). Die Erwartungen mit Datum (`e2e/saved.spec.ts` um Z. 77 und 721–723, `e2e/merkliste-liste.spec.ts` Z. 124–126 und 285–292) prüfen künftig die Region des Tageskopfs und nur die Uhrzeit. Im Test „laufender Kurs mit Vormittags“ steht „Heute“ statt „Läuft gerade“.
- **M2** `e2e/mobile-ux.spec.ts` Z. 239–243: Statt „Vormittags“ tippt der Test den Chip „Anmelden“. Erwartet werden der Musikgarten, „1 von 3“ und „Alle Filter, 1 aktiv“. „merkliste-laeuft“ bleibt unverändert.
- **M3** `scripts/screenshots.ts` Z. 123 („merkliste-sortieren“) tippt „Anmelden“ statt „Vormittags“; der Docstring in Z. 5 nennt die neuen Ansichtsnamen.
- **M4** Der E2E-Test zur Schnittmenge nimmt „Demnächst“ + „Kurse“ (nur PEKiP, „1 von 8“).
- **m1** Leerzustand: Mit „Läuft gerade“ am 5.10. ist die Liste leer. Nach „Filter zurücksetzen“ sind alle Chips `aria-pressed="false"`, und der Fokus liegt auf der Statuszeile.
- **m2** „Läuft gerade“ + „Anmelden“ ist immer leer, bewusst (E1); Unit-Fall in Test 1.
- **m3** `useOfferViews` behält `sheetFiltered = savedCount > 0` für `savedVisible` und den Kalender-Index. `savedFiltered = sheetFiltered || (Liste && Chips)` gilt nur für Statuszeile, Leerzustand und Export-Name.
- **m4** Zu Test 7 kommt `e2e/merkliste-kalender.spec.ts` dazu.
- **m5** In `use-offer-views.test.ts` entfällt der Test „Standard Was ist zu tun“, in `format.test.ts` der `listingHeading`-Fall `abschnitt`.
- **m6** Risiko: „Kurse“ und „Einmalig“ heißen wie auf der Startseite, schreiben aber nicht ins Sheet (Entscheidung 3).
- **m7** Der Sheet-Zähler mit Listen-Chip wird im Browser-Review geprüft. Verwirrt er, kommt eine Zeile nach `docs/ideas.md`.

## Arch-Review (2026-10-31) – Verdict: Nacharbeit nötig, keine Blocker

- **M1** Übernommen: `docs/architecture.md` (Schichten-Tabelle zu `listing`, Abschnitt „Laufende Kurse“) nennt nicht mehr die Abschnitte.
- **m1** Übernommen: Unit-Fall „Läuft gerade“ + „Anmelden“ ist leer, am 27.10. mit laufendem PEKiP.
- **m2** Übernommen: Der Hook-Test prüft „Nächstgelegen“ mit Wegzeit (`groupByReach`) samt Chip.
- **m3** Abgelehnt: Der Test zu `isSoon` trennt den gezeigten vom ersten Termin. Ein Fall mit Tageszeit-Regel brächte keinen weiteren Schutz, denn `isSoon` liest nur `item.session` und wählt keinen Termin selbst.
- **m4** Übernommen: Status „in Umsetzung“.
