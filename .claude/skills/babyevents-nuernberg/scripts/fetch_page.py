#!/usr/bin/env python3
"""Holt eine Programmseite und gibt lesbaren Text plus strukturierte Hinweise aus.

Aufruf:  fetch_page.py URL [--max-chars 60000] [--links]
Ausgabe (stdout):
  ## META       Statuscode, finale URL, Hinweis falls Seite vermutlich JS-gerendert ist
  ## JSON-LD    schema.org-Events (Name, Start, Ende, Ort, Verfügbarkeit), falls vorhanden
  ## FEEDS      gefundene iCal-/RSS-Links
  ## TEXT       sichtbarer Text (Skripte/Navigation entfernt)
  ## LINKS      (mit --links) Linktext -> URL, für Detailseiten / Paginierung

Ist die Seite JS-gerendert (wenig Text, viele Skripte), meldet META das; dann den
Browser (claude-in-chrome) oder die im Anbieterverzeichnis vermerkte API nutzen.
"""
import argparse
import json
import re
import sys
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36"


def parse_ical(text):
    """Minimaler VEVENT-Parser (entfaltet Zeilen; Parameter wie TZID bleiben im Schlüssel sichtbar)."""
    lines = re.sub(r"\r?\n[ \t]", "", text).splitlines()
    events, cur = [], None
    for ln in lines:
        if ln == "BEGIN:VEVENT":
            cur = {}
        elif ln == "END:VEVENT" and cur is not None:
            events.append(cur)
            cur = None
        elif cur is not None and ":" in ln:
            k, v = ln.split(":", 1)
            name = k.split(";")[0]
            if name in ("SUMMARY", "DTSTART", "DTEND", "RRULE", "LOCATION", "URL", "DESCRIPTION", "EXDATE", "STATUS"):
                v = v.replace("\\n", " ").replace("\\,", ",").replace("\\;", ";")
                cur[name] = v[:300] if name == "DESCRIPTION" else v
    return events


def events_from_jsonld(soup):
    found = []

    def walk(node):
        if isinstance(node, list):
            for n in node:
                walk(n)
        elif isinstance(node, dict):
            t = node.get("@type")
            types = t if isinstance(t, list) else [t]
            if any(x and "Event" in x and x != "CourseInstance" for x in types):
                loc = node.get("location") or {}
                if isinstance(loc, list):
                    loc = loc[0] if loc else {}
                addr = loc.get("address") if isinstance(loc, dict) else None
                if isinstance(addr, dict):
                    addr = " ".join(str(addr.get(k, "")) for k in ("streetAddress", "postalCode", "addressLocality"))
                offers = node.get("offers") or {}
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                found.append({
                    "name": node.get("name"),
                    "start": node.get("startDate"),
                    "end": node.get("endDate"),
                    "location": (loc.get("name") if isinstance(loc, dict) else loc),
                    "address": addr,
                    "availability": offers.get("availability") if isinstance(offers, dict) else None,
                    "price": offers.get("price") if isinstance(offers, dict) else None,
                    "url": node.get("url"),
                })
            if any(x and x == "Course" for x in types):
                for inst in node.get("hasCourseInstance") or []:
                    offers = inst.get("offers") or {}
                    if isinstance(offers, list):
                        offers = offers[0] if offers else {}
                    found.append({
                        "name": inst.get("name") or node.get("name"),
                        "start": inst.get("startDate"), "end": inst.get("endDate"),
                        "location": (inst.get("location") or {}).get("name") if isinstance(inst.get("location"), dict) else inst.get("location"),
                        "availability": offers.get("availability"), "price": offers.get("price"),
                        "url": inst.get("url") or node.get("url"),
                    })
            for v in node.values():
                walk(v)

    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            walk(json.loads(tag.string or ""))
        except ValueError:
            pass
    return found


def main():
    p = argparse.ArgumentParser()
    p.add_argument("url")
    p.add_argument("--max-chars", type=int, default=60000)
    p.add_argument("--links", action="store_true")
    a = p.parse_args()

    try:
        r = requests.get(a.url, headers={"User-Agent": UA, "Accept-Language": "de-DE,de"}, timeout=30)
    except requests.RequestException as e:
        print(f"## META\nFEHLER: {type(e).__name__}: {e}")
        sys.exit(1)
    ctype = r.headers.get("content-type", "")
    print(f"## META\nstatus={r.status_code} final_url={r.url} content_type={ctype}")
    if "pdf" in ctype:
        print("PDF – mit dem Read-Tool bzw. pdftotext auswerten.")
        return
    if "calendar" in ctype or r.text.lstrip().startswith("BEGIN:VCALENDAR"):
        print("## ICAL (VEVENTs: SUMMARY, DTSTART, DTEND, RRULE, LOCATION, URL, DESCRIPTION gekürzt)")
        print(json.dumps(parse_ical(r.text), ensure_ascii=False, indent=1)[: a.max_chars])
        return

    if "charset" not in ctype.lower():
        r.encoding = r.apparent_encoding
    soup = BeautifulSoup(r.text, "html.parser")
    events = events_from_jsonld(soup)
    feeds = sorted({
        urljoin(r.url, x["href"]) for x in soup.find_all("a", href=True)
        if re.search(r"(\.ics\b|\bical\b|[./?&]ical|webcal:|/feed\b|\.rss\b)", x["href"], re.I)
    } | {
        urljoin(r.url, x["href"]) for x in soup.find_all("link", href=True)
        if "rss" in (x.get("type") or "") or "calendar" in (x.get("type") or "")
    })
    # Status-Ampeln u. ä. stehen oft nur in title/alt/aria-label/class (z. B. FBS: <span class="ampel red" title="…">)
    for t in (soup.body or soup).find_all(["span", "i", "abbr", "div", "img", "em"]):
        if t.get_text(strip=True):
            continue
        cls = " ".join(t.get("class") or [])
        label = t.get("title") or t.get("aria-label") or t.get("alt")
        status_cls = re.search(r"ampel|status|avail|frei|belegt|ausgebucht|booked|(?<![-\w])full(?![-\w])|traffic", cls, re.I)
        if status_cls or (label and t.name in ("span", "i", "abbr")):
            t.append(f" [Status: {label or ''} {cls}] ".replace("  ", " "))
    n_scripts = len(soup.find_all("script"))
    for t in soup(["script", "style", "noscript", "svg", "header", "footer", "nav", "form"]):
        t.decompose()
    text = re.sub(r"\n\s*\n+", "\n\n", soup.get_text("\n", strip=True))
    if len(text) < 1500 and n_scripts > 5:
        print("HINWEIS: wenig Text bei vielen Skripten – Seite ist vermutlich JS-gerendert.")
    if events:
        print("## JSON-LD")
        print(json.dumps(events, ensure_ascii=False, indent=1))
    if feeds:
        print("## FEEDS\n" + "\n".join(feeds))
    print("## TEXT\n" + text[: a.max_chars])
    if len(text) > a.max_chars:
        print(f"\n[... gekürzt, {len(text)} Zeichen gesamt]")
    if a.links:
        print("## LINKS")
        seen = set()
        for x in BeautifulSoup(r.text, "html.parser").find_all(True):
            label = x.get_text(" ", strip=True)[:80] or x.get("title") or x.get("aria-label") or ""
            cands = [x.get("href"), x.get("data-href"), x.get("data-url")]
            m = re.search(r"""(?:window\.open|location(?:\.href)?\s*=)\s*\(?\s*['"]([^'"]+)""", x.get("onclick") or "")
            if m:
                cands.append(m.group(1))
            for c in filter(None, cands):
                u = urljoin(r.url, c)
                if u not in seen and label and u.startswith("http"):
                    seen.add(u)
                    print(f"{label} -> {u}")


if __name__ == "__main__":
    main()
