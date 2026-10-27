# Plan 0052 – Browser-Installation in der CI: ab dem zweiten Versuch ohne Azure-Spiegel

Status: in Umsetzung
Datum: 2026-10-27

## Anlass

Seit dem Nachmittag des 2026-10-27 scheitert die CI wiederholt im Schritt „Playwright-Browser“ bzw. „Playwright-Chromium“ (`.github/install-browsers.sh`), nie in einem Test:

- `main`, Lauf 40556630108 (Commit `62f6180`): Versuch 1 Smoke, chromium 3/4, webkit 2/2; Versuche 2 und 3 webkit 2/2.
- Branch `s2-waechter`, Lauf 40558940546: chromium 1/4 in beiden Versuchen.
- Branch `ci-ubuntu-2404`, Lauf 40561910300: chromium 1/4 und webkit 1/2, auf `ubuntu-24.04`.

Befund aus den Logs: `playwright install --with-deps` installiert auf den Runnern rund 180 Systempakete (115 MB auf 24.04, 140 MB auf 26.04). `azure.archive.ubuntu.com` lieferte einzelne Pakete mit rund 40–100 kB/s, und alle drei Versuche à 150 s rissen. Beleg im Log von webkit 1/2 (Lauf 40561910300): `Get:2 http://azure.archive.ubuntu.com/ubuntu noble/universe amd64 fonts-ipafont-gothic … [3513 kB]` um 18:39:35, `Get:3 … fonts-freefont-ttf … [5641 kB]` erst um 18:40:58, Abbruch des Versuchs um 18:41:58; apt nennt bei der Spiegelliste den tatsächlichen Host. Andere Jobs desselben Laufs waren schnell; der Spiegel ist also zeitweise und je Runner langsam. Gemessen hatte die Installation bisher 22–37 s.

**Widerlegte erste Annahme:** Die erste Fassung dieses Plans (Commits `2e2e8d8`, `4178e40` auf dem Branch `ci-ubuntu-2404`, nie auf `main`) hielt das neue Image Ubuntu 26.04 (`ubuntu-latest` seit 2026-10-19) für die Ursache und legte die Browser-Jobs auf `ubuntu-24.04` fest. Der Branch-Lauf 40561910300 scheiterte auf 24.04 genauso. Die Festlegung ist zurückgenommen.

Dringlich: Der Nachtlauf (`nightly.yml`, Job `nachtlauf`) installiert Chromium mit demselben Skript; scheitert es, fällt die Nacht aus.

## Entscheidung

In `.github/install-browsers.sh`, nach einem gescheiterten Versuch und vor dem nächsten:

- Die Runner-Images holen Pakete über die Spiegelliste `/etc/apt/apt-mirrors.txt` (Log: `Get:1 file:/etc/apt/apt-mirrors.txt Mirrorlist`), zuerst Azure. apt weicht dort nur bei Fehlern auf den nächsten Eintrag aus, nicht bei Langsamkeit.
- Steht `azure.archive.ubuntu.com` in der Liste, wird die Zeile entfernt; bleibt die Liste leer, kommt `http://archive.ubuntu.com/ubuntu/` hinein. Der neue Inhalt steht als `::notice::` im Log.
- Annahme, im Abnahmelog zu prüfen: Fertig geladene Pakete bleiben in `/var/cache/apt/archives`, ein neuer Versuch lädt nur den Rest (kleineres „Need to get“ in Versuch 2).
- Der erste Versuch nutzt weiter Azure (im Normalfall der schnellste Weg). Folge: An einem schlechten Tag kostet jeder Browser-Job bis zu 160 s mehr, bevor gewechselt wird. Gewechselt wird nach jedem Fehlschlag, nicht nur nach einer Zeitüberschreitung; bei einem anderen Fehler (etwa am Playwright-CDN) schadet der Wechsel nicht.
- Schalter `ZP_APT_SKIP_AZURE=1`: Wechsel schon vor dem ersten Versuch. Bleibt im Skript, damit der Weg jederzeit prüfbar ist; gesetzt wird er nur zur Abnahme (unten).

Unverändert: drei Versuche à 150 s, Aufräumen von apt und dpkg, Zeitlimits des Schritts (9 Min.) und der Jobs. Kein Gate ändert sich.

**Verworfen:**
- Feste Runner-Version (`ubuntu-24.04`): widerlegt, siehe oben.
- Zeitlimit je Versuch anheben: Bei ~40–100 kB/s bräuchten 115 MB 20–50 Minuten; das verschiebt das Problem.
- Systempakete cachen (`actions/cache` über `/var/cache/apt/archives`): wirksam auch gegen einen ganz ausgefallenen Spiegel, aber mehr Aufwand (Schlüssel je Image und Playwright-Version, Rechte des Cache-Verzeichnisses). Eintrag in `docs/ideas.md`, falls der Spiegelwechsel nicht reicht.

## Dateien

- `.github/install-browsers.sh`: Funktion `skip_azure`, Wechsel vor Versuch 2 und 3, Schalter `ZP_APT_SKIP_AZURE`, Kommentar mit Befund.
- `.github/workflows/ci.yml`: nur vorübergehend der Schalter im Job `smoke` (Abnahme), vor dem Merge wieder entfernt.

Herkunft: Die Änderung liegt auf einem frischen Branch `ci-apt-spiegel` ab `origin/main`. Die Commits der widerlegten Fassung bleiben auf `ci-ubuntu-2404` und kommen nicht nach `main`.
- `docs/ideas.md`: Eintrag „apt-Pakete der Browser in der CI cachen“.

## Tests und Abnahme

- Kein Unit-Test: Das Verhalten hängt am Runner (Spiegelliste, `sudo`, apt). Lokal: `bash -n`, `shellcheck`, wenn vorhanden, und eine Simulation von `skip_azure` auf der Spiegelliste der Runner-Images (drei Zeilen mit Tab und `priority:`; Azure-Zeile weg, die übrigen bleiben; zweiter Aufruf ändert nichts; nur Azure → `archive.ubuntu.com`).
- `pnpm verify` (Stufe C). `pnpm e2e:local --affected` entfällt mit Begründung: Die Änderung betrifft nur die Installation auf dem Runner. `.github/` gehört zur vollen Auswahl (`scripts/lib/e2e-map.ts`, `FULL`), schon der Branch-Lauf fährt alle Shards plus Smoke.
- Abnahme:
  - **Weg ohne Azure geprüft:** Auf dem Branch setzt ein Commit vorübergehend `ZP_APT_SKIP_AZURE: "1"` am Schritt „Playwright-Browser“ des Jobs `smoke` in `ci.yml`. Sein Log zeigt die `::notice::`-Zeile, `Get:`-Zeilen von `archive.ubuntu.com` und eine erfolgreiche Installation. Ein zweiter Commit entfernt den Schalter wieder; erst dann Fast-Forward nach `main`.
  - Branch-Lauf ohne Neustart grün. Scheitert dort ein erster Versuch, zeigt das Log die `::notice::`-Zeile und einen erfolgreichen zweiten oder dritten Versuch.
  - Der folgende Lauf auf `main` und der nächste Nachtlauf ohne Neustart.
  - Bleibt ein Lauf trotz Wechsel rot, folgt der Cache aus „Verworfen“ als eigener Plan.

## Review (2026-10-27) – Verdict: Freigabe mit Änderungen

Keine Blocker. Übernommen:
- **M1** Der neue Weg ist vor dem nächsten Ausfall nachweisbar: Schalter `ZP_APT_SKIP_AZURE`, einmal auf dem Branch im Job `smoke` gesetzt, danach entfernt.
- **M2** Frischer Branch `ci-apt-spiegel` ab `origin/main`; die widerlegte Fassung kommt nicht nach `main`.
- **m1** Log-Beleg mit Zeilen und Zeiten; apt nennt bei der Spiegelliste den Host.
- **m2** Paket-Cache als Annahme gekennzeichnet, Prüfung im Abnahmelog.
- **m3** Folge für Versuch 1 benannt; Wechsel nach jedem Fehlschlag begründet.
- **m4** Lokale Prüfung: `shellcheck` fehlt auf dem Rechner, dafür Simulation von `skip_azure`.
- **m5** dieser Abschnitt, Status.

