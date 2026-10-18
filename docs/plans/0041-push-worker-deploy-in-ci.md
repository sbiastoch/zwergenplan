# Plan 0041 – Push-Worker aus der CI deployen

Status: Review eingearbeitet
Datum: 2026-10-18
Bezug:
- ADR 0014 (Web-Push), Punkt 2: „`GET /version` zeigt den deployten Commit, weil der Worker manuell deployt wird“; bekommt einen Nachtrag
- Plan 0017 (Wochen-Push), Schritt 3 (Worker-Deploy von Hand)
- Plan 0011, E11 (`/version` und Versionswarnung)
- ADR 0021/0023 (CI ist das einzige Gate vor dem Deploy, Doku-Pfad, volle Suite auf `main`)
- `docs/architecture.md`, Zeile `push-worker/` („Deploy von Hand“)

## Anlass

Der Push-Worker (`push-worker/`, Cloudflare Worker `zwergenplan-push`) wird nur von Hand mit `pnpm push:deploy` deployt. Seit dem letzten Deploy (29335c8) hat sich `src/domain/time.ts` geändert, das der Worker importiert. Jeder Lauf der Wochen-Nachricht warnt seitdem: „Push-Worker läuft mit 29335c8, der Worker-Code im Repo ist seitdem geändert: pnpm push:deploy“. Ob der Worker dem Repo entspricht, hängt also davon ab, dass jemand daran denkt.

Nutzerentscheid (2026-10-18): Der Deploy des Workers gehört in die CI.

## Ziel

Nach jedem grünen Lauf auf `main` läuft der Worker mit dem Code von `main`, einschließlich der gebündelten npm-Pakete. Deployt wird nur, wenn sich etwas geändert hat. Die Versionswarnung der Wochen-Nachricht bleibt als Rückfallprüfung.

## Änderung

### E1 – Modul `scripts/lib/push-worker-version.ts`: Quellen und Entscheidung

- **Umzug.** `WORKER_SOURCES` und `workerVersionWarning` ziehen aus `scripts/lib/push-weekly-core.ts` hierher. `sameWorkerCode(version)` zieht aus `scripts/push-weekly.ts` als Verdrahtung in das neue Skript (E2) und wird von `push-weekly.ts` importiert; dafür bekommt es eine eigene kleine Datei `scripts/lib/push-worker-git.ts`, damit das Modul aus E1 rein bleibt. Das Wurzelverzeichnis bestimmt sie selbst per `fileURLToPath(new URL("../../", import.meta.url))`, nicht über `ROOT` aus `load-data.ts`, damit sie nicht am Datenlader hängt (Review 2, m4). `sameWorkerCode` führt `git diff --quiet <version> HEAD -- …WORKER_SOURCES` aus: Ergebnis 0 heißt gleich, 1 verschieden, alles andere unbekannt. `push-weekly-core.ts` exportiert beides nicht mehr.
- **`pnpm-lock.yaml` kommt zu `WORKER_SOURCES`** (Review M1). Der Worker bündelt `zod`, und `wrangler` erzeugt das Bundle. Ein Update eines der beiden muss einen Deploy auslösen. Ein Deploy zu viel kostet nichts, denn der Worker ist bis auf KV zustandslos. `package.json` gehört nicht dazu, weil Paketversionen im Lockfile stehen.
- **Hinweistexte** in `workerVersionWarning`: statt „pnpm push:deploy“ jetzt „CI-Job „Deploy (Push-Worker)“ prüfen, sonst pnpm push:deploy“ (Review m4).
- **Ablauf als testbare Funktion** (Review M4), nach dem Muster `push-weekly-core.ts`/`push-weekly.ts`:

  ```ts
  interface WorkerDeployDeps {
    fetchVersion(): Promise<string | undefined>; // undefined bei Netz- oder JSON-Fehler
    sameCode(version: string): boolean | undefined;
    head: string;                                 // git rev-parse --short HEAD
    hasToken: boolean;                            // CLOUDFLARE_API_TOKEN gesetzt
    deploy(): void;                               // wirft bei Fehler
    sleep(ms: number): Promise<void>;
    log(line: string): void;
  }
  type WorkerDeployResult =
    | { status: "aktuell"; version: string }
    | { status: "noetig" }                        // nur bei dryRun
    | { status: "deployt"; version: string }
    | { status: "fehler"; reason: "kein-token" | "deploy" | "version" };
  runWorkerDeploy(deps, { dryRun }): Promise<WorkerDeployResult>
  ```

  1. `fetchVersion()`. Ist der Code laut `workerVersionWarning` gleich, folgt `aktuell`. Fehlt die Version, ist sie ungültig oder unbekannt oder der Code verschieden, ist ein Deploy nötig. Im Zweifel wird also deployt.
  2. Mit `dryRun` endet der Ablauf hier mit `noetig`, ohne `deploy()`.
  3. Ohne Token endet er mit `fehler/kein-token` und der Ausgabe „Secret CLOUDFLARE_API_TOKEN fehlt (README, Push)“. Leise überspringen hieße, dass niemand die fehlende Einrichtung bemerkt.
  4. `deploy()`. Wirft es, folgt `fehler/deploy`.
  5. `/version` bis zu 12-mal im Abstand von 5 s abfragen, bis es `head` meldet. Dann folgt `deployt`, sonst `fehler/version` mit „Worker meldet <x> statt <head>“.

### E2 – Skript `scripts/push-worker-deploy.ts` (Verdrahtung)

- `fetchVersion`: `GET ${PUSH_WORKER_URL}/version` mit `AbortSignal.timeout(10_000)`. Ein Fehler ergibt `undefined`.
- `deploy`: `execFileSync("pnpm", ["push:deploy"], { stdio: "inherit" })`. `--var VERSION:<HEAD>` setzt weiterhin das Paket-Skript in `package.json`, nicht dieses Skript (Review m3).
- Exit 0 bei `aktuell`, `noetig` und `deployt`, sonst Exit 1. Ausgegeben werden nur Commits und Status, keine Secrets.
- `--dry-run` macht nur die Entscheidung und braucht kein Token.

### E3 – Job `push-worker` in `.github/workflows/ci.yml`

```yaml
  push-worker:
    name: Deploy (Push-Worker)
    needs: [scope, gates, deploy]
    # Auch auf dem Doku-Pfad (deploy übersprungen, full=false): Dann ist der Worker-Code gleich dem eines voll geprüften
    # Commits, und ein vorher roter Worker-Deploy wird nicht von einem grünen Doku-Lauf überdeckt (Plan 0041, Review M2).
    if: >-
      ${{ !cancelled() && github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
      && needs.gates.result == 'success'
      && (needs.deploy.result == 'success' || (needs.deploy.result == 'skipped' && needs.scope.outputs.full == 'false')) }}
    runs-on: ubuntu-latest
    timeout-minutes: 8
    environment:
      name: push-worker
    concurrency:
      group: push-worker
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # git diff gegen den deployten Commit
          persist-credentials: false
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Worker deployen, falls sein Code sich geändert hat
        run: node scripts/push-worker-deploy.ts
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- **Wann**: auf `main` nach einem voll geprüften Pages-Deploy. Auf dem Doku-Pfad läuft der Job ebenfalls. Dann deployt er nur, wenn der Worker noch nicht dem Code entspricht, etwa nach einem vorher roten Job. Der Code entspricht dabei dem eines voll geprüften Commits, denn der Doku-Pfad greift nur, wenn seit dem live ausgelieferten Commit bloß Doku dazukam.
- **Reihenfolge**: Die Concurrency `ci-${{ github.ref }}` auf Workflow-Ebene reiht die Läufe auf `main` nacheinander ein. Ein älterer Lauf deployt also nicht nach einem neueren.
- **`!cancelled()` statt `always()`** (Review 2, m1), wie bei `gates`: Ein abgebrochener Lauf deployt nicht. Weil der Ausdruck mit `!` beginnt, steht er laut GitHub-Doku in `${{ }}`.
- **Ausnahme vom Doku-Pfad** (Review 2, M1): ADR 0021, Nr. 9, und CLAUDE.md, Schritt 6, sagen „bei `full=false` … ohne Deploy“. `push-worker` ist eine benannte Ausnahme: Er liefert nur Code eines voll geprüften Commits aus. Kosten: Jeder Doku-Commit auf `main` fährt einen Job mit `pnpm install`, etwa 1 Minute, der fast immer „aktuell“ meldet.
- **Kein Gate für die Website**: Der Job läuft nach dem Pages-Deploy, ein Fehler bei Cloudflare hält die Website also nicht auf. Der Lauf wird aber rot. Das ist gewollt: „Fertig“ heißt laut CLAUDE.md CI grün, und ein Worker mit veraltetem Code soll auffallen statt nur zu warnen. `ci-gates.ts` bleibt unverändert.
- **Secrets im Environment `push-worker`** (Review M3). Repository-Secrets stünden jedem Push-Lauf auf jedem Branch zur Verfügung, und ein Branch kann das `if:` in der YAML ändern. Das Environment `push-worker` bekommt deshalb die Deployment-Branch-Regel „nur `main`“. `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` werden dort als Environment-Secrets angelegt, nicht als Repository-Secrets. Jobs auf anderen Branches lehnt GitHub für dieses Environment ab.
- **Token-Scope** (Review M5): Startpunkt ist die Cloudflare-Vorlage „Edit Cloudflare Workers“, beschränkt auf das eigene Konto und ohne Zonen. Vor dem ersten CI-Lauf wird der Token lokal geprüft (Ablauf, Schritt 1). Was er tatsächlich braucht, wird nach diesem Test hier festgehalten.

### E4 – Doku

- ADR 0021: ein Nachtrag zu Nr. 9, „außer dem Job `push-worker`, der nur Code eines voll geprüften Commits ausliefert (Plan 0041)“. CLAUDE.md, Schritt 6, Doku-Pfad: dieselbe Ausnahme in einem Halbsatz (Review 2, M1).
- ADR 0014: ein Nachtrag „Deploy aus der CI (Plan 0041)“ mit Environment, Token-Scope und Lockfile in den Quellen. In Punkt 2 heißt es statt „weil der Worker manuell deployt wird“ künftig „zur Kontrolle des Deploys“.
- `docs/architecture.md`, Zeile `push-worker/`: „Deploy aus der CI (Job `push-worker`, nur bei geändertem Code inkl. `pnpm-lock.yaml`), von Hand weiter mit `pnpm push:deploy`“.
- README, Abschnitt Push: Environment `push-worker` mit Branch-Regel, die beiden Secrets, Deploy aus der CI. `pnpm push:deploy` bleibt für den Notfall.
- `scripts/push-weekly.ts:80`: Der Kommentar „Der Worker wird von Hand deployt“ wird berichtigt (Review m4).
- Kopfkommentar `push-worker/wrangler.toml`: Deploy aus der CI. Das ändert `WORKER_SOURCES` und löst deshalb einmal einen Deploy aus. Der erste Lauf ist damit zugleich der Abnahmetest, und `time.ts` geht dabei auch live.

## Tests (test-first)

- `scripts/lib/push-worker-version.test.ts`:
  - **Umgezogen** aus `push-weekly-core.test.ts`: die Fälle von `workerVersionWarning` und der Abgleich von `WORKER_SOURCES` mit den relativen Importen des Workers.
  - **Neu, Lockfile**: Für jeden npm-Import unter `push-worker/src` (Import ohne `.`-Präfix, ohne `node:` und ohne `cloudflare:`) muss `pnpm-lock.yaml` in `WORKER_SOURCES` stehen (Review M1). Reine `import type` zählen mit, das macht die Prüfung nur strenger (Review 2, m7).
  - **Neu, `runWorkerDeploy` als Tabelle** (Review M4):
    - Code gleich → `aktuell`, `deploy` nicht gerufen.
    - Code verschieden → `deploy` einmal, dann Abfrage mit `head` → `deployt`.
    - `fetchVersion` liefert `undefined`, `"<script>"` oder einen unbekannten Commit → Deploy nötig.
    - `dryRun` → `noetig`, `deploy` nie gerufen, auch ohne Token.
    - kein Token bei nötigem Deploy → `fehler/kein-token`, `deploy` nicht gerufen.
    - `deploy` wirft → `fehler/deploy`.
    - `/version` bleibt alt → nach 12 Versuchen `fehler/version`, `sleep` 12-mal mit 5000 ms.
    - Die neue Version kommt beim dritten Versuch → `deployt`.
- `scripts/lib/ci-scope.test.ts`, neuer Fall „push-worker: nur auf main, nach gates und deploy, auch auf dem Doku-Pfad“. Er liest `ci.yml`, schneidet den Job mit dem vorhandenen Helfer `job()` aus und normalisiert Leerraum (`replace(/\s+/g, " ")`), damit ein Umbruch im gefalteten `if:` den Abgleich nicht still bricht (Review 2, m2). Er prüft:
  - `needs` ist `[scope, gates, deploy]`.
  - `if` enthält `!cancelled()`, `refs/heads/main`, `!= 'pull_request'` und `needs.gates.result == 'success'`, die Bedingung für den Doku-Pfad wörtlich, und kein `always()`.
  - `environment.name` ist `push-worker`, und `fetch-depth` ist `0`.
  - Das Skript `scripts/push-worker-deploy.ts` wird aufgerufen.
  - `gates.needs` enthält `push-worker` nicht.
  - `CLOUDFLARE_API_TOKEN` und `environment: push-worker` (bzw. `name: push-worker` unter `environment`) kommen in keinem Workflow unter `.github/workflows/*.yml` vor außer im Job `push-worker` von `ci.yml` (Review m2; Review 2, m3: Die Branch-Regel schützt nur vor anderen Branches, nicht vor anderen Workflows auf `main`).
- Lokal: `pnpm verify` (Stufe C). E2E (Review m1): `node scripts/e2e-select.ts .github/workflows/ci.yml scripts/lib/push-worker-version.ts` meldet „E2E: volle Suite (.github/workflows/ci.yml)“, 0 Geräte- und 0 Smoke-Specs, lokal `e2e/app.spec.ts e2e/theme.spec.ts`. Lokal läuft also `pnpm e2e:local --affected`, die volle Suite fährt die CI auf `main`.
- `node scripts/push-worker-deploy.ts --dry-run` lokal: Solange der Worker auf 29335c8 steht, ist „Deploy nötig“ erwartet.

## Ablauf

1. **Einrichtung durch den Nutzer**, vor dem Push:
   1. In Cloudflare einen API-Token aus der Vorlage „Edit Cloudflare Workers“ anlegen, beschränkt auf das eigene Konto.
   2. Lokal testen, mit sauberem Arbeitsbaum (`git status --porcelain -- push-worker src/domain/time.ts src/domain/push-types.ts` leer, denn `push:deploy` bündelt den Arbeitsbaum, meldet aber HEAD; Review 2, m6): `CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… pnpm push:deploy`. Das bringt nebenbei den veralteten Worker auf den aktuellen Stand. Fehlen Rechte, nur das ergänzen, was die Fehlermeldung verlangt, und das Ergebnis in E3 eintragen.
   3. In GitHub unter Settings → Environments das Environment `push-worker` anlegen, mit der Deployment-Branch-Regel „Selected branches: main“. Dort die beiden Secrets eintragen.
2. Umsetzen (test-first), `pnpm verify`, `pnpm e2e:local --affected`, Commit und Push auf `main`.
3. Die CI beobachten. Im Job „Deploy (Push-Worker)“ wird deployt, weil sich der Kommentar in `wrangler.toml` geändert hat. Danach meldet `/version` HEAD.
4. Gegenprobe: `gh workflow run push-weekly.yml` (Trockenlauf, `dry_run` steht standardmäßig auf `true`). Im Log fehlt die Warnung „Push-Worker läuft mit …“ (Review m6).

## Risiken

- **Deployments-API**: Das Environment `push-worker` erzeugt GitHub-Deployments. `ci-scope` fragt nur `environment=github-pages` ab (`scripts/lib/ci-scope.ts`, abgesichert in `ci-scope.test.ts`). Das muss so bleiben, sonst sähe der Doku-Pfad einen Worker-Deploy als Live-Stand (Review 2, m5).
- **Token**: Er kann höchstens Worker des Kontos ändern. Erreichbar ist er nur über das Environment `push-worker`, also nur aus Läufen auf `main`, und nie aus Fork-PRs.
- **Paralleles Deploy von Hand und aus der CI**: Es gewinnt der letzte; `/version` zeigt ihn. Die Gruppe `push-worker` serialisiert nur CI-Läufe.
- **Ein `wrangler`-Update ändert das Deploy-Verhalten**: `wrangler` ist gepinnt (ADR 0014). Ein Update ändert das Lockfile und löst dadurch einen Deploy aus, den die CI beobachtet.
- **Schiefer Stand bei rotem Job**: Website neu, Worker alt. Das bleibt sichtbar, denn der Lauf ist rot, der Push-Lauf warnt, und der nächste Lauf auf `main` versucht es erneut, auch auf dem Doku-Pfad.

## Review (2026-10-18) – Verdict: Überarbeiten (kein Blocker)

Runde 1.

Übernommen:
- **M1, npm-Pakete**: `pnpm-lock.yaml` in `WORKER_SOURCES`, dazu ein Test für npm-Importe (E1, Tests).
- **M2, Doku-Pfad überdeckt roten Job**: Der Job läuft auch auf dem Doku-Pfad, die Bedingung steht im CI-Test (E3).
- **M3, Secrets**: Environment `push-worker` mit Branch-Regel `main` statt Repository-Secrets (E3, Ablauf).
- **M4, ungetesteter Ablauf**: `runWorkerDeploy` mit injizierten Abhängigkeiten, getestet als Tabelle (E1, Tests).
- **M5, Token-Scope**: Vorlage „Edit Cloudflare Workers“, vorab lokal getestet, Ergebnis wird festgehalten (E3, Ablauf).
- **m1**: E2E-Angabe aus `e2e-select` übernommen.
- **m2**: Der CI-Test prüft auch `pull_request` und das Vorkommen des Tokens.
- **m3**: Klargestellt, dass `VERSION` das Paket-Skript setzt.
- **m4**: Kommentar in `push-weekly.ts` und die Hinweistexte werden berichtigt.
- **m5**: Zeitlimit 8 Minuten.
- **m6**: Gegenprobe mit erwarteter Ausgabe.

Abgelehnt: keine.

## Review Runde 2 (2026-10-18) – Verdict: Freigabe mit Änderungen

Kein Blocker. Runde 1 ist tragfähig gelöst.

Übernommen:
- **M1, Ausnahme vom Doku-Pfad**: Nachtrag zu ADR 0021, Nr. 9, und ein Halbsatz in CLAUDE.md, Schritt 6. Die Kosten (etwa 1 Minute je Doku-Commit) sind in E3 genannt.
- **m1**: `!cancelled()` statt `always()`.
- **m2**: Der CI-Test normalisiert Leerraum.
- **m3**: Token und Environment werden in allen Workflows geprüft.
- **m4**: `ROOT` kommt in `push-worker-git.ts` aus `import.meta.url`.
- **m5**: Deployments-API unter „Risiken“.
- **m6**: Lokaler Deploy nur mit sauberem Arbeitsbaum.
- **m7**: Typ-Importe zählen mit, als Kommentar im Test.

Abgelehnt: keine.
