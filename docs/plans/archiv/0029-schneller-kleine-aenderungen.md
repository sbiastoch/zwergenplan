# Plan 0029 – Kleine Änderungen schneller: Zeremonie nach Größe, E2E nach Diff

Status: abgeschlossen, live seit eaf6169 (2026-10-09)
Datum: 2026-10-08
Bezug: ADR 0021 (Verifikation nach Risiko, verwirft unter „Verworfen“ die automatische Spec-Auswahl), ADR 0002 (check → E2E → Deploy), ADR 0004 (Backpressure), Plan 0013 (E2E-Matrix in CI), Plan 0027 (archiviert, Stufen und Doku-Pfad)

## Anlass

Der Nutzer, wörtlich: „Eine kleine Änderung dauert lokal inzwischen etwa 1h zu implementieren, da tests in jeder Stufe immer komplett laufen anstatt fokussiert abhängig von der Änderung.“ Entscheidung nach der Analyse: „4 bitte zuerst und dann 2 umsetzen, direkt ohne schattenmessung. Die volle suite nur bevor es live geht, einmal.“

Gemessen am 2026-10-08:

| Schritt | Dauer |
|---|---|
| `check:fast` (Stop-Gate, pre-commit) | 9,7 s, also kein Engpass |
| CI-Lauf, egal wie klein die Änderung ist | etwa 10 min, alle 313 E2E-Tests auf allen Geräten in 7 Jobs, auf jedem Branch und nach dem Fast-Forward noch einmal auf `main` |
| Ablauf | Für jede Änderung gibt es einen Plan mit `/plan-review`-Subagent. `/browser-review` wartet auf den Deploy, also auf die CI |

„Teil A“ ist Punkt 4 der Analyse (Zeremonie nach Größe), „Teil B“ ist Punkt 2 (E2E nach Diff). Die Flakes aus Punkt 1 sind nicht Teil dieses Plans (siehe Restpunkte).

## Ziel

- Eine Kleinänderung braucht keinen eigenen Plan, kein `/plan-review`, und die Sichtprüfung wartet nicht auf den Deploy.
- E2E läuft lokal und auf Branches nur für die Specs, die der Diff erreicht.
- Die volle Suite läuft **genau einmal**: auf `main`, vor dem Deploy. Jeder ausgelieferte Stand bleibt voll grün geprüft, wie es ADR 0021, Nr. 10 garantiert.

## Teil A – Zeremonie nach Größe

### A1 Kleinänderung, objektiv

Eine Änderung ist eine **Kleinänderung**, wenn alle Bedingungen gelten, gemessen gegen `merge-base HEAD origin/main` inklusive Arbeitsbaum und ungetrackter Dateien:

1. Höchstens **60 geänderte Zeilen** (hinzugefügt plus gelöscht). Nicht mit gezählt werden **hinzugefügte** Zeilen in Tests (`*.test.ts(x)`, `e2e/*.spec.ts`) und Doku der Positivliste (`isDocPath`, `scripts/lib/change-class.ts`). Gelöschte Testzeilen zählen, damit eine „Kleinänderung“ keine Tests still entfernt (Review M3).
2. Keine neue Datei außer Tests und Doku, also kein neues Modul. „Neu“ meint `git diff --diff-filter=A` gegen die Basis plus `git ls-files --others --exclude-standard`. So zählen ignorierte Artefakte wie `runs/` und `e2e/.artifacts/` nicht (Review m5).
3. Keine hinzugefügte Zeile mit `.skip(`, `.only(`, `.fixme(` oder `biome-ignore`.
4. Kein Pfad aus der **Sperrliste**:
   - `package.json`, `pnpm-lock.yaml`, `.nvmrc`
   - die Schema-Auslöser aus `.claude/hooks/post-edit.ts` (`src/domain/schema.ts`, `src/domain/topics.ts`, `scripts/pipeline/lib/raw.ts`)
   - die Gate-Konfiguration: `.dependency-cruiser.cjs`, `biome.json*`, `knip.*`, `lefthook.yml`, `.size-limit.json`, `vitest.config.ts`, `.claude/settings.json`, `.claude/hooks/**`, `.github/**`, `scripts/check-*.ts`, `scripts/verify.ts`, `vite.config.ts`, `playwright.config.ts`, `playwright.devices.ts`, `tsconfig*.json`
   - die E2E-Helfer, also die Mobile-UX-Gates: `e2e/fixtures.ts`, `e2e/mobile-ux.ts`, `e2e/global-setup.ts`
   - die Auswahl- und Stufenlogik selbst, Module und CLIs: `scripts/(lib/)?(change-class|change-size|ci-scope|ci-scope-git|ci-gates|import-graph|import-graph-io|e2e-map|e2e-select|e2e-local|e2e-args)\.ts` (Review 2, m10)
   - `docs/adr/**`
5. Der Nutzer hat kein Mockup verlangt. Das prüft kein Skript, das entscheidet der Agent.

Prüfen lässt sich das mit `node scripts/change-size.ts`. Das Skript gibt `Kleinänderung: ja` aus oder `Kleinänderung: nein (<erster Grund>)`, mit Exit 0 in beiden Fällen, denn es ist ein Hinweis und kein Gate. Die Logik steht rein in `scripts/lib/change-size.ts` (Eingabe: `git diff --numstat`-Zeilen und die Liste neuer Dateien), git liegt im CLI. Wie die Schwellen begründet sind: 60 Zeilen liegt deutlich unter der Review-Schwelle von 200 Zeilen im Stop-Gate. Die Sperrliste deckt die Auslöser für ein Arch-Review ab (neue Abhängigkeit, Schema) und alles, was Gates verändert.

### A2 Ablauf einer Kleinänderung

- Der Agent schätzt vorab nach A1 ein. Vor dem Commit bestätigt er die Einschätzung mit `node scripts/change-size.ts`. Lautet die Antwort „nein“, schreibt er vor dem Commit einen Plan und lässt `/plan-review` laufen, wie bisher. Die Umsetzung bleibt so lange uncommittet.
- **Kein Plan-Dokument, kein `/plan-review`.** Der Plan steht im Commit-Text als Abschnitt `Plan:` mit drei bis sechs Zeilen: Anlass, Änderung, Test. Ein Fremder muss den Commit damit nachvollziehen können.
- Test-first für Domänenlogik, `pnpm verify` und die E2E-Pflicht (Teil B) gelten unverändert.
- `/arch-review` entfällt. Nach A1 wird keiner seiner Auslöser erreicht.
- Bei UI: `/browser-review` lokal, nur für die betroffenen Ansichten (`--views=…`), aber mit der vollen Checkliste. Live genügt der Kurzcheck aus A3.

### A3 Sichtprüfung vor dem Push, live nur Kurzcheck (für alle UI-Änderungen)

- Die volle `/browser-review` läuft **lokal, vor dem Commit** (Ziel „lokal“ im Skill, Fixture-Daten). Sie wartet nicht mehr auf CI und Deploy.
- Nach dem Deploy folgt `/browser-review live` als **Kurzcheck**:
  1. `meta.json` zeigt den Commit.
  2. `node scripts/screenshots.ts https://zwergenplan.app/ --views=<betroffene Ansichten>`, davon mindestens 390×844 hell und dunkel ansehen.
  3. Mit claude-in-chrome einmal die geänderte Interaktion auf 390 px Breite ausprobieren. Dabei Konsole und Service Worker prüfen. Den Service Worker gibt es nur im Deploy-Build, der Fixture-Build hat keinen (Review m6).

  Die Checkliste wird live nur noch für Punkte beantwortet, die von echten Daten abhängen: lange Titel, leere Zustände, Bilder.
- Größere Änderungen behalten Plan, `/plan-review` und `/arch-review` wie bisher. Nur die Sichtprüfung wandert vor den Push.

### A4 Dateien

- `CLAUDE.md`, „Arbeitsweise“: Schritt 1 bekommt die Ausnahme für Kleinänderungen mit Verweis auf A1 und `scripts/change-size.ts`. Schritt 2 gilt nicht für Kleinänderungen. Schritt 5 wird zu „lokal vor dem Commit, live Kurzcheck“.
- `.claude/skills/browser-review/SKILL.md`: In Abschnitt 1 wird „live“ zum Kurzcheck (A3), die Checkliste in Abschnitt 4 gilt für das Ziel „lokal“. Die Beschreibung in der Frontmatter wird angepasst.
- `.claude/skills/plan-review/SKILL.md`: ein Satz, dass Kleinänderungen (A1) ohne Plan auskommen.
- Neu: `scripts/change-size.ts` und `scripts/lib/change-size.ts` mit Test `scripts/lib/change-size.test.ts`.

### A5 Tests Teil A

`scripts/lib/change-size.test.ts`, zuerst rot:

- 60 Zeilen ergeben „ja“, 61 Zeilen „nein (61 Zeilen > 60)“.
- Hinzugefügte Testzeilen und Doku zählen nicht, gelöschte Testzeilen schon.
- Ein hinzugefügtes `test.skip(` ergibt „nein“.
- Eine ungetrackte, ignorierte Datei zählt nicht als neu, eine ungetrackte, nicht ignorierte schon. Getestet wird das über `tempRepo()` (CLAUDE.md, „git in Tests“), die reine Funktion bekommt dafür nur Listen.
- Eine neue Datei `src/ui/X.tsx` ergibt „nein (neue Datei …)“, eine neue Datei `src/ui/X.test.ts` dagegen „ja“.
- Jeder Eintrag der Sperrliste ergibt „nein“ (Tabelle).
- Binärdateien (`-\t-` in numstat) zählen als „nein“, Grund unbekannte Größe.
- Umbenennungen (`--no-renames`) zählen als gelöschte plus neue Datei.

## Teil B – E2E nach Diff

### B1 Entscheidung und Garantie

| Ort | E2E |
|---|---|
| lokal | `pnpm e2e:local --affected` wählt die Specs aus dem Diff zu `merge-base HEAD origin/main` plus Arbeitsbaum. Es läuft auf `pixel-7`, wie bisher |
| CI, Push auf einen Branch außer `main` | nur die gewählten Specs, auf allen Geräten beider Engines |
| CI auf `main`, Pull Request, `workflow_dispatch` | **volle Suite**, unverändert. Davor steht der Doku-Pfad aus ADR 0021, Teil B |

Die Garantie aus ADR 0021, Nr. 10 bleibt: Ausgeliefert wird nur, was auf `main` voll grün ist. Die Auswahl beschleunigt nur und ist kein Gate. Übersieht sie eine Spec, wird `main` rot und nichts geht live. Der Preis ist ein roter `main`-Lauf. Ein neues **ADR 0023** hält drei Dinge fest: die Abkehr vom Verworfen-Punkt „automatische Auswahl von E2E-Specs“ in ADR 0021, die Sichtprüfung vor dem Push (A3) und den Ablauf ohne Plan (A2). Nachträge mit Verweis auf ADR 0023 bekommen:

- ADR 0021: Nr. 8, ein grüner Push-Lauf auf einem Branch ist nicht mehr voll geprüft.
- ADR 0004: Sichtprüfung „nach Deploy“ und „volle Suite auf jedem Branch“ (Review M4).

ADR 0021 nannte zwei Einwände. So begegnet ihnen der Plan:

- „Es gibt keinen Import-Graphen.“ Der Graph wird bei jedem Lauf aus den Quelltexten berechnet. Die Specs deklarieren nur, welche Ansichten sie treiben (B3). Specs, die selbst etwas importieren (`e2e/fixtures.ts`, `e2e/real-data.ts`), hängen direkt im Graphen.
- „Eine Zuordnung veraltet.“ Wächtertests (B6) machen eine veraltete Zuordnung rot, und eine Lücke fängt die volle Suite auf `main`.

### B2 Importgraph (`scripts/lib/import-graph.ts`, rein, nur Node-Builtins)

- `importsOf(file, source)` liefert die aufgelösten Repo-Pfade aller **relativen** Spezifizierer in diesen Formen: `import … from "…"`, `import "…"`, `export … from "…"`, `import("…")` und `import type …`, auch mehrzeilig. Ein Querystring wird abgeschnitten (`maplibre-gl-worker.mjs?worker&url` ist ohnehin nicht relativ). Paket-Spezifizierer werden ignoriert. Das Projekt importiert mit expliziter Endung (`./App.tsx`), aufgelöst wird deshalb ohne Endungs-Suche.
- `reverseClosure(graph, changed)` liefert die geänderten Dateien plus alle Dateien, die sie transitiv importieren.
- Eingelesen werden die getrackten Dateien (`git ls-files`) mit der Endung `.ts`, `.tsx`, `.mts` oder `.css`, und zwar unter `src/`, `e2e/` und `scripts/` sowie die Konfigurationsdateien im Wurzelverzeichnis (`*.config.ts`, `playwright.devices.ts`). Neue, ungetrackte Dateien kommen lokal dazu. Das Einlesen (fs, git) steht in `scripts/lib/import-graph-io.ts`, damit `import-graph.ts` rein bleibt.

### B3 Zuordnung (`scripts/lib/e2e-map.ts`, nur Daten)

```ts
/** Je Spec: welche Dateien sie über die Oberfläche treibt. RegExp auf Repo-Pfade wie in change-class.ts. */
export const SPEC_COVERS: Record<string, readonly RegExp[]> = {
  "e2e/karte.spec.ts": [/^src\/ui\/(karte|map)\//, /^src\/ui\/MapPanel\.tsx$/],
  "e2e/app.spec.ts": [/^src\/ui\/App\.tsx$/, /^src\/main\.tsx$/],
  // … jede Spec in e2e/, auch mit leerer Liste
};
/** Ist ein GEÄNDERTER Pfad einer davon, läuft die volle Suite. Gilt nicht für die Hülle (Review 2, M1). */
export const FULL: readonly RegExp[] = [/* package.json, pnpm-lock.yaml, .nvmrc, index.html, public/, tests/fixtures/,
  .github/, tsconfig*.json, vite.config.ts, playwright.config.ts, playwright.devices.ts, site.config.ts,
  scripts/build-data.ts, src/**\/*.css */];
/** Ohne E2E, wenn die Hülle keine Spec erreicht: Doku (isDocPath), Unit-Tests, Pipeline, Push-Worker. */
export const NO_E2E: readonly RegExp[] = [/\.test\.tsx?$/, /^scripts\/(pipeline|transit)\//, /^docs\//, /^\.claude\//,
  /^data\//, /^push-worker\//];
/** Smoke-Specs laufen im Projekt mit echten Daten (Job smoke). */
export const SMOKE_SPECS = ["e2e/smoke.spec.ts", "e2e/font-swap.smoke.spec.ts"];
```

Beim Ausfüllen gilt: Eine Spec nennt die Ansichts-Module, deren Verhalten sie prüft. `scripts/build-data.ts` steht bei den Specs, die seine Ausgaben lesen (ICS, Vorschauseiten, `site.json`, `wegzeit.json`, also etwa detail, saved, teilen, startpunkt und anbieter), und bei den Smoke-Specs. Erreicht eine Domänenänderung `build-data.ts` nur über die Hülle, wählt sie also diese Specs, nicht die volle Suite (Review 2, M1). Die Querschnitts-Specs (`mobile-ux`, `layout`, `theme`) nennen die globale Hülle der Oberfläche (`Chrome.tsx`, `Sheets.tsx`, `Overlays.tsx`, `Dialog.tsx`, Styles), nicht jedes Ansichtsmodul. Sonst liefen sie bei jeder Änderung. Die Datei `App.tsx` nennt nur `app.spec.ts`. Weil jedes UI-Modul `App.tsx` erreicht, läuft `app.spec.ts` bei jeder Änderung in `src/` mit, und das ist gewollt: Es ist der Kern. Die Zuordnungen aus der bisherigen Tabelle in `CLAUDE.md` werden übernommen: `scripts/lib/(share-pages|og-card|og-engine).ts` und `scripts/og-images.ts` gehören zu `teilen.spec.ts` und zu den Smoke-Specs, `src/sw/` und `scripts/vite-sw.ts` zu `pwa.spec.ts` (und `push.spec.ts`, soweit es `src/sw/` treibt), `data/` zu den Smoke-Specs. Den Rest legt der Umsetzer aus `goto`-Zielen und Interaktionen jeder Spec fest. Die Begründung steht als Kommentar je Eintrag.

### B4 Auswahl (`scripts/lib/e2e-select.ts`, rein)

`selectSpecs(changed, graph, map, specFiles)` liefert `{ kind: "none" }`, `{ kind: "full", reason, device, smoke }` oder `{ kind: "specs", device: string[], smoke: string[] }`. Auch bei `full` werden die Specs aus Schritt 3 berechnet. Lokal läuft dann mehr als nur die Stellvertreter (Review M2).

1. Die Hülle H ist `reverseClosure(graph, changed)`.
2. Trifft ein **geänderter** Pfad ein Muster aus `FULL`, ist das Ergebnis `full`. Der Grund nennt den Pfad. Die Hülle zählt hier nicht: `scripts/lib/share-pages.ts` erreicht zwar `scripts/build-data.ts` und `scripts/vite-sw.ts` erreicht `vite.config.ts`, beide wählen aber über `SPEC_COVERS` (teilen plus Smoke, pwa).
3. Gewählt werden die Specs aus `specFiles`, die in H liegen (geänderte Spec, geänderte Helfer wie `e2e/fixtures.ts` → alle Specs, die sie importieren), dazu die Specs, bei denen ein Muster aus `SPEC_COVERS` einen Pfad in H trifft.
4. Fällt ein geänderter Pfad unter keine Regel (keine Spec aus seiner Hülle, nicht in `NO_E2E`, nicht `isDocPath`), ist das Ergebnis `full` (fail-safe, wie Stufe C). Den Grund nennt der Pfad. Beispiel: eine neue Datei in `src/`, die noch niemand importiert, oder eine unbekannte Endung.
5. Ist keine Spec gewählt, ist das Ergebnis `none`. Sonst `specs`, aufgeteilt in Geräte-Specs und `SMOKE_SPECS`.

Das CLI `node scripts/e2e-select.ts [--base <ref>] [--json]` gibt die Auswahl mit Gründen aus und dient lokal zum Nachsehen.

### B5 Einbindung

**Lokal** (`scripts/e2e-local.ts`, `scripts/lib/e2e-args.ts`): Der neue Modus `--affected` (neben Specs und `--all`) berechnet die Auswahl.

- `none` → Meldung, Exit 0.
- `specs` → wie der Spec-Modus. Sind es mehr als **8** Geräte-Specs, laufen lokal nur die Specs, deren Muster einen **geänderten** Pfad selbst treffen, dazu die Stellvertreter `e2e/app.spec.ts` und `e2e/theme.spec.ts`. Der Rest bleibt der CI überlassen, ADR 0021, Nr. 5 gilt weiter (Review 2, M1). Smoke-Specs laufen lokal nur mit `--smoke`, denn sie brauchen den Deploy-Build mit Kachelbildern. Die CI fährt sie ohnehin (Review 2, m7).
- `full` → Lokal läuft nie alles (ADR 0021, Nr. 5). Gemeldet wird „volle Auswahl (<Grund>), lokal nur Auswahl plus Stellvertreter, den Rest prüft die CI“. Dann laufen auf `pixel-7` die Specs aus `device` (B4, Schritt 3, mit derselben Obergrenze von 8) und dazu `e2e/app.spec.ts` und `e2e/theme.spec.ts`. Damit prüft `--affected` mindestens so viel wie die bisherige Tabelle in `CLAUDE.md`: Eine Änderung an `share-pages.ts` fährt `teilen.spec` plus Smoke, eine an `vite-sw.ts` fährt `pwa.spec` (Review M2).

`--affected` wird der Standard-Aufruf in `CLAUDE.md`. Specs von Hand zu nennen geht weiter.

**CI** (`.github/workflows/ci.yml`, `scripts/ci-scope.ts`, `scripts/lib/ci-scope.ts`):

Die Matrix bleibt **statisch** wie heute: Chromium mit 4 Shards, WebKit mit 2 (Review M1). Playwright shardet die Tests nach dem Spec-Filter, ein leerer Shard endet dank `--pass-with-no-tests` grün. Ein einzelner Shard für ein Drittel der Suite wäre langsamer als heute. Eine dynamische Matrix entfällt deshalb, ebenso `fromJSON` und eine Änderung an `playwright.config.ts`.

- **Ausgaben von `scope`**, zusätzlich zu `full`:
  - `e2e`: `full`, `select` oder `none`
  - `specs`: die Geräte-Specs, durch Leerzeichen getrennt
  - `devices`: `true` oder `false`, ob es Geräte-Specs gibt (Review B1)
  - `smoke`: `true` oder `false`
- **Alle Ausgaben in einem einzigen `appendFileSync`**, sonst wäre `e2e=select` ohne `specs` und `devices` möglich (Review 2, m4).
- **Wann `select` oder `none`**: nur bei `event: push` auf einer Ref außer `refs/heads/main`. Der Diff läuft dann von `git merge-base origin/main HEAD` bis `HEAD`, also über den ganzen Branch und nicht nur über den letzten Push. `fetch-depth: 0` liefert `origin/main`. Jeder Fehler (kein `origin/main`, eine Ausnahme) ergibt `e2e=full`, nie Rot.
- **Ohne `pnpm install`**: `scope` läuft weiter so, die neuen Module nutzen nur Node-Builtins (`fs`, `child_process`, `path`). Die Regel `ci-scope-builtins-only` in `.dependency-cruiser.cjs` bekommt `import-graph`, `import-graph-io`, `e2e-map` und `e2e-select`, und zwar in `from.path` **und** in `to.pathNot`.
- **Rückfallwerte im Job selbst**, falls der Schritt mit `continue-on-error` keine Ausgabe liefert (Review B2):
  - `e2e: ${{ steps.scope.outputs.e2e || 'full' }}`
  - `specs: ${{ steps.scope.outputs.specs || '' }}`
  - `devices: ${{ steps.scope.outputs.devices || 'true' }}`
  - `smoke: ${{ steps.scope.outputs.smoke || 'true' }}`
- **Job `e2e`**:
  - Matrix wie heute.
  - `if`: `needs.scope.outputs.full == 'true' && (github.ref == 'refs/heads/main' || needs.scope.outputs.e2e == 'full' || needs.scope.outputs.devices == 'true')`. Auf `main` läuft der Job so unabhängig von `scope` (Review 2, m3).
  - Die Spec-Liste kommt über `env`, nicht direkt in `run`, damit kein Dateiname Shell-Code einschleust (Review m3): `SPECS: ${{ needs.scope.outputs.e2e == 'select' && github.ref != 'refs/heads/main' && needs.scope.outputs.specs || '' }}`. Der Schritt ruft `pnpm exec playwright test $SPECS --shard=… --workers=2 --pass-with-no-tests` auf. `$SPECS` steht absichtlich ohne Anführungszeichen, damit es in Wörter zerfällt. Die Dateinamen sind zuvor in `ci-scope.ts` gegen `^e2e/[a-z0-9.-]+\.spec\.ts$` geprüft; ein Name außerhalb des Musters ergibt `e2e=full`. Auf `main` ist `SPECS` immer leer, auch wenn `scope` sich irrt.
- **Job `smoke`**: läuft bei `full == 'true'` immer, weil Deploy-Build, `size` und Pages-Artefakt dort liegen. Der Schritt „Smoke mit echten Daten“ läuft nur bei `github.ref == 'refs/heads/main' || e2e == 'full' || smoke == 'true'`. „Schrift-Swap“ läuft mit `always() && (…)` unter derselben Bedingung, damit die Werte gerade bei rotem Smoke da sind (Review 2, m1).
- **Job `gates`**: Die Logik wandert aus dem Shell-Skript in `scripts/ci-gates.ts`, das nur Node-Builtins nutzt. Die Eingaben (Ref, `full`, `e2e`, `devices`, `smoke` und die Ergebnisse der Jobs) kommen über `env`, die Entscheidung steht rein in `scripts/lib/ci-gates.ts` und wird als Tabelle unit-getestet (Review 2, M2). Die Regeln:
  - Auf `main` mit `full == 'true'` muss `e2e == 'full'` gelten, und `check`, `e2e` und `smoke` müssen `success` sein.
  - Auf Branches ist ein übersprungenes `e2e` nur bei `e2e == 'none'` oder `devices == 'false'` in Ordnung (Review 2, m2). Sonst muss es `success` sein.
  - Bei `full == 'false'` gilt der Doku-Pfad wie heute.
- **`deploy`**: zusätzlich die Bedingung `needs.scope.outputs.e2e == 'full'`. Die Garantie hängt so nicht an einer einzigen Stelle.
- **Kanarienvogel**: Den Fall `main` mit `e2e=select` deckt die Tabelle in `ci-gates.test.ts` ab, er muss rot sein. Die YAML-Bedingungen von `e2e`, `smoke` und `deploy` prüft ein Unit-Test als Textabgleich gegen `ci.yml`. Eine Eingabe für `workflow_dispatch`, die nur der Abnahme dient, gibt es nicht (Review 2, M2).

### B6 Wächter (laufen in `check:fast`)

`scripts/lib/e2e-map.test.ts`, mit git nur über `withoutGitEnv()` (CLAUDE.md, „git in Tests“, Review m1):

1. Jede Datei `e2e/*.spec.ts` hat einen Eintrag in `SPEC_COVERS`, und jeder Eintrag ist eine existierende Spec. So wird eine neue Spec ohne Zuordnung rot.
2. Jedes Muster in `SPEC_COVERS`, `FULL` und `NO_E2E` trifft mindestens eine getrackte Datei. Wird eine Datei umbenannt, bleibt keine tote Zuordnung zurück.
3. Jedes Nicht-Test-Modul unter `src/ui/` und `src/sw/` wird von einem Muster aus `SPEC_COVERS` getroffen, und zwar nicht nur von dem für `app.spec`. Sonst stünde es in einer benannten Ausnahmeliste mit Begründung. Über die Hülle erreichte jede Datei `App.tsx`, der Wächter wäre also immer grün (Review 2, m5). Ausgenommen sind Module, die nur Tests importieren, etwa `src/domain/test-fixtures.ts`. Sie stehen in einer benannten Liste mit Begründung, und der Wächter prüft, dass sie wirklich nur aus Tests importiert werden.
4. Die Smoke-Specs passen zu `testMatch` des Smoke-Projekts (`/smoke\.spec\.ts/`).

Graph-Kanarienvogel in `scripts/check-architecture.ts`, gebaut aus dem dort schon vorhandenen depcruise-JSON: Für jede Kante zwischen zwei lokalen Modulen (ohne `core` und `npm`) muss `importsOf(quelle, inhalt)` das Ziel liefern. Geprüft wird je Datei, nicht gegen den eingelesenen Graphen, denn depcruise cruist auch `.claude/hooks` und `push-worker` (Review 2, m6). Fehlt eine, wird das Gate rot mit „Importgraph der E2E-Auswahl übersieht A → B“. Das fängt Import-Formen, die der Regex nicht kennt. Dependency-cruiser cruist dort `src`, `scripts`, `e2e`, `.claude/hooks` und `push-worker`, aber nicht die Konfigurationsdateien im Wurzelverzeichnis. Deren Importe (`vite.config.ts` → `scripts/vite-sw.ts` und weitere) prüft ein Unit-Test in `import-graph.test.ts` gegen eine feste Erwartung (Review m2).

### B7 Tests Teil B (zuerst rot)

- `import-graph.test.ts`: alle Import-Formen aus B2, mehrzeilig, Kommentare mit `import` darin (kein Treffer), Querystring, Paket-Spezifizierer ignoriert, `../` aufgelöst, Zyklus in `reverseClosure` terminiert, die Importe von `vite.config.ts`.
- `e2e-select.test.ts` mit einem kleinen Fake-Graphen:
  - Ansichtsmodul → seine Spec plus `app.spec`
  - `e2e/fixtures.ts` → alle Specs
  - nur Unit-Test → `none`
  - nur Doku → `none`
  - `tests/fixtures/x.json` → `full`
  - unbekannte Datei → `full` mit Grund
  - `data/offers.json` → nur Smoke, also `devices` leer
  - `scripts/lib/og-card.ts` → teilen plus Smoke
  - `scripts/lib/share-pages.ts` → nicht `full` (B4, Schritt 2: die Hülle zählt für FULL nicht), `device` ⊇ teilen, dazu Smoke
  - `scripts/vite-sw.ts` → nicht `full`, `device` ⊇ pwa
  - ein geänderter FULL-Pfad (`scripts/build-data.ts`, `vite.config.ts`) → `full`, die Auswahl ist trotzdem berechnet
  - geänderte Spec → nur diese
  - `src/domain/agenda.ts` → nicht `full`
  - `push-worker/src/x.ts` → `none`
- `e2e-select.test.ts` mit dem **echten** Graphen des Repos (Review 2, M1): `src/domain/agenda.ts` und `src/domain/time.ts` ergeben nicht `full`, die lokale Auswahl nach Obergrenze hat höchstens 8 Specs, `src/ui/karte/`-Module wählen `karte.spec`.
- `ci-gates.test.ts`: Tabelle mit main/full/alle grün → grün; main/`e2e=select` → rot; main/`e2e` übersprungen → rot; Branch/`e2e=select`/`devices=true`/übersprungen → rot; Branch/`devices=false`/übersprungen → grün; Doku-Pfad wie heute.
- `ci-scope.test.ts`, erweitert:
  - Branch-Push mit Auswahl → `e2e=select`, `specs`, `devices=true`
  - Branch-Push nur mit `data/` → `e2e=select`, `devices=false`, `smoke=true`
  - `main` → `e2e=full`
  - PR → `full`
  - fehlendes `origin/main` → `full`
  - Spec-Name außerhalb des Musters → `full`
  - alle Ausgaben in einem Schreibvorgang
  - Bedingungen von `e2e`, `smoke` und `deploy` in `ci.yml` als Textabgleich
- `e2e-args.test.ts`: `--affected` parsen, mit Specs kombiniert ist es ein Fehler.

**Abnahme in CI** (Branch `plan-0029-probe`, danach löschen):

1. Ein Push, der nur eine Zeile in `src/ui/karte/` ändert:
   - Der Hinweis von `scope` zeigt `e2e=select` und die Spec-Liste.
   - Die E2E-Shards fahren nur diese Specs.
   - Die Dauer wird gegen den heutigen Lauf (etwa 10 min) notiert.
2. Ein Push, der nur `data/` ändert, zeigt `devices=false`: kein E2E-Job, nur Smoke. Die Handänderung an `data/` ist eine ausdrückliche Ausnahme von CLAUDE.md, „Daten“: Sie bleibt auf dem Probe-Branch, kommt nie nach `main`, und der Branch wird gelöscht (Review 2, m8).
3. Ein Push, der nur `tests/fixtures/` ändert, zeigt `e2e=full`.
4. Der Fast-Forward der Umsetzung nach `main` läuft voll und ist grün.

Die Dauer der Läufe 1 und 4 kommt in den Abschnitt Ergebnis.

### B8 Dateien

- Neu in `scripts/lib`:
  - `import-graph.ts`, `import-graph-io.ts`
  - `e2e-map.ts`, `e2e-select.ts`, `ci-gates.ts`
  - die Tests dazu
- Neu: die CLIs `scripts/e2e-select.ts` und `scripts/ci-gates.ts`
- Geändert:
  - `scripts/e2e-local.ts`, `scripts/lib/e2e-args.ts`
  - `scripts/ci-scope.ts`, `scripts/lib/ci-scope.ts`
  - `.github/workflows/ci.yml`, `.dependency-cruiser.cjs`, `scripts/check-architecture.ts`
- Doku:
  - ADR 0023 und die Nachträge in ADR 0021 und ADR 0004 schon in Etappe 1 (Review 2, m9), hier nur der Stand „Teil B umgesetzt“
  - `CLAUDE.md`: Tabelle „E2E lokal“ wird zu `--affected`, CI-Absatz „volle Suite nur auf `main`“
  - `docs/architecture.md`, falls es die E2E-Gates beschreibt

## Etappen

1. **Teil A**: A1–A5, also das Skript, die Tests und die Doku, dazu ADR 0023 samt Nachträgen. Danach `pnpm verify`, Commit, Push.
2. **B2–B4 mit Tests**: rein, ohne Einbindung. Danach `pnpm verify`.
3. **B5 lokal**, also `--affected`. Danach `pnpm verify`. Abnahme: `pnpm e2e:local --affected` auf einem Arbeitsbaum mit einer Änderung in `src/ui/karte/` wählt die erwarteten Specs und fährt sie grün.
4. **B5 CI und B6**. Danach `pnpm verify` und `pnpm exec playwright test --list` (Summe unverändert gegenüber vorher, `playwright.config.ts` bleibt unberührt), dann die Abnahme in CI aus B7.
5. **Doku aus B8**, dann `/arch-review` (neue Module, mehr als 200 Zeilen, CI-Änderung). Danach Fast-Forward nach `main`, der volle Lauf auf `main` muss grün sein.

## Nicht geändert

- `check:fast`, Stop-Gate, pre-commit, Stufe 0/C, Doku-Pfad der CI.
- `/arch-review` für größere Änderungen, Schwelle 200 Zeilen.
- Auf `main` laufen weiterhin alle Geräte und Engines vor dem Deploy.

## Risiken

- **Auswahl übersieht eine Spec**: `main` wird rot, nichts geht live, und ein zusätzlicher Lauf kostet etwa 10 min. Gegenmittel sind die Wächter in B6 und die fail-safe-Regel in B4.4. Tritt das mehr als einmal auf, wird die Zuordnung der betroffenen Spec erweitert.
- **Kleinänderung wird zu großzügig ausgelegt**: A1 ist objektiv bis auf das Mockup. Das Stop-Gate erinnert weiterhin ab 200 Zeilen an `/arch-review`.
- **Arbeit direkt auf `main`**: Dort ändert Teil B an der CI-Dauer nichts. Lokal wählt `--affected` die Specs, und Teil A spart die Wartezeit für die Sichtprüfung.

## Restpunkte (nicht in diesem Plan)

- Punkt 1 der Analyse: die Flakes in CI.
  - WebKit `Worker failed to load` im Konsolenwächter (`e2e/fixtures.ts`), in den Läufen zu `497819d` und `e0b2ab5`.
  - Der OpenFreeMap-Mock-Test (`59de3ef`).
  - `ENOTEMPTY` in `scripts/heavy.test.ts` (`bbe5830`, `117767b`).
- Punkt 3: einen Cache für den Build von `dist-e2e/` in `e2e:local`.
- `gh run rerun --failed` statt neuem Push als Hinweis in `CLAUDE.md`.

## Ergebnis

### Teil B, Etappen 2–4 (2026-10-09, Branch `plan-0029-teil-b`)

- **Importgraph**: `importsOf` findet alle 845 lokalen Kanten, die dependency-cruiser in `src`, `scripts`, `e2e`, `.claude/hooks` und `push-worker` findet. Der Kanarienvogel in `scripts/check-architecture.ts` hält das fest.
- **Zuordnung**: alle 22 Specs mit Begründung je Eintrag in `scripts/lib/e2e-map.ts`. Ausnahme nach B6.3 ist nur `src/ui/App.tsx` (steht nur bei app.spec), `TEST_ONLY` ist `src/domain/test-fixtures.ts`.
- **Abweichungen vom Plantext**:
  - B7 nannte für `share-pages.ts` und `vite-sw.ts` noch `full`. Nach B4, Schritt 2 (Review 2, M1) wählen beide über die Zuordnung. Die Tests und B7 folgen B4.
  - `NO_E2E` umfasst über B3 hinaus ganz `scripts/` (statt nur `pipeline/` und `transit/`), `schema/`, `design/`, die Konfiguration der statischen Gates und der Unit-Tests sowie `src/env.d.ts`. Was der Build ausführt, erreicht seine Specs über den Graphen (`build-data.ts`, `og-images.ts` und `vite-sw.ts` stehen in `SPEC_COVERS`). Ein neuer Build-Schritt braucht `package.json` und läuft damit voll. Ohne diese Erweiterung hätte jedes Gate-Skript die volle Suite ausgelöst.
  - `FULL` nennt zusätzlich `e2e/global-setup.ts`. Keine Spec importiert die Datei, sie fiele sonst über B4.4 ohnehin auf `full`.
  - `node scripts/e2e-select.ts <pfad …>` wertet genannte Pfade ohne `git diff` aus. Damit ist die Tabelle unten entstanden.
- **`playwright test --list`** vor und nach der Umsetzung: 2940 Tests in 22 Dateien, `PW_SUITE=chromium` 2332, `webkit` 583, `smoke` 25. `playwright.config.ts` ist unverändert. Nach dem Rebase auf Plan 0025, Etappe 3 (`calendar.spec.ts` wurde zu `merkliste-kalender.spec.ts`, `CalendarView.tsx` zu `SavedCalendar.tsx`; die Wächter haben beides gemeldet): 3050 Tests in 22 Dateien, chromium 2420, webkit 605, smoke 25.
- **Lokale Abnahme (Etappe 3)**: Mit einer Kommentarzeile in `src/ui/karte/place-format.ts` wählte `pnpm e2e:local --affected --base HEAD` app, karte und saved (saved über `MapPanel.tsx`, die Karte der Merkliste). 65 Tests auf `pixel-7` waren grün, in 49 s. Bei reiner Doku endet `--affected` mit „keine Spec lokal zu fahren“, ohne die Sperre zu nehmen.

- **Nacharbeit aus dem Arch-Review**:
  - M1: `--pass-with-no-tests` steht nur noch mit Auswahl (`${SPECS:+--pass-with-no-tests}`). Auf `main` wäre ein leerer Lauf der vollen Suite sonst grün. Der Textabgleich hält fest, dass die Option nie ohne `SPECS` steht.
  - m1, m2: Es gibt nur noch ein `mergeBase` (`scopeGit`). `--affected` und `e2e-select.ts` melden ein fehlendes `origin/main` mit Exit 2 („--base <ref> angeben oder git fetch“), über `resolveBase`. `localChanges` hat einen Test über `tempRepo()`.
  - m4: Die Wächter sehen neue, nicht ignorierte Dateien mit, wie `--affected`. Die Begründung steht in `e2e-map.test.ts`.
  - Neuer Wächter 5: Jedes Modul, das ein Build-Einstieg erreicht (`build-data.ts`, `vite.config.ts`, `og-images.ts`, `site.config.ts`, `src/main.tsx`, `src/sw/sw.ts`, `src/sw/kill.ts`), wählt Specs oder `full`. Heute ist er grün. Ein Modul, das nur `vite.config.ts` importiert, macht ihn rot (Probe).

Auswahl mit dem echten Graphen (`node scripts/e2e-select.ts <pfad>`). Stand nach dem Rebase; die Testzahl gilt für alle Geräte (Summe ohne Smoke 3025).

| geänderte Datei | Art | Geräte-Specs in der CI | Smoke | lokal mit `--affected` |
|---|---|---|---|---|
| `src/ui/karte/place-format.ts` | specs | 3 (355 Tests) | – | app, karte, saved |
| `src/ui/SavedCalendar.tsx` | specs | 3 (220) | – | app, merkliste-kalender, timezone |
| `src/sw/routes.ts` | specs | 2 (170) | smoke | push, pwa |
| `src/ui/DetailDialog.tsx` | specs | 7 (2020) | – | anbieter, app, detail, layout, mobile-ux, teilen, theme |
| `src/ui/anbieter/ProviderScreen.tsx` | specs | 13 (2635) | – | app, theme, anbieter-inhalt, anbieter, merkliste-anbieter |
| `scripts/lib/share-pages.ts` | specs | 8 (1730) | beide | anbieter-inhalt, anbieter, detail, mobile-ux, pwa, saved, startpunkt, teilen |
| `src/domain/agenda.ts` | specs | 20 (3025) | beide | app, theme, merkliste-kalender |
| `src/domain/time.ts` | specs | 20 (3025) | beide | app, theme, merkliste-kalender, timezone |
| `data/offers.json` | specs | 0 | beide | – (Smoke nur mit `--smoke`) |
| `e2e/fixtures.ts` | specs | 20 (3025) | beide | app, theme |
| `tests/fixtures/offers.json` | full | – | – | app, theme |

**Beobachtung für die CI-Dauer**: Die Querschnitts-Specs mobile-ux und layout tragen 1595 der 3025 Geräte-Tests. Ihre Zuordnung nennt `Overlays.tsx`, und `Overlays.tsx` importiert fast alle Ansichten. Deshalb liegt es in der Hülle jeder Änderung an Detail, Sheets, Kind-Sheet und Anbieterübersicht, und beide Specs laufen dann mit. Domänenmodule erreichen über `scripts/build-data.ts` und `share-pages.ts` fast jede Spec. Auf Branches sparen also vor allem Änderungen an Karte, Kalender, Service Worker, Merkliste und Daten. Ob die Zuordnung der Querschnitts-Specs enger werden soll (etwa nur geänderte Hüllen-Dateien selbst statt der Hülle), entscheidet die Messung der CI-Abnahme (B7).

### Abnahme in CI (2026-10-09, B7)

Alle Probe-Branches zweigen von `eaf6169` ab, also von Teil B auf `main`. Jeder hat genau einen Wegwerf-Commit, keiner kommt nach `main`. Die Laufzeit reicht vom Start des ersten bis zum Ende des letzten Jobs.

| Lauf | Hinweis von `scope` | Ergebnis | Laufzeit |
|---|---|---|---|
| 1 `plan-0029-probe-karte` (Kommentar in `src/ui/karte/map-data.ts`) | `e2e=select devices=true smoke=false`, Specs app, karte, saved | grün, alle 6 Shards fuhren nur diese 3 Specs (z. B. WebKit 1/2: 39 Tests) | **3,2 min** (vorher etwa 10) |
| 2 `plan-0029-probe-daten` (Kommentar in `data/providers.yaml`) | `e2e=select devices=false smoke=true` | grün, E2E-Matrix übersprungen, nur Deploy-Build und Smoke | 6,2 min |
| 3 `plan-0029-probe-fixtures` (neue Datei in `tests/fixtures/`) | `e2e=full` (`tests/fixtures/probe-0029.txt`, volle Suite) | volle Suite. Rot war nur der bekannte WebKit-Flake `saved.spec.ts:438` (siehe Restpunkte), `gates` meldete „E2E ist failure bei e2e=full“ | 13,3 min |
| 4 `main` mit `eaf6169` | `e2e=full` („main: volle Suite vor dem Deploy“) | grün, deployt, `meta.json` zeigt `eaf6169` | 12,2 min (davor in der Warteschlange hinter einem Lauf einer anderen Session) |

Teil A ist live seit `df10403` (2026-10-09). Teil A hat keine UI-Änderung, ein `/browser-review` war deshalb nicht nötig.

## Review (2026-10-09) – Verdict: Überarbeiten → eingearbeitet

Übernommen:

- **B1**: Eine leere Liste der Geräte-Specs hätte die volle Suite in einem einzigen Shard gestartet. Neu ist die Ausgabe `devices`, der Job `e2e` läuft nur bei `full` oder `devices`.
- **B2**: Die Garantie hing allein an `ci-scope`. Jetzt gibt es Rückfallwerte im YAML, `SPECS` ist auf `main` immer leer, `gates` prüft auf `main` hart `e2e == full`, `deploy` hat eine zusätzliche Bedingung, und ein Kanarienvogel prüft das.
- **M1**: Die Matrix bleibt statisch, gefiltert wird mit `--pass-with-no-tests`. Die dynamische Matrix entfällt.
- **M2**: Auch bei `full` wird die Spec-Auswahl berechnet, lokal laufen die Auswahl plus die Stellvertreter. Neue Testfälle sind `share-pages` und `vite-sw`.
- **M3**: Die Sperrliste wird erweitert (`.size-limit.json`, `vitest.config.ts`, `.nvmrc`, die E2E-Helfer, die Auswahl- und Stufenlogik). Gelöschte Testzeilen zählen, `.skip`/`.only`/`biome-ignore` ergibt „nein“.
- **M4**: ADR 0023 deckt auch A2 und A3 ab. Nachträge bekommen ADR 0004 und ADR 0021, Nr. 8.
- **m1–m6**: Ausnahme für Module, die nur Tests importieren; `withoutGitEnv()`; der Kanarienvogel nutzt das vorhandene depcruise-JSON, die Konfigurationsdateien im Wurzelverzeichnis prüft ein Unit-Test; `SPECS` über `env` mit Namensmuster; `pnpm verify` und `--list` in den Etappen; neue Dateien nur über `ls-files --others --exclude-standard`; live zusätzlich der Service Worker.

Abgelehnt:

- **m7** (CI-Teil verschieben): Der Nutzer hat entschieden, dass die volle Suite nur vor dem Live-Gang laufen soll. Mit der statischen Matrix aus M1 ist der CI-Teil klein.

## Review 2 (2026-10-09) – Verdict: Freigabe mit Änderungen → eingearbeitet

Übernommen:

- **M1**: `FULL` gilt nur für direkt geänderte Pfade. `build-data.ts` wählt über `SPEC_COVERS`. Die Querschnitts-Specs nennen nur die globale Hülle der Oberfläche. Lokal gilt eine Obergrenze von 8 Specs. Ein Test mit dem echten Graphen ist dazugekommen.
- **M2**: Die Logik von `gates` steht in `scripts/ci-gates.ts` mit Tabellentest. Die Abnahme per `workflow_dispatch` entfällt.
- **m1–m10**:
  - `always()` für „Schrift-Swap“.
  - `gates` auf Branches strenger.
  - Job `e2e` auf `main` erzwungen.
  - Alle Ausgaben in einem einzigen Schreibvorgang.
  - Wächter B6.3 ohne `app.spec`.
  - Kanarienvogel je Datei, `push-worker/` in `NO_E2E`.
  - Lokaler Smoke-Lauf nur mit `--smoke`.
  - Ausnahme für `data/` auf dem Probe-Branch.
  - ADR 0023 in Etappe 1.
  - Die CLIs auf der Sperrliste.

Abgelehnt: nichts.
