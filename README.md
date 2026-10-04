# babyevents – Babyangebote in Nürnberg

Ein Claude-Code-Skill (`.claude/skills/babyevents-nuernberg/`), der für einen Zeitraum alle bekannten Anbieter von
Baby-/Kleinkindangeboten (0–3 Jahre) in Nürnberg prüft. Er liefert freie Plätze, Wegzeiten (zu Fuß / VGN) ab einer
Adresse und eine ICS-Datei pro Termin.

**Benutzen:** in Claude Code z. B. „Was können wir vom 12. bis 18.10. mit dem Baby (7 Monate) machen? Start: <Adresse>“
oder `/babyevents-nuernberg`. Das Ergebnis landet in `runs/<von>_<bis>/` (`bericht.html`, `ics/alle.ics`).

- `ANBIETER.md` – verschlagwortete Anbieterliste mit Programm-Links (erzeugt aus `data/providers.yaml`)
- `data/providers.yaml` – der gepflegte Anbieterkatalog (83 Einträge, Stand 04.10.2026; Schema: `.claude/skills/babyevents-nuernberg/references/provider-schema.md`)
- `research/` – Rohdaten der Erstrecherche und das einmalige Zusammenführungsskript

Abhängigkeiten: Python 3 mit `requests`, `beautifulsoup4`, `pyyaml`. Genutzte offene Dienste: Nominatim/OSRM
(OpenStreetMap), VGN-EFA, OpenHolidays, Veranstaltungskalender der Stadt Nürnberg, evangelische-termine.de, frankenkids.de.
