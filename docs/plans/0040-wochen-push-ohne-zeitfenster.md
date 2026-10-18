# Plan 0040 – Wochen-Nachricht ohne Zeitfenster, Nachholen per Hand

Status: in Umsetzung
Datum: 2026-10-18
Bezug:
- Plan 0017, E1 (Zeitplan, Wächter `shouldSendNow`, Versand-Marke)
- ADR 0014, Punkt 3 (Versand aus GitHub Actions); bekommt einen Nachtrag
- `docs/architecture.md`, Abschnitt Web-Push

## Anlass

Bisher ist keine Wochen-Nachricht an alle Abos gegangen. GitHub hat beide Zeitplan-Läufe verspätet angelegt. Am 2026-10-10 lief er um 16:26 Uhr (Lauf 38059585110), am 2026-10-17 um 14:08 Uhr Berliner Zeit (Lauf 39031350789). Geplant war jeweils 10:07 Uhr. Der Wächter `shouldSendNow` lässt nur Samstag 10–14 Uhr zu. Beide Läufe endeten deshalb grün mit „Nicht Samstag 10–14 Uhr (Berlin): kein Versand.“

Nutzerentscheid (2026-10-18): Das Zeitfenster entfällt ganz. Läuft der Workflow, soll eine Nachricht verschickt werden. Die verpasste Nachricht wird danach von Hand nachgeholt.

## Änderung

1. **Wächter entfernen.** `shouldSendNow` und `LAST_HOUR` fallen aus `scripts/lib/push-schedule.ts` weg, ebenso der Status `ausserhalb` aus `runWeekly` (`scripts/lib/push-weekly-core.ts`). `berlinDay`, `PUSH_CRON` und `PUSH_TIMEZONE` bleiben.
2. **Versand-Marke bleibt.** Sie verhindert weiter einen zweiten Versand am selben Berliner Kalendertag, etwa bei einem Re-run. Ein Re-run am Montag sendet jetzt eine Nachricht. Das ist gewollt. Der Text („neu seit letztem Samstag“) stimmt dann nur ungefähr; das nehmen wir hin.
3. **Nachholen per Hand.** In `.github/workflows/push-weekly.yml` läuft `workflow_dispatch` mit `dry_run: false` und leerer Geräte-Kennung wie ein Zeitplan-Lauf: `node scripts/push-weekly.ts`, also an alle, mit Versand-Marke und ohne `data.test`. Bisher war die Kennung dann Pflicht. Mit Kennung bleibt es beim Testversand (`--force --only=…`), Trockenlauf unverändert. Der Schritt heißt „Testversand oder Nachholen“. Die Concurrency-Gruppe ist für dieses Senden an alle `schedule` statt `test`. Die Versand-Marke ist Lesen und dann Schreiben auf Cloudflare KV, also nicht atomar. Ein Nachholen parallel zu einem Zeitplan-Lauf könnte sonst doppelt senden.
4. **Doku.** Geändert werden:
   - die Kopfkommentare in `push-schedule.ts`, `push-weekly-core.ts`, `scripts/push-weekly.ts` und der YAML;
   - `docs/architecture.md` (Web-Push) und README (Versand, Nachholen);
   - ADR 0014: ein Nachtrag, dazu in Punkt 2 „je Versandtag“ statt „je Samstag“;
   - Plan 0017, E1: ein Verweis „entfallen mit Plan 0040“.

   Der Kopfkommentar in `push-worker/src/handler.ts` („je Samstag“) bleibt bewusst stehen. Die Datei gehört zu `WORKER_SOURCES`, jede Änderung löst bis zum nächsten `pnpm push:deploy` eine Warnung aus.

## Tests

- `scripts/lib/push-schedule.test.ts`: Der Block `shouldSendNow` entfällt. `berlinDay` und der Abgleich von Cron und YAML bleiben.
- `scripts/lib/push-weekly-core.test.ts`: Der Fall „außerhalb … kein Versand“ wird zu „ein stark verspäteter Zeitplan-Lauf sendet trotzdem“. Samstag 2026-10-17 14:08 Uhr ergibt `gesendet`, drei Zustellversuche und die Marke `2026-10-17`. Der Fall „Marke schon gesetzt“ bleibt.
- `push-schedule.test.ts` liest die YAML. Bei leerem `ONLY` und ausgeschaltetem Trockenlauf muss `node scripts/push-weekly.ts` ohne `--force` aufgerufen werden. Außerdem muss das Senden an alle in der Gruppe `schedule` laufen.
- Lokal läuft `pnpm verify` (Stufe C). E2E: `node scripts/e2e-select.ts` nennt keine Geräte- und keine Smoke-Specs, nur die Grundauswahl `app` und `theme`. Weder UI noch Build sind betroffen; die CI fährt auf `main` die volle Suite.

## Ablauf nach dem Deploy

Zuerst `gh workflow run push-weekly.yml` mit `dry_run=true` starten und die Abo-Zahl prüfen. Dann `gh workflow run push-weekly.yml -f dry_run=false` (ohne `only`) und danach den Lauf mit `gh run watch <id> -i 120 --exit-status` beobachten. Die beiden verpassten Wochen werden in **einer** Nachricht nachgeholt; die Versand-Marke ließe ohnehin nur eine am Tag zu. Der allgemeine Text zählt „neu seit 7 × 24 h“, deckt die erste verpasste Woche also nicht ab. Der Zuschnitt auf dem Gerät rechnet aber gegen die dort gespeicherten gesehenen IDs (`src/sw/push-tailor.ts`) und erfasst damit beide Wochen, solange solche IDs vorliegen.

## Risiken

- Ein Re-run über Mitternacht sendet doppelt: Ein Samstagslauf und sein Re-run am Sonntag haben verschiedene Marken. Ein Re-run ist also nie harmlos. Erst prüfen, ob der erste Lauf „gesendet“ meldete.
- Ein Lauf nach Mitternacht (GitHub mehr als 14 h verspätet) sendet am Sonntag mit der Marke des Sonntags. Höchstens einer je Tag, das reicht.
- Ein irrtümlicher manueller Lauf ohne Kennung sendet an alle. Abhilfe: Der Standard bleibt `dry_run: true`, Senden an alle braucht also zwei bewusste Eingaben.

## Review (2026-10-18) – Verdict: Freigabe mit Änderungen

Kein Blocker.

Übernommen:
- **M1, `.env` ungeschützt**: Beim Commit wird jede Datei einzeln gestagt. Die Datei selbst und `.gitignore` bleiben unberührt; das entscheidet der Nutzer.
- **M2, Concurrency**: Das Senden an alle läuft in der Gruppe `schedule` (Änderung 3).
- **M3, Verzweigung ungetestet**: Ein YAML-Test kam dazu. Vor dem Senden an alle läuft ein Trockenlauf.
- **m4**: Die lokale Prüfung steht unter „Tests“.
- **m5**: Die Begründung zum Nachholen ist berichtigt.
- **m6**: README nachgezogen.
- **m7**: ADR 0014 Punkt 2 und Plan 0017 E1 nachgezogen. `handler.ts` bleibt mit Begründung stehen.
- **m8**: Re-run über Mitternacht unter „Risiken“.
- **m9**: Testname „ohne Marke“.

Abgelehnt: keine.
