/**
 * Einziger Lazy-Einstieg in den Karten-Chunk (Plan 0055, E5, Review B2): Angebots- und Anbieterkarte in einem Chunk,
 * nach dem Muster von `anbieter/entry.ts`. So landet Geteiltes (`camera.ts`, `places.ts`, `provider-places.ts`) hier und
 * nicht in einem gemeinsamen Chunk direkt unter `assets/`.
 */
export { MapScreen } from "./MapScreen.tsx";
export { ProviderMapScreen } from "./ProviderMapScreen.tsx";
