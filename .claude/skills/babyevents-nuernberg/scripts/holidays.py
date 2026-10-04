#!/usr/bin/env python3
"""Bayerische Schulferien und Feiertage (OpenHolidays-API, gecacht).

Aufruf:  holidays.py FROM TO      -> JSON {"YYYY-MM-DD": "Herbstferien", ...} für jeden freien Tag
Als Modul: free_days(from_iso, to_iso) -> dict
"""
import json
import os
import sys
from datetime import date, timedelta

import requests

CACHE = os.path.expanduser("~/.cache/babyevents/holidays.json")
API = "https://openholidaysapi.org/{kind}?countryIsoCode=DE&subdivisionCode=DE-BY&languageIsoCode=DE&validFrom={y}-01-01&validTo={y}-12-31"


def _year(y, cache):
    key = str(y)
    if key not in cache:
        days = {}
        for kind in ("SchoolHolidays", "PublicHolidays"):
            r = requests.get(API.format(kind=kind, y=y), headers={"accept": "application/json"}, timeout=20)
            r.raise_for_status()
            for h in r.json():
                if h.get("subdivisions") and not any(s["code"] == "DE-BY" for s in h["subdivisions"]):
                    continue  # regionale Feiertage anderer Länder bzw. nur Augsburg o. ä.
                name = h["name"][0]["text"]
                d, end = date.fromisoformat(h["startDate"]), date.fromisoformat(h["endDate"])
                while d <= end:
                    days.setdefault(d.isoformat(), name)
                    d += timedelta(days=1)
        cache[key] = days
    return cache[key]


def free_days(frm, to):
    try:
        cache = json.load(open(CACHE))
    except (OSError, ValueError):
        cache = {}
    a, b = date.fromisoformat(frm[:10]), date.fromisoformat(to[:10])
    out = {}
    for y in range(a.year, b.year + 1):
        for d, n in _year(y, cache).items():
            if frm[:10] <= d <= to[:10]:
                out[d] = n
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(cache, open(CACHE, "w"), ensure_ascii=False)
    return dict(sorted(out.items()))


if __name__ == "__main__":
    json.dump(free_days(sys.argv[1], sys.argv[2]), sys.stdout, ensure_ascii=False, indent=1)
    print()
