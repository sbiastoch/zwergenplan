# ADR 0010 – `src/data` nutzt reine Domänenhilfen zur Laufzeit

Status: angenommen (2026-10-04)

## Kontext
Bis Plan 0004 importierte `src/data` aus `src/domain` nur Typen. Mit der Entfernung (Plan 0004, E3) fragt `src/data/geolocation.ts` den Standort ab. Die Privatsphäre-Invariante verlangt, dass die Rohkoordinate diese Datei nie verlässt (`docs/architecture.md`). Darum muss schon dort auf ca. 100 m gerundet und gegen die Stadtgrenze geprüft werden. Beides ist Domänenlogik (`coarsen`, `inBounds`, `NUERNBERG_BBOX` in `src/domain/geo.ts`) und soll nicht doppelt existieren.

Der erste Stand importierte zusätzlich `districts.ts` in `preferences.ts`, um unbekannte Stadtteil-IDs schon beim Laden zu verwerfen. Das Arch-Review zu Plan 0004 (M2) hat das zurückgenommen: Die Prüfung gehört zum Zustand des Startpunkts (`useOrigin`), nicht zum Speicherzugriff.

## Entscheidung
- `src/data` darf zur Laufzeit aus `src/domain` nur **reine Hilfen ohne Zod** importieren. Heute ist das genau `geo.ts`.
- Typ-Importe aus `src/domain` bleiben frei. `schema`/`dataset` bleiben auch hier reine Typ-Importe (`no-zod-in-client`).
- Maschinell geprüft durch die dependency-cruiser-Regel `data-domain-runtime-allowlist` (Tests ausgenommen). Ein weiteres Modul auf der Liste braucht eine Begründung im Plan und eine Ergänzung dieses ADR.

## Konsequenzen
- Die Rundung passiert dort, wo die Koordinate entsteht. Die UI sieht nie eine Rohkoordinate.
- `src/data` bleibt dünn: Speicher, Netz und Geräte-APIs, keine eigene Fachlogik. Die Validierung gespeicherter Werte liegt in der UI-Zustandsschicht, die ohnehin aus `src/domain` importiert.
- Die Allowlist ist eng. Ein neuer Laufzeit-Import aus `src/domain` wird rot, statt still durchzurutschen.
