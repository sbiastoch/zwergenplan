#!/usr/bin/env python3
"""Führt die Teilergebnisse zusammen und reichert sie an.

Aufruf:  enrich.py RUN_DIR
Liest    RUN_DIR/meta.json und RUN_DIR/raw/*.json (je Paket {"events": [...], "status": {...}})
Schreibt RUN_DIR/events.json (dedupliziert, mit "route" und "ics"), RUN_DIR/status.json, RUN_DIR/ics/*.ics

Wegzeit: Fußweg je Ort; ÖPNV je Ort und Beginn (Ankunft zum Terminbeginn), gecacht über route.py.
"""
import difflib
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from holidays import free_days
from route import geocode, load_cache, save_cache, transit, walk

HERE = os.path.dirname(os.path.abspath(__file__))
TZ = ZoneInfo("Europe/Berlin")
AGGREGATORS = {"stadt-nuernberg-veranstaltungskalender", "frankenkids-eventkalender", "et-dekanat-nuernberg"}
GENERIC = {"kinder", "kind", "eltern", "gruppe", "miniclub", "mini", "club", "krabbelgruppe", "baby", "babys", "offene",
           "offener", "treff", "jahre", "jahren", "monate", "monaten", "geb", "warteliste", "für", "fuer", "mit", "und",
           "nürnberg", "nuernberg", "kurs", "termin", "eltern-kind-gruppe", "familien", "familie"}


def rank(ev):
    known = ev.get("availability", "unbekannt") != "unbekannt"
    return (known, ev["provider_id"] not in AGGREGATORS, len(ev.get("description") or ""))


def words(title):
    return {w for w in re.findall(r"[a-zäöüß]{4,}", title.lower()) if w not in GENERIC}


def same_event(a, b):
    """Gleicher Beginn + ähnlicher Titel; Einträge derselben Quelle gelten immer als verschieden."""
    if a["start"][:16] != b["start"][:16] or a["provider_id"] == b["provider_id"]:
        return False
    ta, tb = a["title"].lower(), b["title"].lower()
    return bool(words(ta) & words(tb)) or difflib.SequenceMatcher(None, ta, tb).ratio() >= 0.6


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:30]


def merge_events(run):
    events, status = [], {}
    for f in sorted(glob.glob(os.path.join(run, "raw", "*.json"))):
        part = json.load(open(f))
        status.update(part.get("status", {}))
        for ev in part.get("events", []):
            dup = next((o for o in events if same_event(o, ev)), None)
            if dup is None:
                events.append(ev)
                continue
            keep, drop = (ev, dup) if rank(ev) > rank(dup) else (dup, ev)
            keep["tags"] = list(dict.fromkeys((keep.get("tags") or []) + (drop.get("tags") or [])))
            for k in ("price", "url", "address", "description"):
                keep.setdefault(k, drop.get(k))
            events[events.index(dup)] = keep
    # eindeutige ids (ICS-Dateinamen und UIDs hängen daran)
    seen = set()
    for ev in events:
        base = ev.get("id") or f"{ev['provider_id']}-{ev['start'][:16]}-{slug(ev['title'])}"
        uid, n = base, 2
        while uid in seen:
            uid, n = f"{base}-{n}", n + 1
        ev["id"] = uid
        seen.add(uid)
    return events, status


def fix_times(events):
    for ev in events:
        start = datetime.fromisoformat(ev["start"])
        end = None
        if ev.get("end"):
            try:
                end = datetime.fromisoformat(ev["end"])
            except ValueError:
                end = None
        if end is None or end <= start or end - start > timedelta(hours=10):
            ev["end"] = (start + timedelta(minutes=60)).isoformat(timespec="minutes")
            ev["description"] = (ev.get("description", "") + " (Endzeit geschätzt)").strip()
        rr = ev.get("rrule")
        if rr and "UNTIL=" in rr:  # UNTIL als UTC-Zeitstempel ohne Bindestriche (RFC 5545 bei DTSTART mit TZID)
            head, tail = rr.split("UNTIL=", 1)
            val, _, rest = tail.partition(";")
            ev["rrule"] = f"{head}UNTIL={re.sub(r'[^0-9]', '', val)[:8]}T225959Z" + (f";{rest}" if rest else "")


def skip_holidays(events, meta):
    """Wöchentliche Regeln: Termine an Ferien-/Feiertagen ausnehmen (skip_holidays, Standard bei offener-treff)."""
    free = free_days(meta["from"], meta["to"])
    for ev in events:
        rr = ev.get("rrule") or ""
        if "FREQ=WEEKLY" not in rr or not ev.get("skip_holidays", "offener-treff" in (ev.get("tags") or [])):
            continue
        d, stop = datetime.fromisoformat(ev["start"]), meta["to"]
        if "UNTIL=" in rr:
            u = rr.split("UNTIL=")[1][:8]
            stop = min(stop, f"{u[:4]}-{u[4:6]}-{u[6:8]}")
        ex, names = [], set()
        while d.date().isoformat() <= stop:
            if d.date().isoformat() in free:
                ex.append(d.isoformat(timespec="minutes"))
                names.add(free[d.date().isoformat()])
            d += timedelta(days=7)
        if ex:
            ev["exdates"] = sorted(set((ev.get("exdates") or []) + ex))
            ev["series_info"] = (ev.get("series_info", "") + f"; Pause: {', '.join(sorted(names))}").lstrip("; ")


def add_routes(events, meta):
    cache = load_cache()
    home = geocode(meta["address"], cache)
    errors = set()
    for ev in events:
        loc = ev.get("address") or ev.get("location")
        r = {}
        try:
            tgt = geocode(loc, cache) if loc else None
            if not home or not tgt:
                r["error"] = "Geocoding fehlgeschlagen"
            else:
                wk = f"walk|{meta['address']}|{loc}"
                if wk not in cache:
                    cache[wk] = walk(home, tgt)
                r["walk"] = cache[wk]
                if r["walk"]["minutes"] > 12:
                    arrive = datetime.fromisoformat(ev["start"][:16]).replace(tzinfo=TZ)
                    tk = f"pt|{meta['address']}|{loc}|{arrive.strftime('%a%H%M')}"
                    pt = cache.get(tk) or transit(meta["address"], home, loc, tgt, arrive)
                    if "error" not in pt:
                        cache[tk] = pt
                    r["transit"] = pt
        except Exception as e:  # Netzfehler einzelner Dienste sollen den Lauf nicht abbrechen
            r["error"] = f"{type(e).__name__}: {e}"
        if "error" in r or "error" in (r.get("transit") or {}):
            errors.add(loc or ev["title"])
        ev["route"] = r
        bits = []
        if r.get("walk"):
            bits.append(f"zu Fuß {r['walk']['minutes']} Min")
        if (r.get("transit") or {}).get("minutes") is not None:
            t = r["transit"]
            bits.append(f"ÖPNV {t['minutes']} Min ({', '.join(t['lines']) or 'Fußweg'}, ab {t['depart']})")
        ev["travel"] = "; ".join(bits)
        if ev.get("location") and ev.get("address") and ev["address"] not in ev["location"]:
            ev["location"] = f"{ev['location']}, {ev['address']}"
        elif ev.get("address") and not ev.get("location"):
            ev["location"] = ev["address"]
    save_cache(cache)
    return sorted(errors)


def main():
    run = sys.argv[1]
    meta = json.load(open(os.path.join(run, "meta.json")))
    events, status = merge_events(run)
    events = [e for e in events if meta["from"] <= e["start"][:10] <= meta["to"]]
    fix_times(events)
    skip_holidays(events, meta)
    route_errors = add_routes(events, meta)

    tmp = os.path.join(run, "_ics_input.json")
    json.dump(events, open(tmp, "w"), ensure_ascii=False)
    out = subprocess.run([sys.executable, os.path.join(HERE, "ics.py"), tmp, os.path.join(run, "ics")],
                         capture_output=True, text=True, check=True)
    mapping = json.loads(out.stdout)
    os.remove(tmp)
    for ev in events:
        ev["ics"] = mapping.get(ev["id"])

    json.dump(events, open(os.path.join(run, "events.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(status, open(os.path.join(run, "status.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"events": len(events), "providers": len(status), "route_errors": route_errors}, ensure_ascii=False))


if __name__ == "__main__":
    main()
