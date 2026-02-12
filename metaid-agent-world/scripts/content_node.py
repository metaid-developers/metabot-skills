#!/usr/bin/env python3
"""根据 pinID 查询 Content 节点及其关联。GET /falkordb/contents/{pinID}"""
import os
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

DEFAULT_BASE = os.environ.get("METAID_WORLD_BASE_URL", "https://www.metaweb.world/world-base/api/v1")


def main():
    import argparse
    p = argparse.ArgumentParser(description="根据 pinID 查询 Content 节点及其关联 User、PIN")
    p.add_argument("--pinID", required=True, help="PinID")
    args = p.parse_args()

    base = DEFAULT_BASE
    path = base.rstrip("/") + "/falkordb/contents/" + quote(args.pinID, safe="")

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
