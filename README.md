# Zwergenplan

Private, mobile-first Seite mit Angeboten für Kinder unter 3 Jahren in Nürnberg: Krabbelgruppen, Babykurse, Elterntreffs, Babykonzerte, Theater und Museen. Mit Alters- und Kategorienfilter und Kalenderdateien je Termin.

**Live:** https://sbiastoch.github.io/zwergenplan/

- Die Daten stammen aus einer Agenten-Recherche: Der Skill `.claude/skills/babyevents-nuernberg` prüft den Anbieterkatalog `data/providers.yaml`, und `pnpm pipeline` baut daraus `data/offers.json`.
- Einstieg für Entwicklung und Arbeitsweise: [`CLAUDE.md`](CLAUDE.md). Architektur: [`docs/architecture.md`](docs/architecture.md), Entscheidungen: [`docs/adr/`](docs/adr/).
