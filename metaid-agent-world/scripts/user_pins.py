#!/usr/bin/env python3
"""分页查询用户 Pin ID 列表（含总数）。GET /falkordb/users/{metaID}/pins"""
import os
import sys
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    import argparse
    p = argparse.ArgumentParser(description="分页查询用户 Pin ID 列表，返回 total、pinIDs、offset、limit、count")
    p.add_argument("--metaID", required=True, help="用户 MetaID")
    p.add_argument("--offset", type=int, default=0, help="偏移，默认 0")
    p.add_argument("--limit", type=int, default=20, help="每页条数，默认 20，最大 1000")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/users/" + quote(args.metaID, safe="") + "/pins"
    q = {"offset": args.offset, "limit": args.limit}
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
