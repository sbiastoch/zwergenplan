/**
 * Anbieterübersicht, Teil im Startbundle (Plan 0010, E3, E6, E7): Lader für den Lazy-Chunk anbieter/ samt Katalog
 * (`anbieter.json`), Datenstand-Abgleich und die Zustände „laden“ und „Fehler“ in `.lazy-box`.
 * - `ProviderPanel`: Tab „Anbieter“.
 * - `ProviderSheetLoader`: Inhalt des Anbieter-Sheets; den Dialog rendert Overlays.tsx immer, diesen Inhalt nur offen.
 * - `preloadProviderUi`: Start mit `ansicht=anbieter` bzw. `anbieter=` in der URL (use-app-state.ts, `useRoute`).
 *
 * Screen und Sheet bekommen den Katalog schon abgeglichen (`ensureFresh`, Abweichung aus „Umsetzung“, Schritt 4):
 * So hängt der Chunk nicht an src/data/providers.ts.
 */
import { useEffect, useState } from "react";
import { ensureFresh, loadProviderDirectory } from "../data/providers.ts";
import type { ProviderDirectoryData } from "../domain/site-data.ts";
import { LoadFailed, useLazy } from "./Lazy.tsx";
import type { ProviderScreenProps, ProviderSheetProps, ProviderUiModule } from "./provider-types.ts";

/** Chunk und Katalog zusammen, wie sie Tab und Sheet brauchen */
interface ProviderUi extends ProviderUiModule {
  data: ProviderDirectoryData;
}

/** Ein Promise für Vorladen, Tab und Sheet: ein Chunk- und ein Daten-Request. Ein Fehlschlag leert ihn. */
let pending: Promise<ProviderUi> | undefined;

async function fetchUi(): Promise<ProviderUi> {
  const [ui, data] = await Promise.all([import("./anbieter/entry.ts"), loadProviderDirectory()]);
  return { ProviderScreen: ui.ProviderScreen, ProviderSheet: ui.ProviderSheet, data };
}

/**
 * Ohne Argument: stabile Identität für `useLazy` (Review 2, M1). Bleibt eine async-Kette mit `await import(…)`, wie
 * Lazy.tsx verlangt; den Datenstand gleicht `useFreshDirectory` danach ab.
 */
export function loadProviderUi(): Promise<ProviderUi> {
  pending ??= fetchUi().catch((e: unknown) => {
    pending = undefined;
    throw e;
  });
  return pending;
}

/** Startet Chunk und Katalog, bevor site.json da ist (E3). Ein Fehlschlag zeigt sich erst im Tab bzw. Sheet. */
export const preloadProviderUi = (): void => void loadProviderUi().catch(() => {});

/**
 * Katalog mit dem Datenstand von site.json (`expected`). Gleich: sofort. Abweichend: höchstens ein Reload
 * (`ensureFresh`), solange `undefined`. Ohne `expected` (site.json lädt noch, Deep-Link) ebenfalls `undefined`.
 */
function useFreshDirectory(
  data: ProviderDirectoryData | undefined,
  expected: string | undefined,
): ProviderDirectoryData | undefined {
  const [fresh, setFresh] = useState<{ expected: string; data: ProviderDirectoryData }>();
  const stale = data !== undefined && expected !== undefined && data.generatedAt !== expected;
  useEffect(() => {
    if (!stale || data === undefined || expected === undefined) return;
    let live = true;
    void ensureFresh(data, expected).then((next) => {
      if (live) setFresh({ expected, data: next });
    });
    return () => {
      live = false;
    };
  }, [stale, data, expected]);
  if (data === undefined || expected === undefined) return undefined;
  if (!stale) return data;
  return fresh?.expected === expected ? fresh.data : undefined;
}

function Loading({ children }: { children: string }) {
  return (
    <div className="lazy-box" aria-busy="true">
      <p className="lazy-note">{children}</p>
    </div>
  );
}

function Failed({ attempt, retry }: { attempt: number; retry: () => void }) {
  return (
    <div className="lazy-box">
      <LoadFailed attempt={attempt} retry={retry} className="lazy-note">
        Die Anbieter konnten nicht geladen werden.
      </LoadFailed>
    </div>
  );
}

type ProviderPanelProps = Omit<ProviderScreenProps, "directory"> & {
  /** Datenstand von site.json */
  generatedAt: string;
};

export function ProviderPanel({ generatedAt, ...props }: ProviderPanelProps) {
  const { module, attempt, retry } = useLazy(loadProviderUi);
  const directory = useFreshDirectory(module.kind === "da" ? module.View.data : undefined, generatedAt);
  if (module.kind === "fehler") return <Failed attempt={attempt} retry={retry} />;
  if (module.kind === "laden" || directory === undefined) return <Loading>Anbieter werden geladen …</Loading>;
  return <module.View.ProviderScreen {...props} directory={directory} />;
}

type ProviderSheetLoaderProps = Omit<ProviderSheetProps, "directory"> & {
  /** Datenstand von site.json; `undefined`, solange site.json noch lädt (Deep-Link `?anbieter=`) */
  generatedAt: string | undefined;
};

/**
 * Inhalt des Anbieter-Sheets (E3). Rendert nur bei offenem Dialog, erst dann lädt `useLazy`. Gibt es die ID weder im
 * Katalog noch in den Angeboten, meldet er das nach dem Laden (`onUnknown`), und die App entfernt `anbieter=`.
 */
export function ProviderSheetLoader({ generatedAt, ...props }: ProviderSheetLoaderProps) {
  const { providerId, offers, onUnknown, onClose } = props;
  const { module, attempt, retry } = useLazy(loadProviderUi);
  const directory = useFreshDirectory(module.kind === "da" ? module.View.data : undefined, generatedAt);
  const unknown =
    directory !== undefined &&
    !directory.providers.some((p) => p.id === providerId) &&
    !offers.some((o) => o.providerId === providerId);
  useEffect(() => {
    if (unknown) onUnknown();
  }, [unknown, onUnknown]);
  if (module.kind === "da" && directory !== undefined && !unknown) {
    return <module.View.ProviderSheet {...props} directory={directory} />;
  }
  return (
    // Hülle wie die übrigen Sheets: scrollender Inhalt, Fuß mit „Schließen“
    <div className="sheet-body">
      <div className="sheet-scroll">
        <div className="grab" />
        {module.kind === "fehler" ? (
          <Failed attempt={attempt} retry={retry} />
        ) : (
          <Loading>Anbieter wird geladen …</Loading>
        )}
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
