/**
 * Getippter Ort der Karte (Plan 0059, E5): markiert, solange sein Overlay offen ist. Das Orts-Sheet kennt die Karte
 * selbst; Detail und Anbieter-Sheet meldet `App` als `overlayOpen`. Ist nichts mehr offen, entfällt die Auswahl.
 */
import { useCallback, useEffect, useState } from "react";

/**
 * Welcher Ort markiert ist: das offene Orts-Sheet, sonst der getippte Ort, solange sein Overlay offen ist. Ohne Tipp
 * (Detail aus der Liste im Ausschnitt) der Ort dieses Details, `focusKey` (Plan 0059, Nachtrag 1, N2).
 */
export function shownSelection(
  sheetKey: string | undefined,
  tapped: string | undefined,
  overlayOpen: boolean,
  focusKey?: string,
): string | undefined {
  return sheetKey ?? (overlayOpen ? (tapped ?? focusKey) : undefined);
}

/**
 * Ob die Karte die Auswahl über das Sheet fährt: nur für einen Tipp oder ein Orts-Sheet. Den Ort eines Details aus der
 * Liste im Ausschnitt markiert sie nur. Er liegt schon im Ausschnitt, und eine Fahrt änderte die Liste unter dem
 * Detail (Nachtrag 1, Review M1).
 */
export function revealsSelection(sheetKey: string | undefined, tapped: string | undefined): boolean {
  return sheetKey !== undefined || tapped !== undefined;
}

export function useSelection(sheetKey: string | undefined, overlayOpen: boolean, focusKey?: string) {
  const [tapped, setTapped] = useState<string>();
  /*
   * Ist weder Orts-Sheet noch Overlay offen, vergessen: sonst markierte ein späteres Detail aus der Liste den alten Ort
   * (Review 2). Beim Tipp öffnet Sheet bzw. Detail im selben gebündelten Render, der Tipp bleibt also stehen.
   */
  useEffect(() => {
    if (sheetKey === undefined && !overlayOpen) setTapped(undefined);
  }, [sheetKey, overlayOpen]);
  const tap = useCallback((key: string) => setTapped(key), []);
  return {
    selected: shownSelection(sheetKey, tapped, overlayOpen, focusKey),
    reveal: revealsSelection(sheetKey, tapped),
    tap,
  };
}
