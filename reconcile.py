#!/usr/bin/env python3
"""Payment reconciliation.

Reads payments.jsonl and works out how much money we actually collected.
Run:  python3 reconcile.py

Rules (from the README):
  * Ignore lines that cannot be read, and events without a txn_id.
  * A payment can be attempted more than once (same txn_id). Only the latest
    attempt (by timestamp, not by position in the file) counts.
  * A payment is collected only if its latest attempt is "success".
"""
import json
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP


def parse_ts(value):
    """'2026-09-21T15:30:26Z' -> timezone-aware datetime (UTC)."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def to_kobo(value):
    """Naira amount -> whole kobo (integer), so no floating-point drift.

    Amounts arrive as numbers (3533.05) or as text with thousands
    separators ("55,707.77"), so strip the commas before converting.
    """
    text = str(value).replace(",", "").strip()
    return int((Decimal(text) * 100).to_integral_value(rounding=ROUND_HALF_UP))


latest = {}  # txn_id -> (timestamp, event): only the newest attempt is kept
unreadable = 0
no_txn_id = 0

with open("payments.jsonl", encoding="utf-8", errors="replace") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            unreadable += 1  # truncated or corrupt line
            continue
        if not isinstance(event, dict):
            unreadable += 1
            continue
        txn_id = event.get("txn_id")
        if not txn_id:
            no_txn_id += 1
            continue
        ts = parse_ts(event["ts"])
        # Keep the latest attempt. On an exact tie, the later line wins.
        if txn_id not in latest or ts >= latest[txn_id][0]:
            latest[txn_id] = (ts, event)

collected = [event for _, event in latest.values() if event["status"] == "success"]
count = len(collected)
total_kobo = sum(to_kobo(event["amount"]) for event in collected)
total = (total_kobo + 50) // 100  # whole naira, halves round up

with open("expected.txt") as f:
    expected = int(f.read().strip())

print(f"Skipped {unreadable} unreadable lines and {no_txn_id} events without a txn_id.")
if count != expected:
    print(f"Check failed: counted {count} successful payments, expected {expected}.")
    print("Something in the data isn't being handled the way the README describes.")
else:
    print(f"Check passed: {count} successful payments.")
    print(f"Your code: KOYA-{total}")
