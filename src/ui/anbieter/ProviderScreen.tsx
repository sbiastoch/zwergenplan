/**
 * Stub aus dem Schritt „Schnittstellen“ (Plan 0010, E13), Paket B ersetzt ihn durch die Anbieterliste. Er nutzt mit
 * Absicht geteilte Start-Module (Icon, format.ts samt time.ts) wie die echte Liste: Nur so zeigt der Chunk-Wächter,
 * ob Rolldown sie abspaltet (ADR 0012).
 */
import { useState } from "react";
import { plural, standDate } from "../format.ts";
import { Icon } from "../icons.tsx";
import type { ProviderScreenProps } from "../provider-types.ts";

export function ProviderScreen({ directory, query, onQuery }: ProviderScreenProps) {
  const [count] = useState(directory.providers.length);
  return (
    <section aria-label="Anbieter">
      <label>
        <Icon name="search" size={20} /> Anbieter suchen
        <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} />
      </label>
      <p className="small">
        {count} {plural(count, "Anbieter", "Anbieter")}, Stand {standDate(directory.generatedAt)}
      </p>
    </section>
  );
}
