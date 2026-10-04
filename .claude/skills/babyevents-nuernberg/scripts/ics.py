#!/usr/bin/env python3
"""Erzeugt ICS-Dateien aus einer JSON-Liste von Veranstaltungen.

Aufruf:  ics.py events.json OUTDIR
Schreibt OUTDIR/<slug>.ics je Veranstaltung und OUTDIR/alle.ics mit allen zusammen.

Pro Veranstaltung erwartete Felder (siehe SKILL.md, Abschnitt "Event-Schema"):
  id, title, provider, start, end (lokal, ISO "2026-10-06T10:00"), location,
  optional: description, url, rrule (z. B. "FREQ=WEEKLY;COUNT=8"),
            exdates (ausfallende Termine, ISO lokal),
            rdates (weitere Starttermine einer unregelmäßigen Reihe, ISO lokal),
            travel ("U1, 17 Min" o. ä., wird in die Beschreibung übernommen)
Einträge mit gleicher series-ID landen zusammen in <series>.ics.
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

VTIMEZONE = """BEGIN:VTIMEZONE
TZID:Europe/Berlin
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE"""


def esc(text):
    return (
        str(text).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")
    )


def fold(line):
    """RFC 5545: Zeilen auf 75 Oktette falten."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not parts else 74):
            parts.append(cur.decode("utf-8"))
            cur = b""
        cur += b
    parts.append(cur.decode("utf-8"))
    return "\r\n ".join(parts)


def local(dt):
    return datetime.fromisoformat(dt).strftime("%Y%m%dT%H%M%S")


def vevent(ev):
    uid_src = f"{ev.get('id') or ev['title']}|{ev['start']}"
    uid = hashlib.sha1(uid_src.encode()).hexdigest()[:20] + "@babyevents-nuernberg"
    desc = [ev.get("description", "")]
    if ev.get("travel"):
        desc.append(f"Anfahrt: {ev['travel']}")
    if ev.get("availability"):
        desc.append(f"Plätze: {ev['availability']}")
    if ev.get("price"):
        desc.append(f"Kosten: {ev['price']}")
    if ev.get("url"):
        desc.append(f"Info/Anmeldung: {ev['url']}")
    lines = [
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART;TZID=Europe/Berlin:{local(ev['start'])}",
        f"DTEND;TZID=Europe/Berlin:{local(ev['end'])}",
        f"SUMMARY:{esc(ev['title'] + ' (' + ev['provider'] + ')')}",
        f"LOCATION:{esc(ev.get('location', ''))}",
        f"DESCRIPTION:{esc(chr(10).join(d for d in desc if d))}",
    ]
    if ev.get("url"):
        lines.append(f"URL:{ev['url']}")
    if ev.get("rrule"):
        lines.append(f"RRULE:{ev['rrule']}")
    if ev.get("exdates"):
        lines.append("EXDATE;TZID=Europe/Berlin:" + ",".join(local(d) for d in ev["exdates"]))
    if ev.get("rdates"):
        lines.append("RDATE;TZID=Europe/Berlin:" + ",".join(local(d) for d in ev["rdates"]))
    lines.append("END:VEVENT")
    return lines


def calendar(events):
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//babyevents-nuernberg//DE", "CALSCALE:GREGORIAN"]
    lines += VTIMEZONE.split("\n")
    for ev in events:
        lines += vevent(ev)
    lines.append("END:VCALENDAR")
    return "\r\n".join(fold(l) for l in lines) + "\r\n"


def slug(text):
    s = text.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]


def main():
    events = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    groups = {}
    for ev in events:
        key = ev.get("series") or f"{ev['start'][:10]}-{ev.get('id') or ev['title']}"
        groups.setdefault(key, []).append(ev)
    written, used = {}, set()
    for key, evs in groups.items():
        base = slug(key)
        name, n = base + ".ics", 2
        while name in used:  # gekürzte Slugs können kollidieren
            name, n = f"{base}-{n}.ics", n + 1
        used.add(name)
        with open(os.path.join(out, name), "w", newline="") as f:
            f.write(calendar(evs))
        for ev in evs:
            written[ev.get("id") or ev["title"]] = name
    with open(os.path.join(out, "alle.ics"), "w", newline="") as f:
        f.write(calendar(events))
    json.dump(written, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
