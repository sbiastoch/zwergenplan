/** Orts-Sheet (Plan 0005, E6): Angebote eines Orts nach dem nächsten Termin. Inhalt des Dialogs, die Hülle ist Dialog.tsx. */
import { groupByNextSession } from "../../domain/agenda.ts";
import type { Place } from "../../domain/places.ts";
import type { Origin } from "../../domain/reach.ts";
import type { SiteOffer } from "../../domain/site-data.ts";
import { reachLong } from "../format.ts";
import { type CardContext, DistPending, OfferCard } from "../OfferCard.tsx";

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
    // Hülle wie Filter- und Kind-Sheet (Plan 0007, H7): scrollender Inhalt, Fuß darunter
    <div className="sheet-body">
      <div className="sheet-scroll">
        <div className="grab" />
        <h2>{place.names.join(" / ")}</h2>
        <p className="place-where">
          {place.address}
          {reach && origin ? <span>{reachLong(reach, origin)}</span> : ctx.reachPending && <DistPending />}
        </p>
        {groupByNextSession(place.offers, ctx.now).flatMap((group) =>
          group.items.map((item) => <OfferCard key={item.offer.id} item={item} ctx={ctx} dated atPlace />),
        )}
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn primary wide" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
