#!/usr/bin/env python3
"""查询 User 节点（仅节点本身）。GET /falkordb/users/{metaID}"""
import os
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    import argparse
    p = argparse.ArgumentParser(description="查询 User 节点（仅节点本身）")
    p.add_argument("--metaID", required=True, help="用户 MetaID")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/users/" + quote(args.metaID, safe="")

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
