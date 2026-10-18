#!/usr/bin/env python3
"""Build observed star growth from daily snapshots; no network requests required."""
import argparse
import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "skills": "data.json", "mcp": "mcp_data.json",
    "frameworks": "frameworks_data.json", "prompts": "prompts_data.json",
    "research": "auto_research_data.json",
}
WINDOWS = (1, 7, 30)


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def snapshot(payload):
    return {"updated_at": payload["meta"]["updated_at"],
            "stars": {str(repo["id"]): repo["stars"] for repo in payload["repos"]}}


def retain_snapshots(snapshots, current):
    """Keep the latest observation per UTC day, bounded to 40 days."""
    end = timestamp(current["updated_at"])
    days = {}
    for item in [*snapshots, current]:
        dt = timestamp(item["updated_at"])
        if end - timedelta(days=40) <= dt <= end:
            key = dt.date().isoformat()
            if key not in days or dt > timestamp(days[key]["updated_at"]):
                days[key] = item
            elif dt == timestamp(days[key]["updated_at"]):
                days[key] = item
    return [days[key] for key in sorted(days)]


def build_source(current, history):
    end = timestamp(current["updated_at"])
    windows = {}
    for days in WINDOWS:
        target = (end - timedelta(days=days)).date()
        # Require the actual target date. Never silently substitute a shorter window.
        baseline = next((s for s in history if timestamp(s["updated_at"]).date() == target), None)
        deltas = {}
        if baseline:
            for repo_id, stars in current["stars"].items():
                before = baseline["stars"].get(repo_id)
                if before is not None:
                    deltas[repo_id] = stars - before
        windows[str(days)] = {
            "baseline_at": baseline["updated_at"] if baseline else None,
            "deltas": deltas,
        }
    return {"updated_at": current["updated_at"], "windows": windows}


def git_snapshots(root, filename, current):
    """One-time bootstrap from committed source data, using data timestamps."""
    since = (timestamp(current["updated_at"]) - timedelta(days=42)).date().isoformat()
    path = f"data/{filename}"
    commits = subprocess.check_output(
        ["git", "log", "--format=%H", f"--since={since}", "--", path], cwd=root, text=True
    ).splitlines()
    result = []
    for commit in commits:
        raw = subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=root, text=True)
        result.append(snapshot(json.loads(raw)))
    return result


def build(root=ROOT, from_git=False):
    data_dir = root / "data"
    history_path = data_dir / "star_history.json"
    history = json.loads(history_path.read_text()) if history_path.exists() else {"sources": {}}
    output = {"version": 1, "sources": {}}
    for source, filename in SOURCES.items():
        current = snapshot(json.loads((data_dir / filename).read_text()))
        previous = history["sources"].get(source, [])
        if from_git:
            previous = [*git_snapshots(root, filename, current), *previous]
        kept = retain_snapshots(previous, current)
        history["sources"][source] = kept
        output["sources"][source] = build_source(current, kept)
    # History stays out of the browser payload; only compact deltas are shipped.
    history_path.write_text(json.dumps(history, separators=(",", ":")) + "\n")
    payload = json.dumps(output, separators=(",", ":"))
    (data_dir / "trends.json").write_text(payload + "\n")
    (data_dir / "trends.js").write_text("window.TRENDS_DATA=" + payload + ";\n")
    index = root / "index.html"
    if index.exists():
        version = max(timestamp(s["updated_at"]) for s in output["sources"].values()).strftime("%Y%m%d%H%M")
        html = re.sub(r'data/trends\.js\?v=[^"\s]+', f'data/trends.js?v={version}', index.read_text())
        for source, filename in SOURCES.items():
            js_name = filename.replace(".json", ".js")
            source_version = timestamp(output["sources"][source]["updated_at"]).strftime("%Y%m%d%H%M")
            html = re.sub(r'data/' + re.escape(js_name) + r'\?v=[^"\s]+', f'data/{js_name}?v={source_version}', html)
        index.write_text(html)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-git", action="store_true", help="Bootstrap history from local Git commits")
    args = parser.parse_args()
    result = build(from_git=args.from_git)
    for source, data in result["sources"].items():
        print(source, {days: len(window["deltas"]) for days, window in data["windows"].items()})
