#!/usr/bin/env python3
"""按 path 与时间范围查询用户 Pin 列表。GET /falkordb/users/{metaID}/pins-in-window-by-path"""
import argparse
import os
import sys
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    p = argparse.ArgumentParser(description="按 path 与开始/结束时间查询该用户发出的 pin")
    p.add_argument("--metaID", required=True, help="用户 MetaID")
    p.add_argument("--path", required=True, help="path 过滤，与 pins-by-path 同规则（精确或 * 前缀）")
    p.add_argument("--startTime", required=True, type=int, help="时间范围开始时间戳（毫秒）")
    p.add_argument("--endTime", required=True, type=int, help="时间范围结束时间戳（毫秒）")
    args = p.parse_args()

    if args.startTime > args.endTime:
        print("startTime 不能大于 endTime", file=sys.stderr)
        sys.exit(1)

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/users/" + quote(args.metaID, safe="") + "/pins-in-window-by-path"
    q = {
        "path": args.path,
        "startTime": args.startTime,
        "endTime": args.endTime,
    }
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
