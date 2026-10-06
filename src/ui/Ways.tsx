/**
 * Route in Google Maps und andere Wege (Plan 0019). `routeLink` und `RouteHint` für Detail, Anbieter- und Orts-Sheet
 * (E5): Ziel ist nur die Adresse (`mapsDirectionsUrl`), nie der Startpunkt, kein Referrer (E3). `Ways` ist die Karte
 * „Wege ab …“ im Detail (E6), die Texte baut `wayParts`.
 */
import { Fragment } from "react";
import { mapsDirectionsUrl } from "../domain/maps-link.ts";
import type { Origin, Reach } from "../domain/reach.ts";
import { wayParts } from "./format.ts";
import { Icon } from "./icons.tsx";
import { LineChain } from "./ReachLong.tsx";

/** Attribute eines Routen-Links: neuer Tab bzw. die Maps-App, ohne Referrer (E3) */
export function routeLink(address: string): { href: string; target: string; rel: string } {
  return { href: mapsDirectionsUrl(address), target: "_blank", rel: "noopener noreferrer" };
}

/** Letzte Zeile jeder Routen-Kachel: zeigt, dass sie ein Link ist und wohin er führt */
export function RouteHint() {
  return (
    <span className="route-hint">
      <Icon name="route" size={18} />
      Route in Google Maps
    </span>
  );
}

/**
 * Karte „Wege ab …“ (E6): kein Link, damit der Linkname der Kachel „Wo“ kurz bleibt; am Ende ein eigener Link auf
 * dieselbe Route, damit die Karte nicht als Sackgasse endet. Ohne andere Wege nichts.
 */
export function Ways({ reach, origin, address }: { reach: Reach; origin: Origin; address: string }) {
  const parts = wayParts(reach, origin);
  if (!parts) return null;
  return (
    <div className="ways">
      <span className="cap">{parts.title}</span>
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
      <p className="ways-note">
        Laut Fahrplan, Di vormittags. Live:{" "}
        <a className="linkbtn" {...routeLink(address)}>
          Route in Google Maps
        </a>
      </p>
    </div>
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
