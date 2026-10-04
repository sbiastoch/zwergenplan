#!/usr/bin/env python3
"""Erzeugt eine lesbare Anbieterübersicht (Markdown) aus providers.yaml.

Aufruf:  providers_md.py [ZIEL.md]   (Standard: ANBIETER.md im aktuellen Verzeichnis)
"""
import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
RING = {"innen": "Innerhalb des Rings", "knapp-aussen": "Knapp außerhalb (≤ 700 m)", "aussen": "Übriges Stadtgebiet"}
AVAIL = {"ja": "✅", "teilweise": "◐", "nein": "–", "unbekannt": "?"}


def row(p):
    links = " · ".join(f"[{i + 1}]({x['url']})" for i, x in enumerate(p.get("programme") or []))
    meta = ", ".join((p.get("cost") or []) + (p.get("registration") or []) + (p.get("format") or []))
    plaetze = AVAIL.get(str((p.get("availability") or {}).get("shown", "unbekannt")), "?")
    via = f" (Termine via {p['covered_by']})" if p.get("covered_by") else ""
    addr = (p.get("address") or "").replace("|", "/")
    return (f"| **{p['name']}**{via}<br><small>{addr}</small> | {p.get('age', '')} | "
            f"{', '.join(p.get('topics') or [])} | {meta} | {plaetze} | {links} |")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "ANBIETER.md"
    P = yaml.safe_load(open(os.path.join(HERE, "..", "..", "..", "..", "data", "providers.yaml")))
    head = "| Anbieter | Alter | Themen | Kosten · Anmeldung · Format | Plätze online | Programm |\n|---|---|---|---|---|---|"
    lines = ["# Babyangebote Nürnberg – Anbieterverzeichnis", "",
             "Automatisch erzeugt aus `data/providers.yaml` "
             "(`scripts/providers_md.py`). Plätze online: ✅ ja · ◐ teilweise · – nein.", ""]
    for ring, title in RING.items():
        group = [p for p in P if p["role"] == "anbieter" and p.get("ring") == ring]
        lines += [f"## {title} ({len(group)})", "", head] + [row(p) for p in group] + [""]
    rest = [p for p in P if p["role"] == "anbieter" and p.get("ring") not in RING]
    if rest:
        lines += [f"## Ohne festen Ort ({len(rest)})", "", head] + [row(p) for p in rest] + [""]
    for role, title in (("aggregator", "Sammelkalender (Zusatzquellen)"), ("verzeichnis", "Verzeichnisse (nur zur Pflege)")):
        group = [p for p in P if p["role"] == role]
        lines += [f"## {title}", ""]
        for p in group:
            links = " · ".join(f"[{i + 1}]({x['url']})" for i, x in enumerate(p.get("programme") or []))
            fetch = f" – abgefragt per `{p['fetch']}`" if p.get("fetch") else ""
            lines.append(f"- **{p['name']}**{fetch}: {links}")
        lines.append("")
    open(out, "w").write("\n".join(lines))
    print(out, len(P))


if __name__ == "__main__":
    main()
