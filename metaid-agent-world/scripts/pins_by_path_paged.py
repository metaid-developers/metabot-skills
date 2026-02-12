#!/usr/bin/env python3
"""按 path 分页查询全库 Pin 列表（不按用户）。GET /falkordb/pins-by-path-paged"""
import argparse
import os
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    p = argparse.ArgumentParser(description="按 path 分页查询全库 Pin 列表，不传 metaID")
    p.add_argument("--path", required=True, help="path 过滤，必填；查协议用 /protocols/metaprotocol")
    p.add_argument("--offset", type=int, default=0, help="偏移，默认 0")
    p.add_argument("--limit", type=int, default=20, help="每页条数，默认 20，最大 1000")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/pins-by-path-paged"
    q = {"path": args.path, "offset": args.offset, "limit": args.limit}
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
