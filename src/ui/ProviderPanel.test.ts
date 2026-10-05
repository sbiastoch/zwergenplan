import { afterEach, describe, expect, it, vi } from "vitest";

const DATA = { generatedAt: "2026-10-05T06:00:00+02:00", providers: [] };

const loadProviderDirectory = vi.fn(async () => DATA);
vi.mock("../data/providers.ts", () => ({ loadProviderDirectory, ensureFresh: vi.fn() }));

const chunkLoaded = vi.fn();
vi.mock("./anbieter/entry.ts", () => {
  chunkLoaded();
  return { ProviderScreen: () => null, ProviderSheet: () => null };
});

afterEach(() => {
  vi.resetModules();
  loadProviderDirectory.mockClear();
  chunkLoaded.mockClear();
});

describe("loadProviderUi (Plan 0010, E7)", () => {
  it("hat keine Parameter: stabile Identität für useLazy", async () => {
    const { loadProviderUi } = await import("./ProviderPanel.tsx");
    expect(loadProviderUi.length).toBe(0);
  });

  it("Vorladen und useLazy teilen sich ein Promise: ein Chunk, ein Daten-Request", async () => {
    const { loadProviderUi, preloadProviderUi } = await import("./ProviderPanel.tsx");
    preloadProviderUi();
    const first = loadProviderUi();
    expect(loadProviderUi()).toBe(first);
    const ui = await first;
    expect(ui.data).toBe(DATA);
    expect(typeof ui.ProviderScreen).toBe("function");
    expect(typeof ui.ProviderSheet).toBe("function");
    expect(loadProviderDirectory).toHaveBeenCalledTimes(1);
    expect(chunkLoaded).toHaveBeenCalledTimes(1);
  });

  it("ein Fehlschlag leert den Speicher: der nächste Aufruf lädt neu", async () => {
    const { loadProviderUi, preloadProviderUi } = await import("./ProviderPanel.tsx");
    loadProviderDirectory.mockRejectedValueOnce(new Error("HTTP 503"));
    preloadProviderUi(); // schluckt den Fehler
    await expect(loadProviderUi()).rejects.toThrow("HTTP 503");
    expect((await loadProviderUi()).data).toBe(DATA);
    expect(loadProviderDirectory).toHaveBeenCalledTimes(2);
  });
});
