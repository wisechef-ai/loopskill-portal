#!/usr/bin/env python3
"""
RCP-7 rev7.3 — Stripe LIVE-mode price nickname rename.
Cook -> Pro, Operator -> Pro+

Run from wiserecipes-api dir after sourcing .env:
  set -a && . .env && set +a && python3 scripts/stripe_nickname_rename.py
"""
import os
import stripe

stripe.api_key = os.environ["WR_STRIPE_SECRET_KEY"]

RENAMES = {
    "price_1TUktdEgmqt5xoaLTqMqdPsk": "Pro $20/mo (RCP-1 2026-05-08, RCP-7 rev7.3 label)",
    "price_1TUktdEgmqt5xoaLTF55wChw": "Pro+ $100/mo (RCP-1 2026-05-08, RCP-7 rev7.3 label)",
}

for price_id, new_nickname in RENAMES.items():
    price = stripe.Price.retrieve(price_id)
    old_nickname = price.nickname
    updated = stripe.Price.modify(price_id, nickname=new_nickname)
    print(f"[OK] {price_id}")
    print(f"     OLD: {old_nickname}")
    print(f"     NEW: {updated.nickname}")
    print()

print("Verifying live prices:")
prices = stripe.Price.list(limit=10, active=True)
for p in prices.data:
    if p.id in RENAMES:
        print(f"  {p.id}: {p.nickname}")
