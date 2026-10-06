/**
 * Cloudflare Worker der Push-Abos (Plan 0011, E11; Plan 0017; ADR 0014). Verdrahtet nur die Workers-Laufzeit;
 * die Routen stehen testbar in `handler.ts`. Deploy: `pnpm push:deploy`.
 */
import { type Env, handle } from "./handler.ts";

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env & { PUSH: KVNamespace }>;
