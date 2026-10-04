# ADR 0008 – Eigene Domain zwergenplan.app

Status: angenommen (2026-10-04), ersetzt in ADR 0002 den Punkt „GitHub Pages unter `/zwergenplan/`“. Details in Plan 0005.

## Kontext
ADR 0002 legt GitHub Pages unter `https://sbiastoch.github.io/zwergenplan/` fest und nennt eine eigene Domain als optionalen Kostenpunkt. Der Nutzer hat `zwergenplan.app` bei Porkbun gekauft. Eine kurze Adresse lässt sich leichter an Freunde und Familie weitergeben als der GitHub-Unterpfad.

## Entscheidung
- Die Seite liegt unter **`https://zwergenplan.app/`**, also im Wurzelpfad. `BASE = "/"` und `SITE_URL` stehen weiterhin nur in `site.config.ts`.
- Hosting bleibt **GitHub Pages** mit Deploy über Actions. Die Custom Domain steht in den Pages-Einstellungen des Repos (`gh api … /pages -f cname=…`). Eine `CNAME`-Datei im Artefakt ist bei Actions-Deploys wirkungslos und entfällt.
- **DNS bei Porkbun**: Apex `A`/`AAAA` auf die vier GitHub-Pages-Adressen, `www` als `CNAME` auf `sbiastoch.github.io`. GitHub leitet `www` und die alte github.io-Adresse auf die Apex-Domain um.
- **HTTPS ist Pflicht**: `.app` steht auf der HSTS-Preload-Liste, Browser öffnen die Domain nur per HTTPS. „Enforce HTTPS“ bleibt in den Pages-Einstellungen an.
- **Keine `robots.txt`**, obwohl sie im Wurzelpfad wirken würde. Ein `Disallow: /` hält Crawler davon ab, das `noindex` zu lesen, und verlinkte URLs landen dann trotzdem als bloße Adresse im Index. Es bleibt bei `noindex, nofollow`.
- **DNS-Hygiene**: Die Parking-Records von Porkbun werden vollständig gelöscht, auch die Wildcard `*.zwergenplan.app`. Wildcards ermöglichen bei GitHub Pages die Übernahme von Subdomains. Die Domain wird im GitHub-Konto verifiziert (TXT `_github-pages-challenge-sbiastoch`).

## Konsequenzen
- Neuer Origin: `localStorage` (Merkliste, Geburtsdatum, Darstellung) vom alten Origin `sbiastoch.github.io` ist auf der neuen Domain leer. Die Seite ist erst seit 2026-10-04 live, der Verlust ist hinnehmbar; eine Migration über Origins hinweg lohnt nicht.
- Die Termin-UIDs (`…@zwergenplan`) hängen nicht an der Domain und bleiben gleich. Bereits importierte Termine werden weiter aktualisiert statt dupliziert.
- Laufende Kosten: jährliche Verlängerung der Domain bei Porkbun. Läuft sie aus, ist die Seite weg, bis die Custom Domain in Pages entfernt wird.
- Die Plausibilitätsprüfung in CI liest `SITE_URL/data/meta.json`. Ist die Domain nicht erreichbar, entfällt sie mit einer sichtbaren `::warning::` (vorher bei HTTP 404 nur eine Info-Zeile). Nach dem Umzug muss im CI-Log „(deployt: N)“ stehen.
- Mit `BASE = "/"` fallen fälschlich absolute Pfade (`/data/…`) in E2E nicht mehr auf. Für den Betrieb ist das egal; vor einem späteren Pfadwechsel muss man danach suchen.
