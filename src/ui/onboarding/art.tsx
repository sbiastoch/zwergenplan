/**
 * Illustrationen des Onboardings (Plan 0033, E11), wörtlich aus dem freigegebenen Mockup
 * `docs/design/onboarding-mockup.html` übertragen. Rein dekorativ (`aria-hidden`), der Inhalt steht im HTML-Text.
 *
 * - Klassen wie im Mockup, in `onboarding.css` unter `.onb-art` eingegrenzt: `o` Kontur, `ln` Linie, `sh` Schatten,
 *   `ink` Fläche in Tinte, `st` Text; Bewegung `fl`/`fl2`/`fl3`/`swing`/`drive`.
 * - Helle Flächen im Dunkelmodus (Arch-Review M3): `pa` (Papier, hell #fff) und `sc` (Bildschirm, hell #e8f1ff)
 *   statt fester Füllung, Text darauf mit `pt` (Tinte) bzw. `mu` (gedämpft). Die Klasse schlägt das `fill`-Attribut.
 * - Eine CSS-Animation auf `transform` ersetzte ein `transform`-Attribut desselben Elements. Deshalb sitzt die
 *   Verschiebung außen und die Animation an einem inneren `<g>`.
 */
import { type ComponentType, useId } from "react";
import type { StepId } from "../../domain/onboarding.ts";

/** Maskottchen (Kopf mit Zipfelmütze), in Burg, Straßenbahn und App-Symbol */
function Face({ fill, bobble }: { fill: string; bobble?: boolean }) {
  return (
    <>
      <circle className="o" cx="60" cy="72" r="40" fill={fill} />
      <path className="o" fill="#FF7070" d="M18 58 Q60 40 102 58 L66 12 Q60 5 54 12 Z" />
      {bobble && <circle className="o" cx="60" cy="11" r="8" fill="#FFFFFF" />}
      <circle className="ink" cx="46" cy="76" r="5" />
      <circle className="ink" cx="74" cy="76" r="5" />
    </>
  );
}

const STAR = "M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z";
const SPARKLE = "M12 1c1 6 5 10 11 11-6 1-10 5-11 11-1-6-5-10-11-11 6-1 10-5 11-11z";

function CastleArt() {
  return (
    <>
      <g className="fl sh">
        <circle className="o" cx="38" cy="44" r="22" fill="#FF8CC0" />
        <path
          className="ink"
          transform="translate(26 32)"
          d="M12 2a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 14a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM2 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0zM14 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0zM12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z"
        />
      </g>
      <g className="fl2 sh">
        <circle className="o" cx="152" cy="56" r="20" fill="#FFD93B" />
        <path className="ink" transform="translate(141 45) scale(.92)" d={STAR} />
      </g>
      <g className="fl3 sh">
        <circle className="o" cx="292" cy="128" r="20" fill="#5CB8FF" />
        <path
          className="ink"
          transform="translate(281 117) scale(.92)"
          d="M12 2c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12z"
        />
      </g>
      <g className="sh">
        <path
          className="o"
          fill="#E3A872"
          d="M78 152 V138 H96 V150 H108 V138 H126 V150 H138 V138 H156 V150 H168 V138 H186 V150 H198 V138 H216 V152Z"
        />
        <rect className="o" x="78" y="150" width="140" height="92" fill="#E3A872" />
        <path className="ink" d="M136 242 V212 a12 12 0 0 1 24 0 V242Z" />
        <rect className="ink" x="98" y="170" width="10" height="16" rx="5" />
        <rect className="ink" x="186" y="170" width="10" height="16" rx="5" />
        <rect className="o" x="46" y="118" width="44" height="124" rx="4" fill="#F2C089" />
        <path className="o" fill="#FF7070" d="M40 120 L68 70 L96 120Z" />
        <rect className="ink" x="62" y="140" width="12" height="18" rx="6" />
        <rect className="o" x="210" y="98" width="42" height="144" fill="#F2C089" />
        <path className="o" fill="#5CB8FF" d="M204 100 L231 50 L258 100Z" />
        <path className="ln" d="M231 50 V28" />
        <path className="o" fill="#FFD93B" d="M231 28 L252 34 L231 41Z" />
        <rect className="ink" x="225" y="122" width="12" height="18" rx="6" />
        <rect className="ink" x="225" y="166" width="12" height="18" rx="6" />
        <rect className="o pa" x="6" y="204" width="54" height="50" fill="#FFFFFF" />
        <path className="o" fill="#B99CFF" d="M0 206 L33 176 L66 206Z" />
        <path className="ln" d="M6 226 H60 M24 204 V254 M42 204 V254 M6 204 L24 226 M60 204 L42 226" />
        <rect className="o pa" x="252" y="200" width="58" height="54" fill="#FFFFFF" />
        <path className="o" fill="#FF8CC0" d="M246 202 L281 170 L316 202Z" />
        <path className="ln" d="M252 224 H310 M271 200 V254 M291 200 V254 M252 200 L271 224 M310 200 L291 224" />
      </g>
      <path
        className="o"
        fill="#A6DB5E"
        d="M14 268 C2 250 40 236 90 236 C130 236 142 244 172 242 C222 238 262 224 300 232 C326 240 320 270 296 274 L36 276 C26 276 18 274 14 268Z"
      />
      <g transform="translate(128 196) scale(.54)">
        <Face fill="#FFD93B" bobble />
        <ellipse cx="37" cy="88" rx="7" ry="4.5" fill="#FF8CC0" />
        <ellipse cx="83" cy="88" rx="7" ry="4.5" fill="#FF8CC0" />
        <path className="ln" d="M50 90 Q60 99 70 90" />
      </g>
    </>
  );
}

function RulerArt() {
  return (
    <>
      <g className="sh">
        <rect className="o" x="30" y="22" width="60" height="262" rx="12" fill="#FFD93B" />
      </g>
      <path className="ln" d="M30 64 H50 M30 94 H42 M30 124 H50 M30 154 H42 M30 184 H50 M30 214 H42 M30 244 H50" />
      <text className="st" x="54" y="69" fontSize="13">
        12 M
      </text>
      <text className="st" x="56" y="129" fontSize="13">
        9 M
      </text>
      <text className="st" x="56" y="189" fontSize="13">
        6 M
      </text>
      <text className="st" x="56" y="249" fontSize="13">
        3 M
      </text>
      <g className="fl sh">
        <circle className="o" cx="104" cy="146" r="25" fill="#FF8CC0" />
        <circle className="ink" cx="96" cy="144" r="3" />
        <circle className="ink" cx="112" cy="144" r="3" />
        <path className="ln" d="M96 154 Q104 161 112 154 M103 122 c-2 -7 5 -11 9 -7" />
      </g>
      <g className="sh" transform="rotate(-4 222 90)">
        <rect className="o pa" x="140" y="48" width="164" height="88" rx="14" fill="#FFFFFF" />
        <path className="o" fill="#A6DB5E" d="M140 76 V62 a14 14 0 0 1 14 -14 h136 a14 14 0 0 1 14 14 V76Z" />
        <text className="st pt" x="154" y="102" fontSize="16">
          Babymusik
        </text>
        <text className="st mu" x="154" y="122" fontSize="13">
          ab 6 Monaten
        </text>
      </g>
      <g className="fl2">
        <circle className="o" cx="298" cy="50" r="18" fill="#A6DB5E" />
        <path className="ln" style={{ strokeWidth: 3.5 }} d="M290 50 l6 6 l11 -12" />
      </g>
      <g className="sh" transform="rotate(3 228 204)">
        <rect className="o pa" x="146" y="162" width="164" height="88" rx="14" fill="#FFFFFF" strokeDasharray="7 6" />
        <path className="o" fill="#FFB13B" d="M146 190 V176 a14 14 0 0 1 14 -14 h136 a14 14 0 0 1 14 14 V190Z" />
        <text className="st pt" x="160" y="216" fontSize="16">
          Krabbelgruppe
        </text>
        <text className="st mu" x="160" y="236" fontSize="13">
          ab 9 Monaten
        </text>
      </g>
      <g className="fl3">
        <circle className="o pa" cx="306" cy="166" r="18" fill="#FFFFFF" />
        <path className="ln" d="M306 156 V166 L313 170" />
      </g>
      <g transform="translate(116 52) scale(.9)">
        <g className="fl2">
          <path className="o" fill="#FFFFFF" d={SPARKLE} />
        </g>
      </g>
    </>
  );
}

function TramArt() {
  const win = useId();
  return (
    <>
      <defs>
        <clipPath id={win}>
          <rect x="58" y="152" width="204" height="42" rx="12" />
        </clipPath>
      </defs>
      <path className="ln" style={{ strokeWidth: 4, strokeDasharray: "1 11" }} d="M44 82 C110 8 200 118 276 58" />
      <g className="sh">
        <path className="o pa" fill="#FFFFFF" d="M18 104 V78 L40 60 L62 78 V104Z" />
        <rect className="o" x="34" y="84" width="12" height="20" fill="#FF7070" />
      </g>
      <g className="fl sh">
        <circle className="o" cx="282" cy="54" r="24" fill="#FFD93B" />
        <path className="ink" transform="translate(270 42)" d={STAR} />
      </g>
      <path className="ln" d="M6 176 H30 M0 196 H24 M8 216 H30" />
      <g className="drive">
        <path className="ln" d="M142 140 L160 114 L178 140 M148 114 H172" />
        <g className="sh">
          <rect className="o" x="40" y="138" width="240" height="94" rx="28" fill="#5CB8FF" />
        </g>
        <rect className="o sc" x="58" y="152" width="204" height="42" rx="12" fill="#E8F1FF" />
        <g clipPath={`url(#${win})`}>
          <g transform="translate(72 146) scale(.42)">
            <Face fill="#FFD93B" />
            <path className="ln" d="M50 90 Q60 99 70 90" />
          </g>
          <path className="o" fill="#FF8CC0" d="M150 196 V180 a18 18 0 0 1 36 0 Z" />
          <path className="o pa" fill="#FFFFFF" d="M150 180 h36 v16 h-36z" />
          <circle className="o" cx="226" cy="170" r="11" fill="#A6DB5E" />
          <path className="ln" d="M226 181 V196" />
        </g>
        <path className="ln" d="M126 152 V194 M196 152 V194" />
        <rect x="50" y="206" width="220" height="8" fill="#FFFFFF" />
        <circle className="ink" cx="92" cy="234" r="13" />
        <circle className="ink" cx="228" cy="234" r="13" />
        <circle cx="92" cy="234" r="4" fill="#FFFFFF" />
        <circle cx="228" cy="234" r="4" fill="#FFFFFF" />
      </g>
      <path className="ln" style={{ strokeWidth: 4 }} d="M0 252 H320" />
      <path
        className="ln"
        d="M20 252 v8 M60 252 v8 M100 252 v8 M140 252 v8 M180 252 v8 M220 252 v8 M260 252 v8 M300 252 v8"
      />
      <g transform="rotate(10 266 116)">
        <g className="fl2 sh">
          <circle className="o" cx="266" cy="116" r="31" fill="#FFD93B" />
          <text className="st" x="266" y="118" fontSize="24" textAnchor="middle">
            22
          </text>
          <text className="st" x="266" y="134" fontSize="12" textAnchor="middle">
            Min.
          </text>
        </g>
      </g>
    </>
  );
}

function PhoneArt() {
  return (
    <>
      <g className="sh">
        <rect className="o pa" x="86" y="16" width="148" height="270" rx="28" fill="#FFFFFF" />
      </g>
      <rect className="sc" x="98" y="38" width="124" height="230" rx="16" fill="#E8F1FF" />
      <rect className="ink" x="144" y="25" width="32" height="6" rx="3" />
      <g style={{ stroke: "#13212E", strokeWidth: 2 }}>
        <rect x="108" y="52" width="30" height="30" rx="9" fill="#FF8CC0" />
        <rect x="145" y="52" width="30" height="30" rx="9" fill="#5CB8FF" />
        <rect x="182" y="52" width="30" height="30" rx="9" fill="#A6DB5E" />
        <rect x="108" y="98" width="30" height="30" rx="9" fill="#B99CFF" />
        <rect x="182" y="98" width="30" height="30" rx="9" fill="#2EC4B6" />
        <rect x="108" y="144" width="30" height="30" rx="9" fill="#FFB13B" />
        <rect x="145" y="144" width="30" height="30" rx="9" fill="#FF7070" />
        <rect x="182" y="144" width="30" height="30" rx="9" fill="#A3BDD0" />
        <rect x="182" y="190" width="30" height="30" rx="9" fill="#FFD93B" />
      </g>
      <rect
        x="145"
        y="98"
        width="30"
        height="30"
        rx="9"
        fill="none"
        style={{ stroke: "#13212E", strokeWidth: 2.5, strokeDasharray: "4 4" }}
      />
      <path className="ln" style={{ strokeDasharray: "2 9" }} d="M238 112 C222 140 196 134 184 120" />
      <path className="ln" d="M190 112 L182 121 L193 125" />
      <g className="fl sh">
        <rect
          className="o"
          x="234"
          y="44"
          width="64"
          height="64"
          rx="18"
          fill="#FFD93B"
          transform="rotate(12 266 76)"
        />
        <g transform="translate(242 50) scale(.42) rotate(12 60 60)">
          <Face fill="#FFFFFF" />
          <path className="ln" d="M50 90 Q60 99 70 90" />
        </g>
      </g>
      <g transform="translate(264 130) scale(.9)">
        <g className="fl2">
          <path className="o" fill="#FFFFFF" d={SPARKLE} />
        </g>
      </g>
      <g transform="translate(-130 10) scale(.7)">
        <g className="swing">
          <path
            className="o"
            fill="#FFD93B"
            d="M232 58 a8 8 0 0 1 16 0 c18 6 24 22 24 40 v18 l10 12 H198 l10 -12 v-18 c0 -18 6 -34 24 -40z"
          />
          <circle className="ink" cx="240" cy="138" r="8" />
        </g>
        <path className="ln" d="M286 72 q12 16 0 34 M194 72 q-12 16 0 34" />
      </g>
      <g className="fl3 sh">
        <rect className="o pa" x="4" y="204" width="180" height="64" rx="18" fill="#FFFFFF" />
        <rect className="o" x="15" y="216" width="40" height="40" rx="11" fill="#FFD93B" />
        <path className="o" fill="#FF7070" d="M23 250 L35 224 L47 250Z" />
        <text className="st mu" x="64" y="231" fontSize="12">
          Samstag, 10:00
        </text>
        <text className="st pt" x="64" y="251" fontSize="15">
          3 neue Ideen
        </text>
      </g>
    </>
  );
}

const ART: Record<StepId, ComponentType> = {
  stadt: CastleArt,
  alter: RulerArt,
  weg: TramArt,
  app: PhoneArt,
};

/** Illustration eines Schritts; `key` am Aufrufer startet die Einflug-Animation je Schritt neu */
export function StepArt({ step }: { step: StepId }) {
  const Art = ART[step];
  return (
    <svg className="onb-art" viewBox="0 0 320 300" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  );
}
