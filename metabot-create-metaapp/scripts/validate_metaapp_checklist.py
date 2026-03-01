#!/usr/bin/env python3
"""
MetaApp Checklist Validator

Hard-gate validator for metabot-create-metaapp workflow.

Phases:
  - pregen: validate scaffold/baseline readiness and target project path policy
  - predeliver: validate generated project against SKILL.md hard constraints

Usage:
  python3 scripts/validate_metaapp_checklist.py --phase pregen --project ../MyMetaApp
  python3 scripts/validate_metaapp_checklist.py --phase predeliver --project ../MyMetaApp
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


MIN_REQUIRED_FILES = [
    "index.html",
    "app.css",
    "app.js",
    "idframework.js",
    "idconfig.js",
    "idutils.js",
    "bootstrap-stores.js",
    "app-env-compat.js",
    "idcomponents/id-connect-button.js",
    "commands/FetchUserCommand.js",
    "commands/CheckWebViewBridgeCommand.js",
    "commands/CheckBtcAddressSameAsMvcCommand.js",
]

MIN_REQUIRED_DIRS = [
    "commands",
    "idcomponents",
]

INDEX_REQUIRED_SNIPPETS = [
    "./bootstrap-stores.js",
    "./idconfig.js",
    "./idutils.js",
    "./idframework.js",
    "./idcomponents/id-connect-button.js",
    "./app.js",
    "./app-env-compat.js",
    "<id-connect-button",
]

APP_JS_REQUIRED_PATTERNS = [
    r"register\(\s*['\"]fetchUser['\"]\s*,\s*['\"]./commands/FetchUserCommand\.js['\"]\s*\)",
    r"register\(\s*['\"]checkWebViewBridge['\"]\s*,\s*['\"]./commands/CheckWebViewBridgeCommand\.js['\"]\s*\)",
    r"register\(\s*['\"]checkBtcAddressSameAsMvc['\"]\s*,\s*['\"]./commands/CheckBtcAddressSameAsMvcCommand\.js['\"]\s*\)",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def check_item(results: list[tuple[str, bool, str]], name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))


def print_results(results: list[tuple[str, bool, str]], phase: str) -> bool:
    print(f"\n=== MetaApp Checklist ({phase}) ===")
    all_ok = True
    for name, ok, detail in results:
        icon = "✅" if ok else "❌"
        print(f"{icon} {name}" + (f" - {detail}" if detail else ""))
        all_ok = all_ok and ok
    print("=== End Checklist ===\n")
    return all_ok


def get_repo_root(this_script: Path) -> Path:
    # .../metabot-create-metaapp/scripts/validate_metaapp_checklist.py
    # repo root = parent of metabot-create-metaapp
    return this_script.parent.parent.parent.resolve()


def get_skill_root(this_script: Path) -> Path:
    return this_script.parent.parent.resolve()


def validate_pregen(project_dir: Path, skill_root: Path, repo_root: Path) -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []

    # 1) target project location must be at repo root and sibling of metabot-create-metaapp
    check_item(
        results,
        "目标目录与 metabot-create-metaapp 同级",
        project_dir.parent.resolve() == repo_root,
        f"expected parent={repo_root}, got={project_dir.parent.resolve()}",
    )
    check_item(
        results,
        "目标目录不在 metabot-create-metaapp 内",
        not str(project_dir.resolve()).startswith(str(skill_root.resolve()) + "/"),
        f"project={project_dir.resolve()}",
    )

    # 2) baseline files exist
    baseline_files = [
        "templates/index.html",
        "templates/app.js",
        "templates/app.css",
        "templates/idframework.js",
        "templates/bootstrap-stores.js",
        "templates/app-env-compat.js",
        "idframework/idframework.js",
        "idframework/commands/FetchUserCommand.js",
        "idframework/idcomponents/id-connect-button.js",
        "references/MetaApp-Development-Guide.md",
    ]
    for rel in baseline_files:
        p = skill_root / rel
        check_item(results, f"基线文件存在: {rel}", p.exists(), str(p))

    return results


def file_equals(a: Path, b: Path) -> bool:
    return read_text(a) == read_text(b)


def validate_predeliver(project_dir: Path, skill_root: Path) -> list[tuple[str, bool, str]]:
    results: list[tuple[str, bool, str]] = []

    # 1) minimum file set
    for rel in MIN_REQUIRED_FILES:
        p = project_dir / rel
        check_item(results, f"存在必需文件: {rel}", p.is_file(), str(p))

    for rel in MIN_REQUIRED_DIRS:
        p = project_dir / rel
        check_item(results, f"存在必需目录: {rel}", p.is_dir(), str(p))

    # 2) index references and render
    index_path = project_dir / "index.html"
    if index_path.is_file():
        index_text = read_text(index_path)
        for snippet in INDEX_REQUIRED_SNIPPETS:
            check_item(results, f"index.html 包含: {snippet}", snippet in index_text)
    else:
        for snippet in INDEX_REQUIRED_SNIPPETS:
            check_item(results, f"index.html 包含: {snippet}", False, "index.html missing")

    # 3) app.js command registrations
    app_js = project_dir / "app.js"
    if app_js.is_file():
        app_text = read_text(app_js)
        for pat in APP_JS_REQUIRED_PATTERNS:
            check_item(results, f"app.js 注册命令: {pat}", re.search(pat, app_text) is not None)
    else:
        for pat in APP_JS_REQUIRED_PATTERNS:
            check_item(results, f"app.js 注册命令: {pat}", False, "app.js missing")

    # 4) login core must be aligned to idframework baseline
    compare_pairs = [
        ("idframework.js", "idframework/idframework.js"),
        ("commands/FetchUserCommand.js", "idframework/commands/FetchUserCommand.js"),
        ("idcomponents/id-connect-button.js", "idframework/idcomponents/id-connect-button.js"),
    ]
    for project_rel, baseline_rel in compare_pairs:
        p = project_dir / project_rel
        b = skill_root / baseline_rel
        same = p.is_file() and b.is_file() and file_equals(p, b)
        check_item(results, f"核心文件对齐: {project_rel}", same, f"baseline={baseline_rel}")

    # 5) prohibit runtime dependency by parent traversal
    disallow_refs = [
        "../metabot-create-metaapp/",
        "..\\metabot-create-metaapp\\",
        "/metabot-create-metaapp/",
    ]
    scanned_files = ["index.html", "app.js", "idframework.js"]
    scanned_files.extend(str(p.relative_to(project_dir)) for p in (project_dir / "commands").glob("*.js")) if (project_dir / "commands").is_dir() else None
    scanned_files.extend(str(p.relative_to(project_dir)) for p in (project_dir / "idcomponents").glob("*.js")) if (project_dir / "idcomponents").is_dir() else None

    found_bad_ref = False
    for rel in scanned_files:
        p = project_dir / rel
        if not p.is_file():
            continue
        text = read_text(p)
        if any(ref in text for ref in disallow_refs):
            found_bad_ref = True
            check_item(results, f"禁止上级运行依赖引用: {rel}", False, "found ../metabot-create-metaapp ref")
    if not found_bad_ref:
        check_item(results, "禁止上级运行依赖引用", True)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate MetaApp generation checklist.")
    parser.add_argument("--phase", choices=["pregen", "predeliver"], required=True, help="Checklist phase")
    parser.add_argument("--project", required=True, help="Target project directory (absolute or relative)")
    args = parser.parse_args()

    this_script = Path(__file__).resolve()
    skill_root = get_skill_root(this_script)
    repo_root = get_repo_root(this_script)
    project_dir = Path(args.project).resolve()

    if args.phase == "pregen":
        results = validate_pregen(project_dir, skill_root, repo_root)
        ok = print_results(results, "pregen")
        if not ok:
            print("❌ pregen checklist failed. Do NOT generate project until all checks pass.", file=sys.stderr)
            sys.exit(1)
        print("✅ pregen checklist passed.")
        return

    results = validate_predeliver(project_dir, skill_root)
    ok = print_results(results, "predeliver")
    if not ok:
        print("❌ predeliver checklist failed. Project is NOT eligible for delivery.", file=sys.stderr)
        sys.exit(1)
    print("✅ predeliver checklist passed.")


if __name__ == "__main__":
    main()
