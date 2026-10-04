#!/usr/bin/env python3
"""Lage einer Adresse zum Nürnberger Altstadtring (Stadtmauer).

Aufruf:  ring.py "Adresse" [...]   -> JSON [{"address":..., "ring": "innen|knapp-aussen|aussen", "m": Abstand}]
Als Modul: classify(lat, lon) -> (ring, meter)
"knapp-aussen" = höchstens 700 m außerhalb der Mauer.
"""
import json
import math
import sys

# Stadtmauer im Uhrzeigersinn ab Spittlertor (lat, lon), grob entlang der Grabenstraßen
WALL = [
    (49.44775, 11.06810),  # Spittlertor
    (49.45130, 11.06700),  # Westtorgraben
    (49.45470, 11.06960),  # Hallertor
    (49.45750, 11.07180),  # Neutor
    (49.45900, 11.07550),  # Tiergärtnertor / Burg
    (49.45930, 11.07730),  # Vestnertor
    (49.45780, 11.08550),  # Maxtor
    (49.45550, 11.08650),  # Laufer Tor
    (49.45270, 11.08680),  # Wöhrder Bastei
    (49.44920, 11.08430),  # Marientor
    (49.44740, 11.08150),  # Königstor
    (49.44660, 11.07780),  # Frauentor
    (49.44700, 11.07450),  # Frauentorgraben West
    (49.44720, 11.07150),  # Färbertor
    (49.44700, 11.06900),  # Spittlertorgraben
]
KNAPP = 700


def _xy(lat, lon):
    return lon * 111320 * math.cos(math.radians(49.45)), lat * 110540


def _inside(lat, lon):
    x, y = _xy(lat, lon)
    pts = [_xy(*p) for p in WALL]
    inside = False
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _dist(lat, lon):
    px, py = _xy(lat, lon)
    best = float("inf")
    pts = [_xy(*p) for p in WALL]
    for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
        dx, dy = x2 - x1, y2 - y1
        t = max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)))
    return best


def classify(lat, lon, district=None):
    if _inside(lat, lon) or (district or "").startswith("Altstadt, St."):
        return "innen", 0
    d = round(_dist(lat, lon))
    return ("knapp-aussen" if d <= KNAPP else "aussen"), d


if __name__ == "__main__":
    from route import geocode, load_cache, save_cache

    cache = load_cache()
    out = []
    for addr in sys.argv[1:]:
        g = geocode(addr, cache)
        ring, m = classify(g["lat"], g["lon"], g.get("district")) if g else (None, None)
        out.append({"address": addr, "ring": ring, "m": m, "district": (g or {}).get("district")})
    save_cache(cache)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()
