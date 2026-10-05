import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type GeoPoint, haversineMeters } from "../../src/domain/geo.ts";
import { Timetable } from "../../src/domain/schema.ts";
import { walkMinutes } from "../../src/domain/transit.ts";
import {
  buildNetwork,
  type Connection,
  connectionOrder,
  EGRESS_METERS,
  egressSeconds,
  type NetworkInput,
  scanProfiles,
  TRANSFER_BUFFER_SECONDS,
  TRANSFER_METERS,
  TRANSFER_PENALTY_SECONDS,
} from "./profile-csa.ts";

// ── Hilfen ───────────────────────────────────────────────────────────────

const INF = Number.POSITIVE_INFINITY;
const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const BASE: GeoPoint = { lat: 49.45, lon: 11.07 };
/** Punkt `meters` nördlich von BASE (reine Breitendifferenz: Haversine = Bogenlänge) */
const at = (meters: number): GeoPoint => ({ lat: BASE.lat + meters / M_PER_DEG, lon: BASE.lon });
const hm = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;
/** Toleranz für Bewertungen (Plan 0012, E3): Fußwege sind Gleitkommazahlen */
const EPS = 1e-6;

interface TripSpec {
  stops: number[];
  /** je Halt [an, ab] in Sekunden (absolut) */
  at: [number, number][];
  /** je Halt: Bit 1 Einsteigen, Bit 2 Aussteigen; Standard 3 */
  flags?: number[];
}

/** Baut einen Auszug wie im Schema: Zeiten ab dem zweiten Wert als Differenz. */
function input(stops: GeoPoint[], trips: TripSpec[]): NetworkInput {
  return {
    stops: stops.map((p, i): [string, number, number] => [`de:09564:${i + 1}:1:1`, p.lat, p.lon]),
    trips: trips.map((t) => {
      const flat = t.at.flat();
      return {
        route: "X",
        stops: t.stops,
        times: flat.map((v, i) => (i === 0 ? v : v - (flat[i - 1] ?? 0))),
        flags: t.flags ?? t.stops.map(() => 3),
      };
    }),
  };
}

/** Fahrt `stops[0] → stops[1]`, ab `dep`, an `arr` */
const ride = (from: number, to: number, dep: number, arr: number): TripSpec => ({
  stops: [from, to],
  at: [
    [0, dep],
    [arr, 0],
  ],
});

interface Choice {
  /** echte Ankunft am Ort */
  real: number;
  /** bewertete Ankunft (echt + Aufschlag je Umstieg) */
  rated: number;
  /** Fahrten der gewählten Verbindung; leer = direkter Abgang zu Fuß */
  trips: number[];
}

/**
 * Wahl wie in der Tabelle (E4) für einen Steig und eine Abfahrtsminute: Profil-Eintrag gegen direkten
 * Abgang, kleinste Bewertung, bei Gleichstand der Abgang.
 */
function choose(
  inp: NetworkInput,
  place: GeoPoint,
  stop: number,
  t: number,
  opts: { penaltySeconds?: number; egressMeters?: number; from?: number } = {},
): Choice {
  const net = buildNetwork(inp, { from: opts.from ?? hm(8, 30) });
  const egress = egressSeconds(net, place, opts.egressMeters);
  const profiles = scanProfiles(net, egress, opts);
  const rated = new Float64Array(1);
  const real = new Float64Array(1);
  const entry = new Int32Array(1);
  profiles.sweep(stop, t, 60, 1, rated, real, entry);
  const walk = t + (egress[stop] ?? INF);
  if (walk <= (rated[0] ?? INF)) return { real: walk, rated: walk, trips: [] };
  const e = entry[0] ?? -1;
  return { real: real[0] ?? INF, rated: rated[0] ?? INF, trips: e === -1 ? [] : [...profiles.trips(e)] };
}

/** Echte Ankunft wie in der Tabelle */
const arrival = (inp: NetworkInput, place: GeoPoint, stop: number, t: number) => choose(inp, place, stop, t).real;

/** Verbindungen aus dem Rohformat, unabhängig vom Produktivcode, aufsteigend (Vorwärts-Referenzen) */
function rawConnections(inp: NetworkInput): Connection[] {
  const conns: Connection[] = [];
  inp.trips.forEach((trip, ti) => {
    let acc = 0;
    const abs = trip.times.map((v) => {
      acc += v;
      return acc;
    });
    for (let k = 0; k + 1 < trip.stops.length; k++) {
      conns.push({
        dep: abs[2 * k + 1] ?? 0,
        arr: abs[2 * k + 2] ?? 0,
        from: trip.stops[k] ?? 0,
        to: trip.stops[k + 1] ?? 0,
        trip: ti,
        seq: k,
        board: ((trip.flags[k] ?? 0) & 1) !== 0,
        alight: ((trip.flags[k + 1] ?? 0) & 2) !== 0,
      });
    }
  });
  return conns.sort((a, b) => a.dep - b.dep || a.arr - b.arr || a.trip - b.trip || a.seq - b.seq);
}

/** Umstiege ≤ 400 m mit Fußweg + Puffer, unabhängig vom Produktivcode */
function rawTransfers(inp: NetworkInput): Map<number, [to: number, seconds: number][]> {
  const coords = inp.stops.map(([, lat, lon]) => ({ lat, lon }));
  const out = new Map<number, [number, number][]>();
  coords.forEach((p, s) => {
    const list: [number, number][] = [];
    coords.forEach((q, r) => {
      const m = haversineMeters(p, q);
      if (m <= 400) list.push([r, walkMinutes(m) * 60 + 60]);
    });
    out.set(s, list);
  });
  return out;
}

/**
 * Früheste Ankunft an jedem Steig (Aussteigen) mit genau einer Fahrt, Einstieg nur an Steigen mit
 * `ready[s] ≤ dep`. Klassische Vorwärts-CSA ohne Umstieg.
 */
function oneRide(conns: readonly Connection[], ready: ReadonlyMap<number, number>, stops: number): Float64Array {
  const out = new Float64Array(stops).fill(INF);
  const inTrip = new Set<number>();
  for (const c of conns) {
    if (!inTrip.has(c.trip)) {
      if (!c.board || (ready.get(c.from) ?? INF) > c.dep) continue;
      inTrip.add(c.trip);
    }
    if (c.alight && c.arr < (out[c.to] ?? INF)) out[c.to] = c.arr;
  }
  return out;
}

/**
 * Vorwärts-Referenz in zwei Ebenen (T2, nur Testcode): `arr_0` = früheste Ankunft ohne Umstieg,
 * `arr_1` = früheste Ankunft mit genau einem Umstieg; Referenz = min(arr_0, arr_1 + P). Für P ≥ 0 ist das
 * gleichwertig zu „höchstens einem Umstieg“ in arr_1. Ohne direkten Abgang vom Startsteig.
 */
function twoLevelReference(
  conns: readonly Connection[],
  transfers: ReadonlyMap<number, [number, number][]>,
  egress: Float64Array,
  start: number,
  t: number,
  penalty: number,
): { arr0: number; arr1: number; rated: number } {
  const n = egress.length;
  const first = oneRide(conns, new Map([[start, t]]), n);
  let arr0 = INF;
  const ready = new Map<number, number>();
  first.forEach((a, s) => {
    if (!Number.isFinite(a)) return;
    arr0 = Math.min(arr0, a + (egress[s] ?? INF));
    for (const [to, sec] of transfers.get(s) ?? []) ready.set(to, Math.min(ready.get(to) ?? INF, a + sec));
  });
  let arr1 = INF;
  oneRide(conns, ready, n).forEach((a, s) => {
    arr1 = Math.min(arr1, a + (egress[s] ?? INF));
  });
  return { arr0, arr1, rated: Math.min(arr0, arr1 + penalty) };
}

/**
 * Unbegrenzte Vorwärts-Referenz (das Modell vor Plan 0012, nur Testcode): beliebig viele Umstiege ohne
 * Aufschlag. Dient nur dem Zähler „unbegrenzt wäre schneller“.
 */
function unboundedArrival(
  conns: readonly Connection[],
  transfers: ReadonlyMap<number, [number, number][]>,
  egress: Float64Array,
  start: number,
  t: number,
): number {
  const ready = new Map<number, number>([[start, t]]);
  const inTrip = new Set<number>();
  let best = INF;
  for (const c of conns) {
    if (c.dep < t) continue;
    if (!inTrip.has(c.trip)) {
      if (!c.board || (ready.get(c.from) ?? INF) > c.dep) continue;
      inTrip.add(c.trip);
    }
    if (!c.alight) continue;
    best = Math.min(best, c.arr + (egress[c.to] ?? INF));
    for (const [to, sec] of transfers.get(c.to) ?? []) {
      if (c.arr + sec < (ready.get(to) ?? INF)) ready.set(to, c.arr + sec);
    }
  }
  return best;
}

interface Counters {
  compared: number;
  finite: number;
  /** Minuten mit genau einem Umstieg im Optimum */
  transfer: number;
  /** Minuten, in denen die unbegrenzte Referenz schneller wäre */
  unboundedFaster: number;
  /** Minuten, in denen P = 0 und P = 600 verschieden wählen (Fahrtenzahl oder Ankunft) */
  penaltyMatters: number;
}

/**
 * Profil gegen die Referenz in zwei Ebenen für jeden Steig und jede Minute 8:30–10:29, mit P = 600 und P = 0
 * (T2). Prüft dabei die Rückverfolgung jedes Eintrags (T3).
 */
function compareWithReference(inp: NetworkInput, places: GeoPoint[], egressMeters: number): Counters {
  const from = hm(8, 30);
  const net = buildNetwork(inp, { from });
  const conns = rawConnections(inp);
  const transfers = rawTransfers(inp);
  const counters: Counters = { compared: 0, finite: 0, transfer: 0, unboundedFaster: 0, penaltyMatters: 0 };
  const rated = new Float64Array(120);
  const real = new Float64Array(120);
  const entry = new Int32Array(120);
  for (const place of places) {
    const egress = egressSeconds(net, place, egressMeters);
    const byPenalty = [TRANSFER_PENALTY_SECONDS, 0].map((penalty) => {
      const profiles = scanProfiles(net, egress, { penaltySeconds: penalty });
      const result: { rated: number; real: number; legs: number }[][] = [];
      for (let stop = 0; stop < inp.stops.length; stop++) {
        profiles.sweep(stop, from, 60, 120, rated, real, entry);
        const row: { rated: number; real: number; legs: number }[] = [];
        for (let m = 0; m < 120; m++) {
          const t = from + 60 * m;
          const ref = twoLevelReference(conns, transfers, egress, stop, t, penalty);
          const got = rated[m] ?? Number.NaN;
          const ok = Number.isFinite(ref.rated) ? Math.abs(got - ref.rated) <= EPS : got === INF;
          if (!ok)
            throw new Error(
              `P ${penalty}, Ort ${place.lat},${place.lon}, Steig ${stop}, Minute ${m}: ${got} ≠ ${ref.rated}`,
            );
          const e = entry[m] ?? -1;
          let legs = 0;
          if (e !== -1) {
            const trips = profiles.trips(e);
            legs = trips.length;
            checkTraceable(inp, egress, stop, t, trips, real[m] ?? INF);
            expect(Math.abs((real[m] ?? INF) + (legs - 1) * penalty - got)).toBeLessThanOrEqual(EPS);
          } else {
            expect(got).toBe(INF);
          }
          row.push({ rated: got, real: real[m] ?? INF, legs });
        }
        result.push(row);
      }
      return result;
    });
    const [withP, noP] = byPenalty;
    for (let stop = 0; stop < inp.stops.length; stop++) {
      for (let m = 0; m < 120; m++) {
        const a = withP?.[stop]?.[m];
        const b = noP?.[stop]?.[m];
        if (!a || !b) throw new Error("Lücke");
        counters.compared++;
        if (Number.isFinite(a.rated)) counters.finite++;
        if (a.legs === 2) counters.transfer++;
        const unbounded = unboundedArrival(conns, transfers, egress, stop, from + 60 * m);
        if (unbounded < b.rated - EPS) counters.unboundedFaster++;
        if (a.legs !== b.legs || Math.abs(a.real - b.real) > EPS) counters.penaltyMatters++;
      }
    }
  }
  return counters;
}

/**
 * T3: Die Fahrten eines Eintrags sind fahrbar und ergeben die echte Ankunft: Einstieg ab `t` am Startsteig mit
 * Flag, Ausstieg mit Flag, Umstieg ≤ 400 m mit Fußweg + 60 s, Abgang laut `egress` (≤ Radius).
 */
function checkTraceable(
  inp: NetworkInput,
  egress: Float64Array,
  start: number,
  t: number,
  trips: readonly number[],
  real: number,
) {
  expect(trips.length === 1 || trips.length === 2).toBe(true);
  const coords = inp.stops.map(([, lat, lon]) => ({ lat, lon }));
  const legs = (trip: number, boardAt: number, ready: number) => {
    const tr = inp.trips[trip];
    if (!tr) throw new Error(`Fahrt ${trip}`);
    let acc = 0;
    const abs = tr.times.map((v) => {
      acc += v;
      return acc;
    });
    const out: { stop: number; arr: number }[] = [];
    for (let k = 0; k + 1 < tr.stops.length; k++) {
      if (tr.stops[k] !== boardAt || ((tr.flags[k] ?? 0) & 1) === 0 || (abs[2 * k + 1] ?? 0) < ready) continue;
      for (let j = k + 1; j < tr.stops.length; j++) {
        if (((tr.flags[j] ?? 0) & 2) !== 0) out.push({ stop: tr.stops[j] ?? -1, arr: abs[2 * j] ?? 0 });
      }
    }
    return out;
  };
  const [a, b] = trips;
  const arrivals: number[] = [];
  for (const x of legs(a ?? -1, start, t)) {
    if (b === undefined) {
      arrivals.push(x.arr + (egress[x.stop] ?? INF));
      continue;
    }
    coords.forEach((p, s) => {
      const meters = haversineMeters(coords[x.stop] ?? BASE, p);
      if (meters > TRANSFER_METERS) return;
      for (const y of legs(b, s, x.arr + walkMinutes(meters) * 60 + TRANSFER_BUFFER_SECONDS)) {
        arrivals.push(y.arr + (egress[y.stop] ?? INF));
      }
    });
  }
  expect(arrivals.some((v) => Math.abs(v - real) <= EPS)).toBe(true);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("connectionOrder (M4)", () => {
  const c = (dep: number, arr: number, trip: number, seq: number): Connection => ({
    dep,
    arr,
    trip,
    seq,
    from: 0,
    to: 1,
    board: true,
    alight: true,
  });

  it("sortiert absteigend nach Abfahrt", () => {
    expect([c(10, 20, 0, 0), c(30, 40, 0, 1)].sort(connectionOrder).map((x) => x.dep)).toEqual([30, 10]);
  });

  it("sortiert bei gleicher Abfahrt absteigend nach Ankunft", () => {
    expect([c(10, 20, 0, 0), c(10, 50, 1, 0)].sort(connectionOrder).map((x) => x.arr)).toEqual([50, 20]);
  });

  it("sortiert bei Gleichstand nach Fahrt und absteigend nach Position in der Fahrt", () => {
    const sorted = [c(10, 10, 1, 2), c(10, 10, 0, 3), c(10, 10, 1, 3), c(10, 10, 0, 4)].sort(connectionOrder);
    expect(sorted.map((x) => [x.trip, x.seq])).toEqual([
      [0, 4],
      [0, 3],
      [1, 3],
      [1, 2],
    ]);
  });

  it("lässt bei zwei Verbindungen dep == arr derselben Fahrt sitzen bleiben", () => {
    // A → B → C zur selben Sekunde (Halte im Sekundenabstand gerundet), Ort direkt an C
    const stops = [at(0), at(2000), at(4000)];
    const inp = input(stops, [
      {
        stops: [0, 1, 2],
        at: [
          [hm(9, 0), hm(9, 0)],
          [hm(9, 0), hm(9, 0)],
          [hm(9, 0), hm(9, 0)],
        ],
      },
    ]);
    expect(choose(inp, at(4000), 0, hm(8, 55))).toEqual({ real: hm(9, 0), rated: hm(9, 0), trips: [0] });
  });
});

describe("Profil-CSA (T1, umgestellt auf höchstens einen Umstieg)", () => {
  it("fährt direkt und läuft vom Ausstieg zum Ort", () => {
    const inp = input([at(0), at(3000)], [ride(0, 1, hm(9, 0), hm(9, 10))]);
    const place = at(3150);
    expect(arrival(inp, place, 0, hm(8, 50))).toBeCloseTo(hm(9, 10) + walkMinutes(150) * 60, 6);
    // Abfahrt verpasst, keine weitere Fahrt: nur der Fußweg wäre möglich, aber 3 km > 1 500 m
    expect(arrival(inp, place, 0, hm(9, 1))).toBe(INF);
  });

  it("nimmt den nächsten Takt, wenn der Umstieg 30 s unter dem Puffer liegt", () => {
    expect(TRANSFER_BUFFER_SECONDS).toBe(60);
    const stops = [at(0), at(3000), at(6000)];
    const trips = (wait: number): TripSpec[] => [
      ride(0, 1, hm(9, 0), hm(9, 10)),
      ride(1, 2, hm(9, 10) + wait, hm(9, 20) + wait),
      ride(1, 2, hm(9, 20) + wait, hm(9, 30) + wait),
    ];
    // ein Umstieg: echte Ankunft wie bisher, Bewertung + 10 Min.
    expect(choose(input(stops, trips(30)), at(6000), 0, hm(9, 0))).toEqual({
      real: hm(9, 30, 30),
      rated: hm(9, 40, 30),
      trips: [0, 2],
    });
    expect(arrival(input(stops, trips(60)), at(6000), 0, hm(9, 0))).toBe(hm(9, 21));
  });

  it("bleibt ohne Puffer in derselben Fahrt sitzen", () => {
    const stops = [at(0), at(3000), at(6000)];
    const inp = input(stops, [
      {
        stops: [0, 1, 2],
        at: [
          [0, hm(9, 0)],
          [hm(9, 10), hm(9, 10)],
          [hm(9, 20), 0],
        ],
      },
    ]);
    expect(choose(inp, at(6000), 0, hm(9, 0))).toEqual({ real: hm(9, 20), rated: hm(9, 20), trips: [0] });
  });

  it("steigt zu Fuß bis 400 m um, bei 401 m nicht", () => {
    expect(TRANSFER_METERS).toBe(400);
    const trips = [ride(0, 1, hm(9, 0), hm(9, 10)), ride(2, 3, hm(9, 20), hm(9, 30))];
    const near = input([at(0), at(3000), at(3399.9), at(8000)], trips);
    expect(arrival(near, at(8000), 0, hm(9, 0))).toBe(hm(9, 30));
    const far = input([at(0), at(3000), at(3401), at(8000)], trips);
    expect(arrival(far, at(8000), 0, hm(9, 0))).toBe(INF);
  });

  it("rechnet Fußweg und Puffer in den Umstieg, ohne Fußwege zu verketten", () => {
    // Umstieg 300 m (5,2 Min. + 1 Min.): Anschluss 9:16 knapp verpasst, 9:17 erreicht
    const stops = [at(0), at(3000), at(3300), at(3600), at(9000)];
    const trips: TripSpec[] = [
      ride(0, 1, hm(9, 0), hm(9, 10)),
      ride(2, 4, hm(9, 16), hm(9, 30)),
      ride(2, 4, hm(9, 17), hm(9, 31)),
      // 3 liegt 600 m von 1, aber nur 300 m von 2: zwei Fußwege hintereinander gibt es nicht
      ride(3, 4, hm(9, 11), hm(9, 20)),
    ];
    expect(choose(input(stops, trips), at(9000), 0, hm(9, 0))).toEqual({
      real: hm(9, 31),
      rated: hm(9, 41),
      trips: [0, 2],
    });
  });

  it("nimmt nie zwei Umstiege, auch wenn der Weg sonst ginge (früher: Ankunft 9:30)", () => {
    // 0 → 1, umsteigen, 1 → 2 → 3, umsteigen, 3 → 4: drei Fahrten, also unerreichbar
    const stops = [at(0), at(3000), at(6000), at(9000), at(15_000)];
    const trips: TripSpec[] = [
      ride(0, 1, hm(9, 0), hm(9, 5)),
      {
        stops: [1, 2, 3],
        at: [
          [0, hm(9, 10)],
          [hm(9, 14), hm(9, 14)],
          [hm(9, 18), 0],
        ],
      },
      ride(3, 4, hm(9, 20), hm(9, 30)),
    ];
    // Ort an 4: 6 km von 3, nur mit drei Fahrten erreichbar
    expect(arrival(input(stops, trips), at(15_000), 0, hm(9, 0))).toBe(INF);
  });

  it("beachtet Einsteige- und Aussteigesperren", () => {
    const stops = [at(0), at(3000), at(6000)];
    const trip = (flags: number[]): TripSpec => ({
      stops: [0, 1, 2],
      at: [
        [0, hm(9, 0)],
        [hm(9, 10), hm(9, 10)],
        [hm(9, 20), 0],
      ],
      flags,
    });
    // Einsteigen an 0 verboten
    expect(arrival(input(stops, [trip([2, 3, 3])]), at(6000), 0, hm(9, 0))).toBe(INF);
    // Aussteigen an 2 verboten, Ort nur von 2 aus erreichbar
    expect(arrival(input(stops, [trip([3, 3, 1])]), at(6000), 0, hm(9, 0))).toBe(INF);
    // Aussteigen an 1 verboten: Durchfahren geht trotzdem
    expect(arrival(input(stops, [trip([3, 1, 3])]), at(6000), 0, hm(9, 0))).toBe(hm(9, 20));
    // Einsteigen an 1 verboten: dort Zusteigen unmöglich
    expect(arrival(input(stops, [trip([3, 2, 3])]), at(6000), 1, hm(9, 5))).toBe(INF);
  });

  it("lässt Verbindungen vor dem Fenster weg", () => {
    const inp = input([at(0), at(3000)], [ride(0, 1, hm(8, 0), hm(8, 10))]);
    expect(buildNetwork(inp, { from: hm(8, 30) }).connections).toBe(0);
    expect(buildNetwork(inp, { from: hm(7, 0) }).connections).toBe(1);
  });
});

describe("Radius des Abgangs (T6)", () => {
  it("geht vom Steig bis 1 500 m zum Ort, bei 1 501 m nicht", () => {
    expect(EGRESS_METERS).toBe(1500);
    const inp = input([at(0), at(5000)], [ride(0, 1, hm(9, 0), hm(9, 10))]);
    expect(arrival(inp, at(6500), 0, hm(9, 0))).toBeCloseTo(hm(9, 10) + walkMinutes(1500) * 60, 6);
    expect(arrival(inp, at(6501), 0, hm(9, 0))).toBe(INF);
    // direkter Abgang ohne Fahrt
    expect(arrival(inp, at(500), 0, hm(9, 5))).toBeCloseTo(hm(9, 5) + walkMinutes(500) * 60, 6);
  });
});

describe("Direktverbindung gegen einen Umstieg (T4, P = 10 Min.)", () => {
  // 0 → 2 direkt; 0 → 1, am selben Steig 1 umsteigen, 1 → 2. Ort direkt an 2.
  const stops = [at(0), at(3000), at(9000)];
  const net = (directArr: number) =>
    input(stops, [ride(0, 2, hm(9, 0), directArr), ride(0, 1, hm(9, 0), hm(9, 5)), ride(1, 2, hm(9, 10), hm(9, 20))]);

  it("Direktverbindung 9 Min. langsamer als der Umstiegsweg → Direktverbindung", () => {
    expect(TRANSFER_PENALTY_SECONDS).toBe(600);
    expect(choose(net(hm(9, 29)), at(9000), 0, hm(9, 0))).toEqual({
      real: hm(9, 29),
      rated: hm(9, 29),
      trips: [0],
    });
  });

  it("11 Min. langsamer → Umstieg, mit der echten Ankunft", () => {
    expect(choose(net(hm(9, 31)), at(9000), 0, hm(9, 0))).toEqual({
      real: hm(9, 20),
      rated: hm(9, 30),
      trips: [1, 2],
    });
  });

  it("Ziel nur mit zwei Umstiegen erreichbar → kein Eintrag", () => {
    const inp = input(
      [at(0), at(3000), at(6000), at(9000)],
      [ride(0, 1, hm(9, 0), hm(9, 5)), ride(1, 2, hm(9, 10), hm(9, 15)), ride(2, 3, hm(9, 20), hm(9, 25))],
    );
    expect(choose(inp, at(9000), 0, hm(9, 0))).toEqual({ real: INF, rated: INF, trips: [] });
  });
});

describe("Gleichstand (T5)", () => {
  const stops = [at(0), at(3000), at(9000), at(3000)];

  it("Sitzenbleiben vor Umstieg: gleiche Bewertung → in der Fahrt bleiben", () => {
    // Fahrt 0: 0 → 1 → 2 (an 9:30). An 1 umsteigen auf Fahrt 1 nach 2 (an 9:20, bewertet 9:30).
    const inp = input(stops, [
      {
        stops: [0, 1, 2],
        at: [
          [0, hm(9, 0)],
          [hm(9, 5), hm(9, 5)],
          [hm(9, 30), 0],
        ],
      },
      ride(1, 2, hm(9, 10), hm(9, 20)),
    ]);
    expect(choose(inp, at(9000), 0, hm(9, 0)).trips).toEqual([0]);
  });

  it("gleiche Abfahrt, genau 10 Min. Unterschied → Direktverbindung, auch wenn der Umstiegsweg zuerst gescannt wird", () => {
    // Direkt 0 → 3 → 2 (erste Verbindung an 9:01), Umstieg 0 → 1 (an 9:05) und 1 → 2: Bei gleicher Abfahrt
    // kommt die Verbindung mit der späteren Ankunft zuerst, hier also der Umstiegsweg (connectionOrder).
    const inp = input(
      [at(0), at(3000), at(9000), at(500)],
      [
        {
          stops: [0, 3, 2],
          at: [
            [0, hm(9, 0)],
            [hm(9, 1), hm(9, 1)],
            [hm(9, 30), 0],
          ],
        },
        ride(0, 1, hm(9, 0), hm(9, 5)),
        ride(1, 2, hm(9, 10), hm(9, 20)),
      ],
    );
    expect(choose(inp, at(9000), 0, hm(9, 0))).toEqual({ real: hm(9, 30), rated: hm(9, 30), trips: [0] });
    // Gegenprobe: eine Sekunde schneller gewinnt der Umstieg
    const faster = input(
      [at(0), at(3000), at(9000), at(500)],
      [ride(0, 2, hm(9, 0), hm(9, 30)), ride(0, 1, hm(9, 0), hm(9, 5)), ride(1, 2, hm(9, 10), hm(9, 19, 59))],
    );
    expect(choose(faster, at(9000), 0, hm(9, 0)).trips).toEqual([1, 2]);
  });

  it("gleiche Bewertung, Umstiegsweg fährt später ab → Umstiegsweg (Pareto-Regel, Review 2, W2)", () => {
    const inp = input(stops, [
      // direkt ab 9:00, an 9:40
      ride(0, 2, hm(9, 0), hm(9, 40)),
      // ab 9:05, umsteigen an 1, an 9:30 (bewertet 9:40)
      ride(0, 1, hm(9, 5), hm(9, 10)),
      ride(1, 2, hm(9, 15), hm(9, 30)),
    ]);
    expect(choose(inp, at(9000), 0, hm(9, 0))).toEqual({ real: hm(9, 30), rated: hm(9, 40), trips: [1, 2] });
  });

  it("gleiche Bewertung, Direktverbindung fährt später ab → Direktverbindung", () => {
    const inp = input(stops, [
      ride(0, 2, hm(9, 5), hm(9, 40)),
      ride(0, 1, hm(9, 0), hm(9, 10)),
      ride(1, 2, hm(9, 15), hm(9, 30)),
    ]);
    expect(choose(inp, at(9000), 0, hm(9, 0))).toEqual({ real: hm(9, 40), rated: hm(9, 40), trips: [0] });
  });

  it("zwei Umstiege gleicher Bewertung → der erste der Umstiegsliste", () => {
    // Steige 1 und 3 liegen am selben Punkt; von 1 aus sind 1 und 3 Umstiegsziele, in Index-Reihenfolge
    const inp = input(stops, [
      ride(0, 1, hm(9, 0), hm(9, 5)),
      ride(3, 2, hm(9, 10), hm(9, 20)),
      ride(1, 2, hm(9, 10), hm(9, 20)),
    ]);
    expect(choose(inp, at(9000), 0, hm(9, 0)).trips).toEqual([0, 2]);
  });
});

describe("Referenz in zwei Ebenen und Rückverfolgung (T2, T3)", () => {
  it("gleicht der Referenz für jeden Steig und jede Minute (Fixture-Netz)", () => {
    const fixture = Timetable.parse(
      JSON.parse(readFileSync(new URL("../../tests/fixtures/oepnv/fahrplan.json", import.meta.url), "utf8")),
    );
    // die fünf Fixture-Orte (tests/fixtures/providers.yaml), dazu Gostenhof und ein Punkt im Nirgendwo
    const places: GeoPoint[] = [
      { lat: 49.4521, lon: 11.0767 },
      { lat: 49.4362, lon: 11.0851 },
      { lat: 49.4498, lon: 11.0812 },
      { lat: 49.4495, lon: 11.0601 },
      { lat: 49.4301, lon: 11.0892 },
      { lat: 49.448, lon: 11.058 },
      { lat: 49.6, lon: 10.9 },
    ];
    const c = compareWithReference(fixture, places, EGRESS_METERS);
    expect(c.compared).toBe(places.length * fixture.stops.length * 120);
    expect(c.finite).toBeGreaterThan(c.compared / 3);
    expect(c.transfer).toBeGreaterThan(0);
  });

  describe("auf einem zufälligen Netz mit Umstiegen und Sperren", () => {
    let seed = 20261013;
    const rnd = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = (n: number) => Math.floor(rnd() * n);
    // 14 Steige auf 2 km × 2 km: viele Fußweg-Umstiege unter 400 m, manche darüber
    const stops = Array.from({ length: 14 }, () => ({ lat: BASE.lat + rnd() * 0.018, lon: BASE.lon + rnd() * 0.028 }));
    const trips: TripSpec[] = Array.from({ length: 60 }, () => {
      const len = 2 + pick(4);
      const route: number[] = [];
      while (route.length < len) {
        const s = pick(stops.length);
        if (route.at(-1) !== s) route.push(s);
      }
      let t = hm(8, 20) + pick(150) * 60 + pick(4) * 15;
      const times: [number, number][] = route.map(() => {
        const arr = t;
        const dep = arr + (rnd() < 0.3 ? 0 : pick(3) * 30);
        t = dep + (rnd() < 0.25 ? 0 : 60 + pick(6) * 60);
        return [arr, dep];
      });
      const flags = route.map(() => (rnd() < 0.15 ? pick(3) : 3));
      return { stops: route, at: times, flags };
    });
    const places = [stops[0], stops[5], { lat: BASE.lat + 0.009, lon: BASE.lon + 0.014 }].map((p) => p ?? BASE);
    const inp = input(stops, trips);

    // Bei 1 500 m reicht fast jeder Ausstieg (Review 2, W6): die Grenze üben zusätzlich 300 m und 800 m.
    it("gleicht der Referenz bei Abgang 300, 800 und 1 500 m; Zähler über alle drei mit Untergrenze", () => {
      const sum: Counters = { compared: 0, finite: 0, transfer: 0, unboundedFaster: 0, penaltyMatters: 0 };
      for (const meters of [300, 800, 1500]) {
        const c = compareWithReference(inp, places, meters);
        expect(c.compared).toBe(3 * 14 * 120);
        expect(c.finite).toBeGreaterThan(c.compared / 3);
        for (const key of Object.keys(sum) as (keyof Counters)[]) sum[key] += c[key];
      }
      // Erster Lauf (2026-10-05), 60 Fahrten: 15 120 Minuten; ein Umstieg im Optimum 3 198 (21 %), unbegrenzt
      // schneller 960 (6,3 %), P = 0 und P = 600 wählen verschieden 1 291 (8,5 %). Je Radius schwankt das stark
      // (bei 1 500 m nur 4 % mit Umstieg), deshalb die Summe. Untergrenzen = diese Werte, mindestens 5 %.
      expect(sum.compared).toBe(15_120);
      expect(sum.transfer).toBeGreaterThanOrEqual(3198);
      expect(sum.unboundedFaster).toBeGreaterThanOrEqual(960);
      expect(sum.penaltyMatters).toBeGreaterThanOrEqual(1291);
      for (const n of [sum.transfer, sum.unboundedFaster, sum.penaltyMatters]) {
        expect(n / sum.compared).toBeGreaterThanOrEqual(0.05);
      }
    });
  });
});
