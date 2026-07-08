#!/usr/bin/env python3
"""Independent oracle: recompute the import summary + dashboard totals straight
from orders.csv using the same rules as the app, then (optionally) diff against
the live API. This deliberately shares NO code with the TypeScript importer, so
agreement to the cent is real evidence the app is correct.

Usage:
  python3 scripts/verify_oracle.py            # print expected numbers
  python3 scripts/verify_oracle.py --api      # also fetch app APIs and diff
"""
import csv
import json
import re
import sys
import urllib.request
from collections import defaultdict

CSV = "orders.csv"
RATE = {"USD": 100, "EUR": 108, "GBP": 127}  # numerator / 100
REVENUE_STATUSES = {"completed", "shipped"}
MONTHS = {m: f"{i:02d}" for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_date(s):
    s = s.strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        return _valid(m[1], m[2], m[3])
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        return _valid(m[3], m[1].zfill(2), m[2].zfill(2))
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$", s)
    if m:
        mm = MONTHS.get(m[2][:3].lower())
        return _valid(m[3], mm, m[1].zfill(2)) if mm else None
    return None


def _valid(y, mm, dd):
    mo, da = int(mm), int(dd)
    if mo < 1 or mo > 12 or da < 1 or da > 31:
        return None
    import calendar
    if da > calendar.monthrange(int(y), mo)[1]:
        return None
    return f"{y}-{mm}-{dd}"


def parse_amount_cents(s):
    s = s.strip()
    if not s:
        return None
    cleaned = re.sub(r"[$,\s]", "", s)
    if not re.match(r"^-?\d+(\.\d+)?$", cleaned):
        return None
    neg = cleaned.startswith("-")
    absv = cleaned[1:] if neg else cleaned
    intp, _, fracraw = absv.partition(".")
    frac = (fracraw + "00")[:3]
    cents = int(intp) * 100 + int(frac[:2])
    if int(frac[2]) >= 5:
        cents += 1
    return -cents if neg else cents


def to_usd(cents, currency):
    num = RATE[currency]
    sign = -1 if cents < 0 else 1
    absv = abs(cents)
    return sign * ((absv * num + 50) // 100)


def valid_updated_at(s):
    # accept ISO-ish timestamps; reject blanks / obvious junk
    s = s.strip()
    if not s:
        return False
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}", s))


def main():
    rows_read = 0
    rejected = defaultdict(int)
    valid = []  # (order_id, updated_at, file_idx, email_norm, name, iso_date, status, usd_cents)
    with open(CSV, encoding="utf-8-sig", newline="") as f:
        r = csv.reader(f)
        next(r)  # header
        for idx, row in enumerate(r):
            rows_read += 1
            if len(row) != 8:
                rejected["wrong_column_count"] += 1
                continue
            oid, name, email, odate, updated, status, currency, amount = row
            if not email.strip():
                rejected["missing_email"] += 1
                continue
            iso = parse_date(odate)
            if iso is None or not valid_updated_at(updated):
                rejected["unparseable_date"] += 1
                continue
            cents = parse_amount_cents(amount)
            if cents is None:
                rejected["empty_or_bad_amount"] += 1
                continue
            if currency not in RATE:
                rejected["unsupported_currency"] += 1
                continue
            valid.append((oid, updated.strip(), idx, email.strip().lower(),
                          name, iso, status, to_usd(cents, currency)))

    # dedup: max updated_at, tie -> later file idx
    best = {}
    for v in valid:
        oid, updated, idx = v[0], v[1], v[2]
        cur = best.get(oid)
        if cur is None or (updated, idx) > (cur[1], cur[2]):
            best[oid] = v
    winners = list(best.values())
    imported = len(winners)
    dupes = len(valid) - imported
    rej_total = sum(rejected.values())

    summary = {
        "rowsRead": rows_read,
        "imported": imported,
        "duplicatesDropped": dupes,
        "rejected": rej_total,
        "rejectedByReason": dict(rejected),
        "reconciles": rows_read == imported + dupes + rej_total,
    }

    # dashboard
    total_rev = 0
    by_month = defaultdict(int)
    by_cust = defaultdict(int)
    cust_name = {}
    cust_latest = {}
    for (oid, updated, idx, email, name, iso, status, usd) in winners:
        if status in REVENUE_STATUSES:
            contrib = max(0, usd)
            total_rev += contrib
            by_month[iso[:7]] += contrib
            by_cust[email] += contrib
        if updated >= cust_latest.get(email, ""):
            cust_latest[email] = updated
            cust_name[email] = name
    top5 = sorted(by_cust.items(), key=lambda kv: -kv[1])[:5]

    dash = {
        "totalRevenueCents": total_rev,
        "orderCount": imported,
        "byMonth": [{"month": m, "revenueCents": by_month[m]} for m in sorted(by_month)],
        "top5": [{"email": e, "name": cust_name.get(e, ""), "lifetimeCents": c} for e, c in top5],
    }

    print("=== EXPECTED IMPORT SUMMARY ===")
    print(json.dumps(summary, indent=2))
    print("\n=== EXPECTED DASHBOARD ===")
    print(json.dumps(dash, indent=2, ensure_ascii=False))

    if "--api" in sys.argv:
        base = "http://localhost:3000"
        api = json.load(urllib.request.urlopen(base + "/api/dashboard"))
        print("\n=== API DASHBOARD ===")
        print(json.dumps(api, indent=2, ensure_ascii=False))
        ok = (api.get("totalRevenueCents") == total_rev
              and api.get("orderCount") == imported)
        print("\nRevenue match:", api.get("totalRevenueCents"), "vs", total_rev, "->",
              api.get("totalRevenueCents") == total_rev)
        print("Count match:", api.get("orderCount"), "vs", imported, "->",
              api.get("orderCount") == imported)
        print("\nORACLE MATCH:" , "PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
