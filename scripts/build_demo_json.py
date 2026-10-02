#!/usr/bin/env python3
"""Rebuild quicklift-public-demo/data/demo.json for Solvenna public marketing demo.

- All companies from vw_company that have a primary domain (~2247)
- February 2026 series fully filled (imputed where needed)
- Other 2026 months included with actual non-null metrics only
- Marketing Effectiveness Score (quicklift_score) via Brand-Health-style
  approximation over available export metrics
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

DB_PATH = "/home/box/quicklift-readonly.duckdb"
OUT_PATH = Path("/workspace/quicklift-public-demo/data/demo.json")
NOTES_PATH = Path("/workspace/quicklift-public-demo/data/IMPUTATION_NOTES.md")
METRIC_MAP_PATH = Path("/workspace/quicklift-public-demo/METRIC_MAP.md")
SLIM_PATH = Path("/workspace/quicklift-public-demo/data/demo-feb.json")

SEED_DOMAINS = {
    "bestbuy.com",
    "target.com",
    "walmart.com",
    "nike.com",
    "nordstrom.com",
    "homedepot.com",
    "chewy.com",
    "gap.com",
    "ulta.com",
    "rei.com",
    "williams-sonoma.com",
    "footlocker.com",
}

# Export metric ids (order matches existing demo.json)
METRIC_META = [
    {
        "id": "quicklift_score",
        "label": "Marketing Effectiveness Score",
        "format": "index",
        "higher_is_better": True,
        "column": "computed_brand_health_approx",
        "available_in_snapshot": True,
    },
    {"id": "conv_pct", "label": "Conv %", "format": "percent", "higher_is_better": True, "column": "conversion_rate"},
    {"id": "multi_visit_pct", "label": "% Multi Visit", "format": "percent", "higher_is_better": True, "column": "derived"},
    {"id": "mobile_pct", "label": "mobile %", "format": "percent", "higher_is_better": True, "column": "mobile_share"},
    {"id": "new_visitors_pct", "label": "New Visitors %", "format": "percent", "higher_is_better": False, "column": "derived"},
    {"id": "return_visitors_pct", "label": "Return Visitors %", "format": "percent", "higher_is_better": True, "column": "derived"},
    {"id": "bounce_pct", "label": "Bounce %", "format": "percent", "higher_is_better": False, "column": "all_traffic_bounce_rate"},
    {"id": "owned_visits_pct", "label": "Owned Visits %", "format": "percent", "higher_is_better": True, "column": "derived"},
    {"id": "owned_traffic_retention_index", "label": "Owned Traffic Retention Index", "format": "index", "higher_is_better": True, "column": "derived"},
    {"id": "paid_visits_pct", "label": "Paid Visits %", "format": "percent", "higher_is_better": False, "column": "derived"},
    {"id": "paid_traffic_retention_index", "label": "Paid Traffic Retention Index", "format": "index", "higher_is_better": True, "column": "derived"},
    {"id": "dollars_per_retained_ppc_visit", "label": "$ Per Retained PPC Visit", "format": "currency", "higher_is_better": False, "column": "derived"},
    {"id": "list_mm", "label": "List MM", "format": "number", "higher_is_better": True, "column": "reach_mm"},
    {"id": "read_pct", "label": "Read %", "format": "percent", "higher_is_better": True, "column": "read"},
    {"id": "spam_pct", "label": "Spam %", "format": "percent", "higher_is_better": False, "column": "spam"},
    {"id": "list_campaign_pct", "label": "% List/Campaign", "format": "percent", "higher_is_better": False, "column": "derived"},
    {"id": "email_user_day", "label": "Email/User/Day", "format": "number", "higher_is_better": False, "column": "derived"},
    {"id": "email_power_index", "label": "Email POWER Index", "format": "index", "higher_is_better": True, "column": "derived"},
    {"id": "rpe", "label": "RPE", "format": "currency", "higher_is_better": True, "column": "derived"},
]

DATA_METRICS = [m["id"] for m in METRIC_META if m["id"] != "quicklift_score"]
ALL_METRICS = [m["id"] for m in METRIC_META]

PERCENT_METRICS = {
    "conv_pct",
    "multi_visit_pct",
    "mobile_pct",
    "new_visitors_pct",
    "return_visitors_pct",
    "bounce_pct",
    "owned_visits_pct",
    "paid_visits_pct",
    "read_pct",
    "spam_pct",
    "list_campaign_pct",
}

# Sensible clamps for imputation
CLAMPS = {
    "conv_pct": (0.001, 0.15),
    "multi_visit_pct": (0.05, 0.85),
    "mobile_pct": (0.20, 0.95),
    "new_visitors_pct": (0.15, 0.90),
    "return_visitors_pct": (0.10, 0.85),
    "bounce_pct": (0.15, 0.85),
    "owned_visits_pct": (0.15, 0.95),
    "paid_visits_pct": (0.05, 0.85),
    "owned_traffic_retention_index": (20.0, 95.0),
    "paid_traffic_retention_index": (15.0, 95.0),
    "dollars_per_retained_ppc_visit": (0.05, 50.0),
    "list_mm": (0.01, 500.0),
    "read_pct": (0.01, 0.60),
    "spam_pct": (0.0, 0.25),
    "list_campaign_pct": (0.001, 2.0),
    "email_user_day": (0.01, 5.0),
    "email_power_index": (0.1, 500.0),
    "rpe": (1000.0, 5_000_000.0),
    "quicklift_score": (15.0, 95.0),
}

FEB = "2026-02"
FEB_MONTH = "2026-02-01"


def domain_to_slug(domain: str) -> str:
    d = (domain or "").strip().lower()
    d = d.rstrip("/")
    # strip path
    if "/" in d:
        d = d.split("/", 1)[0]
    # multi-part TLDs
    for suffix in (".com.mx", ".co.uk", ".com.au", ".com/"):
        if d.endswith(suffix):
            base = d[: -len(suffix)]
            tld = suffix.lstrip(".").replace(".", "_")
            return re.sub(r"[^a-z0-9]+", "_", base).strip("_") + "_" + tld.replace("/", "")
    # default: drop final label (TLD)
    parts = d.split(".")
    if len(parts) >= 2:
        base = "_".join(parts[:-1])
    else:
        base = d
    slug = re.sub(r"[^a-z0-9]+", "_", base).strip("_")
    return slug or "unknown"


def unique_slugs(domains: list[str]) -> dict[str, str]:
    """Map domain -> unique slug."""
    raw = {dom: domain_to_slug(dom) for dom in domains}
    counts = defaultdict(list)
    for dom, slug in raw.items():
        counts[slug].append(dom)
    out = {}
    for slug, doms in counts.items():
        if len(doms) == 1:
            out[doms[0]] = slug
            continue
        for dom in doms:
            parts = dom.strip().lower().rstrip("/").split(".")
            # append tld
            tld = parts[-1] if parts else "x"
            cand = f"{slug}_{re.sub(r'[^a-z0-9]+', '', tld)}"
            # if still colliding, use hash
            if cand in out.values():
                cand = f"{slug}_{hashlib.md5(dom.encode()).hexdigest()[:6]}"
            out[dom] = cand
    return out


def parse_pct(val) -> float | None:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if isinstance(val, (int, float)):
        v = float(val)
        # if looks like already 0-1 fraction for typical rates stored as share
        return v
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "null"):
        return None
    s = s.replace(",", "")
    if s.endswith("%"):
        try:
            return float(s[:-1]) / 100.0
        except ValueError:
            return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_money(val) -> float | None:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace("$", "").replace(",", "")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def safe_div(a, b):
    if a is None or b is None:
        return None
    try:
        if b == 0 or (isinstance(b, float) and math.isnan(b)):
            return None
        return a / b
    except Exception:
        return None


def round_metric(mid: str, v: float) -> float:
    if mid in ("owned_traffic_retention_index", "paid_traffic_retention_index"):
        return float(round(v))
    if mid == "quicklift_score":
        return round(float(v), 1)
    if mid in PERCENT_METRICS:
        return round(float(v), 6)
    if mid in ("list_mm",):
        return round(float(v), 2)
    if mid in ("email_user_day", "email_power_index", "dollars_per_retained_ppc_visit"):
        return round(float(v), 6)
    if mid == "rpe":
        return round(float(v), 6)
    return round(float(v), 6)


def jitter_factor(company_id: str, metric_id: str) -> float:
    """Deterministic ±3–8% based on company_id + metric hash."""
    h = hashlib.md5(f"{company_id}:{metric_id}".encode()).hexdigest()
    # map to [-0.08, -0.03] U [0.03, 0.08]
    n = int(h[:8], 16) / 0xFFFFFFFF
    mag = 0.03 + 0.05 * n  # 3%..8%
    sign = 1.0 if int(h[8:10], 16) % 2 == 0 else -1.0
    return 1.0 + sign * mag


def clamp_metric(mid: str, v: float) -> float:
    lo, hi = CLAMPS.get(mid, (None, None))
    if lo is not None:
        v = max(lo, v)
    if hi is not None:
        v = min(hi, v)
    return v


def extract_metrics_sql(con) -> pd.DataFrame:
    """Pull derived metrics for all company primary domains × 2026 months."""
    sql = """
    WITH base AS (
      SELECT
        c.company_id AS raw_company_id,
        c.name AS company_name,
        c.category_ci,
        c.sub_category_ci,
        c.online_revenue,
        d.domain,
        s.date_id,
        s.conversion_rate,
        s.mobile_share,
        s.all_traffic_bounce_rate,
        s.all_traffic_visits,
        s.deduplicated_audience,
        s.total_new_visitors,
        s.total_returning_visitors,
        s.direct_channel_desktop_visits,
        s.direct_channel_mobile_visits,
        s.organic_search_channel_desktop_visits,
        s.organic_search_channel_mobile_visits,
        s.mail_channel_desktop_visits,
        s.mail_channel_mobile_visits,
        s.referrals_channel_desktop_visits,
        s.referrals_channel_mobile_visits,
        s.paid_search_channel_desktop_visits,
        s.paid_search_channel_mobile_visits,
        s.social_channel_desktop_visits,
        s.social_channel_mobile_visits,
        s.display_ads_channel_desktop_visits,
        s.display_ads_channel_mobile_visits,
        s.desk_direct,
        s.desk_organic_search,
        s.desk_email,
        s.desk_referrals,
        s.desk_paid_search,
        s.desk_social,
        s.desk_display_ads,
        s.desktop_ppc_spend_usd,
        s.mobile_ppc_spend_usd,
        s.reach_mm,
        s.vol_mm,
        s.camps,
        s.read,
        s.spam,
        s.li_total,
        s.total_sales_2024
      FROM vw_company c
      JOIN vw_domains d ON d.domain_id = c.company_id
      JOIN vw_summary_fact s
        ON s.company_id = c.company_id
       AND s.domain_id = c.company_id
       AND s.date_id LIKE '2026-%'
    )
    SELECT * FROM base
    ORDER BY domain, date_id
    """
    return con.execute(sql).fetchdf()


def compute_row_metrics(row) -> dict:
    """Compute export metrics (fractions 0-1) from a raw summary row. Nones for missing."""
    visits = row.get("all_traffic_visits")
    if visits is not None and (isinstance(visits, float) and math.isnan(visits)):
        visits = None

    out = {}

    # conv_pct: conversion_rate is like "2.60%"
    out["conv_pct"] = parse_pct(row.get("conversion_rate"))

    # multi_visit
    dedup = row.get("deduplicated_audience")
    if visits and dedup is not None and not (isinstance(dedup, float) and math.isnan(dedup)) and visits > 0:
        out["multi_visit_pct"] = (visits - dedup) / visits
    else:
        out["multi_visit_pct"] = None

    out["mobile_pct"] = None if row.get("mobile_share") is None or (isinstance(row.get("mobile_share"), float) and math.isnan(row.get("mobile_share"))) else float(row["mobile_share"])

    tn = row.get("total_new_visitors")
    tr = row.get("total_returning_visitors")
    if tn is not None and isinstance(tn, float) and math.isnan(tn):
        tn = None
    if tr is not None and isinstance(tr, float) and math.isnan(tr):
        tr = None
    tot = (tn or 0) + (tr or 0)
    if tot > 0 and tn is not None and tr is not None:
        out["new_visitors_pct"] = tn / tot
        out["return_visitors_pct"] = tr / tot
    else:
        out["new_visitors_pct"] = None
        out["return_visitors_pct"] = None

    br = row.get("all_traffic_bounce_rate")
    out["bounce_pct"] = None if br is None or (isinstance(br, float) and math.isnan(br)) else float(br)

    def ch(a, b):
        va = row.get(a)
        vb = row.get(b)
        if va is not None and isinstance(va, float) and math.isnan(va):
            va = None
        if vb is not None and isinstance(vb, float) and math.isnan(vb):
            vb = None
        return (va or 0.0) + (vb or 0.0)

    owned = ch("direct_channel_desktop_visits", "direct_channel_mobile_visits") + \
            ch("organic_search_channel_desktop_visits", "organic_search_channel_mobile_visits") + \
            ch("mail_channel_desktop_visits", "mail_channel_mobile_visits")
    paid = ch("referrals_channel_desktop_visits", "referrals_channel_mobile_visits") + \
           ch("paid_search_channel_desktop_visits", "paid_search_channel_mobile_visits") + \
           ch("social_channel_desktop_visits", "social_channel_mobile_visits") + \
           ch("display_ads_channel_desktop_visits", "display_ads_channel_mobile_visits")

    if visits and visits > 0:
        out["owned_visits_pct"] = owned / visits
        out["paid_visits_pct"] = paid / visits
    else:
        out["owned_visits_pct"] = None
        out["paid_visits_pct"] = None

    # Owned retention index
    def retained_owned():
        num = 0.0
        den = 0.0
        channels = [
            ("desk_direct", "direct_channel_desktop_visits", "direct_channel_mobile_visits"),
            ("desk_organic_search", "organic_search_channel_desktop_visits", "organic_search_channel_mobile_visits"),
            ("desk_email", "mail_channel_desktop_visits", "mail_channel_mobile_visits"),
        ]
        for bounce_col, dcol, mcol in channels:
            bounce = row.get(bounce_col)
            if bounce is None or (isinstance(bounce, float) and math.isnan(bounce)):
                continue
            v = ch(dcol, mcol)
            den += v
            num += v * (1.0 - float(bounce))
        if den <= 0:
            return None
        return round(num / den * 100.0)

    def retained_paid():
        num = 0.0
        den = 0.0
        channels = [
            ("desk_referrals", "referrals_channel_desktop_visits", "referrals_channel_mobile_visits"),
            ("desk_paid_search", "paid_search_channel_desktop_visits", "paid_search_channel_mobile_visits"),
            ("desk_social", "social_channel_desktop_visits", "social_channel_mobile_visits"),
            ("desk_display_ads", "display_ads_channel_desktop_visits", "display_ads_channel_mobile_visits"),
        ]
        for bounce_col, dcol, mcol in channels:
            bounce = row.get(bounce_col)
            if bounce is None or (isinstance(bounce, float) and math.isnan(bounce)):
                continue
            v = ch(dcol, mcol)
            den += v
            num += v * (1.0 - float(bounce))
        if den <= 0:
            return None
        return round(num / den * 100.0)

    out["owned_traffic_retention_index"] = retained_owned()
    out["paid_traffic_retention_index"] = retained_paid()

    # $ per retained PPC visit
    ppc_spend = (row.get("desktop_ppc_spend_usd") or 0) + (row.get("mobile_ppc_spend_usd") or 0)
    if isinstance(ppc_spend, float) and math.isnan(ppc_spend):
        ppc_spend = 0
    ppc_visits = ch("paid_search_channel_desktop_visits", "paid_search_channel_mobile_visits")
    bounce_ppc = row.get("desk_paid_search")
    if bounce_ppc is None or (isinstance(bounce_ppc, float) and math.isnan(bounce_ppc)) or ppc_visits <= 0:
        out["dollars_per_retained_ppc_visit"] = None
    else:
        retained = ppc_visits * (1.0 - float(bounce_ppc))
        out["dollars_per_retained_ppc_visit"] = safe_div(ppc_spend, retained)

    # list_mm
    rm = row.get("reach_mm")
    out["list_mm"] = None if rm is None or (isinstance(rm, float) and math.isnan(rm)) else float(rm)

    out["read_pct"] = parse_pct(row.get("read"))
    out["spam_pct"] = parse_pct(row.get("spam"))

    vol = row.get("vol_mm")
    camps = row.get("camps")
    if vol is not None and isinstance(vol, float) and math.isnan(vol):
        vol = None
    if camps is not None and isinstance(camps, float) and math.isnan(camps):
        camps = None
    # list_campaign_pct as 0-1 fraction: (vol/camps)/reach
    if vol is not None and camps and camps > 0 and rm and rm > 0:
        out["list_campaign_pct"] = (vol / camps) / rm
    else:
        out["list_campaign_pct"] = None

    if vol is not None and rm and rm > 0:
        out["email_user_day"] = (vol / rm) / 30.4
    else:
        out["email_user_day"] = None

    # Email POWER = mail_visits/1e6 / vol_mm * 100000 = mail_visits / vol_mm / 10
    mail_v = ch("mail_channel_desktop_visits", "mail_channel_mobile_visits")
    if visits and visits > 0 and vol and vol > 0:
        out["email_power_index"] = (mail_v / visits) * (visits / 1_000_000.0) / vol * 100_000.0
    else:
        out["email_power_index"] = None

    sales = parse_money(row.get("total_sales_2024"))
    li = row.get("li_total")
    if li is not None and isinstance(li, float) and math.isnan(li):
        li = None
    if sales is not None and li and li > 0:
        out["rpe"] = sales / float(li)
    else:
        out["rpe"] = None

    return out


def brand_health_approx(metrics: dict) -> float | None:
    """Approximate Brand Health / Marketing Effectiveness Score from export metrics.

    Mirrors vw_brand_self_score_metric_config transforms for the subset of
    metrics present in the public demo export. Percents are converted to
    0-100 display scale before transform. Score = mean of non-null metric
    scores, clamped to [0, 100].
    """
    scores = []

    def pct100(key):
        v = metrics.get(key)
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return None
        return float(v) * 100.0

    def identity_pct(key):
        v = pct100(key)
        return None if v is None else max(0.0, min(100.0, v))

    def invert_pct(key):
        v = pct100(key)
        return None if v is None else max(0.0, min(100.0, 100.0 - v))

    def identity_idx(key, scale=1.0):
        v = metrics.get(key)
        if v is None or (isinstance(v, float) and math.isnan(v)):
            return None
        return max(0.0, min(100.0, float(v) * scale))

    # Config-aligned subset
    mapping = [
        ("conv_pct", "identity_pct"),
        ("multi_visit_pct", "identity_pct"),
        ("new_visitors_pct", "invert_pct"),
        ("return_visitors_pct", "identity_pct"),
        ("bounce_pct", "invert_pct"),
        ("owned_visits_pct", "identity_pct"),
        ("owned_traffic_retention_index", "identity_idx"),
        ("paid_visits_pct", "invert_pct"),
        ("paid_traffic_retention_index", "identity_idx"),
        ("read_pct", "identity_pct"),
        ("spam_pct", "invert_pct"),
        ("list_campaign_pct", "invert_pct"),
        ("email_power_index", "identity_idx"),
    ]
    for key, kind in mapping:
        if kind == "identity_pct":
            s = identity_pct(key)
        elif kind == "invert_pct":
            s = invert_pct(key)
        else:
            s = identity_idx(key)
        if s is not None:
            scores.append(s)

    # Email/User/Day: log_inv_eud = 100 / (1 + ln(1+v))
    eud = metrics.get("email_user_day")
    if eud is not None and not (isinstance(eud, float) and math.isnan(eud)) and eud > -1:
        scores.append(max(0.0, min(100.0, 100.0 / (1.0 + math.log(1.0 + float(eud))))))

    if not scores:
        return None
    return round(sum(scores) / len(scores), 1)


def enforce_pairs(m: dict) -> dict:
    """Keep owned+paid ≈ 1 and new+return ≈ 1 when both present."""
    if m.get("owned_visits_pct") is not None and m.get("paid_visits_pct") is not None:
        owned = float(m["owned_visits_pct"])
        owned = max(0.05, min(0.95, owned))
        m["owned_visits_pct"] = owned
        m["paid_visits_pct"] = 1.0 - owned
    if m.get("new_visitors_pct") is not None and m.get("return_visitors_pct") is not None:
        neu = float(m["new_visitors_pct"])
        neu = max(0.10, min(0.90, neu))
        m["new_visitors_pct"] = neu
        m["return_visitors_pct"] = 1.0 - neu
    return m


def impute_february(
    metrics_by_co_month: dict,
    company_meta: dict,
    category_medians: dict,
    subcategory_medians: dict,
    global_medians: dict,
) -> tuple[dict, dict, int, int]:
    """Fill all Feb metrics for every company. Returns (feb_metrics, imputed_flags, imputed_cells, total_cells)."""
    feb_out = {}
    imputed_flags = {}
    imputed_cells = 0
    total_cells = 0

    nearby_order = ["2026-01", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]

    for cid, meta in company_meta.items():
        months = metrics_by_co_month.get(cid, {})
        base = dict(months.get(FEB, {}))
        imputed = []
        for mid in DATA_METRICS:
            total_cells += 1
            val = base.get(mid)
            if val is not None and not (isinstance(val, float) and math.isnan(val)):
                continue
            # nearby months same company
            filled = None
            for mo in nearby_order:
                v = months.get(mo, {}).get(mid)
                if v is not None and not (isinstance(v, float) and math.isnan(v)):
                    filled = float(v)
                    break
            if filled is None:
                # subcategory then category median
                sub = meta.get("sub_category_ci")
                cat = meta.get("category_ci")
                if sub and sub in subcategory_medians and mid in subcategory_medians[sub]:
                    filled = subcategory_medians[sub][mid]
                elif cat and cat in category_medians and mid in category_medians[cat]:
                    filled = category_medians[cat][mid]
                elif mid in global_medians:
                    filled = global_medians[mid]
                else:
                    # last-resort defaults
                    defaults = {
                        "conv_pct": 0.02,
                        "multi_visit_pct": 0.45,
                        "mobile_pct": 0.65,
                        "new_visitors_pct": 0.55,
                        "return_visitors_pct": 0.45,
                        "bounce_pct": 0.50,
                        "owned_visits_pct": 0.60,
                        "paid_visits_pct": 0.40,
                        "owned_traffic_retention_index": 55.0,
                        "paid_traffic_retention_index": 50.0,
                        "dollars_per_retained_ppc_visit": 1.5,
                        "list_mm": 0.5,
                        "read_pct": 0.10,
                        "spam_pct": 0.03,
                        "list_campaign_pct": 0.05,
                        "email_user_day": 0.4,
                        "email_power_index": 15.0,
                        "rpe": 200_000.0,
                    }
                    filled = defaults[mid]

            # jitter from global/peer only (not nearby company months — those are real)
            # Always apply small jitter when source wasn't same-company nearby? Spec says
            # jitter for global median. Apply for peer+global paths; skip for nearby.
            # We already used nearby first without jitter. For peer/global we jitter.
            # Detect: if filled came from nearby, months had it — we set filled before peer.
            # Re-check: only jitter if no nearby value existed.
            had_nearby = any(
                months.get(mo, {}).get(mid) is not None
                and not (isinstance(months.get(mo, {}).get(mid), float) and math.isnan(months.get(mo, {}).get(mid)))
                for mo in nearby_order
            )
            if not had_nearby:
                filled = filled * jitter_factor(cid, mid)

            filled = clamp_metric(mid, filled)
            base[mid] = filled
            imputed.append(mid)
            imputed_cells += 1

        base = enforce_pairs(base)
        # re-clamp after pair enforce
        for mid in DATA_METRICS:
            if base.get(mid) is not None:
                base[mid] = clamp_metric(mid, float(base[mid]))
                base[mid] = round_metric(mid, base[mid])

        # score after imputation
        score = brand_health_approx(base)
        if score is None:
            score = clamp_metric("quicklift_score", global_medians.get("quicklift_score", 50.0) * jitter_factor(cid, "quicklift_score"))
            imputed.append("quicklift_score")
            imputed_cells += 1
        else:
            # score always "computed" — not counted as imputed unless we had to invent it
            pass
        total_cells += 1  # quicklift_score cell
        base["quicklift_score"] = round_metric("quicklift_score", float(score))

        feb_out[cid] = base
        imputed_flags[cid] = imputed

    return feb_out, imputed_flags, imputed_cells, total_cells


def build_competitors(con, domain_to_cid: dict, company_meta: dict) -> dict:
    """company_id -> up to 5 competitor company_ids."""
    # From vw_comp_fact
    cf = con.execute("""
        SELECT domain, url, score
        FROM vw_comp_fact
        WHERE date_id = (SELECT MAX(date_id) FROM vw_comp_fact)
        ORDER BY domain, score DESC
    """).fetchdf()

    comps = defaultdict(list)
    for domain, grp in cf.groupby("domain", sort=False):
        cid = domain_to_cid.get(domain)
        if not cid:
            continue
        for url in grp["url"].tolist():
            if len(comps[cid]) >= 5:
                break
            ocid = domain_to_cid.get(url)
            if ocid and ocid != cid and ocid not in comps[cid]:
                comps[cid].append(ocid)

    # Peer fallback by category_ci + online_revenue proximity
    by_cat = defaultdict(list)
    for cid, meta in company_meta.items():
        cat = meta.get("category_ci") or "_none"
        rev = meta.get("online_revenue")
        if rev is None or (isinstance(rev, float) and math.isnan(rev)):
            rev = 0.0
        by_cat[cat].append((cid, float(rev)))

    for cat, members in by_cat.items():
        members_sorted = sorted(members, key=lambda x: x[1])
        idx_map = {cid: i for i, (cid, _) in enumerate(members_sorted)}
        for cid, rev in members:
            if len(comps[cid]) >= 5:
                continue
            i = idx_map[cid]
            # gather neighbors by index distance
            candidates = []
            for j, (oid, orev) in enumerate(members_sorted):
                if oid == cid:
                    continue
                candidates.append((abs(j - i), abs(orev - rev), oid))
            candidates.sort()
            for _, _, oid in candidates:
                if len(comps[cid]) >= 5:
                    break
                if oid not in comps[cid]:
                    comps[cid].append(oid)

    # Global revenue-proximity fallback for singleton / empty categories
    all_members = []
    for cid, meta in company_meta.items():
        rev = meta.get("online_revenue")
        if rev is None or (isinstance(rev, float) and (rev != rev)):  # NaN
            rev = 0.0
        all_members.append((cid, float(rev)))
    all_members.sort(key=lambda x: x[1])
    idx_global = {cid: i for i, (cid, _) in enumerate(all_members)}

    for cid in company_meta:
        comps.setdefault(cid, [])
        if len(comps[cid]) >= 5:
            continue
        i = idx_global[cid]
        candidates = []
        for j, (oid, orev) in enumerate(all_members):
            if oid == cid:
                continue
            candidates.append((abs(j - i), oid))
        candidates.sort()
        for _, oid in candidates:
            if len(comps[cid]) >= 5:
                break
            if oid not in comps[cid]:
                comps[cid].append(oid)

    return dict(comps)


def main():
    print("Connecting…")
    con = duckdb.connect(DB_PATH, read_only=True)

    print("Extracting summary rows…")
    raw = extract_metrics_sql(con)
    print(f"  raw rows: {len(raw)}")

    # Keep original domain as identity (trailing-slash variants are distinct rows).
    # Display domain: strip trailing slash only.
    raw["domain_key"] = raw["domain"].astype(str).str.strip()
    raw["domain_display"] = raw["domain_key"].str.rstrip("/")
    domains = sorted(raw["domain_key"].unique().tolist())
    domain_slug = unique_slugs(domains)

    def display_name(company_name, domain_disp):
        if company_name is None or (isinstance(company_name, float) and pd.isna(company_name)):
            # Title-case first label of domain
            base = domain_disp.split(".")[0].replace("-", " ").replace("_", " ")
            return base.title() if base else domain_disp
        s = str(company_name).strip()
        return s if s and s.lower() != "nan" else domain_disp.split(".")[0].title()

    # company_meta keyed by slug id
    company_meta = {}
    domain_to_cid = {}
    raw_id_to_cid = {}

    # One row per domain_key for meta (from any month)
    meta_df = raw.sort_values("date_id").groupby("domain_key", as_index=False).first()
    for _, r in meta_df.iterrows():
        dom_key = r["domain_key"]
        dom_disp = r["domain_display"]
        cid = domain_slug[dom_key]
        company_meta[cid] = {
            "name": display_name(r["company_name"], dom_disp),
            "domain": dom_disp,
            "domain_key": dom_key,
            "raw_company_id": r["raw_company_id"],
            "category_ci": r["category_ci"] if pd.notna(r["category_ci"]) else None,
            "sub_category_ci": r["sub_category_ci"] if pd.notna(r["sub_category_ci"]) else None,
            "online_revenue": float(r["online_revenue"]) if pd.notna(r["online_revenue"]) else None,
            "seed": dom_disp in SEED_DOMAINS or dom_key in SEED_DOMAINS,
        }
        domain_to_cid[dom_key] = cid
        domain_to_cid[dom_disp] = cid
        raw_id_to_cid[r["raw_company_id"]] = cid

    print(f"  companies: {len(company_meta)}")

    # Compute metrics per company × month
    print("Computing derived metrics…")
    metrics_by_co_month = defaultdict(dict)
    for _, row in raw.iterrows():
        cid = domain_to_cid[row["domain_key"]]
        date_id = row["date_id"]
        m = compute_row_metrics(row.to_dict())
        # drop Nones
        m = {k: v for k, v in m.items() if v is not None and not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))}
        metrics_by_co_month[cid][date_id] = m

    # Medians for imputation from ALL available 2026 values (pre-imputation)
    print("Computing peer/global medians…")
    # Collect values by category / subcategory / global
    cat_vals = defaultdict(lambda: defaultdict(list))
    sub_vals = defaultdict(lambda: defaultdict(list))
    glob_vals = defaultdict(list)

    for cid, months in metrics_by_co_month.items():
        meta = company_meta[cid]
        cat = meta.get("category_ci")
        sub = meta.get("sub_category_ci")
        for mo, mets in months.items():
            for mid, v in mets.items():
                if v is None:
                    continue
                glob_vals[mid].append(float(v))
                if cat:
                    cat_vals[cat][mid].append(float(v))
                if sub:
                    sub_vals[sub][mid].append(float(v))

    def med(xs):
        return float(np.median(xs)) if xs else None

    global_medians = {k: med(v) for k, v in glob_vals.items() if v}
    category_medians = {c: {m: med(vs) for m, vs in mv.items() if vs} for c, mv in cat_vals.items()}
    subcategory_medians = {c: {m: med(vs) for m, vs in mv.items() if vs} for c, mv in sub_vals.items()}

    # Precompute a global score median seed from companies that have dense Feb data
    pre_scores = []
    for cid, months in metrics_by_co_month.items():
        if FEB in months and len(months[FEB]) >= 10:
            s = brand_health_approx(months[FEB])
            if s is not None:
                pre_scores.append(s)
    if pre_scores:
        global_medians["quicklift_score"] = med(pre_scores)
    else:
        global_medians["quicklift_score"] = 55.0

    print("Imputing February…")
    feb_metrics, imputed_flags, imputed_cells, total_cells = impute_february(
        metrics_by_co_month, company_meta, category_medians, subcategory_medians, global_medians
    )

    print("Building competitors…")
    competitors = build_competitors(con, domain_to_cid, company_meta)

    # Also map competitor URLs that might not be cleaned
    # (already handled via domain_to_cid including original)

    print("Assembling JSON…")
    companies_out = []
    # stable order: seeds first, then alpha by name
    ordered = sorted(
        company_meta.items(),
        key=lambda kv: (0 if kv[1]["seed"] else 1, str(kv[1]["name"] or "").lower(), kv[0]),
    )
    for cid, meta in ordered:
        feb = feb_metrics[cid]
        latest = {mid: feb[mid] for mid in ALL_METRICS if mid in feb}
        co = {
            "id": cid,
            "name": meta["name"],
            "domain": meta["domain"],
            "latest_metrics": latest,
            "latest_month": FEB_MONTH,
        }
        if meta["seed"]:
            co["seed"] = True
        # optional category for debugging — omit to keep UI shape
        companies_out.append(co)

    # Series: Feb for everyone (full) + other months with actual non-null only
    series_out = []
    months_present = set()
    for cid, _ in ordered:
        # Feb
        feb = feb_metrics[cid]
        row = {
            "company_id": cid,
            "month": FEB_MONTH,
            "metrics": {mid: feb[mid] for mid in ALL_METRICS},
        }
        flags = imputed_flags.get(cid) or []
        if flags:
            row["imputed_metrics"] = flags
        series_out.append(row)
        months_present.add(FEB)

        for date_id, mets in sorted(metrics_by_co_month.get(cid, {}).items()):
            if date_id == FEB:
                continue
            if not date_id.startswith("2026-"):
                continue
            # only include if at least one metric
            clean = {}
            for mid, v in mets.items():
                if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                    continue
                clean[mid] = round_metric(mid, float(v))
            if not clean:
                continue
            # optional cheap score for other months if enough metrics
            if len(clean) >= 8:
                sc = brand_health_approx(clean)
                if sc is not None:
                    clean["quicklift_score"] = round_metric("quicklift_score", sc)
            month_str = f"{date_id}-01"
            series_out.append({"company_id": cid, "month": month_str, "metrics": clean})
            months_present.add(date_id)

    # competitors only for companies that can be primary — all of them
    competitors_out = {cid: competitors.get(cid, []) for cid, _ in ordered}

    # period note
    month_list = sorted(months_present)
    # month avg metric counts (post-build sample)
    month_avg = {}
    by_month_rows = defaultdict(list)
    for s in series_out:
        by_month_rows[s["month"][:7]].append(len(s["metrics"]))
    for mo, counts in sorted(by_month_rows.items()):
        month_avg[mo] = {
            "avg_metrics": round(sum(counts) / len(counts), 1),
            "company_rows": len(counts),
        }

    generated_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "generated_at": generated_at,
        "period": {
            "grain": "month",
            "year": 2026,
            "note": (
                "Monthly rows from vw_summary_fact for calendar 2026. "
                f"Months present: {', '.join(month_list)}. "
                "Public demo locked on February 2026: every company has a complete Feb row "
                "with all metrics non-null (real values preferred; missing cells imputed — "
                "see imputed_metrics on series rows and data/IMPUTATION_NOTES.md). "
                "Percents as 0–1 fractions. Retention indexes and Email POWER Index keep master.sql scale. "
                "Marketing Effectiveness Score (export id quicklift_score) is a Brand-Health-style "
                "approximation over available export metrics. "
                "Competitors from vw_comp_fact (score DESC) with category peer fallback."
            ),
            "month_avg_metric_counts": month_avg,
        },
        "metrics": METRIC_META,
        "companies": companies_out,
        "competitors": competitors_out,
        "series": series_out,
    }

    print("Writing demo.json…")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"), ensure_ascii=False)
    size = OUT_PATH.stat().st_size
    print(f"  size={size} bytes")

    if size > 15_000_000:
        print("Writing slim demo-feb.json…")
        slim = {
            "generated_at": generated_at,
            "period": {**payload["period"], "note": payload["period"]["note"] + " [slim: Feb-only series]"},
            "metrics": METRIC_META,
            "companies": companies_out,
            "competitors": competitors_out,
            "series": [s for s in series_out if s["month"] == FEB_MONTH],
        }
        with open(SLIM_PATH, "w", encoding="utf-8") as f:
            json.dump(slim, f, separators=(",", ":"), ensure_ascii=False)
        print(f"  slim size={SLIM_PATH.stat().st_size}")

    # Validation
    print("Validating…")
    with open(OUT_PATH, encoding="utf-8") as f:
        check = json.load(f)
    cos = {c["id"] for c in check["companies"]}
    feb_series = [s for s in check["series"] if s["month"] == FEB_MONTH]
    assert len(feb_series) == len(cos), f"Feb series {len(feb_series)} != companies {len(cos)}"
    missing_feb = cos - {s["company_id"] for s in feb_series}
    assert not missing_feb, f"companies missing Feb: {list(missing_feb)[:5]}"
    null_cells = 0
    for s in feb_series:
        for mid in ALL_METRICS:
            v = s["metrics"].get(mid)
            if v is None:
                null_cells += 1
    assert null_cells == 0, f"null Feb cells: {null_cells}"
    # every company has competitors entry
    assert set(check["competitors"].keys()) == cos

    imp_rate = imputed_cells / total_cells if total_cells else 0
    skipped = ["Delta Team Tactical (company_id 6bb61e3b7bce0931da574d19d1d82c88) — no domain / summary_fact rows"]

    notes = f"""# Imputation notes — Solvenna public demo snapshot

Generated: {generated_at}
Source: `{DB_PATH}` (read-only)

## Scope
- Companies: **{len(companies_out)}** (all `vw_company` rows with a primary domain where `domain_id = company_id`)
- Skipped: {'; '.join(skipped)}
- Series rows: **{len(series_out)}**
- February 2026 rows: **{len(feb_series)}** (one per company, all metrics non-null)
- File: `{OUT_PATH}` ({size} bytes)
- Imputation rate (Feb metric cells filled): **{imp_rate:.1%}** ({imputed_cells} / {total_cells})

## February imputation ladder
For any missing export metric on 2026-02, in order:
1. Same company, nearby months (Jan → Mar → other 2026 months)
2. `sub_category_ci` peer median (all 2026 observed values)
3. `category_ci` peer median
4. Global median × deterministic jitter (±3–8% from `md5(company_id:metric_id)`)
5. Hard-coded sensible default (last resort)

Then clamp to peer-like bands, enforce `owned_visits_pct + paid_visits_pct ≈ 1` and
`new_visitors_pct + return_visitors_pct ≈ 1`.

Imputed metric ids are listed on each Feb series row under `imputed_metrics` (UI can ignore).

## Marketing Effectiveness Score (`quicklift_score`)
Brand-Health-style absolute score (not cohort-relative QuickLift Score).

Uses `vw_brand_self_score_metric_config` transforms on the **subset of metrics present
in this export**:

| Metric | Transform |
|---|---|
| Conv % | identity (0–100 scale) |
| % Multi Visit | identity |
| New Visitors % | invert (100 − v) |
| Return Visitors % | identity |
| Bounce % | invert |
| Owned Visits % | identity |
| Owned Traffic Retention Index | identity (already 0–100) |
| Paid Visits % | invert |
| Paid Traffic Retention Index | identity |
| Read % | identity |
| Spam % | invert |
| % List/Campaign | invert |
| Email POWER Index | identity (clamped 0–100) |
| Email/User/Day | log_inv_eud = 100 / (1 + ln(1+v)) |

Score = mean of non-null transformed metric scores, rounded to 1 decimal.
Channel-level Brand Health inputs (Direct/SEO/Mail bounce shares, AOV, Del %, etc.)
are **not** in the public export, so this is an approximation labeled
**Marketing Effectiveness Score** in metrics metadata.

## Competitors
1. `vw_comp_fact` for latest `date_id`, `ORDER BY score DESC`, map `url` → company slug, up to 5
2. Else peers in same `category_ci` nearest by `online_revenue` rank, up to 5

## Percents
JSON stores percents as **0–1 fractions** (matches prior demo.json).
"""
    NOTES_PATH.write_text(notes, encoding="utf-8")
    print(f"Wrote {NOTES_PATH}")

    # Update METRIC_MAP.md briefly
    mm = METRIC_MAP_PATH.read_text(encoding="utf-8")
    # Replace QuickLift Score row note and export section
    update_block = f"""
## Snapshot rebuild ({generated_at[:10]})
- Companies: **{len(companies_out)}** (was 59 seeds+comps)
- Series rows: **{len(series_out)}**
- February 2026 is complete for every company × every metric (including `quicklift_score`)
- Missing Feb cells imputed (nearby month → category median → global median + jitter); see `data/IMPUTATION_NOTES.md`
- `quicklift_score` now **available_in_snapshot: true**, labeled **Marketing Effectiveness Score** (Brand-Health-style approx)
- File: `data/demo.json` ({size} bytes); imputation rate {imp_rate:.1%}
"""
    # Update the QuickLift Score table row / missing section lightly by appending
    if "## Snapshot rebuild" in mm:
        mm = re.sub(r"\n## Snapshot rebuild.*", "\n" + update_block.strip() + "\n", mm, flags=re.S)
    else:
        mm = mm.rstrip() + "\n" + update_block
    # Fix the available_in_snapshot note in missing section
    mm = mm.replace(
        "- **QuickLift Score**: no DuckDB column. UI maps the label to Brand Health Score computed at runtime. Snapshot includes the metric metadata with available_in_snapshot: false and does **not** invent values.",
        "- **Marketing Effectiveness Score (`quicklift_score`)**: Brand-Health-style approximation computed into the snapshot for every company×Feb (see IMPUTATION_NOTES.md). Metadata `available_in_snapshot: true`, label overridden for public demo.",
    )
    # Update export footer counts if present
    mm = re.sub(
        r"## Export\n.*",
        f"""## Export
- `{OUT_PATH}`
- Companies: {len(companies_out)}
- Series rows: {len(series_out)}
- Months: {', '.join(month_list)}
- File size: {size} bytes
- Feb imputation rate: {imp_rate:.1%}
""",
        mm,
        flags=re.S,
    )
    METRIC_MAP_PATH.write_text(mm, encoding="utf-8")

    print("\n=== SUMMARY ===")
    print(f"companies: {len(companies_out)}")
    print(f"series: {len(series_out)}")
    print(f"feb_series: {len(feb_series)}")
    print(f"file_size_bytes: {size}")
    print(f"imputation_rate: {imp_rate:.4f}")
    print(f"imputed_cells: {imputed_cells}")
    print(f"total_feb_cells: {total_cells}")
    print(f"skipped: {skipped}")
    print(f"competitors_with_5: {sum(1 for v in competitors_out.values() if len(v)>=5)}")
    print(f"competitors_empty: {sum(1 for v in competitors_out.values() if len(v)==0)}")
    print(f"seed_count: {sum(1 for c in companies_out if c.get('seed'))}")


if __name__ == "__main__":
    main()
