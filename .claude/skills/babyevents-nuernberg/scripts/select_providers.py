#!/usr/bin/env python3
"""Wählt Anbieter aus providers.yaml nach Schlagwörtern aus und teilt sie in Pakete.

Aufruf:
  select_providers.py [--topics musik,pekip] [--cost kostenlos] [--registration ohne-anmeldung]
                      [--format offener-treff] [--ring innen,knapp-aussen] [--age-months 7]
                      [--batch 5] [--list-tags]
Mehrere Werte innerhalb eines Filters sind ODER-verknüpft, verschiedene Filter UND-verknüpft.
Ausgabe: JSON {"scripts": [...], "batches": [[provider, ...], ...], "covered": [...], "count": n}
  scripts – Aggregatoren mit fetch-Skript (vom Hauptagenten auszuführen)
  batches – Anbieter + Aggregatoren ohne Skript, paketiert für Subagenten
  covered – Anbieter, deren Termine über einen Aggregator kommen (kein eigener Abruf)
role "verzeichnis" wird nie ausgegeben (nur für die Pflege).
"""
import argparse
import json
import os
import re
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
PROVIDERS = os.path.join(HERE, "..", "..", "..", "..", "data", "providers.yaml")


def age_ok(spec, months):
    """spec wie "0-3" (Jahre), "6m-3", "0-12m", "4 Mon-3 J"; Obergrenze > 6 ohne Einheit = Monate."""
    if months is None or not spec:
        return True
    norm = re.sub(r"\s*mon(ate)?\.?", "m", str(spec).lower()).replace(" j", "").replace("jahre", "").replace(" ", "")
    m = re.match(r"([\d.,]+m?)[-–]([\d.,]+m?)", norm)
    if not m:
        return True
    lo, hi = m.group(1), m.group(2)
    if not hi.endswith("m") and float(hi.replace(",", ".")) > 6:
        hi += "m"
        lo = lo if lo.endswith("m") else lo + "m"

    def to_m(x):
        return float(x[:-1].replace(",", ".")) if x.endswith("m") else float(x.replace(",", ".")) * 12
    return to_m(lo) <= months <= to_m(hi)


def main():
    p = argparse.ArgumentParser()
    for f in ("topics", "cost", "registration", "format", "ring"):
        p.add_argument(f"--{f}")
    p.add_argument("--age-months", type=float)
    p.add_argument("--batch", type=int, default=5)
    p.add_argument("--list-tags", action="store_true")
    p.add_argument("--out", help="RUN_DIR: schreibt dort batch-<n>.yaml je Paket und selection.json")
    a = p.parse_args()

    providers = yaml.safe_load(open(PROVIDERS))
    if a.list_tags:
        tags = {}
        for pr in providers:
            for f in ("topics", "format", "cost", "registration"):
                for t in pr.get(f) or []:
                    tags.setdefault(f, {}).setdefault(t, 0)
                    tags[f][t] += 1
        json.dump(tags, sys.stdout, ensure_ascii=False, indent=1)
        return

    sel, scripts, covered = [], [], []
    for pr in providers:
        if pr.get("role") == "verzeichnis":
            continue
        if pr.get("role") == "aggregator":
            (scripts if pr.get("fetch") else sel).append(pr)
            continue
        ok = True
        for f in ("topics", "cost", "registration", "format"):
            want = getattr(a, f)
            if want and not set(want.split(",")) & set(pr.get(f) or []):
                ok = False
        if a.ring:
            rings = {pr.get("ring")} | {v.get("ring") for v in pr.get("venues") or []}
            if not set(a.ring.split(",")) & rings:
                ok = False
        if not age_ok(pr.get("age"), a.age_months):
            ok = False
        if ok:
            (covered if pr.get("covered_by") else sel).append(pr)
    batches = [sel[i : i + a.batch] for i in range(0, len(sel), a.batch)]
    result = {"count": len(sel), "scripts": [{"id": x["id"], "fetch": x["fetch"]} for x in scripts],
              "covered": [{"id": x["id"], "covered_by": x["covered_by"]} for x in covered],
              "batches": batches}
    if a.out:
        os.makedirs(a.out, exist_ok=True)
        for i, b in enumerate(batches, 1):
            with open(os.path.join(a.out, f"batch-{i}.yaml"), "w") as fh:
                yaml.safe_dump(b, fh, allow_unicode=True, sort_keys=False, width=120)
        json.dump(result, open(os.path.join(a.out, "selection.json"), "w"), ensure_ascii=False, indent=1, default=str)
        result = {"count": len(sel), "batch_files": [f"batch-{i}.yaml" for i in range(1, len(batches) + 1)],
                  "scripts": result["scripts"], "covered": result["covered"]}
    json.dump(result, sys.stdout, ensure_ascii=False, indent=1, default=str)
    print()


if __name__ == "__main__":
    main()
