# ADR 0002 – Hosting, Sichtbarkeit und Datenfluss

Status: angenommen (2026-10-04)

## Entscheidung
- **GitHub Pages** aus dem öffentlichen Repo `sbiastoch/zwergenplan` unter `/zwergenplan/`. Der Pfad steht nur in `site.config.ts`.
- **Privat gedacht, technisch öffentlich**: Die Seite ist für Freunde und Familie, ohne Impressum und mit `noindex`. Eine `robots.txt` im Unterpfad wäre wirkungslos und entfällt. Repo und Daten sind öffentlich einsehbar. In die Daten kommt deshalb nichts, was nicht ohnehin öffentlich auf den Anbieterseiten steht.
- **Kein menschliches Review**: Der Pipeline-Lauf committet direkt auf `main` und pusht. CI ist das einzige Gate (check → E2E → Deploy). Bei Rot bleibt die alte Version live.
- **Plausibilität gegen den deployten Stand**: Jeder Deploy veröffentlicht `data/meta.json`. CI vergleicht den neuen Bestand mit der *Live*-Version, nicht mit `HEAD^`. So kann ein kaputter Commit auf `main` nicht zur neuen Referenz werden. Bricht der Bestand um mehr als 50 % ein, ist das rot. Ist `generatedAt` älter als 14 Tage, gibt es eine Warnung.
- Die Pipeline läuft **lokal** (Claude Code mit dem Abo des Nutzers) und pusht mit den Git-Credentials des Nutzers. Das löst CI aus.

## Konsequenzen
- Läuft die Pipeline später als GitHub Action, löst ein Push mit `GITHUB_TOKEN` **keinen** weiteren Workflow aus. Dann braucht es eine GitHub App, einen PAT oder `workflow_call`.
- Eine eigene Domain wäre der einzige Kostenpunkt (optional).
