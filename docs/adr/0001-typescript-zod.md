# ADR 0001 – Alles TypeScript, Zod als einzige Schema-Quelle

Status: angenommen (2026-10-04)

## Kontext
Die Recherche-Pipeline (anfangs als Python-Skill) und die Website teilen sich einen Datenvertrag. Zwei Sprachen bedeuten zwei Typsysteme und Drift.

## Entscheidung
- Das ganze Repo ist TypeScript: Frontend, Build-Skripte, später die Pipeline und die Hooks. Node 24 führt `.ts` direkt aus (Type-Stripping), deshalb gelten `erasableSyntaxOnly` und `.ts`-Endungen in Imports.
- `src/domain/schema.ts` (Zod 4) ist die **einzige** Quelle. JSON Schema wird nach `schema/` exportiert, nur als Vorlage für Recherche-Agenten.
- Der Stack: React 19, Vite 8, TypeScript 7 (nativer Compiler, Typecheck < 1 s), Tailwind v4, Biome 2. Motion kommt erst, wenn sie gebraucht wird. Die Karte nutzt MapLibre GL JS mit Kacheln von OpenFreeMap, lazy geladen (ADR 0008, Plan 0005).
- Nur Claude Code als Agenten-Werkzeug. `CLAUDE.md` ist kanonisch, es gibt kein `AGENTS.md`.

## Konsequenzen
- Die Python-Skripte des Skills werden portiert (eigener Plan).
- dependency-cruiser unterstützt TS 7 nicht als Transpiler und nutzt deshalb den swc-Parser.
