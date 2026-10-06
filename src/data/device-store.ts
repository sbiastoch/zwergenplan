/**
 * Geräte-Speicher für den Zuschnitt der Wochen-Nachricht (Plan 0011, E8; Plan 0017, E6; ADR 0014): IndexedDB
 * `zwergenplan`, Store `kv`, ohne npm-Paket. Läuft im Fenster und im Service Worker, der den `localStorage` nicht
 * lesen kann. Gefüllt nur, solange Push an ist; beim Abschalten geleert. Nichts davon verlässt das Gerät.
 */

/** Was gespiegelt wird (E6); `seenIds` schreibt nur der Service Worker (E3) */
export const DEVICE_KEYS = ["birthDate", "searches", "origin", "seenIds", "endpoint"] as const;
export type DeviceKey = (typeof DEVICE_KEYS)[number];

const DB = "zwergenplan";
const STORE = "kv";

let opening: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function get(key: DeviceKey): Promise<unknown> {
  return run("readonly", (store) => store.get(key));
}

/** `undefined` löscht den Eintrag */
export async function set(key: DeviceKey, value: unknown): Promise<void> {
  if (value === undefined) await run("readwrite", (store) => store.delete(key));
  else await run("readwrite", (store) => store.put(value, key));
}

/** Alles löschen (Push aus) */
export async function clear(): Promise<void> {
  await run("readwrite", (store) => store.clear());
}
