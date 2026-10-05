/** Gemeinsames für Tests gegen den Deploy-Build mit echten Daten (smoke.spec.ts, font-swap.smoke.spec.ts). */
import type { Page } from "@playwright/test";

export interface DataMeta {
  offers: number;
  generatedAt: string;
}

/** Datenstand aus meta.json, geprüft statt per Cast angenommen (e2e/ importiert nichts aus src/) */
export async function dataMeta(page: Page): Promise<DataMeta> {
  const res = await page.request.get("./data/meta.json");
  const json: unknown = await res.json();
  if (
    typeof json === "object" &&
    json !== null &&
    "offers" in json &&
    typeof json.offers === "number" &&
    "generatedAt" in json &&
    typeof json.generatedAt === "string"
  )
    return { offers: json.offers, generatedAt: json.generatedAt };
  throw new Error(`meta.json ohne offers/generatedAt: ${JSON.stringify(json).slice(0, 200)}`);
}
