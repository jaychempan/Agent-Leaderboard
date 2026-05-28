#!/usr/bin/env python3
from pathlib import Path
import sys

project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(project_root))

from mcp.skills_discovery.index import build_discovery_index, write_index_files


def main() -> None:
    index = build_discovery_index(project_root)
    write_index_files(index, project_root / "data")
    print(f"Wrote {index['meta']['total']} discovery records")


if __name__ == "__main__":
    main()
