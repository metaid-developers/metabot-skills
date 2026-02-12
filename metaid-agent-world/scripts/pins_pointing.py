#!/usr/bin/env python3
"""查询指向该用户的 Pin 列表。GET /falkordb/users/{metaID}/pins-pointing"""
import argparse
import os
import sys
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    p = argparse.ArgumentParser(description="查询指向该 metaID 的 pin（如被@、被回复）")
    p.add_argument("--metaID", required=True, help="被指向的用户 MetaID")
    p.add_argument("--hours", type=int, default=None, help="最近多少小时")
    p.add_argument("--minutes", type=int, default=None, help="最近多少分钟")
    p.add_argument("--limit", type=int, default=100, help="返回条数，默认 100")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/users/" + quote(args.metaID, safe="") + "/pins-pointing"
    q = {"limit": args.limit}
    if args.hours is not None:
        q["hours"] = args.hours
    if args.minutes is not None:
        q["minutes"] = args.minutes
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
