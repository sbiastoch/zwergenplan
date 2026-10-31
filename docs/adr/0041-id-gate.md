# ADR 0041 – ID-Gate bei neuer Pipeline-Fassung

Status: **angenommen** (2026-10-31, mit Plan 0049, Nachtrag 2, Schritt B), Nutzerentscheide vom 2026-10-30.
- **Ergänzt** ADR 0022, Punkt 3: Vor den drei Stufen der Zuordnung gilt das vom Richter belegte Erbe (`keepIds`).
- **Präzisiert** ADR 0026 („Ein Wechsel von Prompt, Schema oder Modell extrahiert einmal alles neu“): Die Neuextraktion bleibt, übernommen wird ihr Ergebnis aber erst nach dem Gate.
- **Nimmt zurück** ADR 0033, Konsequenzen: Ein Modellwechsel darf keine IDs mehr kosten.

## Kontext

- Merklisten liegen auf dem Gerät und hängen an der Angebots-ID (ADR 0022). Eine verlorene ID zeigt dort „gibt es nicht mehr“, obwohl das Angebot noch besteht.
- Eine Neuextraktion mit demselben Modell hält nur 87–96 % der IDs (Plan 0048, S0). Das Modell formuliert Titel um, fasst Einzeltermine zu Kursen zusammen oder wechselt das Format, und die Zuordnung nach ADR 0022 findet dann keinen eindeutigen Partner.
- Prompt, Schema, Modell und Katalogauszug sind Teil des Cache-Schlüssels (`ExtractKeyParts`, `catalogExcerpt`). Jede Verbesserung der Pipeline löst also eine Neuextraktion aus, auch das Anhängen einer Seite durch den Seitenfinder (Plan 0049), denn es ändert den Auszug.
- Harte Regel des Nutzers (2026-10-30): „IDs um jeden Fall stabil … ganz wichtige, ganz harte Regel“. Ob neu extrahiert wird, ist ihm egal. Ein Angebot darf wegfallen, wenn es eindeutig fehlerhaft ist, und das prüft ein Opus-Modell. Im Nachtlauf bleibt Haiku.

## Entscheidung

1. **Fassung je Einheit.** `UnitState.partsHash` ist der Hash über die `KeyParts` und `INPUT_EPOCH` der Eingabe, aus der `events` stammen. Er ist nicht Teil des Cache-Schlüssels, löst also selbst keine Neuextraktion aus. `INPUT_EPOCH` (`lib/normalize.ts`) steigt, wenn sich der Code ändert, der den Eingabetext erzeugt; ein Pin-Test erzwingt das.
2. **Gated** ist eine Einheit, die einen Vorstand hat und ein Ergebnis einer anderen Fassung übernimmt. Ein fehlendes `partsHash` zählt als andere Fassung. Gleichgültig ist, ob sich die Seite zugleich geändert hat. Sonst ginge der Verlust mit der nächsten kleinen Änderung der Seite doch durch.
3. **Verlust** ist eine ID mit künftigem Termin im Vorstand, die im Build mit allen neuen Ergebnissen fehlt, im Build mit dem alten Stand der gated Einheiten aber vorkommt. Verluste aus Einheiten, die nicht gated sind, bleiben erlaubt (Änderung der Seite, ADR 0022).
4. **Richter.** Für jede gated Einheit mit Verlusten urteilt ein Opus-Modell (`LLM_MODEL_JUDGE`) je verlorener ID:
   - `gleich`: Das neue Event erbt die ID (`RawEvent.keepIds`, je Beginn).
   - `fehlerhaft`: Das alte Angebot steht so nicht auf der Seite oder widerspricht dem Katalog. Die ID fällt weg.
   - `entfallen`: Der Anbieter hat es von der Seite genommen. Die ID fällt weg.
   - `unklar`: Die Einheit wird gehalten.
5. **Erbe vor den Stufen.** `assignIds` ordnet einen Entwurf mit Erbe vor Stufe 0 der ID zu: nur beim selben Anbieter, nur bei genau einem Anspruch, der Ort darf wechseln. `keepIds` setzt nur der Code; das Antwortschema des Extraktors lässt das Feld weg.
6. **Halten.** Die Einheit behält den alten Stand. Das neue Ergebnis liegt in `held` mit Grund `unklar` oder `grenze` (Richter nicht gelaufen: Bremse, Zeit, Fehler). Nach `grenze` wird es in der nächsten Nacht ohne neue Extraktion erneut vorgelegt. Der Wächter meldet jeden gehaltenen Anbieter.
7. **Hinnehmen** ist die einzige Ausnahme ohne Richter: ein Eintrag in `data/id-hinnehmen.yaml` mit Anbieter, Grund und Datum, von Hand gepflegt. Die Verluste stehen mit dem Grund im Bericht und im Commit-Text.
8. **Nur im Nachtlauf.** Entdecken und der Ertragsbeweis der Pflege extrahieren ohne Vorstand und haben kein Gate.
9. **Schattenlauf** vor jeder Umstellung von Prompt, Schema, Modell oder `INPUT_EPOCH`: `pnpm pipeline nightly --dry-run` mit der neuen Fassung zählt übernommen, geerbt, weggefallen und gehalten; das Ergebnis steht im Commit der Umstellung.
10. **Build-Code.** Ein Test über eine eingefrorene Kopie von `data/raw` und `data/offers.json` verlangt, dass der Build ohne neue Eingabe keine ID mit künftigem Termin verliert.

## Alternativen

- **Neuextraktion vermeiden** (alter Stand bleibt, bis sich die Seite ändert): verschiebt den Verlust nur auf die nächste Änderung der Seite.
- **Nur die Zuordnung verbessern** (lockerere Stufen): erhöht das Risiko, dass eine ID still auf ein anderes Angebot zeigt; ADR 0022 sagt „lieber neu als vertauscht“.
- **Verluste nur melden:** bricht die harte Regel.
- **Richter mit Haiku:** billiger, aber das Urteil über „dasselbe Angebot“ ist genau die Schwäche, die das Gate abfängt. Qualität vor Kosten (Nutzervorgabe).

## Konsequenzen

- Eine Umstellung kommt nur so weit an, wie der Richter sie trägt. Viele `unklar` zeigt der Schattenlauf vorher; dann muss erst die Zuordnung besser werden, oder ein Mensch nimmt hin.
- Gehaltene Einheiten zeigen den alten Stand, bei geänderter Seite auch veraltete Termine, bis jemand entscheidet. Der Wächter meldet sie.
- Im Nachtlauf läuft ein zweites Modell (Opus) mit eigener Bremse `JUDGE_BRAKES`, nur bei neuer Fassung und nur für Einheiten mit Verlust.
- Ein falsches `gleich` ließe eine ID auf ein anderes Angebot zeigen. Der Bericht nennt jedes Erbe; die ersten Läufe prüft ein Mensch.
