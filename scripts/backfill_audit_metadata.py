#!/usr/bin/env python3
"""
backfill_audit_metadata.py — populate audit metadata (source_url, sha256,
last_reviewed_at) for every skill currently published on recipes.wisechef.ai.

Workflow:
  1. GET  /api/skills/search?page_size=100  (paginate until exhausted)
  2. For each skill:
       a. GET /api/skills/install?slug=<slug>  → manifest with tarball_url
       b. download tarball, compute sha256 (or trust manifest.checksum_sha256)
       c. PATCH /api/skills/{slug}/audit with {source_url, sha256, last_reviewed_at}
  3. Print a one-line report per skill: ok / skipped / failed.

The PATCH endpoint may not exist yet on recipes-api. If it returns 404, this
script logs a TODO and moves on without aborting — the audit row component
gracefully renders "—" for missing fields.

Usage:
  RECIPES_ADMIN_KEY=… python scripts/backfill_audit_metadata.py [--dry-run] [--limit N]

Stdlib only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_BASE = os.environ.get("RECIPES_API_BASE", "https://recipes.wisechef.ai/api")
ADMIN_KEY = os.environ.get("RECIPES_ADMIN_KEY", "")
USER_AGENT = "recipes-backfill/1.0 (+https://recipes.wisechef.ai)"


def http_get(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url)
    req.add_header("User-Agent", USER_AGENT)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def http_download(url: str) -> bytes:
    req = urllib.request.Request(url)
    req.add_header("User-Agent", USER_AGENT)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read()


def http_patch(url: str, body: dict, headers: dict | None = None) -> tuple[int, dict | None]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PATCH")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", USER_AGENT)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.getcode(), json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(body_text)
        except json.JSONDecodeError:
            return e.code, {"_raw": body_text}


def list_all_skills(page_size: int = 100, limit: int | None = None) -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        url = f"{API_BASE}/skills/search?page_size={page_size}&page={page}"
        data = http_get(url)
        results = data.get("results") or data.get("skills") or []
        out.extend(results)
        if not results or len(out) >= (limit or float("inf")):
            break
        if len(results) < page_size:
            break
        page += 1
        time.sleep(0.2)
    if limit:
        out = out[:limit]
    return out


def fetch_manifest(slug: str) -> dict:
    return http_get(f"{API_BASE}/skills/install?slug={urllib.parse.quote(slug)}")


def compute_sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def patch_audit(slug: str, payload: dict, dry_run: bool) -> tuple[bool, str]:
    if dry_run:
        return True, f"dry-run (would PATCH {slug}): {json.dumps(payload)}"
    if not ADMIN_KEY:
        return False, "RECIPES_ADMIN_KEY not set"
    url = f"{API_BASE}/skills/{urllib.parse.quote(slug)}/audit"
    code, body = http_patch(url, payload, headers={"x-api-key": ADMIN_KEY})
    if code == 404:
        return False, "PATCH endpoint not deployed yet (TODO: add to recipes-api)"
    if 200 <= code < 300:
        return True, f"ok ({code})"
    return False, f"http {code}: {body}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Don't PATCH, just print")
    parser.add_argument("--limit", type=int, default=None, help="Cap how many skills to process")
    parser.add_argument("--verify-tarball", action="store_true",
                        help="Re-download each tarball and recompute sha256 (slow but authoritative)")
    args = parser.parse_args()

    if not args.dry_run and not ADMIN_KEY:
        print("WARNING: RECIPES_ADMIN_KEY not set. PATCH calls will fail.", file=sys.stderr)

    print(f"Fetching skill list from {API_BASE} ...")
    skills = list_all_skills(limit=args.limit)
    print(f"  → {len(skills)} skills")

    ok = skipped = failed = 0
    for i, s in enumerate(skills, 1):
        slug = s.get("slug")
        if not slug:
            skipped += 1
            continue

        try:
            manifest = fetch_manifest(slug)
        except Exception as e:
            print(f"  [{i:3d}/{len(skills)}] {slug:<30} skipped: manifest fetch failed ({e})")
            skipped += 1
            continue

        sha = manifest.get("checksum_sha256") or manifest.get("sha256")
        if args.verify_tarball and manifest.get("tarball_url"):
            try:
                blob = http_download(manifest["tarball_url"])
                sha = compute_sha256(blob)
            except Exception as e:
                print(f"  [{i:3d}/{len(skills)}] {slug:<30} skipped: tarball fetch failed ({e})")
                skipped += 1
                continue

        payload = {
            "source_url": manifest.get("source_url") or s.get("repo_url") or s.get("source_url"),
            "sha256": sha,
            "last_reviewed_at": datetime.now(timezone.utc).isoformat(),
        }

        success, msg = patch_audit(slug, payload, args.dry_run)
        status = "ok" if success else "FAIL"
        print(f"  [{i:3d}/{len(skills)}] {slug:<30} {status}: {msg}")
        if success:
            ok += 1
        else:
            failed += 1
        time.sleep(0.1)

    print()
    print(f"Done. ok={ok} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
