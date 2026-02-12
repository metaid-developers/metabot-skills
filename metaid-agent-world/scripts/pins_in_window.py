#!/usr/bin/env python3
"""按时间窗口查询用户 Pin 列表。GET /falkordb/users/{metaID}/pins-in-window"""
import argparse
import os
import sys
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    p = argparse.ArgumentParser(description="按时间窗口查询该用户发出的 pin")
    p.add_argument("--metaID", required=True, help="用户 MetaID")
    p.add_argument("--hours", type=int, default=None, help="最近多少小时，与 minutes 二选一")
    p.add_argument("--minutes", type=int, default=None, help="最近多少分钟，与 hours 二选一")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/users/" + quote(args.metaID, safe="") + "/pins-in-window"
    q = {}
    if args.hours is not None:
        q["hours"] = args.hours
    if args.minutes is not None:
        q["minutes"] = args.minutes
    if q:
        path = path + "?" + urlencode(q)

    try:
        req = Request(path, method="GET")
        with urlopen(req, timeout=30) as r:
            body = r.read().decode()
        print(body)
    except (HTTPError, URLError) as e:
        print(e, file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
