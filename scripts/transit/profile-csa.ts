/**
 * Profil-CSA, all-to-one (Plan 0009, E6; Dibbelt/Pajor/Strasser/Wagner, „Connection Scan Algorithm“, 2018),
 * seit Plan 0012 (E3, ADR 0015) mit höchstens einem Umstieg. Ein Lauf je Ort: Für jeden Steig entsteht ein
 * Profil „Abfahrt ab Steig → bewertete und echte Ankunft am Ort“, mit den Fahrten dahinter.
 *
 * Modell:
 * - Erlaubt sind eine Fahrt (direkt) oder zwei Fahrten (ein Umstieg), mehr nie.
 * - Gewählt wird die kleinste bewertete Ankunft: echte Ankunft, bei einem Umstieg plus Aufschlag
 *   (`TRANSFER_PENALTY_SECONDS`). Der Aufschlag steckt nur im Vergleich, nie in der echten Ankunft.
 * - Sitzenbleiben in derselben Fahrt kostet nichts.
 * - Umsteigen am selben Steig oder zu Fuß zu einem Steig ≤ 400 m kostet Fußweg + 1 Min. Puffer.
 * - Abgang zum Ort von jedem Steig ≤ 1 500 m.
 * - Einsteigen nur mit Flag-Bit 1, Aussteigen nur mit Flag-Bit 2 (Schema `Timetable`).
 * - Fußweg: `walkMinutes` aus `src/domain/transit.ts`, dieselbe Funktion wie im Browser.
 *
 * Zwei Durchläufe je Ort: Ebene 0 (nur direkt) ist vollständig, bevor Ebene 1 (direkt oder ein Umstieg auf
 * eine Fahrt aus Ebene 0) sie liest. Der Aufschlag ist je Ebene konstant, also bleiben beide Profile FIFO.
 *
 * Rein: keine Dateien, kein Netz (dependency-cruiser `transit-build-pure`). Gegen eine Vorwärts-Referenz in zwei
 * Ebenen geprüft (nur im Test), für jeden Steig und jede Minute.
 */
import { type GeoPoint, haversineMeters } from "../../src/domain/geo.ts";
import { TRANSFER_PENALTY_MINUTES, valueAt, walkMinutes } from "../../src/domain/transit.ts";

/** Fußweg-Umstieg bis hierhin (Luftlinie, inklusiv) */
export const TRANSFER_METERS = 400;
/** Puffer je Umstieg, auch am selben Steig */
export const TRANSFER_BUFFER_SECONDS = 60;
/** Abgang vom Steig zum Ort bis hierhin (Luftlinie, inklusiv; Plan 0012, E2) */
export const EGRESS_METERS = 1500;
/** Aufschlag je Umstieg in der Wahl (Plan 0012, E2), abgeleitet aus der einzigen Quelle im Browser-Code */
export const TRANSFER_PENALTY_SECONDS = TRANSFER_PENALTY_MINUTES * 60;

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
  /**
   * Früheste **bewertete** Ankunft am Ort bei Einstieg an `stop` ab Zeitpunkt `t` (ohne direkten Abgang).
   * Nur Tests nutzen sie; die Tabelle nimmt `sweep`.
   */
  earliestArrival(stop: number, t: number): number;
  /**
   * Für `t = from + i · step`, `i = 0 … count − 1`, in einem Durchgang: bewertete Ankunft, echte Ankunft und
   * Eintrag (für `trips`, −1 = keiner).
   */
  sweep(
    stop: number,
    from: number,
    step: number,
    count: number,
    outRated: Float64Array,
    outReal: Float64Array,
    outEntry: Int32Array,
  ): void;
  /** Fahrten (Index in `trips` des Auszugs) eines Eintrags: die erste und, nach einem Umstieg, die zweite */
  trips(entry: number): [number] | [number, number];
}

/** Erster Index in `dep[lo … hi − 1]` (aufsteigend) mit `dep ≥ t`, sonst `hi` */
function lowerBound(dep: Int32Array, lo: number, hi: number, t: number): number {
  let a = lo;
  let b = hi;
  while (a < b) {
    const mid = (a + b) >>> 1;
    if (valueAt(dep, mid) < t) a = mid + 1;
    else b = mid;
  }
  return a;
}

/**
 * Zwei Scans über alle Verbindungen in `connectionOrder` (E3). Je Steig liegt das Profil als Pareto-Menge vor:
 * jeder spätere Eintrag hat eine spätere Abfahrt und eine spätere (bewertete) Ankunft.
 *
 * Gleichstand, festgeschrieben (Vergleiche strikt `<`): Sitzenbleiben vor Aussteigen; Abgang zum Ort vor
 * Umsteigen; Umstiege in der Reihenfolge der CSR-Liste. Über verschiedene Abfahrten bleibt bei gleicher
 * Bewertung die spätere (Pareto-Regel), bei gleicher Abfahrt und gleicher Bewertung die Direktverbindung.
 *
 * Überschreiben eines Eintrags (gleiche Abfahrt): Alle Felder werden gemeinsam ersetzt. In Ebene 0 ist das
 * unkritisch, weil Ebene 1 sie erst nach dem vollständigen Durchlauf liest; auf Einträge der Ebene 1 verweist
 * niemand.
 */
export function scanProfiles(net: Network, egress: Float64Array, opts: { penaltySeconds?: number } = {}): Profiles {
  const penalty = opts.penaltySeconds ?? TRANSFER_PENALTY_SECONDS;
  const n = net.connections;
  const { dep, arr, from, to, trip, flags, transferStart, transferTo, transferSeconds } = net;

  // ── Ebene 0: nur direkt ────────────────────────────────────────────────
  const head0 = new Int32Array(net.stops).fill(-1);
  const dep0 = new Int32Array(n);
  const arr0 = new Float64Array(n);
  const trip0 = new Int32Array(n);
  const next0 = new Int32Array(n);
  let size0 = 0;
  const inTrip0 = new Float64Array(net.trips).fill(INF);
  for (let i = 0; i < n; i++) {
    const tr = valueAt(trip, i);
    const f = valueAt(flags, i);
    let best = valueAt(inTrip0, tr);
    if (f & ALIGHT) {
      const out = valueAt(arr, i) + valueAt(egress, valueAt(to, i));
      if (out < best) best = out;
    }
    if (best === INF) continue;
    inTrip0[tr] = best;
    if (!(f & BOARD)) continue;
    const stop = valueAt(from, i);
    const d = valueAt(dep, i);
    const h = valueAt(head0, stop);
    if (h !== -1 && valueAt(dep0, h) === d) {
      if (best < valueAt(arr0, h)) {
        arr0[h] = best;
        trip0[h] = tr;
      }
      continue;
    }
    // dominiert: eine spätere Abfahrt kommt mindestens so früh an
    if (h !== -1 && valueAt(arr0, h) <= best) continue;
    dep0[size0] = d;
    arr0[size0] = best;
    trip0[size0] = tr;
    next0[size0] = h;
    head0[stop] = size0++;
  }

  // Ebene 0 als CSR je Steig, aufsteigend nach Abfahrt: Ebene 1 sucht darin binär.
  const start0 = new Int32Array(net.stops + 1);
  const sDep0 = new Int32Array(size0);
  const sArr0 = new Float64Array(size0);
  const sTrip0 = new Int32Array(size0);
  let k0 = 0;
  for (let s = 0; s < net.stops; s++) {
    start0[s] = k0;
    for (let e = valueAt(head0, s); e !== -1; e = valueAt(next0, e)) {
      sDep0[k0] = valueAt(dep0, e);
      sArr0[k0] = valueAt(arr0, e);
      sTrip0[k0] = valueAt(trip0, e);
      k0++;
    }
  }
  start0[net.stops] = k0;
  /** Eintrag der Ebene 0 an `stop` mit der frühesten Abfahrt ab `t`, sonst −1 */
  const entry0 = (stop: number, t: number): number => {
    const hi = valueAt(start0, stop + 1);
    const k = lowerBound(sDep0, valueAt(start0, stop), hi, t);
    return k < hi ? k : -1;
  };

  // ── Ebene 1: direkt oder ein Umstieg auf eine Fahrt der Ebene 0 ─────────
  const head = new Int32Array(net.stops).fill(-1);
  const pDep = new Int32Array(n);
  const pRated = new Float64Array(n);
  const pReal = new Float64Array(n);
  const pTrip = new Int32Array(n);
  /** Anschluss: Eintrag der Ebene 0 (CSR-Index) oder −1 = direkt */
  const pConn = new Int32Array(n);
  const pNext = new Int32Array(n);
  let size = 0;
  const rated1 = new Float64Array(net.trips).fill(INF);
  const real1 = new Float64Array(net.trips).fill(INF);
  const conn1 = new Int32Array(net.trips).fill(-1);
  for (let i = 0; i < n; i++) {
    const tr = valueAt(trip, i);
    const f = valueAt(flags, i);
    // 1. Sitzenbleiben: der bisherige Wert der Fahrt
    let best = valueAt(rated1, tr);
    let real = valueAt(real1, tr);
    let conn = valueAt(conn1, tr);
    if (f & ALIGHT) {
      const stop = valueAt(to, i);
      const at = valueAt(arr, i);
      // 2. Abgang zum Ort
      const out = at + valueAt(egress, stop);
      if (out < best) {
        best = out;
        real = out;
        conn = -1;
      }
      // 3. Umstiege in der Reihenfolge der CSR-Liste
      const end = valueAt(transferStart, stop + 1);
      for (let k = valueAt(transferStart, stop); k < end; k++) {
        const e = entry0(valueAt(transferTo, k), at + valueAt(transferSeconds, k));
        if (e === -1) continue;
        const r = valueAt(sArr0, e) + penalty;
        if (r < best) {
          best = r;
          real = valueAt(sArr0, e);
          conn = e;
        }
      }
    }
    if (best === INF) continue;
    rated1[tr] = best;
    real1[tr] = real;
    conn1[tr] = conn;
    if (!(f & BOARD)) continue;
    const stop = valueAt(from, i);
    const d = valueAt(dep, i);
    const h = valueAt(head, stop);
    if (h !== -1 && valueAt(pDep, h) === d) {
      const old = valueAt(pRated, h);
      // gleiche Abfahrt: kleinere Bewertung, bei Gleichstand die Direktverbindung (ADR 0015, Punkt 2)
      if (best < old || (best === old && conn === -1 && valueAt(pConn, h) !== -1)) {
        pRated[h] = best;
        pReal[h] = real;
        pTrip[h] = tr;
        pConn[h] = conn;
      }
      continue;
    }
    // dominiert: eine spätere Abfahrt ist mindestens so gut bewertet
    if (h !== -1 && valueAt(pRated, h) <= best) continue;
    pDep[size] = d;
    pRated[size] = best;
    pReal[size] = real;
    pTrip[size] = tr;
    pConn[size] = conn;
    pNext[size] = h;
    head[stop] = size++;
  }

  const first = (stop: number, t: number): number => {
    let e = valueAt(head, stop);
    while (e !== -1 && valueAt(pDep, e) < t) e = valueAt(pNext, e);
    return e;
  };

  return {
    earliestArrival(stop, t) {
      const e = first(stop, t);
      return e === -1 ? INF : valueAt(pRated, e);
    },
    sweep(stop, start, step, count, outRated, outReal, outEntry) {
      let e = valueAt(head, stop);
      for (let i = 0; i < count; i++) {
        const t = start + i * step;
        while (e !== -1 && valueAt(pDep, e) < t) e = valueAt(pNext, e);
        outRated[i] = e === -1 ? INF : valueAt(pRated, e);
        outReal[i] = e === -1 ? INF : valueAt(pReal, e);
        outEntry[i] = e;
      }
    },
    trips(entry) {
      const c = valueAt(pConn, entry);
      return c === -1 ? [valueAt(pTrip, entry)] : [valueAt(pTrip, entry), valueAt(sTrip0, c)];
    },
  };
}
