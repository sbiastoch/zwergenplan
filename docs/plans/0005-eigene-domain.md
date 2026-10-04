# Plan 0005 – Umzug auf zwergenplan.app

Status: freigegeben nach Review (mit Änderungen, eingearbeitet) → Umsetzung
Datum: 2026-10-04

(Plan 0004 ist für Karte und Entfernung reserviert, siehe Plan 0003, E1.)

## Ziel

- `https://zwergenplan.app/` zeigt den Zwergenplan mit echten Daten, per HTTPS mit gültigem Zertifikat.
- `https://www.zwergenplan.app/` und `https://sbiastoch.github.io/zwergenplan/` leiten auf die neue Adresse um.
- Der Basis-Pfad ist `/`. Alle Stellen, die URL oder Pfad kennen, sind angepasst, `pnpm check:fast` und CI sind grün.
- Die Entscheidung steht in ADR 0008.

## Nicht-Ziele

- E-Mail auf der Domain, Mail-Records.
- PWA-Manifest oder Service Worker (eigener Plan).
- Migration von `localStorage` vom alten Origin (ADR 0008, Konsequenzen).

## Ausgangslage

- `site.config.ts`: `BASE = "/zwergenplan/"`, `SITE_URL = https://sbiastoch.github.io/zwergenplan/`. Genutzt von `vite.config.ts`, `playwright.config.ts` und `scripts/validate-data.ts` (Plausibilität gegen den Live-Stand).
- Der App-Code nutzt nur `import.meta.env.BASE_URL` (`src/data/site.ts`). `index.html` referenziert `/data/site.json`, Vite setzt den Base davor.
- Hart kodierte Pfade: `e2e/app.spec.ts` (2×), `e2e/detail.spec.ts` (ICS-Link), `scripts/screenshots.ts` (Standard-URL).
- Doku und Skills mit Live-URL: `README.md`, `docs/architecture.md` (Datenfluss-Diagramm), `.claude/skills/browser-review/SKILL.md`, `.claude/skills/babyevents-nuernberg/SKILL.md`, `.claude/settings.json` (`WebFetch(domain:…)`).
- Pages: `build_type: workflow`, keine Custom Domain, HTTPS erzwungen.
- DNS: Porkbun-Nameserver. Apex und `www` zeigen auf die Porkbun-Parkseite (`pixie.porkbun.com`, 207.207.210.x).

## Schritte

Die Reihenfolge ist wichtig: Sobald die Custom Domain in Pages gesetzt ist, leitet github.io auf `zwergenplan.app/` um, und dort fehlen die Assets unter `/zwergenplan/…`, bis der neue Build deployt ist. Darum ist der Branch vorher fertig und grün, und der Fast-Forward folgt direkt auf das Setzen der Domain.

1. **Code** auf dem Branch `worktree-eigene-domain` (keine Domänenlogik, nur Konfiguration):
   - `site.config.ts`: `BASE = "/"`, `SITE_URL = "https://zwergenplan.app/"`.
   - `e2e/app.spec.ts`: Pfad-Erwartung `/`, Testname „liegt im Wurzelpfad“. `toHaveURL(/\/zwergenplan\/$/)` prüft jetzt Pfad `/` ohne Query.
   - `e2e/detail.spec.ts`: `^\/ics\/.+\.ics$`.
   - `scripts/screenshots.ts`: Standard `http://localhost:4173/`.
   - `scripts/validate-data.ts`: HTTP-Fehler beim Abruf des Live-Stands als `::warning::` statt Info-Zeile.
   - Doku und Skills: neue URL in README, `docs/architecture.md` (Diagramm), `.claude/skills/browser-review/SKILL.md` (lokale und Live-URL), `.claude/skills/babyevents-nuernberg/SKILL.md` (Beschreibung und Fertig-Kriterium `meta.json`), `.claude/settings.json` (`WebFetch(domain:zwergenplan.app)`). ADR 0002 bekommt Verweise auf ADR 0008 (Pfad und `robots.txt`).
   - Fertig, wenn `pnpm check:fast` und `pnpm e2e` grün sind, `rg -n 'github\.io|/zwergenplan/' --glob '!docs/plans/000[0-3]*' --glob '!data/**'` nur noch ADR 0002/0008, Plan 0005 und den alten `WebFetch`-Eintrag trifft und CI auf dem Branch grün ist.
2. **DNS bei Porkbun** (durch den Nutzer; kein API-Key, keine Browser-Verbindung):
   - Alle Parking-Records löschen: Apex `ALIAS` und `www`/`*` `CNAME` auf `pixie.porkbun.com`.
   - Apex `A`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - Apex `AAAA`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.
   - `www` `CNAME` → `sbiastoch.github.io`.
   - Fertig, wenn über `@1.1.1.1` `A` und `AAAA` die GitHub-Adressen liefern, `www` auf `sbiastoch.github.io` zeigt, eine beliebige Subdomain nichts mehr liefert und kein CAA-Record Let's Encrypt ausschließt (Stand heute: kein CAA).
3. **Pages Custom Domain**: `gh api -X PUT repos/sbiastoch/zwergenplan/pages -f cname=zwergenplan.app`. Direkt danach **Fast-Forward des Branches nach `main` und Push**, `gh run watch` bis grün. Auf diesem Deploy entfällt die Plausibilität womöglich (Zertifikat noch nicht da, `::warning::`). Das ist in Ordnung, weil sich die Daten nicht ändern.
4. **Zertifikat und HTTPS**: Warten, bis `gh api repos/sbiastoch/zwergenplan/pages` `https_certificate.state == approved` zeigt, dann `https_enforced: true` setzen bzw. bestätigen. Fertig, wenn `curl -s https://zwergenplan.app/data/meta.json` den aktuellen Stand liefert.
5. **Umleitungen prüfen** mit `curl -sI`: `https://www.zwergenplan.app/`, `https://sbiastoch.github.io/zwergenplan/?format=kurs` und `https://sbiastoch.github.io/zwergenplan/data/meta.json` liefern jeweils 301 auf `https://zwergenplan.app/…` ohne `/zwergenplan`-Präfix. `http://zwergenplan.app/` prüft nur GitHub; Browser gehen wegen HSTS-Preload nie über HTTP. Behält GitHub den Präfix, kommt `public/zwergenplan/index.html` mit `location.replace("/" + location.search)` dazu.
6. **Domain-Verifizierung** im GitHub-Konto (Settings → Pages → Verified domains, TXT `_github-pages-challenge-sbiastoch`). Das geht nur im Web-UI und ist ein Schritt für den Nutzer.
7. **`/browser-review live`** auf `https://zwergenplan.app/`.

## Risiken

- Das Zertifikat braucht nach der DNS-Umstellung bis zu etwa einer Stunde. Wegen HSTS-Preload ist die Domain bis dahin im Browser nicht erreichbar, während die github.io-Adresse ab Schritt 3 schon umleitet. → Schritt 3 erst, wenn DNS öffentlich sichtbar ist. Die Ausfallzeit für die wenigen privaten Nutzer ist hinnehmbar.
- Domain-Übernahme, falls die Custom Domain in Pages entfernt wird und die DNS-Records bleiben. → Schritt 6 (Verifizierung) und keine Wildcard (Schritt 2).

## Review (2026-10-04, plan-reviewer)

Ergebnis: Freigabe mit Änderungen, kein Blocker. Eingearbeitet:

- W1 fehlende Pfade (lokale Skill-URL, `meta.json`-Kriterium, `robots.txt`-Satz in ADR 0002): ergänzt, `rg`-Abnahme in Schritt 1.
- W2 stiller Ausfall der Plausibilität: HTTP-Fehler werden `::warning::`. Ein hartes Gate ist hier nicht sinnvoll, weil das ADR 0002 Netzfehler bewusst nicht blockieren lässt.
- W3 Reihenfolge: Code zuerst und grün, Fast-Forward direkt nach dem PUT.
- W4 Porkbun-Wildcard und CAA: Wildcard `*` → `pixie.porkbun.com` existiert und wird gelöscht. Es gibt keinen CAA-Record.
- W5 `robots.txt` + `noindex`: keine `robots.txt`, Begründung in ADR 0008.
- H1 keine User-Site `sbiastoch.github.io` vorhanden, Fallback nimmt Query mit. H2 im ADR. H4 Formulierung in Schritt 5. H5 Verifizierung ist Schritt 6.
