/**
 * `pushsubscriptionchange` (Plan 0011, E10.7; ADR 0014, Punkt 4): Der Browser hat das Abo ausgetauscht. Das neue Abo
 * beim Worker melden, das alte abmelden, den Endpoint merken. Der einzige Request ohne Tipp; er enthält nur das Abo.
 * Scheitert das Melden, bleibt alles stehen, und der Abgleich beim Öffnen des Kind-Sheets holt es nach.
 * Umgebung injiziert, `sw.ts` verdrahtet nur (Arch-Review M2).
 */
export interface ResubscribeEnv {
  /** Request an den Push-Worker (`/abo`); liefert, ob er erfolgreich war */
  send(method: "POST" | "DELETE", body: unknown): Promise<boolean>;
  store: { get(key: "endpoint"): Promise<unknown>; set(key: "endpoint", value: string): Promise<void> };
}

export async function resubscribe(
  fresh: { endpoint: string; toJSON(): unknown },
  oldEndpoint: string | undefined,
  env: ResubscribeEnv,
): Promise<void> {
  if (!(await env.send("POST", fresh.toJSON()))) return;
  const old = oldEndpoint ?? (await env.store.get("endpoint"));
  if (typeof old === "string" && old !== fresh.endpoint) {
    await env.send("DELETE", { endpoint: old }).catch(() => false);
  }
  await env.store.set("endpoint", fresh.endpoint);
}
