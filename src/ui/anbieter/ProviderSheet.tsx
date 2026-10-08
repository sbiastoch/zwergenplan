/**
 * Anbieter-Sheet (Plan 0010, E10): Name, Kategorien, „Website & Programm“, Orte und alle kommenden Angebote als
 * Kacheln, unabhängig von Filtern und Alter (E4). Inhalt des Dialogs, die Hülle rendert Overlays.tsx (E3).
 */
import { useMemo } from "react";
import { groupByNextSession } from "../../domain/agenda.ts";
import { findProvider, hasOffersOutside, providerCategories, providerOffers } from "../../domain/directory.ts";
import { CATEGORY_LABELS } from "../../domain/topics.ts";
import { markAutofocus } from "../Dialog.tsx";
import { Icon } from "../icons.tsx";
import { OfferCard } from "../OfferCard.tsx";
import type { ProviderSheetProps } from "../provider-types.ts";
import { RouteHint, routeLink } from "../Ways.tsx";

/**
 * Startfokus auf dem Namen. Ist der Chunk schon da, öffnet der Dialog erst nach diesem Ref (`autofocus`). Kam er erst
 * nach dem Öffnen, ist der Ladekasten samt „Schließen“ weg und der Fokus aus dem Dialog gefallen: dann direkt hierher.
 */
function focusName(el: HTMLElement | null) {
  markAutofocus(el);
  const dialog = el?.closest("dialog");
  if (el && dialog?.open && !dialog.contains(document.activeElement)) el.focus();
}

export function ProviderSheet({
  directory,
  providerId,
  offers,
  visible,
  ctx,
  saved,
  onToggleSaved,
  onShare,
  onClose,
}: ProviderSheetProps) {
  const { now } = ctx;
  const provider = useMemo(
    () => findProvider(directory.providers, offers, providerId),
    [directory.providers, offers, providerId],
  );
  const own = useMemo(() => providerOffers(offers, providerId, now), [offers, providerId, now]);
  // Unbekannte IDs fängt schon der Lader ab (`isKnownProvider`, ProviderPanel.tsx) und rendert das Sheet dann nicht.
  if (!provider) return null;

  const outside = hasOffersOutside(own, visible);
  const categories = providerCategories(provider, own);

  return (
    // Hülle wie das Orts-Sheet: scrollender Inhalt, Fuß darunter
    <div className="sheet-body provider-sheet">
      <div className="sheet-scroll">
        <div className="grab" />
        {/* Herz wie auf der Kachel (Plan 0025, E2): ein Muster für alles Merkbare, „… merken“ mit aria-pressed */}
        <div className="sheet-head">
          {/* Startfokus auf dem Namen, nicht auf dem Herz (wie KidSheet): `showModal()` nimmt sonst das erste Bedienelement */}
          <h2 lang="de" ref={focusName} tabIndex={-1}>
            {provider.name}
          </h2>
          <button
            type="button"
            className="heart inline"
            aria-pressed={saved}
            aria-label={`${provider.name} merken`}
            onClick={() => onToggleSaved(provider.id)}
          >
            <span className="hs">
              <Icon name="heart" size={20} />
            </span>
          </button>
        </div>
        {categories.length > 0 && (
          <p className="provider-cats">{categories.map((c) => CATEGORY_LABELS[c]).join(" · ")}</p>
        )}
        {provider.url && (
          <p className="provider-link">
            <a className="btn wide" href={provider.url} target="_blank" rel="noopener">
              <Icon name="external" size={20} />
              Website & Programm
            </a>
          </p>
        )}
        {provider.venues.length > 0 && (
          <>
            <h3>{provider.venues.length === 1 ? "Ort" : "Orte"}</h3>
            <ul className="provider-venues">
              {provider.venues.map((v) => (
                <li key={`${v.name}\n${v.address}`}>
                  {/* jeder Ort öffnet die Route in Google Maps (Plan 0019, E5) */}
                  <a className="venue-route" {...routeLink(v.address)}>
                    <b>{v.name}</b>
                    <span>{v.district ? `${v.address} · ${v.district}` : v.address}</span>
                    <RouteHint />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Kommende Angebote ({own.length})</h3>
        {own.length === 0 ? (
          <p className="provider-none">
            Gerade stehen keine Termine im Zwergenplan. Auf der Website steht vielleicht mehr.
          </p>
        ) : (
          <>
            {outside && <p className="small">Alle Angebote, auch die außerhalb deiner Auswahl.</p>}
            {groupByNextSession(own, now).flatMap((group) =>
              group.items.map((item) => (
                <OfferCard key={item.offer.id} item={item} ctx={ctx} dated context="provider" />
              )),
            )}
          </>
        )}
      </div>
      <div className="sheetfoot">
        <button type="button" className="btn" onClick={() => onShare(provider)}>
          <Icon name="share" size={20} />
          Teilen
        </button>
        <button type="button" className="btn primary" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
