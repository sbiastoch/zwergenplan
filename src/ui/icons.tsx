/** Strich-Icons und Kategorieformen (Pfade aus docs/design/stickerheft-mockup.html). Immer dekorativ. */

import type { Category } from "../domain/topics.ts";
import { CATEGORY_UI } from "./categories.ts";

const PATHS = {
  check: "m5 12 5 5 9-10",
  heart: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z",
  back: "m15 5-7 7 7 7",
  next: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  sliders: "M4 7h9M18 7h2M4 17h3M12 17h8",
  compass: "m15.5 8.5-2 5-5 2 2-5z",
  calendar: "M3.5 10h17M8 3v4M16 3v4",
  calendarPlus: "M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  face: "M9 15.5c1.6 1.4 4.4 1.4 6 0M9.5 11.5h.01M14.5 11.5h.01M12 5c-.8-1.6.6-2.8 2-2",
  search: "m20 20-4.5-4.5",
  swing: "M4 18c3-6 13-6 16 0M7 10a5 5 0 0 1 10 0",
  // Laden mit Markise über der Tür (Plan 0010, E2): Tab „Anbieter“ und Knopf im Detail
  store:
    "M3.5 8 5 4h14l1.5 4M3.5 8a2.1 2.1 0 0 0 4.25 0 2.1 2.1 0 0 0 4.25 0 2.1 2.1 0 0 0 4.25 0 2.1 2.1 0 0 0 4.25 0M5 10.5V20h14v-9.5M10 20v-5h4v5",
} as const;

export type IconName = keyof typeof PATHS;

/** Zusatzformen, die nicht als einzelner Pfad gehen */
function extra(name: IconName) {
  switch (name) {
    case "sliders":
      return (
        <>
          <circle cx="15.5" cy="7" r="2.5" />
          <circle cx="9.5" cy="17" r="2.5" />
        </>
      );
    case "compass":
      return <circle cx="12" cy="12" r="9" />;
    case "calendar":
    case "calendarPlus":
      return <rect x="3.5" y="5" width="17" height="15" rx="3" />;
    case "face":
      return <circle cx="12" cy="13" r="8" />;
    case "search":
      return <circle cx="11" cy="11" r="6" />;
    default:
      return null;
  }
}

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {extra(name)}
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Kategorieform; `ink` = dunkel auf Kategoriefarbe, sonst in Kategoriefarbe (braucht `.k-…` am Vorfahren). */
export function Shape({ category, size, ink = true }: { category: Category; size?: number; ink?: boolean }) {
  return (
    <svg className="mini" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path className={ink ? "shape-ink" : "shape"} d={CATEGORY_UI[category].shape} />
    </svg>
  );
}

/** Logo: Sticker mit Zipfelmütze */
export function Logo() {
  return (
    <svg className="mark" width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <circle className="base" cx="17" cy="17" r="14.5" />
      <path className="hat" d="M9 24 17 7l8 17z" />
      <circle className="pom" cx="17" cy="7.5" r="2.6" />
    </svg>
  );
}
