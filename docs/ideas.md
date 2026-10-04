# Ideen außerhalb des Scopes

Bewusst zurückgestellt. Wer eine davon angeht, schreibt zuerst einen Plan (`docs/plans/`).

- **Eigenes LLM der Nutzer** (Claude, ChatGPT …) für die Recherche: Nutzer aktualisieren Daten selbst.
- **Anbieter vorschlagen** über ein GitHub-Issue-Template (Name, Programm-URL). Ein Agent arbeitet die Vorschläge ab.
- **Mehrere Kinder / Geschwister**: Ein Angebot passt, wenn es für eines der Kinder passt.
- **Abo-Feeds (webcal)** für vordefinierte Filter-Sets.
- **Englische Oberfläche**: Die Texte liegen zentral, damit das billig wird.
- **Live-Routing-APIs** für echte Wegzeiten. Vorrang hat die statische GTFS-Matrix (ADR 0005).
- **Visuelle Regression** (Playwright-Screenshots als Gate), sobald das Design steht. Baselines entstehen dann im Playwright-Docker-Image, plus ein `workflow_dispatch` zum Aktualisieren.
- **Lighthouse CI**, falls `@lhci/cli` wieder aktuell gepflegt wird. Bis dahin decken Playwright-Web-Vitals und axe das ab.
- **React Compiler**, sobald es Komponenten mit spürbaren Re-Render-Kosten gibt.
- **Architektur-Review in CI** über `anthropics/claude-code-action`. Braucht einen API-Key und kostet pro Lauf.
- **Erinnerung „Anmeldung öffnet“** als eigener ICS-Termin.
- **Anbieterverzeichnis auf der Website** (ersetzt das frühere `ANBIETER.md`): alle Anbieter mit Ring, Themen und Programm-Links.
- **Einstieg in laufende Kurse**: Die Liste sortiert nach dem nächsten Termin und zeigt „Kurs · noch 4 von 8“ (Plan 0003). Ob ein Quereinstieg möglich ist, wissen die Daten nicht – dafür bräuchte das Schema ein Feld.
- **Browser für den Recherche-Lauf**: Mit verbundenem claude-in-chrome werden Plätze bei Eversports, Calendly und Kurabu lesbar (im ersten Lauf `unbekannt`).
