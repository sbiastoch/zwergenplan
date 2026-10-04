# ADR 0006 – Recherche-Pipeline: Katalog im Zod-Vertrag, Rohformat, ID-Regel

Status: angenommen (2026-10-04), ergänzt ADR 0003. Details und Begründungen in Plan 0002.

## Kontext
Der Recherche-Skill pflegte den Anbieterkatalog in einem eigenen Format, und seine Subagenten lieferten Termine als Freitext-Events mit RRULE-Strings. Die Website hat dagegen einen Zod-Vertrag mit materialisierten Terminen und deterministischen IDs (ADR 0001, ADR 0003). In der Praxis kollidiert die Offer-ID aus ADR 0003, z. B. bei drei Vorstellungen eines Stücks oder bei zwei parallelen Kursen mit gleichem Titel.

## Entscheidung
- **Ein Katalogformat**: `data/providers.yaml` steht im Zod-Vertrag (`Provider`, unterschieden nach `role: anbieter | aggregator | verzeichnis`) und wurde einmalig migriert. Einen Adapter für das Altformat gibt es nicht. Agenten pflegen den Katalog direkt, und jedes Gate prüft ihn.
- **Angebote gehören immer zu einem Anbieter**: Termine aus Sammelkalendern werden einem Katalog-Anbieter und einem seiner Orte zugeordnet (`coveredBy`, Zuordnung in `scripts/pipeline/lib/match.ts`). Aggregatoren und Verzeichnisse haben keine Angebote.
- **Rohformat als Zwischenformat**: Subagenten schreiben `RawBatch` (`scripts/pipeline/lib/raw.ts`, exportiert nach `schema/raw-batch.schema.json`). Das ist kein zweiter Datenvertrag. Die Felder sind aus `OfferFields` in `src/domain/schema.ts` abgeleitet, und `pipeline build` erzeugt daraus `data/offers.json`. Offsets, Ferien, IDs und Deduplizierung rechnet Code, kein Sprachmodell.
- **ID-Regel** (ergänzt ADR 0003):
  - `regelmaessig`: `providerId--slug(title)--venueId`
  - `kurs` und `einmalig`: `providerId--slug(title)-<YYYYMMDDtHHmm des ersten Termins>--venueId`
  - Implementiert in `src/domain/ids.ts`. `validateDataset` prüft `id === offerId(offer)`.
  - Läuft ein Kurs, schreibt die Pipeline ihn mit dem Altbestand fort: Die vergangenen Termine bleiben, damit der erste Termin und die ID stabil bleiben.

## Konsequenzen
- Eine verlegte Vorstellung oder ein verschobener Kursstart ist ein neues Angebot mit neuer ID. Das ist gewollt, es ist ein anderer Termin.
- Ein neues Feld im Katalog ist eine Schemaänderung in `schema.ts` mit `schema:export`, kein Freitext.
- Python gibt es im Repo nicht mehr (ADR 0001).
