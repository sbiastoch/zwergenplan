import { afterEach, describe, expect, it, vi } from "vitest";

const chunkLoaded = vi.fn();
/**
 * Ersetzt den Chunk für den nächsten frischen Import; die ersten `failures` Importe scheitern wie ein Netzfehler beim
 * Laden von assets/export/. `vi.doMock` je Test: Ein gehobenes `vi.mock` wertet seine Fabrik nur einmal je Datei aus.
 */
function mockChunk(failures = 0) {
  let left = failures;
  vi.doMock("../domain/ics.ts", () => {
    chunkLoaded();
    if (left > 0) {
      left -= 1;
      throw new Error("Chunk nicht ladbar");
    }
    return { icsContextFor: () => ({}), icsForCollection: () => "BEGIN:VCALENDAR" };
  });
}

afterEach(() => {
  vi.doUnmock("../domain/ics.ts");
  vi.resetModules();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  chunkLoaded.mockClear();
});

describe("loadExport (Plan 0010, E8 A; Plan 0018, E5)", () => {
  it("Vorladen und Export teilen sich einen Ladevorgang: ein Chunk", async () => {
    mockChunk();
    const { loadExport } = await import("./ics-export.ts");
    const first = loadExport();
    expect(loadExport()).toBe(first);
    expect((await first).icsForCollection([], "Zwergenplan – Merkliste")).toBe("BEGIN:VCALENDAR");
    expect(chunkLoaded).toHaveBeenCalledTimes(1);
  });

  it("ein Fehlschlag setzt den Ladevorgang zurück: der nächste Aufruf lädt neu", async () => {
    mockChunk(1);
    const { loadExport } = await import("./ics-export.ts");
    // vitest hüllt den Fehler der Fabrik in eine eigene Meldung; es zählt nur, dass der Import scheitert
    await expect(loadExport()).rejects.toBeInstanceOf(Error);
    expect(typeof (await loadExport()).icsContextFor).toBe("function");
    expect(chunkLoaded).toHaveBeenCalledTimes(2);
  });

  it("das Vorladen im Leerlauf schluckt einen Fehlschlag, der Export lädt danach neu", async () => {
    vi.stubGlobal("requestIdleCallback", (run: () => void) => {
      run();
      return 1;
    });
    mockChunk(1);
    const { loadExport, preloadExportWhenIdle } = await import("./ics-export.ts");
    preloadExportWhenIdle();
    await vi.waitFor(() => expect(chunkLoaded).toHaveBeenCalledTimes(1));
    expect(typeof (await loadExport()).icsForCollection).toBe("function");
    expect(chunkLoaded).toHaveBeenCalledTimes(2);
  });

  it("das Aufräumen bricht ein noch nicht gestartetes Vorladen ab", async () => {
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", () => 7);
    vi.stubGlobal("cancelIdleCallback", cancel);
    mockChunk();
    const { preloadExportWhenIdle } = await import("./ics-export.ts");
    preloadExportWhenIdle()();
    expect(cancel).toHaveBeenCalledWith(7);
    expect(chunkLoaded).not.toHaveBeenCalled();
  });
});

/** Gerade genug DOM für `download`: Die Unit-Tests laufen ohne DOM-Umgebung. */
class FakeNode {
  readonly children: FakeNode[] = [];
  parent: FakeNode | undefined;
  href = "";
  download = "";
  /** Tag des Elternelements bei jedem `click()` */
  readonly clickedIn: Array<string | undefined> = [];
  readonly tag: string;
  constructor(tag: string) {
    this.tag = tag;
  }
  append(child: FakeNode) {
    child.parent = this;
    this.children.push(child);
  }
  remove() {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = undefined;
  }
  click() {
    this.clickedIn.push(this.parent?.tag);
  }
}

function fakeDocument() {
  const body = new FakeNode("body");
  const links: FakeNode[] = [];
  vi.stubGlobal("document", {
    body,
    createElement: (tag: string) => {
      const node = new FakeNode(tag);
      if (tag === "a") links.push(node);
      return node;
    },
  });
  const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:zp-test");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { body, links, createUrl, revoke };
}

describe("download (Plan 0018, E2)", () => {
  it("hängt den Hilfslink in den übergebenen Container, nicht in body, und räumt ihn wieder ab", async () => {
    const { download } = await import("./ics-export.ts");
    vi.useFakeTimers();
    const { body, links, createUrl, revoke } = fakeDocument();
    // Im Detail ein Element im modalen <dialog>, dessen Umgebung inert ist
    const container = document.createElement("div");

    download("BEGIN:VCALENDAR", "offener-krabbeltreff.ics", container);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      href: "blob:zp-test",
      download: "offener-krabbeltreff.ics",
      clickedIn: ["div"],
      parent: undefined,
    });
    expect(container.children).toHaveLength(0);
    expect(body.children).toHaveLength(0);
    const blob = createUrl.mock.calls[0]?.[0];
    if (!(blob instanceof Blob)) throw new Error("createObjectURL ohne Blob");
    expect(blob.type).toBe("text/calendar;charset=utf-8");
    expect(await blob.text()).toBe("BEGIN:VCALENDAR");
    // Die URL bleibt 10 s gültig: Manche Browser lesen die Datei asynchron.
    vi.advanceTimersByTime(9_999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith("blob:zp-test");
  });

  it("ohne Container hängt der Link an body, wie bisher in der Merkliste", async () => {
    const { download } = await import("./ics-export.ts");
    const { body, links } = fakeDocument();

    download("BEGIN:VCALENDAR", "zwergenplan-merkliste.ics");

    expect(links[0]).toMatchObject({ download: "zwergenplan-merkliste.ics", clickedIn: ["body"] });
    expect(body.children).toHaveLength(0);
  });
});
