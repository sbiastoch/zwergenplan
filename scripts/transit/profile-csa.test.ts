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
} from "./profile-csa.ts";

// ── Hilfen ───────────────────────────────────────────────────────────────

const M_PER_DEG = (6_371_008.8 * Math.PI) / 180;
const BASE: GeoPoint = { lat: 49.45, lon: 11.07 };
/** Punkt `meters` nördlich von BASE (reine Breitendifferenz: Haversine = Bogenlänge) */
const at = (meters: number): GeoPoint => ({ lat: BASE.lat + meters / M_PER_DEG, lon: BASE.lon });
const hm = (h: number, m: number, s = 0) => h * 3600 + m * 60 + s;

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

/** Profil-Ankunft (Sekunden) ab Steig `stop` zur Zeit `t`, wie die Tabelle sie nutzt: mit direktem Abgang. */
function profileArrival(inp: NetworkInput, place: GeoPoint, stop: number, t: number, from = hm(8, 30)): number {
  const net = buildNetwork(inp, { from });
  const egress = egressSeconds(net, place);
  return Math.min(scanProfiles(net, egress).earliestArrival(stop, t), t + (egress[stop] ?? Number.POSITIVE_INFINITY));
}

/**
 * Vorwärts-Referenz (nur Testcode, E6): klassische Earliest-Arrival-CSA je Startsteig und Startzeit,
 * unabhängig vom Produktivcode aus dem Rohformat gebaut. Gleiches Modell: Sitzenbleiben kostet nichts,
 * Umsteigen am selben Steig oder zu Fuß ≤ 400 m kostet Fußweg + 1 Min., Fußwege nicht verkettet,
 * Abgang zum Ort ≤ 800 m, Ein-/Aussteigen nur mit Flag.
 */
function forwardArrival(inp: NetworkInput, place: GeoPoint, start: number, t: number): number {
  const coords = inp.stops.map(([, lat, lon]) => ({ lat, lon }));
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
  conns.sort((a, b) => a.dep - b.dep || a.arr - b.arr || a.trip - b.trip || a.seq - b.seq);
  const egress = (s: number) => {
    const m = haversineMeters(coords[s] ?? BASE, place);
    return m <= 800 ? walkMinutes(m) * 60 : Number.POSITIVE_INFINITY;
  };
  const ready = new Map<number, number>([[start, t]]);
  const inTrip = new Set<number>();
  let best = t + egress(start);
  for (const c of conns) {
    if (c.dep < t) continue;
    if (!inTrip.has(c.trip)) {
      if (!c.board || (ready.get(c.from) ?? Number.POSITIVE_INFINITY) > c.dep) continue;
      inTrip.add(c.trip);
    }
    if (!c.alight) continue;
    best = Math.min(best, c.arr + egress(c.to));
    coords.forEach((p, s) => {
      const m = haversineMeters(coords[c.to] ?? BASE, p);
      if (m > 400) return;
      const r = c.arr + walkMinutes(m) * 60 + 60;
      if (r < (ready.get(s) ?? Number.POSITIVE_INFINITY)) ready.set(s, r);
    });
  }
  return best;
}

/** Profil gegen Referenz für jeden Steig und jede Minute 8:30–10:29 */
function compareWithReference(inp: NetworkInput, places: GeoPoint[]) {
  const from = hm(8, 30);
  const net = buildNetwork(inp, { from });
  let compared = 0;
  let finite = 0;
  for (const place of places) {
    const egress = egressSeconds(net, place);
    const profiles = scanProfiles(net, egress);
    const swept = new Float64Array(120);
    for (let stop = 0; stop < inp.stops.length; stop++) {
      profiles.sweep(stop, from, 60, 120, swept);
      for (let m = 0; m < 120; m++) {
        const t = from + 60 * m;
        const profile = Math.min(profiles.earliestArrival(stop, t), t + (egress[stop] ?? Number.POSITIVE_INFINITY));
        const viaSweep = Math.min(swept[m] ?? 0, t + (egress[stop] ?? Number.POSITIVE_INFINITY));
        const reference = forwardArrival(inp, place, stop, t);
        if (profile !== reference || viaSweep !== reference) {
          throw new Error(`Ort ${place.lat},${place.lon}, Steig ${stop}, Minute ${m}: ${profile} ≠ ${reference}`);
        }
        compared++;
        if (Number.isFinite(reference)) finite++;
      }
    }
  }
  return { compared, finite };
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
    const stops = [at(0), at(1000), at(2000)];
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
    expect(profileArrival(inp, at(2000), 0, hm(8, 55))).toBe(hm(9, 0));
    expect(forwardArrival(inp, at(2000), 0, hm(8, 55))).toBe(hm(9, 0));
  });
});

describe("Profil-CSA", () => {
  it("fährt direkt und läuft vom Ausstieg zum Ort", () => {
    const inp = input(
      [at(0), at(3000)],
      [
        {
          stops: [0, 1],
          at: [
            [0, hm(9, 0)],
            [hm(9, 10), 0],
          ],
        },
      ],
    );
    const place = at(3150);
    expect(profileArrival(inp, place, 0, hm(8, 50))).toBeCloseTo(hm(9, 10) + walkMinutes(150) * 60, 6);
    // Abfahrt verpasst, keine weitere Fahrt: nur der Fußweg wäre möglich, aber 3 km > 800 m
    expect(profileArrival(inp, place, 0, hm(9, 1))).toBe(Number.POSITIVE_INFINITY);
  });

  it("nimmt den nächsten Takt, wenn der Umstieg 30 s unter dem Puffer liegt", () => {
    expect(TRANSFER_BUFFER_SECONDS).toBe(60);
    const stops = [at(0), at(3000), at(6000)];
    const trips = (wait: number): TripSpec[] => [
      {
        stops: [0, 1],
        at: [
          [0, hm(9, 0)],
          [hm(9, 10), 0],
        ],
      },
      {
        stops: [1, 2],
        at: [
          [0, hm(9, 10) + wait],
          [hm(9, 20) + wait, 0],
        ],
      },
      {
        stops: [1, 2],
        at: [
          [0, hm(9, 20) + wait],
          [hm(9, 30) + wait, 0],
        ],
      },
    ];
    expect(profileArrival(input(stops, trips(30)), at(6000), 0, hm(9, 0))).toBe(hm(9, 30, 30));
    expect(profileArrival(input(stops, trips(60)), at(6000), 0, hm(9, 0))).toBe(hm(9, 21));
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
    expect(profileArrival(inp, at(6000), 0, hm(9, 0))).toBe(hm(9, 20));
  });

  it("steigt zu Fuß bis 400 m um, bei 401 m nicht", () => {
    expect(TRANSFER_METERS).toBe(400);
    const trips: TripSpec[] = [
      {
        stops: [0, 1],
        at: [
          [0, hm(9, 0)],
          [hm(9, 10), 0],
        ],
      },
      {
        stops: [2, 3],
        at: [
          [0, hm(9, 20)],
          [hm(9, 30), 0],
        ],
      },
    ];
    const near = input([at(0), at(3000), at(3399.9), at(8000)], trips);
    expect(profileArrival(near, at(8000), 0, hm(9, 0))).toBe(hm(9, 30));
    const far = input([at(0), at(3000), at(3401), at(8000)], trips);
    expect(profileArrival(far, at(8000), 0, hm(9, 0))).toBe(Number.POSITIVE_INFINITY);
  });

  it("rechnet Fußweg und Puffer in den Umstieg, ohne Fußwege zu verketten", () => {
    // Umstieg 300 m (5,2 Min. + 1 Min.): Anschluss 9:16 knapp verpasst, 9:17 erreicht
    const stops = [at(0), at(3000), at(3300), at(3600), at(9000)];
    const trips: TripSpec[] = [
      {
        stops: [0, 1],
        at: [
          [0, hm(9, 0)],
          [hm(9, 10), 0],
        ],
      },
      {
        stops: [2, 4],
        at: [
          [0, hm(9, 16)],
          [hm(9, 30), 0],
        ],
      },
      {
        stops: [2, 4],
        at: [
          [0, hm(9, 17)],
          [hm(9, 31), 0],
        ],
      },
      // 3 liegt 600 m von 1, aber nur 300 m von 2: zwei Fußwege hintereinander gibt es nicht
      {
        stops: [3, 4],
        at: [
          [0, hm(9, 11)],
          [hm(9, 20), 0],
        ],
      },
    ];
    expect(profileArrival(input(stops, trips), at(9000), 0, hm(9, 0))).toBe(hm(9, 31));
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
    expect(profileArrival(input(stops, [trip([2, 3, 3])]), at(6000), 0, hm(9, 0))).toBe(Number.POSITIVE_INFINITY);
    // Aussteigen an 2 verboten, Ort nur von 2 aus erreichbar
    expect(profileArrival(input(stops, [trip([3, 3, 1])]), at(6000), 0, hm(9, 0))).toBe(Number.POSITIVE_INFINITY);
    // Aussteigen an 1 verboten: Durchfahren geht trotzdem
    expect(profileArrival(input(stops, [trip([3, 1, 3])]), at(6000), 0, hm(9, 0))).toBe(hm(9, 20));
    // Einsteigen an 1 verboten: dort Zusteigen unmöglich
    expect(profileArrival(input(stops, [trip([3, 2, 3])]), at(6000), 1, hm(9, 5))).toBe(Number.POSITIVE_INFINITY);
  });

  it("geht vom Steig bis 800 m zum Ort, weiter nicht", () => {
    expect(EGRESS_METERS).toBe(800);
    const inp = input(
      [at(0), at(3000)],
      [
        {
          stops: [0, 1],
          at: [
            [0, hm(9, 0)],
            [hm(9, 10), 0],
          ],
        },
      ],
    );
    expect(profileArrival(inp, at(3799.9), 0, hm(9, 0))).toBeCloseTo(hm(9, 10) + walkMinutes(799.9) * 60, 6);
    expect(profileArrival(inp, at(3801), 0, hm(9, 0))).toBe(Number.POSITIVE_INFINITY);
    // direkter Abgang ohne Fahrt
    expect(profileArrival(inp, at(500), 0, hm(9, 5))).toBeCloseTo(hm(9, 5) + walkMinutes(500) * 60, 6);
  });

  it("lässt Verbindungen vor dem Fenster weg", () => {
    const inp = input(
      [at(0), at(3000)],
      [
        {
          stops: [0, 1],
          at: [
            [0, hm(8, 0)],
            [hm(8, 10), 0],
          ],
        },
      ],
    );
    expect(buildNetwork(inp, { from: hm(8, 30) }).connections).toBe(0);
    expect(buildNetwork(inp, { from: hm(7, 0) }).connections).toBe(1);
  });

  it("gleicht der Vorwärts-Referenz für jeden Steig und jede Minute (Fixture-Netz)", () => {
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
    const { compared, finite } = compareWithReference(fixture, places);
    expect(compared).toBe(places.length * fixture.stops.length * 120);
    expect(finite).toBeGreaterThan(compared / 3);
  });

  it("gleicht der Vorwärts-Referenz auf einem zufälligen Netz mit Umstiegen und Sperren", () => {
    let seed = 20261013;
    const rnd = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const pick = (n: number) => Math.floor(rnd() * n);
    // 14 Steige auf 2 km × 2 km: viele Fußweg-Umstiege unter 400 m, manche darüber
    const stops = Array.from({ length: 14 }, () => ({ lat: BASE.lat + rnd() * 0.018, lon: BASE.lon + rnd() * 0.028 }));
    const trips: TripSpec[] = Array.from({ length: 40 }, () => {
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
    const { compared, finite } = compareWithReference(input(stops, trips), places);
    expect(compared).toBe(3 * 14 * 120);
    expect(finite).toBeGreaterThan(compared / 2);
  });
});
