#!/usr/bin/env python3
"""Map current 16 skill categories onto 6 verticals.

Reads /api/skills/search?page_size=200 from the Recipes API, collects the
distinct `category` values, and prints a JSON mapping `{category: vertical}`
plus a stdout decision log so a human can review before the SQL backfill.

Hard rules (per Plan v5.4 / A.5):
  - Print mapping decisions to stdout.
  - DO NOT call the prod DB — read-only HTTP against the public API.
  - Output the JSON mapping to stdout (and optionally to a file via --out).

Verticals: marketing | code | web-scraping | ops | sales | sim-robotics

Usage:
    python scripts/map_skills_to_verticals.py
    python scripts/map_skills_to_verticals.py --base https://recipes.wisechef.ai
    python scripts/map_skills_to_verticals.py --out mapping.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from urllib.request import Request, urlopen

VERTICALS = ("marketing", "code", "web-scraping", "ops", "sales", "sim-robotics")

# Heuristic mapping. Categories not matched fall back to "ops".
# Each tuple: (vertical, list of substrings that map to it).
RULES: list[tuple[str, list[str]]] = [
    ("marketing",   ["market", "report", "seo", "content", "social", "ads",
                     "campaign", "calendar", "analytics", "client"]),
    ("code",        ["code", "dev", "engineer", "review", "refactor",
                     "test", "ci", "build", "lint"]),
    ("web-scraping",["scrap", "crawl", "extract", "harvest", "spider"]),
    ("sales",       ["sales", "outreach", "crm", "lead", "proposal",
                     "deal", "pipeline"]),
    ("sim-robotics",["sim", "simulation", "robot", "ros", "isaac",
                     "gazebo", "drone", "control"]),
    ("ops",         ["ops", "operation", "onboarding", "invoice",
                     "standup", "admin", "infra", "deploy", "monitor"]),
]


def classify(category: str) -> str:
    cat = (category or "").lower().strip()
    if not cat:
        return "ops"
    for vertical, needles in RULES:
        for n in needles:
            if n in cat:
                return vertical
    return "ops"


def fetch_categories(base: str, api_key: str | None) -> list[str]:
    url = f"{base.rstrip('/')}/api/skills/search?page_size=200"
    req = Request(url)
    if api_key:
        req.add_header("x-api-key", api_key)
    print(f"[fetch] GET {url}", file=sys.stderr)
    with urlopen(req, timeout=20) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    results = body.get("results") or body.get("data") or []
    cats = sorted({(s.get("category") or "").strip() for s in results if s.get("category")})
    return [c for c in cats if c]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", default="https://app.loopskill.io",
                    help="LoopSkill API base URL")
    ap.add_argument("--api-key", default=os.environ.get("LOOPSKILL_API_KEY") or os.environ.get("RECIPES_API_KEY"),
                    help="x-api-key header value (env: LOOPSKILL_API_KEY, falls back to RECIPES_API_KEY)")
    ap.add_argument("--out", default=None,
                    help="Optional path to write JSON mapping; default: stdout only")
    args = ap.parse_args()

    try:
        categories = fetch_categories(args.base, args.api_key)
    except Exception as e:
        print(f"[error] could not fetch categories: {e}", file=sys.stderr)
        return 1

    if not categories:
        print("[warn] API returned no categories", file=sys.stderr)

    mapping: dict[str, str] = {}
    print(f"\n# Mapping {len(categories)} categories to {len(VERTICALS)} verticals\n")
    for cat in categories:
        v = classify(cat)
        mapping[cat] = v
        print(f"  {cat:<32} -> {v}")

    payload = json.dumps(mapping, indent=2, sort_keys=True)
    print("\n# JSON mapping\n")
    print(payload)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(payload + "\n")
        print(f"\n[ok] wrote {args.out}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
