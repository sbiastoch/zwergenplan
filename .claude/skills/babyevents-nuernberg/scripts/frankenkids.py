#!/usr/bin/env python3
"""frankenkids.de-Termine für Nürnberg (WordPress "The Events Calendar"-API).

Aufruf:  frankenkids.py FROM TO [--no-filter]
Ausgabe: JSON-Kandidaten im selben Format wie stadt_vk.py (gefiltert auf Baby-/Kleinkindbezug).
"""
import html
import json
import re
import sys

import requests

from stadt_vk import RELEVANT

API = "https://www.frankenkids.de/wp-json/tribe/events/v1/events"


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def main():
    frm, to = sys.argv[1], sys.argv[2]
    no_filter = "--no-filter" in sys.argv
    page, groups = 1, {}
    while True:
        r = requests.get(API, params={"start_date": frm, "end_date": f"{to} 23:59", "per_page": 50,
                                      "tags": "nuernberg", "page": page}, timeout=40)
        if r.status_code == 404:  # hinter der letzten Seite
            break
        r.raise_for_status()
        d = r.json()
        for e in d.get("events", []):
            title, desc = strip(e["title"]), strip(e.get("description"))
            if not no_filter and not RELEVANT.search(f"{title} {desc} {e.get('excerpt', '')}"):
                continue
            v = e.get("venue") if isinstance(e.get("venue"), dict) else {}
            if v.get("city") and "nürnberg" not in v["city"].lower():
                continue
            org = e.get("organizer") or []
            key = (title, v.get("venue"))  # wiederkehrende Termine bündeln
            g = groups.setdefault(key, {
                "fk_id": e["id"],
                "title": title,
                "description": desc[:600],
                "organizer": strip(org[0].get("organizer")) if org else None,
                "location": strip(v.get("venue")),
                "address": f"{v.get('address', '')}, {v.get('zip', '')} {v.get('city', '')}".strip(", "),
                "cost": strip(e.get("cost")) or None,
                "detail_url": e.get("url"),
                "website": e.get("website") or None,
                "occurrences": [],
            })
            g["occurrences"].append({"start": e["start_date"][:16].replace(" ", "T"),
                                     "end": e["end_date"][:16].replace(" ", "T")})
        if page >= d.get("total_pages", 1):
            break
        page += 1
    out = sorted(groups.values(), key=lambda g: g["occurrences"][0]["start"])
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
