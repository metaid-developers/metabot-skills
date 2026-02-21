#!/bin/bash
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/dist"
cd "$ROOT/skill-creator/scripts"
for skill in metabot-basic metabot-chat metabot-file; do
  python3 package_skill.py "$ROOT/$skill" "$ROOT/dist"
done
echo "Done. .skill files in $ROOT/dist"
