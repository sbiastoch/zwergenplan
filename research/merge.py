#!/usr/bin/env python3
"""EINMALIG (Ersteinrichtung 2026-10-04): führt research/providers/*.yaml zu .claude/skills/babyevents-nuernberg/providers.yaml zusammen (heute: data/providers.yaml, seitdem von Hand gepflegt – nicht erneut ausführen).

- Dubletten (gleiche id oder ALIAS) werden vereinigt: Listen per Union, Skalare erster nicht-leerer Wert, notes verkettet.
- role: anbieter | aggregator (mit fetch-Skript) | verzeichnis (nur Pflege, kein Terminabruf)
- covered_by: Anbieter, deren Termine vollständig über einen Aggregator kommen (nur ET-Feeds)
- ring wird per Geocoding + Stadtmauer-Polygon neu berechnet.
"""
import glob
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(ROOT, "..", ".claude", "skills", "babyevents-nuernberg")
sys.path.insert(0, os.path.join(SKILL, "scripts"))
from ring import classify  # noqa: E402
from route import geocode, load_cache, save_cache  # noqa: E402

ALIAS = {
    "zentrum-koberger-treffs": "zentrum-kobergerstrasse",
    "fbs-offene-treffs": "fbs-nuernberg",
    "brk-familienzentrum-nuernberg": "brk-familienzentrum",
    "mamalea-musikzauber": "studio-herzschlag",
    "kuf-sternenhaus": "sternenhaus-kuf",
    "cvjm-gostenhof-mini-club": "cvjm-gostenhof-miniclub",
    "feb-miniclubs": "feb-eltern-kind-gruppen",
    "kuf-kulturlaeden": "kuf-kinderkultur-aggregator",
    "nuernberg-stadtportal-kinderkultur-aggregator": "stadt-nuernberg-veranstaltungskalender",
}
ROLE = {
    "stadt-nuernberg-veranstaltungskalender": ("aggregator", "scripts/stadt_vk.py FROM TO"),
    "frankenkids-eventkalender": ("aggregator", "scripts/frankenkids.py FROM TO"),
    "et-dekanat-nuernberg": ("aggregator", "scripts/evtermine.py FROM TO"),
    "curt-termine-familie": ("aggregator", None),
    "rausgegangen-kinder-familien": ("aggregator", None),
    "kuf-kinderkultur-aggregator": ("aggregator", None),
    "familienbildung-nuernberg-0-3": ("verzeichnis", None),
    "feb-eltern-kind-gruppen": ("verzeichnis", None),
}
LISTS = ("topics", "format", "cost", "registration")


def merge(a, b):
    for k, v in b.items():
        if k.startswith("_"):
            continue
        if k in LISTS:
            a[k] = list(dict.fromkeys((a.get(k) or []) + (v or [])))
        elif k == "programme":
            have = {p["url"] for p in a.get("programme") or []}
            a["programme"] = (a.get("programme") or []) + [p for p in v or [] if p["url"] not in have]
        elif k == "venues":
            have = {x.get("address") for x in a.get("venues") or []}
            a["venues"] = (a.get("venues") or []) + [x for x in v or [] if x.get("address") not in have]
        elif k == "notes":
            if v and v not in (a.get("notes") or ""):
                a["notes"] = f"{a['notes']} | {v}" if a.get("notes") else v
        elif not a.get(k):
            a[k] = v
    return a


def main():
    target = os.path.join(SKILL, "providers.yaml")
    if os.path.exists(target) and "--force" not in sys.argv:
        sys.exit("providers.yaml existiert und wird seitdem von Hand gepflegt – Abbruch (mit --force überschreiben).")
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "providers", "*.yaml"))):
        for p in yaml.safe_load(open(f)) or []:
            pid = ALIAS.get(p["id"], p["id"])
            p["id"] = pid
            out[pid] = merge(out[pid], p) if pid in out else p

    cache = load_cache()
    for p in out.values():
        role, fetch = ROLE.get(p["id"], ("anbieter", None))
        p["role"] = role
        if fetch:
            p["fetch"] = fetch
        urls = [x["url"] for x in p.get("programme") or []]
        if role == "anbieter" and urls and all("evangelische-termine.de" in u for u in urls):
            p["covered_by"] = "et-dekanat-nuernberg"
        if role != "anbieter":
            p.pop("ring", None)
            continue
        for place in [p] + list(p.get("venues") or []):
            addr = place.get("address") or ""
            if "Nürnberg" not in addr or "diverse" in addr:
                continue
            clean = addr.split("(")[0].strip()
            g = geocode(clean, cache)
            if g:
                old = place.get("ring")
                place["ring"], dist = classify(g["lat"], g["lon"], g.get("district"))
                if old and old != place["ring"]:
                    print(f"ring {p['id']}: {old} -> {place['ring']} ({dist} m)  {clean}", file=sys.stderr)
            else:
                print(f"kein Geocoding: {p['id']}: {clean}", file=sys.stderr)
        save_cache(cache)

    order = {"innen": 0, "knapp-aussen": 1, "aussen": 2, None: 3}
    rolesort = {"anbieter": 0, "aggregator": 1, "verzeichnis": 2}
    items = sorted(out.values(), key=lambda p: (rolesort[p["role"]], order.get(p.get("ring"), 3), p["name"].lower()))
    keyorder = ["id", "name", "role", "fetch", "covered_by", "address", "district", "ring", "venues", "age", "topics",
                "format", "cost", "registration", "programme", "availability", "verified", "notes"]
    items = [{k: p[k] for k in keyorder if k in p} | {k: v for k, v in p.items() if k not in keyorder and not k.startswith("_")}
             for p in items]
    header = ("# Anbieterverzeichnis Babyangebote Nürnberg – Schema: references/provider-schema.md\n"
              "# role: anbieter (einzeln prüfen) | aggregator (Zusatzquelle, ggf. per fetch-Skript) | verzeichnis (nur Pflege)\n"
              "# covered_by: Termine kommen vollständig über diesen Aggregator – kein eigener Abruf nötig\n\n")
    with open(os.path.join(SKILL, "providers.yaml"), "w") as fh:
        fh.write(header)
        yaml.safe_dump(items, fh, allow_unicode=True, sort_keys=False, width=120)
    from collections import Counter
    print(len(items), Counter(p["role"] for p in items), Counter(p.get("ring") for p in items),
          "covered:", sum(1 for p in items if p.get("covered_by")))


if __name__ == "__main__":
    main()
