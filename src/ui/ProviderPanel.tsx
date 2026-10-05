/**
 * Tab „Anbieter“, Teil im Startbundle (Plan 0010, E7): Platzhalter und Lader für den Lazy-Chunk anbieter/.
 *
 * Stand „Schnittstellen“ (E13): lädt nur den Chunk und reicht einen leeren Katalog durch. Paket A ergänzt
 * anbieter.json (`loadProviderDirectory`, `ensureFresh`), den gemeinsamen Lader `loadProviderUi` samt
 * `preloadProviderUi`, `ProviderSheetLoader` und die Zustände in `.lazy-box`.
 */
import { LoadFailed, useLazy } from "./Lazy.tsx";
import type { ProviderScreenProps, ProviderUiModule } from "./provider-types.ts";

async function loadProviderUi(): Promise<ProviderUiModule> {
  return await import("./anbieter/entry.ts");
}

type ProviderPanelProps = Omit<ProviderScreenProps, "directory"> & {
  /** Datenstand von site.json */
  generatedAt: string;
};

export function ProviderPanel({ generatedAt, ...props }: ProviderPanelProps) {
  const { module, attempt, retry } = useLazy(loadProviderUi);
  if (module.kind === "da") return <module.View.ProviderScreen {...props} directory={{ generatedAt, providers: [] }} />;
  return module.kind === "laden" ? (
    <p>Anbieter werden geladen …</p>
  ) : (
    <LoadFailed attempt={attempt} retry={retry}>
      Die Anbieter konnten nicht geladen werden.
    </LoadFailed>
  );
}
