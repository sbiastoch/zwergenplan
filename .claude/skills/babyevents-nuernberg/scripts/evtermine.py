#!/usr/bin/env python3
"""evangelische-termine.de – Eltern-Kind-Termine im Dekanat Nürnberg (region 507).

Aufruf:  evtermine.py FROM TO [--keywords krabbel,miniclub] [--vid 1858]
Ausgabe: JSON-Kandidaten im Format von stadt_vk.py.

- highlight=all ist Pflicht, sonst kommen nur hervorgehobene Termine.
- q= verknüpft Wörter per ODER und durchsucht auch Beschreibungen -> stichwortweise abfragen.
- region 507 enthält Röthenbach/Schwaig/Heroldsberg -> auf Nürnberg filtern.
- MODE "jeweils" = ein Eintrag für eine wöchentliche Reihe (START..UNTIL, gleicher Wochentag);
  wird als "weekly" mit erstem Termin im Zeitraum ausgegeben.
"""
import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import requests

from stadt_vk import RELEVANT

API = "https://www.evangelische-termine.de/json"
KEYWORDS = ["krabbel", "miniclub", "mini-club", "mutter-kind", "eltern-kind", "minigottesdienst",
            "minikirche", "krabbelgottesdienst", "baby", "kleinkind", "spielgruppe", "pekip", "zwerge"]


def fetch(params):
    r = requests.get(API, params={"region": 507, "highlight": "all", "itemsPerPage": 1000, **params}, timeout=60)
    r.raise_for_status()
    return [x["Veranstaltung"] for x in r.json() if "Veranstaltung" in x]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("frm")
    p.add_argument("to")
    p.add_argument("--keywords")
    p.add_argument("--vid", help="nur dieser Veranstalter (ET-vid)")
    p.add_argument("--no-filter", action="store_true")
    a = p.parse_args()

    raw = {}
    queries = [{"vid": a.vid}] if a.vid else [{"q": k} for k in (a.keywords.split(",") if a.keywords else KEYWORDS)]
    def safe(q):
        try:
            return fetch(q)
        except (requests.RequestException, ValueError) as e:
            print(f"Warnung: {q}: {e}", file=sys.stderr)
            return []
    with ThreadPoolExecutor(max_workers=5) as pool:
        for res in pool.map(safe, queries):
            for v in res:
                raw[v["ID"]] = v

    groups = {}
    for v in raw.values():
        city = v.get("_place_CITY") or ""
        if city and not city.lower().startswith("nü"):
            continue
        text = f"{v.get('_event_TITLE', '')} {v.get('SUBTITLE', '')} {v.get('_event_LONG_DESCRIPTION', '')}"
        if not a.vid and not a.no_filter and not RELEVANT.search(text):
            continue
        start = datetime.fromisoformat(v["START"])
        end_t = v["END"][11:16] if v.get("END") else None
        occ = []
        if v.get("MODE") == "jeweils" and v.get("UNTIL"):
            until = datetime.fromisoformat(v["UNTIL"]).date()
            d = start
            while d.date() <= until:
                if a.frm <= d.date().isoformat() <= a.to:
                    occ.append({"start": d.isoformat(timespec="minutes"), "end": f"{d.date()}T{end_t}" if end_t else None})
                d += timedelta(days=7)
            weekly = True
        else:
            if a.frm <= start.date().isoformat() <= a.to:
                occ.append({"start": start.isoformat(timespec="minutes"), "end": f"{start.date()}T{end_t}" if end_t else None})
            weekly = False
        if not occ:
            continue
        street = v.get("_place_STREET_NR") or ""
        addr = f"{street}, {v.get('_place_ZIP', '')} {city}".strip(", ") if street else None
        if not addr and v.get("_place_GLAT"):
            addr = f"{float(v['_place_GLAT']):.6f},{float(v['_place_GLONG']):.6f}"
        title = v.get("_event_TITLE", "").strip()
        key = (title, v.get("_user_ID"), v.get("_place_ID"))
        g = groups.setdefault(key, {
            "et_id": v["ID"],
            "title": title,
            "subtitle": v.get("SUBTITLE") or None,
            "description": re.sub(r"\s+", " ", v.get("_event_LONG_DESCRIPTION") or v.get("_event_SHORT_DESCRIPTION") or "")[:600],
            "organizer": v.get("_user_REALNAME"),
            "organizer_url": v.get("_user_URL") or None,
            "location": v.get("_place_NAME"),
            "address": addr,
            "detail_url": v.get("_event_LINK") or f"https://www.evangelische-termine.de/detail-bt?ID={v['ID']}",
            "waitlist": "warteliste" in title.lower(),
            "weekly_range": weekly,
            "occurrences": [],
        })
        g["occurrences"] += occ
    out = sorted(groups.values(), key=lambda g: g["occurrences"][0]["start"])
    for g in out:
        g["occurrences"].sort(key=lambda o: o["start"])
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
