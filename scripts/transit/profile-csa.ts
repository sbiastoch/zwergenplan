/**
 * Profil-CSA, all-to-one (Plan 0009, E6; Dibbelt/Pajor/Strasser/Wagner, „Connection Scan Algorithm“, 2018).
 * Ein Lauf je Ort: Für jeden Steig entsteht ein Profil „Abfahrt ab Steig → früheste Ankunft am Ort“.
 *
 * Modell:
 * - Sitzenbleiben in derselben Fahrt kostet nichts.
 * - Umsteigen am selben Steig oder zu Fuß zu einem Steig ≤ 400 m kostet Fußweg + 1 Min. Puffer.
 *   Fußwege werden nicht verkettet (das Profil eines Steigs beginnt immer mit einem Einstieg dort).
 * - Abgang zum Ort von jedem Steig ≤ 800 m.
 * - Einsteigen nur mit Flag-Bit 1, Aussteigen nur mit Flag-Bit 2 (Schema `Timetable`).
 * - Fußweg: `walkMinutes` aus `src/domain/transit.ts`, dieselbe Funktion wie im Browser.
 *
 * Rein: keine Dateien, kein Netz (dependency-cruiser `transit-build-pure`). Gegen eine Vorwärts-CSA geprüft
 * (nur im Test), für jeden Steig und jede Minute.
 */
import { type GeoPoint, haversineMeters } from "../../src/domain/geo.ts";
import { valueAt, walkMinutes } from "../../src/domain/transit.ts";

/** Fußweg-Umstieg bis hierhin (Luftlinie, inklusiv) */
export const TRANSFER_METERS = 400;
/** Puffer je Umstieg, auch am selben Steig */
export const TRANSFER_BUFFER_SECONDS = 60;
/** Abgang vom Steig zum Ort bis hierhin (Luftlinie, inklusiv) */
export const EGRESS_METERS = 800;

const BOARD = 1;
const ALIGHT = 2;
const INF = Number.POSITIVE_INFINITY;
/** Meter je Grad Breite auf der Kugel aus `geo.ts` */
const METERS_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

/** Was die CSA vom Auszug braucht (Teilmenge von `Timetable`) */
export interface NetworkInput {
  stops: readonly (readonly [id: string, lat: number, lon: number])[];
  trips: readonly { stops: readonly number[]; times: readonly number[]; flags: readonly number[] }[];
}

/** Fahrtabschnitt Halt → nächster Halt; `seq` ist die Position in der Fahrt */
export interface Connection {
  dep: number;
  arr: number;
  from: number;
  to: number;
  trip: number;
  seq: number;
  board: boolean;
  alight: boolean;
}

/**
 * Scan-Reihenfolge (M4): absteigend nach Abfahrt, dann absteigend nach Ankunft, dann nach Fahrt und
 * absteigend nach Position. Bei `dep == arr` kommt so die spätere Verbindung derselben Fahrt zuerst,
 * und die frühere kennt den Wert „sitzen bleiben“ schon.
 */
export function connectionOrder(a: Connection, b: Connection): number {
  return b.dep - a.dep || b.arr - a.arr || a.trip - b.trip || b.seq - a.seq;
}

/** Netz in typisierten Arrays, Verbindungen in `connectionOrder` */
export interface Network {
  stops: number;
  lat: Float64Array;
  lon: Float64Array;
  trips: number;
  connections: number;
  dep: Int32Array;
  arr: Int32Array;
  from: Int32Array;
  to: Int32Array;
  trip: Int32Array;
  /** Bit 1 Einsteigen, Bit 2 Aussteigen */
  flags: Uint8Array;
  /** Umstiege je Steig (CSR): `transferTo[transferStart[s] … transferStart[s + 1] − 1]` */
  transferStart: Int32Array;
  transferTo: Int32Array;
  /** Fußweg + Puffer in Sekunden */
  transferSeconds: Float64Array;
}

/** Zeiten des Auszugs: erster Wert absolut, danach Differenzen → absolute Sekunden */
function absoluteTimes(times: readonly number[]): number[] {
  let acc = 0;
  return times.map((v) => {
    acc += v;
    return acc;
  });
}

function connectionsOf(input: NetworkInput, from: number): Connection[] {
  const out: Connection[] = [];
  input.trips.forEach((trip, index) => {
    const abs = absoluteTimes(trip.times);
    for (let k = 0; k + 1 < trip.stops.length; k++) {
      const dep = valueAt(abs, 2 * k + 1);
      // Vor dem Fenster beginnt keine Reise; diese Abschnitte tragen nichts bei.
      if (dep < from) continue;
      out.push({
        dep,
        arr: valueAt(abs, 2 * k + 2),
        from: valueAt(trip.stops, k),
        to: valueAt(trip.stops, k + 1),
        trip: index,
        seq: k,
        board: (valueAt(trip.flags, k) & BOARD) !== 0,
        alight: (valueAt(trip.flags, k + 1) & ALIGHT) !== 0,
      });
    }
  });
  return out.sort(connectionOrder);
}

/** Paare von Steigen ≤ `TRANSFER_METERS` über ein Gitter, inklusive des Steigs selbst (nur Puffer) */
function transfersOf(lat: Float64Array, lon: Float64Array) {
  const n = lat.length;
  const maxLat = lat.reduce((m, v) => Math.max(m, v), -90);
  // Zellen mindestens so groß wie der Umstiegsradius, auch am nördlichsten Steig
  const cellLat = TRANSFER_METERS / METERS_PER_DEGREE;
  const cellLon = cellLat / Math.cos((maxLat * Math.PI) / 180);
  const cellOf = (i: number): [y: number, x: number] => [
    Math.floor(valueAt(lat, i) / cellLat),
    Math.floor(valueAt(lon, i) / cellLon),
  ];
  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const [y, x] = cellOf(i);
    const key = `${y},${x}`;
    const cell = grid.get(key);
    if (cell) cell.push(i);
    else grid.set(key, [i]);
  }
  const start = new Int32Array(n + 1);
  const to: number[] = [];
  const seconds: number[] = [];
  for (let i = 0; i < n; i++) {
    start[i] = to.length;
    const [y, x] = cellOf(i);
    const here = { lat: valueAt(lat, i), lon: valueAt(lon, i) };
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(`${y + dy},${x + dx}`) ?? []) {
          const meters = haversineMeters(here, { lat: valueAt(lat, j), lon: valueAt(lon, j) });
          if (meters > TRANSFER_METERS) continue;
          to.push(j);
          seconds.push(walkMinutes(meters) * 60 + TRANSFER_BUFFER_SECONDS);
        }
      }
    }
  }
  start[n] = to.length;
  return { transferStart: start, transferTo: Int32Array.from(to), transferSeconds: Float64Array.from(seconds) };
}

/** Baut das Netz einmal je Auszug; `from` ist der Beginn des Abfahrtsfensters in Sekunden. */
export function buildNetwork(input: NetworkInput, opts: { from: number }): Network {
  const conns = connectionsOf(input, opts.from);
  const lat = Float64Array.from(input.stops.map(([, la]) => la));
  const lon = Float64Array.from(input.stops.map(([, , lo]) => lo));
  return {
    stops: input.stops.length,
    lat,
    lon,
    trips: input.trips.length,
    connections: conns.length,
    dep: Int32Array.from(conns, (c) => c.dep),
    arr: Int32Array.from(conns, (c) => c.arr),
    from: Int32Array.from(conns, (c) => c.from),
    to: Int32Array.from(conns, (c) => c.to),
    trip: Int32Array.from(conns, (c) => c.trip),
    flags: Uint8Array.from(conns, (c) => (c.board ? BOARD : 0) | (c.alight ? ALIGHT : 0)),
    ...transfersOf(lat, lon),
  };
}

/** Fußweg in Sekunden von jedem Steig zum Ort, `Infinity` über `maxMeters` */
export function egressSeconds(net: Network, place: GeoPoint, maxMeters = EGRESS_METERS): Float64Array {
  const out = new Float64Array(net.stops);
  for (let s = 0; s < net.stops; s++) {
    const meters = haversineMeters({ lat: valueAt(net.lat, s), lon: valueAt(net.lon, s) }, place);
    out[s] = meters <= maxMeters ? walkMinutes(meters) * 60 : INF;
  }
  return out;
}

/** Profile aller Steige zu einem Ort */
export interface Profiles {
  /** Früheste Ankunft am Ort bei Einstieg an `stop` ab Zeitpunkt `t` (ohne direkten Abgang) */
  earliestArrival(stop: number, t: number): number;
  /** Wie `earliestArrival` für `t = from + i · step`, `i = 0 … count − 1`, in einem Durchgang */
  sweep(stop: number, from: number, step: number, count: number, out: Float64Array): void;
}

/**
 * Ein Scan über alle Verbindungen in `connectionOrder`. Je Steig liegt das Profil als verkettete Liste
 * (Pareto-Menge): Der Kopf hat die früheste Abfahrt, jeder Nachfolger eine spätere Abfahrt und Ankunft.
 */
export function scanProfiles(net: Network, egress: Float64Array): Profiles {
  const n = net.connections;
  const head = new Int32Array(net.stops).fill(-1);
  const pDep = new Int32Array(n);
  const pArr = new Float64Array(n);
  const pNext = new Int32Array(n);
  let size = 0;
  const inTrip = new Float64Array(net.trips).fill(INF);
  const { dep, arr, from, to, trip, flags, transferStart, transferTo, transferSeconds } = net;

  const earliestArrival = (stop: number, t: number): number => {
    let e = valueAt(head, stop);
    while (e !== -1 && valueAt(pDep, e) < t) e = valueAt(pNext, e);
    return e === -1 ? INF : valueAt(pArr, e);
  };

  for (let i = 0; i < n; i++) {
    const tr = valueAt(trip, i);
    const f = valueAt(flags, i);
    let best = valueAt(inTrip, tr);
    if (f & ALIGHT) {
      const stop = valueAt(to, i);
      const at = valueAt(arr, i);
      best = Math.min(best, at + valueAt(egress, stop));
      const end = valueAt(transferStart, stop + 1);
      for (let k = valueAt(transferStart, stop); k < end; k++) {
        best = Math.min(best, earliestArrival(valueAt(transferTo, k), at + valueAt(transferSeconds, k)));
      }
    }
    if (best === INF) continue;
    inTrip[tr] = best;
    if (!(f & BOARD)) continue;
    const stop = valueAt(from, i);
    const d = valueAt(dep, i);
    const h = valueAt(head, stop);
    // dominiert: eine spätere (oder gleich frühe) Abfahrt kommt mindestens so früh an
    if (h !== -1 && valueAt(pArr, h) <= best) continue;
    if (h !== -1 && pDep[h] === d) {
      pArr[h] = best;
      continue;
    }
    pDep[size] = d;
    pArr[size] = best;
    pNext[size] = h;
    head[stop] = size++;
  }

  return {
    earliestArrival,
    sweep(stop, start, step, count, out) {
      let e = valueAt(head, stop);
      for (let i = 0; i < count; i++) {
        const t = start + i * step;
        while (e !== -1 && valueAt(pDep, e) < t) e = valueAt(pNext, e);
        out[i] = e === -1 ? INF : valueAt(pArr, e);
      }
    },
  };
}
