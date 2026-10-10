/**
 * Prüfungen über einzelne Einträge hinaus. Läuft nur in scripts/ (Build, CI, Hooks),
 * nie im Browser – die Oberfläche bekommt ausschließlich bereits geprüfte Daten.
 */
import { offerId } from "./ids.ts";
import { type OffersFile, OffersFile as OffersFileSchema, type Provider, ProvidersFile } from "./schema.ts";

export interface DatasetSummary {
  offers: number;
  providers: number;
  generatedAt: string;
}

export type ValidationResult =
  | { ok: true; providers: Provider[]; offers: OffersFile; summary: DatasetSummary }
  | { ok: false; errors: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;

export function validateDataset(rawProviders: unknown, rawOffers: unknown): ValidationResult {
  const errors: string[] = [];
  const p = ProvidersFile.safeParse(rawProviders);
  const o = OffersFileSchema.safeParse(rawOffers);
  if (!p.success) errors.push(...p.error.issues.map((i) => `providers.yaml ${i.path.join(".")}: ${i.message}`));
  if (!o.success) errors.push(...o.error.issues.map((i) => `offers.json ${i.path.join(".")}: ${i.message}`));
  if (!p.success || !o.success) return { ok: false, errors };

  const providers = p.data;
  const file = o.data;
  const generatedAt = Date.parse(file.generatedAt);

  const providerById = new Map<string, Provider>();
  const venueOwner = new Map<string, string>();
  for (const prov of providers) {
    if (providerById.has(prov.id)) errors.push(`Anbieter-ID doppelt: ${prov.id}`);
    providerById.set(prov.id, prov);
    if (prov.role !== "anbieter") continue;
    for (const v of prov.venues) {
      if (venueOwner.has(v.id)) errors.push(`Ort-ID doppelt: ${v.id}`);
      venueOwner.set(v.id, prov.id);
    }
  }

  for (const prov of providers) {
    if (prov.role !== "anbieter" || prov.coveredBy === undefined) continue;
    const via = providerById.get(prov.coveredBy);
    if (via?.role !== "aggregator")
      errors.push(`Anbieter ${prov.id}: coveredBy ${prov.coveredBy} ist kein Sammelkalender`);
  }

  const offerIds = new Set<string>();
  for (const offer of file.offers) {
    const where = `Angebot ${offer.id}`;
    if (offerIds.has(offer.id)) errors.push(`${where}: ID doppelt`);
    offerIds.add(offer.id);
    const provider = providerById.get(offer.providerId);
    if (!provider) errors.push(`${where}: unbekannter Anbieter ${offer.providerId}`);
    else if (provider.role !== "anbieter")
      errors.push(`${where}: ${offer.providerId} ist kein Anbieter (${provider.role})`);
    const first = offer.sessions[0];
    const expected = first && offerId({ ...offer, firstStart: first.start });
    if (expected !== offer.id) errors.push(`${where}: ID entspricht nicht der Regel (ADR 0006), erwartet ${expected}`);
    const owner = venueOwner.get(offer.venueId);
    if (owner === undefined) errors.push(`${where}: unbekannter Ort ${offer.venueId}`);
    else if (owner !== offer.providerId) errors.push(`${where}: Ort ${offer.venueId} gehört zu ${owner}`);
    const last = offer.sessions.at(-1);
    if (last && Date.parse(last.end) < generatedAt - DAY_MS)
      errors.push(`${where}: alle Termine liegen in der Vergangenheit`);
    if (Date.parse(offer.availability.checkedAt) > generatedAt + 60_000) {
      errors.push(`${where}: availability.checkedAt liegt nach generatedAt`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    providers,
    offers: file,
    summary: { offers: file.offers.length, providers: providers.length, generatedAt: file.generatedAt },
  };
}

/**
 * Schutz vor kaputten Pipeline-Läufen (ADR 0002): Vergleich mit dem zuletzt DEPLOYTEN Stand.
 * Ein leerer Bestand ist ein Fehler (außer bei Fixtures, die keinen echten Datenstand darstellen).
 */
export function checkPlausibility(
  current: DatasetSummary,
  deployed: DatasetSummary | undefined,
  opts: { fixture: boolean; now: Date },
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (current.offers === 0 && !opts.fixture)
    errors.push("Keine Angebote – ein leerer Datenstand wird nie veröffentlicht");
  if (deployed && deployed.offers > 0 && current.offers < deployed.offers * 0.5) {
    errors.push(`Angebote eingebrochen: ${deployed.offers} → ${current.offers} (> 50 %)`);
  }
  const ageDays = (opts.now.getTime() - Date.parse(current.generatedAt)) / DAY_MS;
  if (!opts.fixture && ageDays > 14) warnings.push(`Datenstand ist ${Math.floor(ageDays)} Tage alt`);
  return { errors, warnings };
}
