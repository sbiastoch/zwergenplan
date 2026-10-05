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
import { isKnownProvider } from "../domain/provider-count.ts";
import type { ProviderDirectoryData } from "../domain/site-data.ts";
import { LoadFailed, useLazy } from "./Lazy.tsx";
import type { ProviderScreenProps, ProviderSheetProps, ProviderUiModule } from "./provider-types.ts";

/** Chunk und Katalog zusammen, wie sie Tab und Sheet brauchen */
interface ProviderUi extends ProviderUiModule {
  data: ProviderDirectoryData;
}

/** Ein Promise für Vorladen, Tab und Sheet: ein Chunk- und ein Daten-Request. Ein Fehlschlag leert ihn. */
let pending: Promise<ProviderUi> | undefined;

/** Destrukturiert direkt am `import()`: So sieht knip, welche Exporte des Chunks genutzt werden. */
async function loadChunk(): Promise<ProviderUiModule> {
  const { ProviderScreen, ProviderSheet } = await import("./anbieter/entry.ts");
  return { ProviderScreen, ProviderSheet };
}

/** Schon geladen: für `useLazy` (peek), damit die Rückkehr in den Tab ohne Ladekasten auskommt */
let loaded: ProviderUi | undefined;
const peekProviderUi = (): ProviderUi | undefined => loaded;

async function fetchUi(): Promise<ProviderUi> {
  const [ui, data] = await Promise.all([loadChunk(), loadProviderDirectory()]);
  loaded = { ...ui, data };
  return loaded;
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
 * Abgeglichene Kataloge je Datenstand von site.json: Ein neuer Mount (Tabwechsel, nächstes Sheet) hat das Ergebnis so
 * sofort, ohne einen Frame mit dem Ladekasten (Arch-Review m4). `ensureFresh` merkt sich das Promise ohnehin.
 */
const fresh = new Map<string, ProviderDirectoryData>();

/**
 * Katalog mit dem Datenstand von site.json (`expected`). Gleich: sofort. Abweichend: höchstens ein Reload
 * (`ensureFresh`), solange `undefined`. Ohne `expected` (site.json lädt noch, Deep-Link) ebenfalls `undefined`.
 */
function useFreshDirectory(
  data: ProviderDirectoryData | undefined,
  expected: string | undefined,
): ProviderDirectoryData | undefined {
  const [, setResolved] = useState(0);
  const stale = data !== undefined && expected !== undefined && data.generatedAt !== expected;
  const known = expected === undefined ? undefined : fresh.get(expected);
  useEffect(() => {
    if (!stale || known !== undefined || data === undefined || expected === undefined) return;
    let live = true;
    void ensureFresh(data, expected).then((next) => {
      fresh.set(expected, next);
      if (live) setResolved((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [stale, known, data, expected]);
  if (data === undefined || expected === undefined) return undefined;
  return stale ? known : data;
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
  const { module, attempt, retry } = useLazy(loadProviderUi, peekProviderUi);
  const directory = useFreshDirectory(module.kind === "da" ? module.View.data : undefined, generatedAt);
  if (module.kind === "fehler") return <Failed attempt={attempt} retry={retry} />;
  if (module.kind === "laden" || directory === undefined) return <Loading>Anbieter werden geladen …</Loading>;
  return <module.View.ProviderScreen {...props} directory={directory} />;
}

type ProviderSheetLoaderProps = Omit<ProviderSheetProps, "directory"> & {
  /** ID weder im Katalog noch in den Angeboten: Die App entfernt `anbieter=` (E3) */
  onUnknown: () => void;
  /** Datenstand von site.json; `undefined`, solange site.json noch lädt (Deep-Link `?anbieter=`) */
  generatedAt: string | undefined;
};

/**
 * Inhalt des Anbieter-Sheets (E3). Rendert nur bei offenem Dialog, erst dann lädt `useLazy`. Gibt es die ID weder im
 * Katalog noch in den Angeboten, meldet er das nach dem Laden (`onUnknown`), und die App entfernt `anbieter=`.
 */
export function ProviderSheetLoader({ generatedAt, onUnknown, ...props }: ProviderSheetLoaderProps) {
  const { providerId, offers, onClose } = props;
  const { module, attempt, retry } = useLazy(loadProviderUi, peekProviderUi);
  const directory = useFreshDirectory(module.kind === "da" ? module.View.data : undefined, generatedAt);
  const unknown = directory !== undefined && !isKnownProvider(directory.providers, offers, providerId);
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
