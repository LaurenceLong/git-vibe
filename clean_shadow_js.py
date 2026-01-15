#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
递归删除：当同目录下存在同名 .ts 或 .tsx 时，删除对应的 .js 文件
例如：
  src/foo/bar.ts  存在 -> 删除 src/foo/bar.js（如果存在）
  src/foo/baz.tsx 存在 -> 删除 src/foo/baz.js（如果存在）

支持：
  --dry-run   仅打印将删除的文件，不实际删除
  --root      指定扫描根目录（默认当前目录）
  --ignore    忽略目录名（可多个），默认忽略 node_modules、dist、build、out、.git
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path


DEFAULT_IGNORE_DIRS = {".git", "node_modules", "dist", "build", "out", ".next", ".turbo"}


def should_ignore_dir(dir_path: Path, ignore_names: set[str]) -> bool:
    # 只按目录名忽略（简单可靠）
    return dir_path.name in ignore_names


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove .js files that have same-name .ts/.tsx siblings.")
    parser.add_argument("--root", default=".", help="Root directory to scan (default: current directory)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be deleted without deleting")
    parser.add_argument(
        "--ignore",
        action="append",
        default=[],
        help="Directory name to ignore (can be specified multiple times)",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    ignore_names = set(DEFAULT_IGNORE_DIRS) | set(args.ignore)

    removed = 0
    scanned_dirs = 0

    # 用 os.walk 便于就地剪枝忽略目录
    for dirpath, dirnames, filenames in os.walk(root):
        dir_path = Path(dirpath)
        scanned_dirs += 1

        # 剪枝：从遍历列表中移除要忽略的目录名
        dirnames[:] = [d for d in dirnames if d not in ignore_names]

        # 为快速查找构建集合
        name_set = set(filenames)

        # 找到目录内所有 .ts/.tsx，看看是否存在对应 .js
        for fname in filenames:
            if fname.endswith(".ts") or fname.endswith(".tsx"):
                stem = fname.rsplit(".", 1)[0]
                js_name = f"{stem}.js"
                if js_name in name_set:
                    js_path = dir_path / js_name
                    if args.dry_run:
                        print(f"[dry-run] delete: {js_path}")
                    else:
                        try:
                            js_path.unlink()
                            print(f"deleted: {js_path}")
                        except FileNotFoundError:
                            # 可能并发/软链接/权限等导致，忽略即可
                            pass
                    removed += 1

    if args.dry_run:
        print(f"\nDone (dry-run). scanned_dirs={scanned_dirs}, would_remove={removed}")
    else:
        print(f"\nDone. scanned_dirs={scanned_dirs}, removed={removed}")
        os.system(f"npx prettier {root} --write")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())