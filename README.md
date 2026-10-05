# Zwergenplan

Private, mobile-first Seite mit Angeboten für Kinder unter 3 Jahren in Nürnberg: Krabbelgruppen, Babykurse, Elterntreffs, Babykonzerte, Theater und Museen. Mit Alters- und Kategorienfilter und Kalenderdateien je Termin.

**Live:** https://zwergenplan.app/

- Die Daten stammen aus einer Agenten-Recherche: Der Skill `.claude/skills/babyevents-nuernberg` prüft den Anbieterkatalog `data/providers.yaml`, und `pnpm pipeline` baut daraus `data/offers.json`.
- Einstieg für Entwicklung und Arbeitsweise: [`CLAUDE.md`](CLAUDE.md). Architektur: [`docs/architecture.md`](docs/architecture.md), Entscheidungen: [`docs/adr/`](docs/adr/).

## Datenquellen

- **Angebote:** eigene Recherche aus den Programmen der Anbieter (`data/providers.yaml`, `data/offers.json`).
- **Fahrplan für die Wegzeit:** VGN – Verkehrsverbund Großraum Nürnberg GmbH, „VGN-Soll-Daten vom 24.06.2026“, https://www.vgn.de/web-entwickler/open-data/. Lizenz: [CC BY-SA 3.0 DE](https://creativecommons.org/licenses/by-sa/3.0/de/) (https://creativecommons.org/licenses/by-sa/3.0/de/).
  - **Abgewandelt:** Auszug für einen Dienstagvormittag (`data/oepnv/fahrplan.json`, erzeugt mit `pnpm pipeline oepnv`) und daraus berechnete Wegzeiten (`data/wegzeit.json` auf der Website, entsteht bei jedem Build) und die Linien je Wegzeit (`data/linien.json`, ebenso). Alle drei stehen unter derselben Lizenz, CC BY-SA 3.0 DE. Der übrige Inhalt des Repos ist davon nicht berührt.
  - Titel und Stand ändern sich mit jedem Feed; maßgeblich ist das Feld `source` in `data/oepnv/fahrplan.json`.
  - Die Download-Seite des VGN nennt CC BY 3.0 DE, die Nutzungsbedingungen (Nr. 5 Abs. 3) CC BY-SA 3.0 DE. Wir folgen vorsichtig der strengeren Lizenz (ADR 0011).
  - Die Nennung bedeutet keine Unterstützung durch den VGN; für die berechneten Wegzeiten ist er nicht verantwortlich.

## Als App installieren

Der Zwergenplan ist eine installierbare Web-App (Plan 0011, ADR 0013). Offline öffnet er mit dem zuletzt geladenen Stand.

- **Android (Chrome):** Im Kind-Sheet („Dein Zwerg“) unter „Als App“ auf „Zum Startbildschirm hinzufügen“ tippen, oder im Browser-Menü „App installieren“ wählen.
- **iPhone/iPad (Safari):** Teilen-Symbol, dann „Zum Home-Bildschirm“. Die App hat dort einen eigenen Speicher (Spike h). Die App startet leer: Alter, Merkliste und Stadtteil dort noch einmal eintragen.
- **Desktop (Chrome, Edge):** Symbol „Installieren“ in der Adressleiste.

Icons entstehen aus `design/icon.svg` mit `node scripts/icons.ts` (die PNGs in `public/icons/` werden committet).

### Notausgang: Service Worker abmelden

Hält ein Service Worker einen kaputten Stand fest, hilft ein Deploy mit dem Schalter `ZWERGENPLAN_SW=aus` (Plan 0011, Arch-Review Stufe 1). Er wirkt zur Build-Zeit:

- Statt `src/sw/sw.ts` wird `src/sw/kill.ts` zu `sw.js` gebaut. Der neue Service Worker übernimmt sofort, löscht die eigenen Caches (`zp-*`), meldet sich ab und lädt offene Fenster neu (`src/sw/retire.ts`, Unit-Test, „Typen SW“).
- Die Seite registriert keinen Service Worker mehr (`__SW_OFF__`), es gibt also keine Schleife.
- `e2e/pwa.spec.ts` und der Smoke „mit Service Worker“ überspringen sich bei gesetztem Schalter.

So geht es:

1. In `.github/workflows/ci.yml` auf Ebene des Workflows `env: ZWERGENPLAN_SW: aus` setzen (gilt für Build und Tests), committen, CI grün, Deploy.
2. Der Browser prüft `sw.js` bei Navigationen auf eine neue Version, spätestens nach 24 Stunden am HTTP-Cache vorbei. Danach läuft die Seite ohne Service Worker.
3. Nach der Reparatur den Schalter wieder entfernen und deployen.

Lokal ausprobieren: `ZWERGENPLAN_SW=aus pnpm build`, dann enthält `dist/sw.js` den Notausgang.
