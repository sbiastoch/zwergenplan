---
name: arch-review
description: Adversarialer Architektur-Review der aktuellen Änderungen gegen docs/architecture.md und die ADRs. Pflicht vor „fertig“ bei größeren Änderungen (neues Modul, neue Abhängigkeit, Schemaänderung, >200 Zeilen). Optional mit Basis-Ref als Argument (Standard: merge-base mit origin/main).
---

# Arch-Review

1. **Gates zuerst**: `pnpm check:fast` muss grün sein. Ein Review auf rotem Code ist verschwendet.
2. **Diff erzeugen**:
   `git diff $(git merge-base HEAD origin/main 2>/dev/null || echo main) > .claude/state/review.diff`.
   Nimm uncommittete Änderungen mit (`git diff` ohne `--cached` reicht, da der Vergleich gegen einen Commit läuft). Neue, noch nicht getrackte Dateien vorher mit `git add -N` sichtbar machen.
3. Starte den Subagenten `arch-reviewer` mit dem Pfad `.claude/state/review.diff`. Er bekommt keine Rechtfertigungen mit.
4. Bewerte die Findings:
   - **Blocker**: beheben. Alternativ einen bewussten Regelbruch als neues ADR in `docs/adr/` begründen, dann nennt `CLAUDE.md` das ADR.
   - **Major**: beheben oder im Commit-Text begründen.
   - **Minor**: nach Ermessen.
5. Nach den Fixes läuft `pnpm check:fast` erneut. Bei Blockern startet ein **neuer** `arch-reviewer` auf den neuen Diff, höchstens zweimal.
6. Sind keine Blocker mehr offen: `node .claude/hooks/mark-reviewed.ts`. Das vermerkt den geprüften Stand für das Stop-Gate.
7. Fasse für den Nutzer in 3–6 Zeilen zusammen, was gefunden und was geändert wurde.
