# Anbieter-Eintrag in `data/providers.yaml`

Der Katalog liegt im Repo-Root unter `data/providers.yaml` und ist eine YAML-Liste. Das verbindliche Zod-Schema entsteht bei der TypeScript-Portierung. Bis dahin gilt diese Beschreibung.

```yaml
- id: zoff-harmonie                      # kebab-case, eindeutig
  name: "Zoff + Harmonie – Familienbildung der Kath. Stadtkirche"
  role: anbieter                         # anbieter | aggregator | verzeichnis
  fetch: scripts/stadt_vk.py FROM TO     # nur bei aggregator mit eigenem Abfragewerkzeug (wird bei der TS-Portierung umbenannt)
  covered_by: et-dekanat-nuernberg       # optional: Termine kommen vollständig über diesen Aggregator
  address: "Vordere Sterngasse 1, 90402 Nürnberg"   # Hauptveranstaltungsort
  district: Altstadt                     # optional
  ring: innen                            # innen | knapp-aussen (≤ 700 m vom Ring) | aussen
  lat: 49.449683                         # WGS84, 6 Nachkommastellen
  lon: 11.075437
  venues:                                # nur bei mehreren Orten
    - {name: "...", address: "...", ring: innen, lat: 49.45, lon: 11.07}
  age: "0-3"                             # Jahre "0-3", Monate "0-12" (Obergrenze > 6 ohne Einheit = Monate) oder "4 Mon-3 J"
  topics: [pekip, musik, spielgruppe, elterntreff]   # Vokabular unten
  format: [kurs, regelmaessig, einmalig]             # siehe unten
  cost: [kostenpflichtig, teils-kostenlos]           # kostenlos | teils-kostenlos | kostenpflichtig
  registration: [mit-anmeldung, ohne-anmeldung]      # ohne-anmeldung | mit-anmeldung
  programme:                             # ALLE Stellen, an denen Termine stehen
    - url: "https://zoff-harmonie.de/programm/"
      kind: html                         # html | pdf | ical | json-api | js (nur im Browser)
      note: "Kursliste mit Detailseiten"
  availability:
    shown: ja                            # ja | teilweise | nein | unbekannt
    how: "Detailseite zeigt 'X von Y Plätzen frei' bzw. 'ausgebucht'"
    system: "eigenes CMS"                # z. B. Hebamio, Kursorganizer, Eversports, Reservix, keins
  verified: "2026-10-04"                 # Datum der letzten Live-Prüfung (String, ISO)
  notes: "Freitext; Teilinformationen mit ' | ' getrennt"
```

## Regeln

- **Pflichtfelder für alle Einträge:** `id`, `name`, `role`, `programme`, `verified`.
- **Zusätzlich bei `role: anbieter`:** `address`, `ring`, `lat`, `lon`, `topics`, `format`, `cost`, `registration`.
- **Koordinaten:** `lat`/`lon` gibt es für jeden Ort mit fester Adresse, also für den Hauptort und jeden Eintrag unter `venues`. Bei Orten ohne festen Treffpunkt (z. B. „wechselnd, Nürnberger Wald“) fehlen sie. Ist die Koordinate nur ungefähr (Straßenmitte, Park), steht das in `notes` („Koordinate: …“).
- **`format`** beschreibt, wie die Angebote eines Anbieters zeitlich organisiert sind. Mehrfachnennung ist erlaubt.
  - `kurs`: Reihe mit festem Start und Ende, man meldet sich für die ganze Reihe an.
  - `regelmaessig`: wiederkehrende Termine ohne festes Ende (wöchentlicher Treff, laufende Gruppe, Miniclub).
  - `einmalig`: Einzeltermine (Konzert, Führung, Theater, Workshop).
  - Ein **offener Treff** ist `format: regelmaessig` zusammen mit `registration: ohne-anmeldung`. Einen eigenen Wert dafür gibt es nicht.
- **Anmeldestart und -schluss:** Sind sie bekannt, stehen sie in `notes` in der Form `Anmeldestart: … | Anmeldeschluss: …`, jeweils als Regel („14 Tage vor Kursbeginn“), festes Datum oder Verweis („je Kurs auf der Detailseite“). Felder ohne Angabe werden weggelassen.
- Listen enthalten keine Duplikate. Die Werte stammen aus den Vokabularen in diesem Dokument.

## Vokabular `topics`

pekip, fenkid, babymassage, babysignal, musik, singen, tanz, krabbelgruppe, spielgruppe, eltern-kind-gruppe, eltern-kind-turnen, bewegung, waldgruppe, kreativ, elterncafe, stillcafe, elterntreff, vaeter, muetter, mehrsprachig, beratung, beikost, hebamme, erste-hilfe, rueckbildung, fitness-mit-baby, yoga-mit-baby, babyschwimmen, kleinkindschwimmen, bibliothek, vorlesen, museum, kino, konzert, theater, tiere-natur, spielplatz-indoor, krabbelgottesdienst

Fehlt ein wichtiges Thema, wird ein neuer Tag hier ergänzt und erst danach im Katalog verwendet.
