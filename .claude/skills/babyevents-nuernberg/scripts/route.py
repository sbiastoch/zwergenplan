#!/usr/bin/env python3
"""Wegzeiten von einer Startadresse zu einem oder mehreren Zielen in Nürnberg.

Fußweg: Nominatim (Geocoding) + OSRM-Fußprofil von routing.openstreetmap.de.
ÖPNV:   VGN-EFA (efa.vgn.de), Abfahrt so, dass man zur angegebenen Zeit ankommt.

Aufruf:
  route.py --from "Hauptmarkt 1, Nürnberg" --to "Fürther Straße 100, Nürnberg" [--to "49.4423,11.1298"] [--to ...]
           [--arrive 2026-10-06T10:00]
Ausgabe: JSON-Liste, ein Objekt je Ziel.

Ergebnisse werden in ~/.cache/babyevents/routes.json gecacht (Schlüssel: Start, Ziel,
Wochentag+Uhrzeit), damit wiederholte Läufe die offenen Dienste nicht belasten.
"""
import argparse
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

UA = "babyevents-nuernberg-skill/1.0 (private use)"
TZ = ZoneInfo("Europe/Berlin")
CACHE = os.path.expanduser("~/.cache/babyevents/routes.json")
EFA = "https://efa.vgn.de/vgnExt_oeffi"

_last_nominatim = 0.0


def load_cache():
    try:
        with open(CACHE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cache(cache):
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    with open(CACHE, "w") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)


COORD = re.compile(r"^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$")  # "49.44,11.08" (lat,lon)


def street_part(addr):
    """'Gemeindehaus X, Musterstr. 3, 90402 Nürnberg' -> 'Musterstr. 3, 90402 Nürnberg' (oder None)."""
    clean = re.sub(r"\([^)]*\)", "", addr)
    parts = [x.strip() for x in clean.split(",") if x.strip()]
    for i, part in enumerate(parts):
        if re.search(r"[A-Za-zäöüß]\.?\s*\d", part) and not re.fullmatch(r"\d{5}.*", part):
            alt = ", ".join(parts[i:])
            return alt if alt != addr else None
    return None


def geocode(addr, cache):
    res = _geocode(addr, cache)
    if res is None:
        alt = street_part(addr)
        if alt and alt != addr:
            res = _geocode(alt, cache)
    return res


def _geocode(addr, cache):
    global _last_nominatim
    m = COORD.match(addr)
    if m:
        return {"lat": float(m.group(1)), "lon": float(m.group(2))}
    key = "geo|" + addr
    if key in cache and (cache[key] is None or "district" in cache[key]):
        return cache[key]
    wait = 1.1 - (time.time() - _last_nominatim)  # Nominatim: max. 1 Anfrage/s
    if wait > 0:
        time.sleep(wait)
    _last_nominatim = time.time()
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": addr, "format": "json", "limit": 1, "countrycodes": "de", "addressdetails": 1},
        headers={"User-Agent": UA},
        timeout=20,
    )
    r.raise_for_status()
    hits = r.json()
    res = None
    if hits:
        a = hits[0].get("address", {})
        res = {"lat": float(hits[0]["lat"]), "lon": float(hits[0]["lon"]),
               "district": a.get("neighbourhood") or a.get("suburb") or a.get("quarter")}
    cache[key] = res
    return res


def walk(a, b):
    url = (
        "https://routing.openstreetmap.de/routed-foot/route/v1/foot/"
        f"{a['lon']},{a['lat']};{b['lon']},{b['lat']}?overview=false"
    )
    r = requests.get(url, headers={"User-Agent": UA}, timeout=20)
    r.raise_for_status()
    route = r.json()["routes"][0]
    return {"minutes": round(route["duration"] / 60), "km": round(route["distance"] / 1000, 1)}


def efa_location(addr):
    m = COORD.match(addr)
    # VGN akzeptiert höchstens 5 Nachkommastellen
    typ, name = ("coord", f"{float(m.group(2)):.5f}:{float(m.group(1)):.5f}:WGS84[dd.ddddd]") if m else ("any", addr)
    r = requests.get(
        f"{EFA}/XML_STOPFINDER_REQUEST",
        params={"outputFormat": "rapidJSON", "type_sf": typ, "name_sf": name, "locationServerActive": 1},
        timeout=20,
    )
    r.raise_for_status()
    locs = r.json().get("locations") or []
    return locs[0]["id"] if locs else None


def nearest_stop(geo):
    """Nächste Haltestelle (id, Gehminuten) per XML_COORD_REQUEST – Rückfall, wenn der VGN die Adresse nicht kennt."""
    r = requests.get(
        f"{EFA}/XML_COORD_REQUEST",
        params={"outputFormat": "rapidJSON", "coord": f"{geo['lon']:.5f}:{geo['lat']:.5f}:WGS84[dd.ddddd]",
                "inclFilter": 1, "type_1": "STOP", "radius_1": 1500, "coordOutputFormat": "WGS84[dd.ddddd]"},
        timeout=20,
    )
    r.raise_for_status()
    best = None
    for loc in r.json().get("locations") or []:
        lat, lon = loc["coord"]
        d = math.hypot((lat - geo["lat"]) * 110540, (lon - geo["lon"]) * 72400)
        if best is None or d < best[1]:
            best = (loc["id"], d)
    return (best[0], round(best[1] * 1.3 / 75)) if best else (None, 0)  # Umwegfaktor 1.3, 75 m/min


def resolve(addr, geo):
    """VGN-Ort für eine Adresse: Adresse -> Koordinate -> nächste Haltestelle (+ Gehminuten)."""
    loc = efa_location(addr)
    if not loc and geo:
        loc = efa_location(f"{geo['lat']},{geo['lon']}")
    if loc:
        return loc, 0
    return nearest_stop(geo) if geo else (None, 0)


def transit(origin, o_geo, dest, d_geo, arrive):
    (o, o_walk), (d, d_walk) = resolve(origin, o_geo), resolve(dest, d_geo)
    if not o or not d:
        return {"error": "Adresse im VGN nicht gefunden"}
    arrive_stop = arrive - timedelta(minutes=d_walk)
    r = requests.get(
        f"{EFA}/XML_TRIP_REQUEST2",
        params={
            "outputFormat": "rapidJSON",
            "type_origin": "any", "name_origin": o,
            "type_destination": "any", "name_destination": d,
            "itdDate": arrive_stop.strftime("%Y%m%d"), "itdTime": arrive_stop.strftime("%H%M"),
            "itdTripDateTimeDepArr": "arr",
            "locationServerActive": 1,
            "calcNumberOfTrips": 4,
        },
        timeout=30,
    )
    r.raise_for_status()
    best = None
    for j in r.json().get("journeys") or []:
        legs = j["legs"]
        dep = datetime.fromisoformat(legs[0]["origin"]["departureTimePlanned"].replace("Z", "+00:00"))
        arr = datetime.fromisoformat(legs[-1]["destination"]["arrivalTimePlanned"].replace("Z", "+00:00"))
        if arr > arrive_stop.astimezone(timezone.utc):
            continue
        dep -= timedelta(minutes=o_walk)
        arr += timedelta(minutes=d_walk)
        lines = [
            l["transportation"].get("number") or l["transportation"].get("product", {}).get("name")
            for l in legs
            if l["transportation"].get("product", {}).get("name") not in ("footpath", "Fussweg", None)
        ]
        cand = {
            "minutes": round((arr - dep).total_seconds() / 60),
            "depart": dep.astimezone(TZ).strftime("%H:%M"),
            "arrive": arr.astimezone(TZ).strftime("%H:%M"),
            "lines": lines,
            "changes": max(len(lines) - 1, 0),
        }
        # spätestmögliche Abfahrt bevorzugen
        if best is None or cand["depart"] > best["depart"]:
            best = cand
    return best or {"error": "keine Verbindung gefunden"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--from", dest="origin", required=True)
    p.add_argument("--to", dest="dests", action="append", required=True)
    p.add_argument("--arrive", help="Ankunft lokal, ISO (z. B. 2026-10-06T10:00); Standard: nächster Werktag 10:00")
    p.add_argument("--no-transit", action="store_true")
    args = p.parse_args()

    if args.arrive:
        arrive = datetime.fromisoformat(args.arrive).replace(tzinfo=TZ)
    else:
        now = datetime.now(TZ)
        arrive = now.replace(hour=10, minute=0, second=0, microsecond=0)
        while arrive <= now or arrive.weekday() >= 5:
            arrive += timedelta(days=1)

    cache = load_cache()
    try:
        start = geocode(args.origin, cache)
    except requests.RequestException as e:
        json.dump([{"error": f"Startadresse: {type(e).__name__}: {e}"}], sys.stdout, ensure_ascii=False)
        sys.exit(1)
    out = []
    for dest in args.dests:
        res = {"to": dest}
        try:
            tgt = geocode(dest, cache)
            if not start or not tgt:
                res["error"] = "Geocoding fehlgeschlagen"
            else:
                wk = f"walk|{args.origin}|{dest}"
                if wk not in cache:
                    cache[wk] = walk(start, tgt)
                res["walk"] = cache[wk]
                if not args.no_transit and res["walk"]["minutes"] > 12:
                    tk = f"pt|{args.origin}|{dest}|{arrive.strftime('%a%H%M')}"
                    pt = cache.get(tk) or transit(args.origin, start, dest, tgt, arrive)
                    if "error" not in pt:
                        cache[tk] = pt
                    res["transit"] = pt
        except requests.RequestException as e:
            res["error"] = f"{type(e).__name__}: {e}"
        out.append(res)
        save_cache(cache)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
