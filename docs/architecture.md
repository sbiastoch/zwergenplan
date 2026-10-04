# Architektur

Grundlage für `/arch-review`. Regeln, die maschinell prüfbar sind, stehen zusätzlich in `.dependency-cruiser.cjs` (Verweis in Klammern). Alle anderen prüft der Review.

## Datenfluss

```
Recherche-Skill ──► data/providers.yaml + data/offers.json   (committet auf main)
                          │
            scripts/build-data.ts  (Zod + Invarianten; rot = kein Build)
                          │
   public/data/site.json, meta.json, public/ics/**.ics   (generiert, nicht committet)
                          │
              Vite-Build ► dist/ ► GitHub Pages /zwergenplan/
                          │
            Browser: src/data lädt site.json per fetch ► src/domain ► src/ui
```

## Schichten

| Ordner | Aufgabe | darf importieren |
|---|---|---|
| `src/domain/` | reine Logik: Schema, Kategorien, Alter, Filter, ICS, Zeit | nur `src/domain`, `zod` (nur schema/dataset) |
| `src/data/` | einziger Datenzugriff der App (fetch, localStorage) | `src/domain` (Typen) |
| `src/ui/` | React-Komponenten, Darstellung, Interaktion | `src/domain`, `src/data` |
| `scripts/` | Build, Validierung, später die Pipeline (Node) | `src/domain`, `site.config.ts` |
| `e2e/` | Black-Box-Tests im Browser | nichts aus `src/` |
| `.claude/hooks/` | Agenten-Hooks | nur Node-Builtins |

Regeln:
- `src/domain` ist framework-frei und läuft im Browser: kein React, kein Node-API, keine UI (`domain-is-pure`, `domain-no-node-at-runtime`).
- **Geschäftslogik gehört nach `src/domain`.** Komponenten rufen Domänenfunktionen auf, rechnen aber keine Filter-, Alters- oder Zeitlogik selbst. Das prüft der Review.
- Die UI lädt geprüfte Daten und importiert `schema.ts`/`dataset.ts` nur als Typ. Zod gehört nicht ins Client-Bundle (`no-zod-in-client`).
- Datenzugriff läuft nur über `src/data` (`ui-reads-data-only-via-src-data`).
- Keine Zyklen (`no-circular`). Produktivcode importiert keine Tests oder Fixtures (`no-test-code-in-prod`).

## Invarianten

- **Ein Datenvertrag**: `src/domain/schema.ts` (Zod 4). Abgeleitete Werte wie Kategorien werden berechnet, nie gespeichert. `schema/*.json` ist ein Export (CI prüft Drift).
- **Zeit**: Jeder Zeitpunkt trägt einen Offset. Kalendertage, das Alter und „heute“ werden in Europe/Berlin bestimmt (`time.ts`), nie in der Geräte-Zeitzone. „Jetzt“ wird in Domänenfunktionen hineingegeben (`FilterContext.now`), nicht intern mit `new Date()` erzeugt.
- **Stabile IDs** (ADR 0003, ADR 0006): Die Offer-ID ist `providerId--slug(title)--venueId` (Kurse und Einzeltermine mit Beginn im Slug, `src/domain/ids.ts`), die Termin-UID ist `offerId--YYYYMMDDTHHmm@zwergenplan`. Eine geänderte ID erzeugt Duplikate im Kalender der Nutzer.
- **ICS**: ein VEVENT je Termin in UTC, keine RRULE/RDATE. Die Dateien entstehen statisch zur Build-Zeit.
- **Privatsphäre**: Das Geburtsdatum bleibt im `localStorage`. Es steht nie in URL, Logs oder Requests. Kein Tracking, keine Drittanbieter-Requests außer den später geplanten Kartenkacheln (OpenFreeMap).
- **Testdaten gehen nie live**: Der Fixture-Build schreibt nach `dist-e2e/`, nur `dist/` wird deployt.
- **Altersprüfung**: Kurs und einmalig zählen zum (ersten) Termin, regelmäßig zählt, wenn irgendein Termin passt. Die Grenzen sind inklusiv, es zählen vollendete Monate.

## Mobile-UX-Gates (`e2e/mobile-ux.ts`)

Jede Ansicht besteht in Playwright auf 360 px, Pixel 7, iPhone 15 (WebKit), quer und Desktop:
- kein horizontales Scrollen, auch bei 320 px und 200 % Textgröße
- Touch-Ziele ≥ 44 px (Links im Fließtext ≥ 24 px)
- Eingabefelder ≥ 16 px (sonst zoomt iOS)
- axe WCAG 2.2 AA ohne Verstöße, hell und dunkel
- sichtbarer Fokus bei Tastaturbedienung
- keine Konsolen- oder Seitenfehler (automatisch in jedem Test)
- reduzierte Bewegung funktioniert
- LCP < 2,5 s und CLS < 0,05 bei gedrosselter Mobile-CPU bzw. gedrosseltem Netz
- Bundle-Budgets (`.size-limit.json`)

Eine neue Ansicht bekommt eigene E2E-Tests **und** einen Aufruf von `expectMobileUx`.
