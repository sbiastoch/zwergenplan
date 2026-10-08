/**
 * Gibt den ersten Port p eines freien Paars (p, p + 1) aus, etwa für die lokale Vorschau im Browser-Review
 * (Plan 0027, E12): `PORT=$(node scripts/free-port.ts)`. So kollidieren parallele Sessions nicht auf einem festen Port.
 */
import { findFreePortPair } from "./lib/free-ports.ts";

process.stdout.write(`${await findFreePortPair()}\n`);
