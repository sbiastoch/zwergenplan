---
name: plan-review
description: Lässt einen Implementierungsplan aus docs/plans/ unabhängig und adversarial prüfen und arbeitet das Ergebnis ein. Pflicht vor jeder Umsetzung (CLAUDE.md). Aufruf mit dem Plan-Pfad.
---

# Plan-Review

Kleinänderungen (CLAUDE.md, Schritt 1; `node scripts/change-size.ts`) brauchen keinen Plan und kein Plan-Review. Ihr Plan steht im Commit-Text.

1. Stelle sicher, dass der Plan als Datei unter `docs/plans/NNNN-<thema>.md` liegt und für sich allein verständlich ist. Der Reviewer kennt den Chat nicht. Die Statuszeile ist die erste nicht-leere Zeile nach dem Titel und beginnt mit `Status: Entwurf`, `Review eingearbeitet`, `freigegeben` oder `in Umsetzung` (`check-docs`). Abgeschlossene Pläne in `docs/plans/archiv/` liest der Reviewer nur, wenn ein Verweis darauf zeigt.
2. Starte den Subagenten `plan-reviewer` mit dem Plan-Pfad. Gib ihm keine Begründungen aus dem Chat mit; er soll unvoreingenommen urteilen.
3. Bewerte jedes Finding:
   - **übernehmen**: Plan anpassen.
   - **ablehnen**: Das ist nur mit einer Begründung erlaubt, die du im Plan festhältst.
4. Hänge an den Plan einen Abschnitt `## Review (<Datum>) – Verdict: …` an, mit den übernommenen und den abgelehnten Punkten.
5. Lautet das Verdict „Überarbeiten“ und hast du Blocker geändert, starte einen **neuen** `plan-reviewer` auf die überarbeitete Fassung, höchstens zweimal.
6. Committe den Plan inklusive Review, bevor die Umsetzung beginnt.

Fertig ist der Skill, wenn der Plan einen Review-Abschnitt hat und keine offenen Blocker mehr enthält.
