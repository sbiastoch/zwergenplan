/**
 * Suchfeld des Tabs „Anbieter“ (Plan 0010, E5; Plan 0025, E3): im Start, damit es über der Statuszeile steht. Der
 * Suchtext lebt in App.tsx, die Ansage der Trefferzahl macht die Liste im Chunk.
 */
import { useId } from "react";

export function ProviderSearch({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  const inputId = useId();
  return (
    <div className="provider-search">
      <label htmlFor={inputId}>Anbieter suchen</label>
      <input
        id={inputId}
        type="search"
        placeholder="z. B. Bibliothek"
        enterKeyHint="search"
        autoComplete="off"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
    </div>
  );
}
