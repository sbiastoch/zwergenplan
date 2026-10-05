# Zwergenplan

Private, mobile-first Seite mit Angeboten für Kinder unter 3 Jahren in Nürnberg: Krabbelgruppen, Babykurse, Elterntreffs, Babykonzerte, Theater und Museen. Mit Alters- und Kategorienfilter und Kalenderdateien je Termin.

**Live:** https://zwergenplan.app/

- Die Daten stammen aus einer Agenten-Recherche: Der Skill `.claude/skills/babyevents-nuernberg` prüft den Anbieterkatalog `data/providers.yaml`, und `pnpm pipeline` baut daraus `data/offers.json`.
- Einstieg für Entwicklung und Arbeitsweise: [`CLAUDE.md`](CLAUDE.md). Architektur: [`docs/architecture.md`](docs/architecture.md), Entscheidungen: [`docs/adr/`](docs/adr/).

## Datenquellen

- **Angebote:** eigene Recherche aus den Programmen der Anbieter (`data/providers.yaml`, `data/offers.json`).
- **Fahrplan für die Wegzeit:** VGN – Verkehrsverbund Großraum Nürnberg GmbH, „VGN-Soll-Daten vom 24.06.2026“, https://www.vgn.de/web-entwickler/open-data/. Lizenz: [CC BY-SA 3.0 DE](https://creativecommons.org/licenses/by-sa/3.0/de/) (https://creativecommons.org/licenses/by-sa/3.0/de/).
  - **Abgewandelt:** Auszug für einen Dienstagvormittag (`data/oepnv/fahrplan.json`, erzeugt mit `pnpm pipeline oepnv`) und daraus berechnete Wegzeiten (`data/wegzeit.json` auf der Website, entsteht bei jedem Build) und die Linien je Wegzeit (`data/linien.json`, ebenso). Beide stehen unter derselben Lizenz, CC BY-SA 3.0 DE. Der übrige Inhalt des Repos ist davon nicht berührt.
  - Titel und Stand ändern sich mit jedem Feed; maßgeblich ist das Feld `source` in `data/oepnv/fahrplan.json`.
  - Die Download-Seite des VGN nennt CC BY 3.0 DE, die Nutzungsbedingungen (Nr. 5 Abs. 3) CC BY-SA 3.0 DE. Wir folgen vorsichtig der strengeren Lizenz (ADR 0011).
  - Die Nennung bedeutet keine Unterstützung durch den VGN; für die berechneten Wegzeiten ist er nicht verantwortlich.
