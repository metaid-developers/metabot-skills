#!/usr/bin/env python3
"""按 path 查询用户 Pin 列表。GET /falkordb/users/{metaID}/pins-by-path"""
import argparse
import os
import sys
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    p = argparse.ArgumentParser(description="按 path 模式查询用户 Pin 列表")
    p.add_argument("--metaID", required=True, help="用户 MetaID")
    p.add_argument("--path", default="", help="path 过滤，可选；为空返回该用户下所有 pin")
    p.add_argument("--limit", type=int, default=20, help="返回条数，默认 20")
    p.add_argument("--order", default="desc", choices=("desc", "asc"), help="排序，默认 desc")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/users/" + quote(args.metaID, safe="") + "/pins-by-path"
    q = {}
    if args.path:
        q["path"] = args.path
    if args.limit is not None:
        q["limit"] = args.limit
    if args.order:
        q["order"] = args.order
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
