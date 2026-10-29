/**
 * Wert erst nach einer Pause (Plan 0010, E5): Screenreader sagen eine Zahl erst an, wenn Tippen bzw. Verschieben der
 * Karte ruht, nicht bei jedem Schritt. Im Start, weil Anbieterliste (Chunk) und Statuszeile (Plan 0055, E4) es nutzen.
 */
import { useEffect, useState } from "react";

/** Screenreader sagen die Zahl erst nach einer Pause an, nicht bei jedem Buchstaben bzw. jeder Bewegung (E5) */
export const ANNOUNCE_DELAY_MS = 500;

export function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
