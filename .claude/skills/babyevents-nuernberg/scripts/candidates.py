#!/usr/bin/env python3
"""Wandelt Aggregator-Kandidaten in Events um (raw/aggregatoren.json).

1) holen:    candidates.py fetch RUN_DIR          -> ruft stadt_vk/frankenkids/evtermine für meta.json-Zeitraum
2) sichten:  candidates.py list RUN_DIR           -> kompakte Tabelle (cid | Termin | Titel | Veranstalter | Auszug)
3) filtern:  candidates.py keep RUN_DIR cid,cid,… -> schreibt RUN_DIR/raw/aggregatoren.json nur mit diesen
Status-Einträge: je Aggregator ok/fehler.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = {
    "stadt-nuernberg-veranstaltungskalender": "stadt_vk.py",
    "frankenkids-eventkalender": "frankenkids.py",
    "et-dekanat-nuernberg": "evtermine.py",
}


TOPIC_RULES = [
    ("pekip", r"pekip"), ("babymassage", r"babymassage"), ("krabbelgruppe", r"krabbel"),
    ("eltern-kind-gruppe", r"eltern[- ]kind|mutter[- ]kind|miniclub|mini-club"), ("musik", r"musik|singen|lieder|rhythmik"),
    ("yoga-mit-baby", r"yoga"), ("fitness-mit-baby", r"barre|pilates|fitness|rückbildung"), ("tanz", r"tanz|dancer"),
    ("museum", r"museum"), ("theater", r"theater|puppen"), ("konzert", r"konzert"), ("vorlesen", r"vorles|bücherzwerge|bilderbuch"),
    ("elterncafe", r"café|cafe|elterncaf"), ("krabbelgottesdienst", r"gottesdienst|kinderkirche|minikirche"),
    ("waldgruppe", r"wald"), ("stillcafe", r"still(caf|treff|zeit)|milchzeit"), ("vaeter", r"väter|vater|papa"),
]


def topics(text):
    return [tag for tag, rx in TOPIC_RULES if re.search(rx, text)]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower())[:40].strip("-")


def fetch(run):
    meta = json.load(open(os.path.join(run, "meta.json")))
    os.makedirs(os.path.join(run, "candidates"), exist_ok=True)
    status = {}
    for pid, script in SOURCES.items():
        out = subprocess.run([sys.executable, os.path.join(HERE, script), meta["from"], meta["to"]],
                             capture_output=True, text=True, timeout=600)
        try:
            data = json.loads(out.stdout)
            status[pid] = {"status": "ok" if data else "keine-termine", "count": len(data)}
        except ValueError:
            data = []
            status[pid] = {"status": "fehler", "reason": (out.stderr or "keine Ausgabe").strip()[-300:]}
        json.dump(data, open(os.path.join(run, "candidates", f"{pid}.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(status, open(os.path.join(run, "candidates", "_status.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(status, ensure_ascii=False))


def load(run):
    items = []
    for pid in SOURCES:
        path = os.path.join(run, "candidates", f"{pid}.json")
        if not os.path.exists(path):
            continue
        for i, c in enumerate(json.load(open(path))):
            c["cid"] = f"{pid.split('-')[0]}{i}"
            c["source"] = pid
            items.append(c)
    return items


def to_events(c):
    occ = c["occurrences"]
    first = occ[0]
    end = first.get("end") or first["start"]
    if end[:10] != first["start"][:10]:
        end = first["start"][:11] + end[11:16] if len(end) >= 16 else first["start"]
    if c.get("cancelled"):
        return []
    avail = "ausgebucht" if c.get("sold_out") else "warteliste" if c.get("waitlist") else "unbekannt"
    text = f"{c.get('title')} {c.get('subtitle') or ''} {c.get('description') or ''}".lower()
    if avail == "unbekannt" and re.search(r"ohne anmeldung|offene[rs]? (treff|café|cafe)|einfach vorbei", text):
        avail = "ohne-anmeldung"
    tags = topics(text)
    if re.search(r"kostenlos|kostenfrei|eintritt frei|gebührenfrei", text) or c.get("cost") in ("0", "kostenlos", "Kostenlos"):
        tags.append("kostenlos")
    if avail == "ohne-anmeldung":
        tags.append("ohne-anmeldung")
    ev = {
        "provider_id": c["source"],
        "provider": c.get("organizer") or c.get("location") or c["source"],
        "title": c["title"],
        "start": first["start"],
        "end": end,
        "location": c.get("location"),
        "address": c.get("address") or (f"{c['lat']},{c['lon']}" if c.get("lat") else None),
        "url": c.get("ticket_url") or c.get("detail_url") or c.get("website"),
        "tags": tags,
        "price": c.get("cost"),
        "availability": avail,
        "description": (c.get("subtitle") or c.get("description") or "")[:300],
        "source_url": c.get("detail_url"),
    }
    if len(occ) > 1:
        ev["series"] = f"{c['cid']}-{slug(c['title'])}"
        ev["rdates"] = [o["start"] for o in occ[1:]]
        ev["series_info"] = f"{len(occ)} Termine im Zeitraum"
    return [{k: v for k, v in ev.items() if v not in (None, "", [])}]


def main():
    cmd, run = sys.argv[1], sys.argv[2]
    if cmd == "fetch":
        fetch(run)
    elif cmd == "list":
        for c in load(run):
            o = c["occurrences"]
            snip = re.sub(r"\s+", " ", (c.get("subtitle") or c.get("description") or ""))[:70]
            print(f"{c['cid']:8} | {o[0]['start']} (+{len(o)-1}) | {c['title'][:55]} | {(c.get('organizer') or '')[:30]} | {snip}")
    elif cmd == "keep":
        keep = set(sys.argv[3].split(",")) if len(sys.argv) > 3 and sys.argv[3] else set()
        events = [e for c in load(run) if c["cid"] in keep for e in to_events(c)]
        status = json.load(open(os.path.join(run, "candidates", "_status.json")))
        os.makedirs(os.path.join(run, "raw"), exist_ok=True)
        json.dump({"events": events, "status": status}, open(os.path.join(run, "raw", "aggregatoren.json"), "w"),
                  ensure_ascii=False, indent=1)
        print(f"{len(events)} Events übernommen")


if __name__ == "__main__":
    main()
