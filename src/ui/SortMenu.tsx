/**
 * Sortierung der Liste „Entdecken“ (Plan 0043, E4; Mockup Variante B): runder Icon-Knopf rechts neben „Liste | Karte“
 * mit Menü. Gefüllt, sobald nicht nach Terminen sortiert ist, damit die Wahl ohne Text erkennbar bleibt.
 * Bedienung: Pfeile mit Umlauf, Home/End, Enter/Leertaste wählt; Escape und Wahl geben den Fokus an den Knopf zurück;
 * Tab schließt und folgt dem natürlichen Fokus. Ein Tipp daneben schließt und wird verbraucht (Fangfläche), damit er
 * nicht zugleich eine Karte öffnet.
 */
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icons.tsx";

export interface SortOption<V extends string> {
  value: V;
  title: string;
  /** Untertitel, zugleich die Beschreibung des Eintrags */
  sub: string;
}

/** Tastenlogik des Menüs, rein (Review 3, K6): neuer Index, Wahl, Schließen oder nichts */
export function menuKey(key: string, index: number, count: number): number | "choose" | "close" | undefined {
  switch (key) {
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "Enter":
    case " ":
      return "choose";
    case "Escape":
      return "close";
    default:
      return undefined;
  }
}

export function SortMenu<V extends string>({
  options,
  current,
  plain,
  onChange,
}: {
  options: readonly SortOption<V>[];
  current: V;
  /** die Standardsortierung: Knopf ungefüllt */
  plain: V;
  onChange: (value: V) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const active = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );

  // Beim Öffnen: sichtbar machen (200 %, nicht unter die Tab-Leiste) und Fokus auf die aktive Zeile
  useEffect(() => {
    if (!open) return;
    menu.current?.scrollIntoView({ block: "nearest" });
    items.current[active]?.focus();
  }, [open, active]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (value: V) => {
    close(true);
    if (value !== current) onChange(value);
  };
  const onKey = (e: KeyboardEvent, index: number) => {
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    const next = menuKey(e.key, index, options.length);
    if (next === undefined) return;
    e.preventDefault();
    if (next === "close") close(true);
    else if (next === "choose") {
      const option = options[index];
      if (option) choose(option.value);
    } else items.current[next]?.focus();
  };

  return (
    <div className="sort">
      <button
        ref={button}
        type="button"
        className={current === plain ? "iconbtn sortbtn" : "iconbtn sortbtn on"}
        aria-label={`Sortierung: ${options[active]?.title ?? ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="sort" />
      </button>
      {open && (
        <>
          {/* Fangfläche: nur der Tipp daneben; per Tastatur schließen Escape und Tab */}
          <div className="sort-catch" aria-hidden="true" onClick={() => close(false)} />
          <div ref={menu} className="sort-menu">
            <p id={`${id}h`} className="sort-head">
              Sortieren nach
            </p>
            <div role="menu" aria-labelledby={`${id}h`}>
              {options.map((option, index) => (
                <button
                  key={option.value}
                  ref={(el) => {
                    items.current[index] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  className="sort-item"
                  aria-checked={index === active}
                  aria-label={option.title}
                  aria-describedby={`${id}${index}`}
                  tabIndex={index === active ? 0 : -1}
                  onClick={() => choose(option.value)}
                  onKeyDown={(e) => onKey(e, index)}
                >
                  <b>{option.title}</b>
                  <span id={`${id}${index}`} className="sort-sub">
                    {option.sub}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
