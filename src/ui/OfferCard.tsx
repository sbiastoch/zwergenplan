/** Angebots-Kachel (Plan 0003, E9): Kopfzeile mit Kategorie-Pille und Zeit, Titel, Meta, Fakten, Herz. */
import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { vibrate } from "../data/haptics.ts";
import type { Occurrence } from "../domain/agenda.ts";
import { isNewlyListed } from "../domain/listing.ts";
import type { Reach } from "../domain/reach.ts";
import type { SavedStage } from "../domain/saved.ts";
import type { SiteOffer } from "../domain/site-data.ts";
import { CATEGORY_LABELS } from "../domain/topics.ts";
import {
  ageRangeLabel,
  availabilityLabel,
  clock,
  costLabel,
  formatFact,
  reachShort,
  registrationLabel,
  sessionDay,
  shortDate,
  timeRange,
} from "./format.ts";
import { type GestureEvent, HOLD_MS, heartGesture, IDLE_GESTURE, SWALLOW_MS } from "./heart-gesture.ts";
import { Icon, Shape } from "./icons.tsx";

/** Was jede Kachel von außen braucht – von allen Ansichten gemeinsam genutzt. */
export interface CardContext {
  now: Date;
  /** Stufe auf der Merkliste (Plan 0057, E1) */
  stageOf: (id: string) => SavedStage;
  isUnfit: (id: string) => boolean;
  /** Tipp aufs Herz und Halten (Plan 0057, E2) */
  onCycle: HeartCycle;
  onHold: HeartHold;
  /** Detail öffnen; `day` = gewählter Kalendertag (Termin im Kalender) */
  onOpen: (offer: SiteOffer, day?: string) => void;
  /** neu eingefügte Kacheln dürfen sich einkleben (nicht beim ersten Rendern, wegen LCP) */
  animate: boolean;
  /** Entfernung zum Ort, nur mit Startpunkt (Plan 0004, E6); je Koordinate zwischengespeichert */
  reachOf: (offer: SiteOffer) => Reach | undefined;
  /** Wegzeit lädt: Platzhalter statt Entfernung, ohne Layoutsprung (Plan 0009, E11) */
  reachPending: boolean;
}

interface OfferCardProps {
  item: Occurrence<SiteOffer>;
  ctx: CardContext;
  /** Datum mit anzeigen (Merkliste) statt nur der Uhrzeit (Liste/Agenda unter Tagesüberschrift) */
  dated?: boolean;
  /** Kurstermin mit seiner Stelle zeigen, „Termin 3 von 8“ (Merkliste) */
  numbered?: boolean;
  /** Vorgemerktes absetzen: ohne Schatten, Rand gedämpft, Etikett „vorgemerkt“ (Kalender, Plan 0057, E4) */
  markTentative?: boolean;
  /** Termin gehört zu einem gewählten Kalendertag (Kalender; Liste mit Zeitraum, Plan 0023, E7) */
  calendarDay?: string | undefined;
  /**
   * Sheet, dessen Kopf schon etwas nennt (Plan 0010, E10; ersetzt `atPlace` aus Plan 0008, E19): im Orts-Sheet
   * („place“) fehlen Ort und Entfernung in der Meta-Zeile, im Anbieter-Sheet („provider“) der Anbietername.
   */
  context?: "place" | "provider";
  /** Marke „heute“, „morgen“, „in 5 Tagen“ im Abschnitt „Demnächst“ (Plan 0057, E8) */
  soon?: string | undefined;
  /** Fußzeile „Endet Di 1.12.“ mit „Anschluss suchen“ im Abschnitt „Läuft gerade“ (Plan 0057, E8) */
  followUp?: { ends: string; onSearch: () => void } | undefined;
}

export function OfferCard({
  item,
  ctx,
  dated = false,
  numbered = false,
  markTentative = false,
  calendarDay,
  context,
  soon,
  followUp,
}: OfferCardProps) {
  const { offer, session } = item;
  const [fresh] = useState(ctx.animate);
  // Etikett, Farbe und Form nur aus der Hauptkategorie; kein Filter ändert sie (Plan 0037, E11)
  const category = offer.category;
  const unfit = ctx.isUnfit(offer.id);
  const stage = ctx.stageOf(offer.id);
  const tentative = markTentative && stage === "vorgemerkt";
  const availability = availabilityLabel(offer);
  const atPlace = context === "place";
  const reach = atPlace ? undefined : ctx.reachOf(offer);
  const where = offer.venue.district ?? offer.venue.name;
  const when = dated ? `${shortDate(sessionDay(session))} · ${clock(session.start)} Uhr` : `${timeRange(session)} Uhr`;
  // Etikett „Neu“ (Plan 0043, E5): vor dem Titel im Kartentext, damit die Karte „Neu, …“ vorliest
  const isNew = isNewlyListed(offer, ctx.now);

  return (
    <article
      className={`card k-${category}${unfit ? " unfit" : ""}${fresh ? " fresh" : ""}${isNew ? " is-new" : ""}${tentative ? " tentative" : ""}`}
      data-testid="offer"
    >
      {isNew && <span className="new-tag">Neu</span>}
      <div className="card-body">
        <div className="card-top">
          <span className="pill">
            <Shape category={category} />
            {CATEGORY_LABELS[category]}
          </span>
          <span className="when">{when}</span>
        </div>
        <h3 className="ctitle">
          <button type="button" className="card-open" onClick={() => ctx.onOpen(offer, calendarDay)}>
            {offer.title}
          </button>
        </h3>
        <p className="meta">
          {context === "provider" ? where : atPlace ? offer.providerName : `${offer.providerName} · ${where}`}
          {reach ? (
            <>
              {" · "}
              <span className="dist">{reachShort(reach)}</span>
            </>
          ) : (
            ctx.reachPending &&
            !atPlace && (
              <>
                {" · "}
                <DistPending />
              </>
            )
          )}
        </p>
        <div className="facts">
          {soon && <span className="fact soon">{soon}</span>}
          {tentative && <span className="fact tentative-tag">vorgemerkt</span>}
          <span className="fact">{formatFact(offer, session, ctx.now, numbered)}</span>
          <span className="fact">{costLabel(offer)}</span>
          <span className={offer.registration === "mit-anmeldung" ? "fact reg" : "fact"}>
            {registrationLabel(offer)}
          </span>
          {availability && <span className={`fact avail-${offer.availability.status}`}>{availability}</span>}
          {unfit && <span className="fact warn">{ageRangeLabel(offer.age)}</span>}
        </div>
        {followUp && (
          <p className="card-next">
            <span>{followUp.ends}</span>
            <button
              type="button"
              className="linkbtn"
              aria-label={`Anschluss an ${offer.title} suchen`}
              onClick={followUp.onSearch}
            >
              Anschluss suchen
              <Icon name="next" size={16} />
            </button>
          </p>
        )}
      </div>
      <HeartButton offer={offer} stage={stage} onCycle={ctx.onCycle} onHold={ctx.onHold} />
    </article>
  );
}

/** Platzhalter der Entfernung mit reservierter Breite und Zeilenhöhe, solange die Wegzeit lädt (E11) */
export function DistPending() {
  return (
    <span className="dist pending" aria-hidden="true">
      {"\u00a0"}
    </span>
  );
}

/**
 * Glocke (Plan 0054, E1): abonnieren statt merken, für Anbieter und Suchen. Gebaut wie das Herz (`.heart`), gedrückt
 * gelb; `busy`, solange der Tipp Push einschaltet.
 */
export function BellButton({
  label,
  subscribed,
  busy = false,
  onToggle,
  inline = false,
  className = "",
}: {
  /** Name des Abonnierten: „<label> abonnieren“ */
  label: string;
  subscribed: boolean;
  busy?: boolean;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  inline?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`heart bell${inline ? " inline" : ""}${className && ` ${className}`}`}
      aria-pressed={subscribed}
      aria-busy={busy}
      aria-label={`${label} abonnieren`}
      onClick={(event) => {
        if (!busy) onToggle(event);
      }}
    >
      <span className="hs">
        <Icon name="bell" size={20} />
      </span>
    </button>
  );
}

/** Tipp aufs Herz: schaltet weiter und liefert die neue Stufe; `button` bekommt nach „Rückgängig“ den Fokus zurück */
export type HeartCycle = (offer: SiteOffer, button: HTMLButtonElement) => SavedStage;
/** Halten abgelaufen: fest einplanen */
export type HeartHold = (offer: SiteOffer, button: HTMLButtonElement) => void;

/** Animation nach einer Nutzeraktion (E2): nie beim Rendern, nie bei „Rückgängig“ */
type HeartAnimation = "pop-small" | "pop-big" | "deflate";

function animationFor(next: SavedStage): HeartAnimation {
  if (next === "vorgemerkt") return "pop-small";
  return next === "fest" ? "pop-big" : "deflate";
}

/** `motion.css` schaltet Animationen ab, dann feuert kein `animationend`: gar keine Klasse setzen (E2) */
function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const PRESSED: Record<SavedStage, boolean | "mixed"> = { aus: false, vorgemerkt: "mixed", fest: true };

/**
 * Herz mit drei Stufen (Plan 0057, E2): aus, vorgemerkt (halb voll, `aria-pressed="mixed"`), fest eingeplant (voll).
 * `click` schaltet weiter, langes Halten (550 ms) plant fest ein. Die Logik steckt in `heart-gesture.ts`, hier nur
 * Ereignisse, Timer, Vibration und Animation. Der Name bleibt „<Titel> merken“; die Wirkung sagt der Toast an.
 */
export function HeartButton({
  offer,
  stage,
  onCycle,
  onHold,
  inline = false,
}: {
  offer: SiteOffer;
  stage: SavedStage;
  onCycle: HeartCycle;
  onHold: HeartHold;
  inline?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [holding, setHolding] = useState(false);
  const [animation, setAnimation] = useState<HeartAnimation>();
  const gesture = useRef(IDLE_GESTURE);
  const timers = useRef<{ hold?: ReturnType<typeof setTimeout>; swallow?: ReturnType<typeof setTimeout> }>({});
  // Timer feuern nach dem Rendern: Sie lesen die aktuellen Props
  const latest = useRef({ offer, stage, onCycle, onHold });
  latest.current = { offer, stage, onCycle, onHold };

  useEffect(() => {
    const el = button.current;
    const own = timers.current;
    // `animationcancel` kennt React nicht; beide räumen die Klasse ab, die Animation der Funken zählt nicht
    // Nur die Animation der aktuellen Klasse räumt ab: Ein schneller zweiter Tipp bricht `pop-small` ab, und dessen
    // `animationcancel` darf das neue `pop-big` nicht löschen
    const done = (event: AnimationEvent) => {
      setAnimation((current) => (current && `heart-${current}` === event.animationName ? undefined : current));
    };
    el?.addEventListener("animationend", done);
    el?.addEventListener("animationcancel", done);
    return () => {
      el?.removeEventListener("animationend", done);
      el?.removeEventListener("animationcancel", done);
      clearTimeout(own.hold);
      clearTimeout(own.swallow);
    };
  }, []);

  const feedback = (before: SavedStage, next: SavedStage) => {
    if (next === before) return;
    if (next !== "aus") vibrate(next === "fest" ? 25 : 8);
    if (!reducedMotion()) setAnimation(animationFor(next));
  };

  const dispatch = (event: GestureEvent) => {
    const [next, effects] = heartGesture(gesture.current, event);
    gesture.current = next;
    const own = timers.current;
    const el = button.current;
    const now = latest.current;
    for (const effect of effects) {
      if (effect === "startHold") {
        clearTimeout(own.hold);
        own.hold = setTimeout(() => dispatch({ type: "holdElapsed" }), HOLD_MS);
        setHolding(true);
      } else if (effect === "stopHold") {
        clearTimeout(own.hold);
        setHolding(false);
      } else if (effect === "startSwallow") {
        clearTimeout(own.swallow);
        own.swallow = setTimeout(() => dispatch({ type: "swallowElapsed" }), SWALLOW_MS);
      } else if (effect === "stopSwallow") {
        clearTimeout(own.swallow);
      } else if (el && effect === "cycle") {
        feedback(now.stage, now.onCycle(now.offer, el));
      } else if (el) {
        now.onHold(now.offer, el);
        feedback(now.stage, "fest");
      }
    }
  };

  const point = (event: PointerEvent<HTMLButtonElement>) => ({ x: event.clientX, y: event.clientY });
  return (
    <button
      ref={button}
      type="button"
      className={`heart${inline ? " inline" : ""}${holding ? " holding" : ""}${animation ? ` ${animation}` : ""}`}
      aria-pressed={PRESSED[stage]}
      aria-label={`${offer.title} merken`}
      // Ziel für den Fokus nach „Rückgängig“, wenn das auslösende Herz verschwunden ist (E3)
      data-offer={offer.id}
      onClick={() => dispatch({ type: "click" })}
      onPointerDown={(event) =>
        dispatch({ type: "down", ...point(event), primary: event.isPrimary && event.button === 0, stage })
      }
      onPointerMove={(event) => dispatch({ type: "move", ...point(event) })}
      onPointerUp={() => dispatch({ type: "up" })}
      onPointerCancel={() => dispatch({ type: "cancel" })}
      // Touch fängt den Zeiger implizit ein, die Maus nicht: Verlässt sie das Herz, endet das Halten
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") dispatch({ type: "cancel" });
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <span className="hs">
        <span className="hw">
          <Icon name={stage === "vorgemerkt" ? "heartHalf" : "heart"} size={20} />
        </span>
      </span>
      {holding && (
        <svg className="heart-ring" width="60" height="60" viewBox="0 0 60 60" aria-hidden="true">
          <circle cx="30" cy="30" r="27" />
        </svg>
      )}
      {animation === "pop-big" && (
        <span className="sparks" aria-hidden="true">
          {SPARKS.map((n) => (
            <i key={n} />
          ))}
        </span>
      )}
    </button>
  );
}

const SPARKS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
