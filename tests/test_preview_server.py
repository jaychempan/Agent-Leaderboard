import importlib.util
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import partial
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("preview_server", ROOT / "scripts" / "serve.py")
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class VisitStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "visits.sqlite3"
        self.store = preview.VisitStore(self.path)

    def test_midnight_reset_persistence_and_read_without_increment(self):
        before = datetime(2026, 10, 20, 15, 59, tzinfo=timezone.utc)
        after = datetime(2026, 10, 20, 16, 0, tzinfo=timezone.utc)
        self.assertEqual(self.store.counts(now=before)["today"], 0)
        self.store.counts(increment=True, now=before)
        self.store.counts(increment=True, now=before)
        reopened = preview.VisitStore(self.path)
        self.assertEqual(reopened.counts(now=before)["today"], 2)
        rollover = reopened.counts(now=after)
        self.assertEqual(rollover["date"], "2026-10-21")
        self.assertEqual((rollover["today"], rollover["total"]), (0, 2))
        updated = reopened.counts(increment=True, now=after)
        self.assertEqual((updated["today"], updated["total"]), (1, 3))

    def test_concurrent_visits_are_not_lost(self):
        now = datetime(2026, 10, 20, 12, tzinfo=timezone.utc)
        with ThreadPoolExecutor(max_workers=8) as executor:
            list(executor.map(lambda _: self.store.counts(increment=True, now=now), range(40)))
        self.assertEqual(self.store.counts(now=now)["total"], 40)

    def test_visitors_deduplicate_across_days_and_restarts(self):
        before = datetime(2026, 10, 20, 15, 59, tzinfo=timezone.utc)
        after = datetime(2026, 10, 20, 16, 0, tzinfo=timezone.utc)
        self.store.counts(increment=True, now=before, visitor="browser-a")
        self.store.counts(increment=True, now=before, visitor="browser-a")
        reopened = preview.VisitStore(self.path)
        counts = reopened.counts(increment=True, now=after, visitor="browser-a")
        self.assertEqual((counts["today"], counts["visitors"]), (1, 1))
        counts = reopened.counts(increment=True, now=after, visitor="browser-b")
        self.assertEqual((counts["today"], counts["total"], counts["visitors"]), (2, 4, 2))


class PreviewHTTPTests(unittest.TestCase):
    def test_counts_api_static_files_and_database_protection(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "index.html").write_text("local preview")
            store = preview.VisitStore(root / ".local" / "visits.sqlite3")
            handler = partial(preview.PreviewHandler, store=store, directory=root)
            server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                def request(method, path, headers=None, body=None):
                    client = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
                    client.request(method, path, headers=headers or {}, body=body)
                    response = client.getresponse()
                    result = response.status, response.read()
                    client.close()
                    return result

                self.assertEqual(request("GET", "/"), (200, b"local preview"))
                status, body = request("POST", "/api/visits")
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body)["today"], 1)
                for _ in range(2):
                    status, body = request("GET", "/api/visits")
                    self.assertEqual(status, 200)
                    self.assertEqual(json.loads(body)["total"], 1)
                self.assertEqual(request("POST", "/api/visits", {"Origin": "https://elsewhere.example"})[0], 403)
                self.assertEqual(request("GET", "/.local/visits.sqlite3")[0], 403)
                self.assertEqual(request("GET", "/%2elocal/visits.sqlite3")[0], 403)
                identity = json.dumps({"visitor": "00000000-0000-4000-8000-000000000001"})
                for _ in range(2):
                    status, body = request("POST", "/api/visits", body=identity)
                    self.assertEqual(status, 200)
                    self.assertEqual(json.loads(body)["visitors"], 1)
                self.assertEqual(json.loads(body)["today"], 3)
                self.assertEqual(request("POST", "/api/visits", body='{"visitor":"invalid"}')[0], 400)
                self.assertEqual(request("POST", "/api/visits", body='[]')[0], 400)
            finally:
                server.shutdown()
                server.server_close()
                worker.join()


if __name__ == "__main__":
    unittest.main()
