#!/usr/bin/env python3
"""Veranstaltungskalender der Stadt Nürnberg (vk.nuernberg.de, JSON-API ajax_vk.pl).

Dieselbe Datenbank speist kuf-kultur.de (Kulturläden), Stadtbibliothek, viele Museen und
Theater. Die Abfrage läuft stichwortweise; Treffer werden auf Baby-/Kleinkindbezug gefiltert.

Aufruf:
  stadt_vk.py FROM TO                      # Standard-Stichwörter, gefiltert
  stadt_vk.py FROM TO --query "(ortID == 13)" [--username KundF] [--no-filter]
  stadt_vk.py FROM TO --keywords Baby,Krabbel
Ausgabe: JSON-Liste von Kandidaten, ein Objekt je Veranstaltung mit allen Terminen im Zeitraum.
SUCHTEXT darf nur EIN Wort sein – mit Leerzeichen ignoriert die API den Filter stillschweigend.
Die Kandidaten sind Rohmaterial: Relevanz (wirklich 0–3 mit Eltern?) prüft der Agent.
"""
import argparse
import ast
import json
import re
import sys

import requests

API = "https://www.nuernberg.de/cgi-bin/ajax_vk.pl"
FIELDS = "TITEL,UNTERTITEL,BESCHREIBUNG,DATUM,ALLETERMINE,ORT,VVKLINK,ABGESAGT,AUSVERKAUFT,VERANSTALTERNAME,ANMELDUNG"
KEYWORDS = ["Baby", "Babys", "Krabbel", "Krabbelgruppe", "Kleinkind", "Kleinkinder", "Eltern-Kind", "Kinderwagen",
            "Stillcafé", "Stilltreff", "PEKiP", "Bücherzwerge", "Krabbelkonzert", "Allerkleinsten", "Minis",
            "Familiencafé", "Elterncafé", "Spielgruppe", "Bilderbuchkino", "Fingerspiele"]
RELEVANT = re.compile(
    r"bab(y|ies)|krabbel|kleinkind|eltern[- ]kind|kinderwagen|still(caf|treff|gruppe)|pekip|zwerge|"
    r"allerkleinsten|ab\s*(0|1|2)\s*(jahr|j\.|\+)|ab\s*\d+\s*monat|0\s*[-–bis]+\s*3|u3|"
    r"mutter[- ]kind|vater[- ]kind|papa[- ]kind|miniclub|musikzwerge|säugling|fenkid|babymassage|rückbildung|"
    r"fingerspiel|wiegenl|mini[- ]?(club|gruppe|konzert)|familiencaf|elterncaf|spielgruppe",
    re.I,
)


def parse(x):
    if isinstance(x, (dict, list)) or x in (None, ""):
        return x
    try:
        return ast.literal_eval(x)
    except (ValueError, SyntaxError):
        return x


def fetch(params):
    base = {"START_DATUM": params.pop("from"), "ENDE_DATUM": params.pop("to"), "ALLETERMINE": 1, "MAX_LIMIT": 500, "ORDER": "DATUM", "AUSGABEFELDER": FIELDS}
    base.update(params)
    r = requests.get(API, params=base, timeout=60)  # API antwortet teils erst nach ~30 s
    r.raise_for_status()
    r.encoding = "utf-8"  # API liefert UTF-8 ohne charset-Header
    return r.json().get("VERANSTALTUNGEN") or []


def normalize(v, frm, to):
    dates = parse(v.get("ALLETERMINE")) or {}
    occ = []
    for start, info in (dates.items() if isinstance(dates, dict) else []):
        if frm <= start[:10] <= to:
            end = (info or {}).get("E", "")[:16].replace(" ", "T") or None
            occ.append({"start": start[:16], "end": end})
    if not occ:
        return None
    return {
        "vk_id": v.get("VERANSTALTUNGID"),
        "title": v.get("TITEL"),
        "subtitle": v.get("UNTERTITEL"),
        "description": (v.get("BESCHREIBUNG") or "")[:600],
        "organizer": v.get("VERANSTALTERNAME"),
        "location": v.get("ORTSNAMEKOMPLETT") or v.get("ORT"),
        "address": f"{v.get('ORTSSTRASSENR', '')}, {v.get('ORTSPLZ', '')} {v.get('ORTSORT', '')}".strip(", "),
        "lat": v.get("ORTSLAT"), "lon": v.get("ORTSLNG"),
        "ticket_url": v.get("VVKLINK") or None,
        "detail_url": f"https://www.nuernberg.de/internet/stadtportal/veranstaltung.html?vid={v.get('VERANSTALTUNGID')}",
        "cancelled": bool(v.get("ABGESAGT")), "sold_out": bool(v.get("AUSVERKAUFT")),
        "registration": bool(v.get("ANMELDUNG")),
        "occurrences": occ,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("frm")
    p.add_argument("to")
    p.add_argument("--query", help="ABFRAGE-Ausdruck, z. B. '(ortID == 13)' oder '(veranstalterID == 412)'")
    p.add_argument("--username", help="z. B. KundF für KUF-Tags wie privatetag")
    p.add_argument("--keywords", help="Komma-Liste statt der Standard-Stichwörter")
    p.add_argument("--no-filter", action="store_true", help="Relevanzfilter abschalten")
    a = p.parse_args()

    raw = {}
    queries = []
    if a.query:
        q = {"ABFRAGE": a.query}
        if a.username:
            q["USERNAME"] = a.username
        queries.append(q)
    else:
        for kw in (a.keywords.split(",") if a.keywords else KEYWORDS):
            queries.append({"SUCHTEXT": kw})
    for q in queries:
        try:
            for v in fetch({"from": a.frm, "to": a.to, **q}):
                raw[v["VERANSTALTUNGID"]] = v
        except requests.RequestException as e:
            print(f"Warnung: {q}: {e}", file=sys.stderr)

    out = []
    for v in raw.values():
        text = " ".join(str(v.get(k) or "") for k in ("TITEL", "UNTERTITEL", "BESCHREIBUNG"))
        if not a.no_filter and not RELEVANT.search(text):
            continue
        n = normalize(v, a.frm, a.to)
        if n:
            out.append(n)
    out.sort(key=lambda e: e["occurrences"][0]["start"])
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    print()


if __name__ == "__main__":
    main()
