/**
 * Karte groß (Plan 0059, E3), Teil im Startbundle: der Knopf „Groß“ in jedem Kartenrahmen, Kopfleiste und Zahl der
 * großen Karte. `App` rendert Kopfleiste und Zahl und reicht sie als `overlay` in den Kartenrahmen (MapScreenProps),
 * damit sie in der sichtbaren Ebene liegen (`.app:has(.map-box.big)`, map.css).
 */
import type { RefObject } from "react";
import { Icon } from "./icons.tsx";
import type { BigMapProps } from "./map-types.ts";

function GrowButton({ onClick, buttonRef }: { onClick: () => void; buttonRef: RefObject<HTMLButtonElement | null> }) {
  return (
    <button ref={buttonRef} type="button" className="map-grow" onClick={onClick} aria-label="Karte groß zeigen">
      <Icon name="expand" size={20} />
    </button>
  );
}

interface BigMapBarProps {
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
  /** Filter-Sheet der Ansicht; im Tab „Anbieter“ fehlt er (Plan 0059, Nicht-Ziele) */
  filter: { count: number; onOpen: () => void } | undefined;
  /** sichtbare Zahl, z. B. „42 Angebote im Kartenausschnitt“ */
  count: string;
  /** Ansage erst, wenn die Karte ruht (`useSettled`) */
  announce: string;
  /** Tipp auf die Zahl: Liste im Ausschnitt als Sheet (Nachtrag 1, N2); Fokus-Rückweg beim Schließen */
  onOpenList: () => void;
  countRef: RefObject<HTMLButtonElement | null>;
}

export function BigMapBar({ onClose, closeRef, filter, count, announce, onOpenList, countRef }: BigMapBarProps) {
  return (
    <>
      <div className="bigmap-bar">
        <button ref={closeRef} type="button" className="bigmap-close" onClick={onClose} aria-label="Karte verkleinern">
          <Icon name="shrink" size={20} />
        </button>
        {filter && (
          <button
            type="button"
            className={filter.count > 0 ? "chip on" : "chip"}
            onClick={filter.onOpen}
            aria-label={`Alle Filter, ${filter.count} aktiv`}
          >
            <Icon name="sliders" size={20} />
            Filter
            {filter.count > 0 && <span className="badge">{filter.count}</span>}
          </button>
        )}
      </div>
      {/* Knopf statt Live-Region: Die Ansage steht daneben, sonst läse der Screenreader jede Änderung als Namen vor */}
      <button ref={countRef} type="button" className="bigmap-count" aria-haspopup="dialog" onClick={onOpenList}>
        {count}
        <Icon name="up" size={18} />
      </button>
      <p className="sr-only" role="status">
        {announce}
      </p>
    </>
  );
}

/**
 * Groß-Knopf bzw. Kopfleiste im Kartenrahmen (Plan 0059, E3), in Platzhalter und Karten-Oberfläche: Auch ein Deep-Link
 * mit `karte=gross` lässt sich beim Laden und im Fehlerfall verkleinern. Klein gibt es im Fehlerfall keinen Knopf.
 */
export function BigSlot({ big, onBig, growRef, overlay, failed }: BigMapProps & { failed: boolean }) {
  if (big) return overlay;
  return failed ? null : <GrowButton onClick={onBig} buttonRef={growRef} />;
}
