/**
 * Route in Google Maps und andere Wege (Plan 0019). `routeLink` und `RouteHint` für Detail, Anbieter- und Orts-Sheet
 * (E5): Ziel ist nur die Adresse (`mapsDirectionsUrl`), nie der Startpunkt, kein Referrer (E3). `WhereTile` ist die
 * Kachel „Wo“ im Detail: Gibt es andere Wege, öffnet sie das Sheet „Wege ab …“ mit dem Knopf nach Google Maps
 * (Nutzerwunsch nach der Umsetzung, E10), sonst führt sie direkt zu Google Maps.
 */
import { Fragment, type ReactNode, useState } from "react";
import { mapsDirectionsUrl } from "../domain/maps-link.ts";
import type { Origin, Reach } from "../domain/reach.ts";
import { Dialog } from "./Dialog.tsx";
import { wayParts } from "./format.ts";
import { Icon } from "./icons.tsx";
import { LineChain } from "./ReachLong.tsx";

/** Attribute eines Routen-Links: neuer Tab bzw. die Maps-App, ohne Referrer (E3) */
export function routeLink(address: string): { href: string; target: string; rel: string } {
  return { href: mapsDirectionsUrl(address), target: "_blank", rel: "noopener noreferrer" };
}

/** Letzte Zeile jeder Routen-Kachel: zeigt, dass sie antippbar ist und wohin sie führt */
export function RouteHint({ text = "Route in Google Maps" }: { text?: string }) {
  return (
    <span className="route-hint">
      <Icon name="route" size={18} />
      {text}
    </span>
  );
}

/** Kachel „Wo“ im Detail (E5, E10): Knopf mit Sheet „Wege ab …“, wenn es andere Wege gibt, sonst Link nach Maps */
export function WhereTile({
  reach,
  origin,
  address,
  children,
}: {
  reach: Reach | undefined;
  origin: Origin | undefined;
  address: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const parts = reach && origin ? wayParts(reach, origin) : undefined;
  if (!parts) {
    return (
      <a className="label full route" {...routeLink(address)}>
        {children}
        <RouteHint />
      </a>
    );
  }
  return (
    <>
      <button type="button" className="label full route" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {children}
        <RouteHint text={`${parts.rows.length} Wege & Route in Google Maps`} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={parts.title} className="sheet" toast="">
        <div className="sheet-body">
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Bei großer Schrift scrollt die Liste, ohne selbst ein Bedienelement zu enthalten; ohne Fokus erreicht die Tastatur sie nicht (axe scrollable-region-focusable, WCAG 2.1.1). */}
          <section className="sheet-scroll ways" tabIndex={0} aria-label={parts.title}>
            <div className="grab" />
            <h2>{parts.title}</h2>
            <ol>
              {parts.rows.map((row) => (
                <li key={[row.minutes, ...(row.lines ?? []), ...row.extra].join("|")}>
                  <b className="way-seg">{row.minutes}</b>
                  {row.lines && (
                    <>
                      <Dot />
                      <span className="way-seg">
                        <LineChain lines={row.lines} />
                      </span>
                    </>
                  )}
                  {row.extra.map((text) => (
                    <Fragment key={text}>
                      <Dot />
                      <span className="way-seg">{text}</span>
                    </Fragment>
                  ))}
                  {row.main && (
                    <>
                      {" "}
                      <span className="way-tag">Vorschlag</span>
                    </>
                  )}
                </li>
              ))}
            </ol>
            {parts.reason && <p className="ways-note">{parts.reason}</p>}
            <p className="ways-note">Laut Fahrplan, Di vormittags. Live und mit Echtzeit in Google Maps.</p>
          </section>
          <div className="sheetfoot">
            <a className="btn primary wide" {...routeLink(address)}>
              <Icon name="route" size={20} />
              In Google Maps navigieren
            </a>
            <button type="button" className="btn wide" onClick={() => setOpen(false)}>
              Schließen
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Trenner zwischen den Segmenten: sichtbar „·“, vorgelesen als Komma (Review 3, N6) */
function Dot() {
  return (
    <>
      <span className="dot" aria-hidden="true">
        {" · "}
      </span>
      <span className="sr-only">, </span>
    </>
  );
}
