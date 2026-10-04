/** Orts-Sheet (Plan 0005, E6): Angebote eines Orts nach dem nächsten Termin. Inhalt des Dialogs, die Hülle ist Dialog.tsx. */
import { groupByNextSession } from "../domain/agenda.ts";
import type { Place } from "../domain/places.ts";
import type { Origin } from "../domain/reach.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { distanceLong } from "./format.ts";
import { type CardContext, OfferCard } from "./OfferCard.tsx";

export function PlaceSheet({
  place,
  origin,
  ctx,
  onClose,
}: {
  place: Place<SiteOffer>;
  origin: Origin | undefined;
  ctx: CardContext;
  onClose: () => void;
}) {
  const first = place.offers[0];
  const reach = first && ctx.reachOf(first);
  return (
    <div className="sheet-body">
      <div className="grab" />
      <h2>{place.names.join(" / ")}</h2>
      <p className="place-where">
        {place.address}
        {reach && origin && <span>{distanceLong(reach, origin)}</span>}
      </p>
      {groupByNextSession(place.offers, ctx.now).flatMap((group) =>
        group.items.map((item) => <OfferCard key={item.offer.id} item={item} ctx={ctx} dated />),
      )}
      <div className="sheetfoot single">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
