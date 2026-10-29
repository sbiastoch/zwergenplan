/**
 * Orts-Sheet der Anbieterkarte (Plan 0055, E4; Mockup A2): ein Ort mit mehreren Anbietern. Je Anbieter eine Zeile wie
 * in der Liste, mit Glocke (Plan 0054); ein Tipp auf die Zeile öffnet das Anbieter-Sheet. Inhalt des Dialogs, die Hülle
 * ist Dialog.tsx. Sitzungszustand, nie in der URL.
 */
// `providerLine`/`idleLine` liegen im Anbieter-Chunk und sind hier nicht erreichbar, daher eine schlanke Zeile
import { type ProviderPlace, placeProviderLine } from "../../domain/provider-places.ts";
import { BellButton } from "../OfferCard.tsx";
import { RouteHint, routeLink } from "../Ways.tsx";

export function ProviderPlaceSheet({
  place,
  saved,
  bellBusy,
  onToggleSaved,
  onOpenProvider,
  onClose,
}: {
  place: ProviderPlace;
  saved: readonly string[];
  bellBusy: boolean;
  onToggleSaved: (providerId: string) => void;
  onOpenProvider: (providerId: string) => void;
  onClose: () => void;
}) {
  return (
    // Hülle wie das Orts-Sheet der Angebotskarte (PlaceSheet.tsx): scrollender Inhalt, Fuß darunter
    <div className="sheet-body">
      <div className="sheet-scroll">
        <div className="grab" />
        <h2>{place.name}</h2>
        <p className="place-where">
          <a className="place-route" {...routeLink(place.address)}>
            {place.district ? `${place.address} · ${place.district}` : place.address}
            <RouteHint />
          </a>
        </p>
        <p className="small">{place.providers.length} Anbieter an diesem Ort</p>
        <ul className="places providers">
          {place.providers.map((provider) => (
            <li key={provider.id} className="provider-row">
              <button
                type="button"
                className={provider.state === "aktiv" ? "place" : "place idle"}
                onClick={() => onOpenProvider(provider.id)}
              >
                <b className="provider-name" lang="de">
                  {provider.name}
                </b>
                <span>{placeProviderLine(provider)}</span>
              </button>
              <BellButton
                label={provider.name}
                subscribed={saved.includes(provider.id)}
                busy={bellBusy}
                onToggle={() => onToggleSaved(provider.id)}
              />
            </li>
          ))}
        </ul>
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
