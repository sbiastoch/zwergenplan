#!/usr/bin/env python3
"""Baut aus den angereicherten Events den Bericht (Markdown + HTML).

Aufruf:  report.py RUN_DIR
Liest    RUN_DIR/events.json   (Events inkl. "route" und "ics", siehe SKILL.md)
         RUN_DIR/status.json   (je Anbieter: ok | keine-termine | fehler + Grund)
         RUN_DIR/meta.json     ({"from", "to", "address", "filters" (Text), "require_tags": [...], "max_minutes": n})
Schreibt RUN_DIR/bericht.md und RUN_DIR/bericht.html (ICS-Links relativ zu RUN_DIR/ics/).
"""
import html
import json
import os
import sys
from datetime import datetime

WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
AVAIL = {"frei": "🟢 frei", "wenige": "🟡 wenige Plätze", "ausgebucht": "🔴 ausgebucht",
         "warteliste": "🟠 Warteliste", "ohne-anmeldung": "⚪ ohne Anmeldung", "unbekannt": "❔ unbekannt"}


def when(ev):
    s, e = datetime.fromisoformat(ev["start"]), datetime.fromisoformat(ev["end"])
    txt = f"{WD[s.weekday()]} {s:%d.%m.} {s:%H:%M}–{e:%H:%M}"
    if ev.get("series_info"):
        txt += f" ({ev['series_info']})"
    return txt


def travel(ev):
    r = ev.get("route") or {}
    parts = []
    if r.get("walk"):
        parts.append(f"🚶 {r['walk']['minutes']} Min ({r['walk']['km']} km)")
    t = r.get("transit") or {}
    if t.get("minutes") is not None:
        parts.append(f"🚊 {t['minutes']} Min ({', '.join(t['lines']) or 'Fußweg'}; ab {t['depart']})")
    return " · ".join(parts) or "–"


def main():
    run = sys.argv[1]
    events = json.load(open(os.path.join(run, "events.json")))
    status = json.load(open(os.path.join(run, "status.json")))
    meta = json.load(open(os.path.join(run, "meta.json")))
    events.sort(key=lambda e: e["start"])
    # Termin-Filter aus meta.json: require_tags (alle nötig), max_minutes (min. aus Fußweg/ÖPNV)
    req = set(meta.get("require_tags") or [])
    hidden = 0
    if req or meta.get("max_minutes"):
        keep = []
        for ev in events:
            r = ev.get("route") or {}
            mins = [x["minutes"] for x in (r.get("walk"), r.get("transit")) if x and x.get("minutes") is not None]
            too_far = meta.get("max_minutes") and mins and min(mins) > meta["max_minutes"]
            if req <= set(ev.get("tags") or []) and not too_far:
                keep.append(ev)
        hidden = len(events) - len(keep)
        events = keep

    md = [f"# Baby- & Kleinkindangebote Nürnberg {meta['from']} – {meta['to']}",
          f"Start: {meta['address']} · Filter: {meta.get('filters') or 'keine'} · "
          f"{len(events)} Termine von {sum(1 for s in status.values() if s['status']=='ok')} geprüften Quellen"
          + (f" ({hidden} durch Filter ausgeblendet)" if hidden else ""), ""]
    md += ["| Wann | Was | Anbieter | Tags | Plätze | Kosten | Weg | ICS |", "|---|---|---|---|---|---|---|---|"]
    rows = []
    for ev in events:
        av = AVAIL.get(ev.get("availability", "unbekannt"), ev.get("availability"))
        tags = ", ".join(ev.get("tags") or [])
        ics = f"[ics](ics/{ev['ics']})" if ev.get("ics") else ""
        title = f"[{ev['title']}]({ev['url']})" if ev.get("url") else ev["title"]
        md.append(f"| {when(ev)} | {title} | {ev['provider']} | {tags} | {av} | {ev.get('price','')} | {travel(ev)} | {ics} |")
        rows.append((ev, av, tags))
    problems = {k: v for k, v in status.items() if v["status"] == "fehler"}
    if problems:
        md += ["", "## Nicht prüfbar", ""] + [f"- **{k}**: {v.get('reason','')}" for k, v in problems.items()]
    empty = [k for k, v in status.items() if v["status"] == "keine-termine"]
    if empty:
        md += ["", f"**Ohne passende Termine:** {', '.join(empty)}"]
    md += ["", "Alle Termine in einer Datei: [alle.ics](ics/alle.ics)"]
    open(os.path.join(run, "bericht.md"), "w").write("\n".join(md) + "\n")

    e = html.escape
    trs = "\n".join(
        f"<tr data-tags='{e(t)}'><td>{e(when(ev))}</td><td>"
        + (f"<a href='{e(ev['url'])}'>{e(ev['title'])}</a>" if ev.get("url") else e(ev["title"]))
        + f"<div class=sub>{e(ev.get('location',''))}</div></td><td>{e(ev['provider'])}</td><td>{e(t)}</td>"
        f"<td>{e(av)}</td><td>{e(ev.get('price',''))}</td><td>{e(travel(ev))}</td>"
        f"<td>{'<a href=ics/' + e(ev['ics']) + '>📅</a>' if ev.get('ics') else ''}</td></tr>"
        for ev, av, t in rows
    )
    probs = "".join(f"<li><b>{e(k)}</b>: {e(v.get('reason',''))}</li>" for k, v in problems.items())
    page = f"""<!doctype html><html lang=de><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Babyangebote Nürnberg</title><style>
:root{{--bg:#fff;--fg:#1d1d1f;--mut:#6b6b70;--line:#e3e3e6;--acc:#2b6cb0}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151517;--fg:#ececef;--mut:#9a9aa1;--line:#2c2c30;--acc:#7fb2ff}}}}
body{{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0;padding:16px;max-width:1200px;margin:auto}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}}
.sub,.meta{{color:var(--mut);font-size:13px}}a{{color:var(--acc)}}input{{padding:6px;width:100%;max-width:360px;margin:8px 0}}
@media (max-width:700px){{td:nth-child(4),th:nth-child(4){{display:none}}}}</style>
<h1>Babyangebote Nürnberg {e(meta['from'])} – {e(meta['to'])}</h1>
<p class=meta>Start: {e(meta['address'])} · Filter: {e(str(meta.get('filters') or 'keine'))} · {len(events)} Termine · <a href=ics/alle.ics>alle.ics</a></p>
<input placeholder="Filtern (z. B. kostenlos, musik, Gostenhof)" oninput="for(const r of document.querySelectorAll('tbody tr'))r.hidden=!r.textContent.toLowerCase().includes(this.value.toLowerCase())">
<table><thead><tr><th>Wann</th><th>Was</th><th>Anbieter</th><th>Tags</th><th>Plätze</th><th>Kosten</th><th>Weg</th><th>ICS</th></tr></thead><tbody>
{trs}</tbody></table>{'<h2>Nicht prüfbar</h2><ul>' + probs + '</ul>' if probs else ''}</html>"""
    open(os.path.join(run, "bericht.html"), "w").write(page)
    print(os.path.join(run, "bericht.md"))


if __name__ == "__main__":
    main()
