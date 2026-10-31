# ADR 0043 – Sieben Kategorien, gefaltet im Datenvertrag

Status: **angenommen** (2026-10-31, mit Plan 0037, Nachtrag A), Nutzerentscheid vom 2026-10-31.

- **Ändert** ADR 0030, Punkt 1: `category` hat einen von **sieben** Werten, nicht zwölf. Das Modell wählt in der Extraktion weiter aus zwölf, der Datenvertrag faltet.
- **Ändert** ADR 0003, Punkt „Themen und Kategorien“: `TOPIC_CATEGORIES` zeigt auf die sieben.

## Kontext

- Am 2026-10-31 hatten die Kategorien `natur` (9 Angebote), `kreativ` (7), `beratung` (7), `museum` (5) und `buecher` (3) zusammen 31 von 436 Angeboten (7 %). Sie belegten 5 von 12 Stickern, Zeilen im Filter-Sheet und Kartenfarben. Ein Filter mit 3 Treffern ist mit Zeitraum oder Wegzeit fast immer leer (Nutzermeldung).
- Jede Änderung an Prompt oder Antwortschema der Extraktion extrahiert alle Anbieter neu (Plan 0032, N3). Das kostet rund $0,90 und ist ein ID-Risiko (ADR 0022, ADR 0041).
- Der Client prüft `site.json` nicht per Schema. Ein alter Tab mit neuen Daten liest `CATEGORY_UI[category]` direkt.

## Entscheidung

1. **Sieben Kategorien** (`CATEGORIES` in `src/domain/topics.ts`): `babykurse` („Baby- & Elternkurse“, nimmt `beratung` auf), `krabbel-spielgruppen`, `treffs-cafes`, `bewegung` („Bewegung & Draußen“, nimmt `natur` auf), `wasser`, `musik` und `buehne` („Kultur & Kreativ“, nimmt `museum`, `buecher` und `kreativ` auf).
2. **Die IDs bleiben aus dem alten Bestand**, auch wenn `buehne` nicht mehr wörtlich zum Label passt. Alter Code mit neuen Daten zeigt dann nur alte Labels und bricht nicht. Links mit `kat=buehne`, `kat=bewegung` und `kat=babykurse` bleiben gültig.
3. **Die Extraktion wählt weiter aus zwölf Werten** (`EXTRACT_CATEGORIES`, alte Reihenfolge). Prompt und Antwortschema bleiben unverändert, der Cache-Schlüssel auch. Es gibt keine Neu-Extraktion.
4. **Der Datenvertrag faltet:** `CategoryField = z.enum(EXTRACT_CATEGORIES).transform(foldCategory)`. Er liest alte und neue Werte und gibt einen der sieben zurück. `data/offers.json` und `data/raw/` mit Altwerten bleiben gültig und werden nie von Hand umgeschrieben. Der Export `schema/*.json` (`io: "input"`) zeigt die zwölf Eingabewerte.
5. **Der Browser faltet ebenfalls:** `withCategory` (für ein gecachtes `site.json`) und `filterFromSearch` (für `kat=` in alten Links) nutzen `foldCategory`.

## Alternativen

- **Neue IDs** (etwa `kultur`): sprechender, aber alter Code bräche an der unbekannten ID, bis sich der Service Worker aktualisiert hat. Das bräuchte einen Zwischen-Deploy mit Übergangsnetz.
- **Prompt auf sieben kürzen:** sauberer, kostet aber eine Neu-Extraktion mit ID-Risiko für reine Kosmetik. Das passiert bei der nächsten ohnehin fälligen Neu-Extraktion (`docs/ideas.md`).
- **Kleine Kategorien nur ausblenden:** Ihre Angebote hätten weiter Etiketten ohne Filter-Sticker.

## Konsequenzen

- Zwei Vokabulare: zwölf für das Modell, sieben für alles andere. `foldCategory` ist die einzige Brücke.
- Die Eval-Trefferquote `category` wird gefaltet gezählt und kann ab 2026-10-31 bei gleichem Prompt-Hash steigen. Das ist eine Messänderung, kein Modellfortschritt.
- Das Grün der Grundkarte war die Farbe von `natur`. Es ist jetzt das eigene Token `--map-green` mit gleichem Wert.
