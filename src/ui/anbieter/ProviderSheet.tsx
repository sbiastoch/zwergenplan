/** Stub aus dem Schritt „Schnittstellen“ (Plan 0010, E13), Paket B ersetzt ihn durch das Anbieter-Sheet. */
import { Icon } from "../icons.tsx";
import type { ProviderSheetProps } from "../provider-types.ts";

export function ProviderSheet({ directory, providerId, onClose }: ProviderSheetProps) {
  const provider = directory.providers.find((p) => p.id === providerId);
  return (
    <div className="sheet-body">
      <h2>{provider?.name ?? providerId}</h2>
      <button type="button" className="btn" onClick={onClose}>
        <Icon name="back" size={20} /> Schließen
      </button>
    </div>
  );
}
