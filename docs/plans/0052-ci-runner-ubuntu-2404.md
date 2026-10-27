# Plan 0052 – Jobs mit Browsern fest auf Ubuntu 24.04

Status: in Umsetzung
Datum: 2026-10-27

## Anlass

Seit 2026-10-19 stellt GitHub `ubuntu-latest` auf Ubuntu 26.04 um (actions/runner-images#14748). Seitdem scheitert die CI wiederholt im Schritt „Playwright-Browser“ (`.github/install-browsers.sh`), nie in einem Test:

- `main`, Lauf 40556630108 (Commit `62f6180`): Versuch 1 Smoke, chromium 3/4, webkit 2/2; Versuch 2 webkit 2/2. Schon `cdbadcd` (Lauf 40526210393) brauchte einen Neustart wegen webkit.
- Branch `s2-waechter`, Lauf 40558940546: chromium 1/4.

Befund aus dem Log (webkit 2/2, Versuch 2): Das Image ist `ubuntu-26.04`. `playwright install --with-deps webkit` muss dort 185 Pakete mit 140 MB nachinstallieren, die auf 24.04 vorhanden waren (gemessen dauerte die Installation dort 22–37 s). Der Azure-Spiegel lieferte einzelne Pakete mit rund 100 kB/s (`fonts-ipafont-gothic`, 3,7 MB in 65 s), und alle drei Versuche à 150 s rissen. Mit jedem weiteren Lauf ist das wieder zu erwarten; jeder Merge nach `main` hängt dann an Neustarts.

## Entscheidung

Jeder Job, der `.github/install-browsers.sh` aufruft, läuft fest auf `runs-on: ubuntu-24.04`. GitHub hält höchstens zwei GA-Images; `ubuntu-24.04` wird voraussichtlich mit der GA von 28.04 (2028) abgekündigt, mit Brownouts vorher. Das sind:

- `.github/workflows/ci.yml`: Jobs `e2e` und `smoke` (Smoke und Budgets);
- `.github/workflows/nightly.yml`: Jobs `fetch` (Modus `messen`) und `nachtlauf`;
- `.github/workflows/discover.yml`: Job `entdecken`.

Die übrigen Jobs (ohne Browser) bleiben auf `ubuntu-latest`. Jede der fünf Stellen verweist per Kommentar auf diesen Plan.

**Verworfen:**
- Zeitlimit je Versuch in `install-browsers.sh` anheben (etwa auf 600 s): Bei ~100 kB/s dauerten 140 MB über 20 Minuten, und das je Job und Lauf; die Jobgrenzen (15–20 Min.) müssten mit. Das verschiebt das Problem.
- Systempakete cachen: viel Aufwand für einen Zustand, den 24.04 schon liefert.

Kein Gate ändert sich: dieselben Specs, dieselben Grenzen; nur das Image.

## Rückweg und Wechsel auf 26.04

Ein Wechsel auf 26.04 ist ein eigener Plan, sobald ein Branch-Lauf mit allen Browser-Jobs auf `ubuntu-26.04` im ersten Versuch durchläuft und jeder Schritt „Playwright-Browser“ unter zwei Minuten bleibt; spätestens mit der Abkündigung von `ubuntu-24.04`. Er steht in `docs/ideas.md`.

Risiko: gering. LCP-Gates und Laufzeiten sind auf 24.04 geeicht; auf 26.04 ist die volle Suite nie vollständig im ersten Versuch durchgelaufen. Die Festlegung stellt den geprüften Zustand wieder her.

## Dateien

- `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`, `.github/workflows/discover.yml`: `runs-on` der fünf Jobs.
- `docs/ideas.md`: Eintrag „CI-Jobs mit Browsern auf Ubuntu 26.04“.
- `scripts/lib/browser-runner.test.ts` (neu): Wächter der Invariante.

## Tests und Abnahme

- `scripts/lib/browser-runner.test.ts`: liest alle `.github/workflows/*.yml`; jeder Job, dessen Schritte `install-browsers.sh` aufrufen, hat `runs-on: ubuntu-24.04`; mindestens fünf solche Jobs (sonst wäre der Test stumm). Ein kopierter Job mit `ubuntu-latest` wird so rot.
- `pnpm verify` (Stufe C). `pnpm e2e:local --affected` entfällt mit Begründung: Die Änderung betrifft nur das Image der Runner, lokal gibt es keins. `.github/` gehört zur vollen Auswahl (`scripts/lib/e2e-map.ts`, `FULL`), schon der Branch-Lauf fährt also alle Shards plus Smoke; das ist die eigentliche Prüfung.
- Abnahme:
  - Im Log jedes Browser-Jobs steht „Image: ubuntu-24.04“, der Schritt „Playwright-Browser“ bzw. „Playwright-Chromium“ dauert unter einer Minute (`gh run view --json jobs`).
  - Drei aufeinanderfolgende CI-Läufe (Branch und `main`) ohne Neustart.
  - Dasselbe im nächsten Nachtlauf (`nachtlauf`) und im nächsten Entdecken (`entdecken`).

## Review (2026-10-27) – Verdict: Freigabe mit Änderungen

Keine Blocker. Übernommen:
- **M1** Wächter der Invariante: `scripts/lib/browser-runner.test.ts` statt „kein Test“.
- **m1** Ende des Supports durch GitHub (höchstens zwei GA-Images), nicht Canonical.
- **m2** Risiko richtig begründet (keine Screenshot-Baselines; einzelne Jobs liefen auf 26.04 durch).
- **m3** `e2e:local --affected` entfällt mit Begründung; der Branch-Lauf fährt die volle Suite.
- **m4** Abnahme: Image im Log, drei Läufe ohne Neustart, Nachtlauf und Entdecken.
- **m5** messbare Bedingung für den Wechsel auf 26.04.

