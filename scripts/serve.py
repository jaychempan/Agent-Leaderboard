#!/usr/bin/env python3
"""Local site preview with persistent daily and cumulative visit counts."""

import argparse
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
STAT_TIMEZONE = timezone(timedelta(hours=8))


class VisitStore:
    def __init__(self, database):
        self.database = Path(database)
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS daily_visits "
                "(day TEXT PRIMARY KEY, views INTEGER NOT NULL)"
            )

    def counts(self, *, increment=False, now=None):
        day = (now or datetime.now(STAT_TIMEZONE)).astimezone(STAT_TIMEZONE).date().isoformat()
        with sqlite3.connect(self.database, timeout=10) as connection:
            connection.execute("BEGIN IMMEDIATE" if increment else "BEGIN")
            if increment:
                connection.execute(
                    "INSERT INTO daily_visits(day, views) VALUES (?, 1) "
                    "ON CONFLICT(day) DO UPDATE SET views = views + 1", (day,)
                )
            row = connection.execute("SELECT views FROM daily_visits WHERE day = ?", (day,)).fetchone()
            total = connection.execute("SELECT COALESCE(SUM(views), 0) FROM daily_visits").fetchone()[0]
        return {"date": day, "timezone": "Asia/Shanghai", "today": row[0] if row else 0,
                "total": total, "scope": "local"}


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, store, directory, **kwargs):
        self.store = store
        super().__init__(*args, directory=str(directory), **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/visits":
            self.send_counts(increment=False)
        else:
            super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/visits":
            self.send_error(404)
            return
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{self.headers.get('Host')}":
            self.send_error(403)
            return
        self.send_counts(increment=True)

    def send_counts(self, *, increment):
        try:
            body = json.dumps(self.store.counts(increment=increment)).encode()
        except sqlite3.Error:
            self.send_error(503, "Local visit database unavailable")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_head(self):
        # Keep the local counter database and repository metadata out of HTTP.
        parts = Path(unquote(urlsplit(self.path).path)).parts
        if any(part.startswith(".") for part in parts):
            self.send_error(403)
            return None
        return super().send_head()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    store = VisitStore(ROOT / ".local" / "visits.sqlite3")
    handler = partial(PreviewHandler, store=store, directory=ROOT)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Local website: http://127.0.0.1:{args.port}/", flush=True)
    print("Local statistics only; daily counts use Asia/Shanghai.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
