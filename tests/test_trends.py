import json
import tempfile
import unittest
from pathlib import Path

from scripts.build_trends import SOURCES, build, build_source, retain_snapshots


class TrendTests(unittest.TestCase):
    def test_growth_uses_ids_and_never_treats_new_repos_as_zero(self):
        old = {"updated_at": "2026-10-10T06:00:00Z", "stars": {"1": 100, "2": 80, "3": 0}}
        now = {"updated_at": "2026-10-17T07:00:00Z", "stars": {"1": 150, "2": 70, "3": 10, "4": 900}}
        result = build_source(now, [old, now])["windows"]
        self.assertEqual(result["7"]["deltas"], {"1": 50, "2": -10, "3": 10})
        self.assertIsNone(result["1"]["baseline_at"])
        self.assertEqual(result["30"]["deltas"], {})

    def test_does_not_substitute_wrong_date_or_future_snapshot(self):
        now = {"updated_at": "2026-10-17T07:00:00Z", "stars": {"1": 200}}
        snapshots = [
            {"updated_at": "2026-10-09T07:00:00Z", "stars": {"1": 100}},
            {"updated_at": "2026-10-11T07:00:00Z", "stars": {"1": 150}},
            {"updated_at": "2026-10-18T07:00:00Z", "stars": {"1": 250}},
        ]
        kept = retain_snapshots(snapshots, now)
        self.assertEqual(len(kept), 3)
        self.assertIsNone(build_source(now, kept)["windows"]["7"]["baseline_at"])

    def test_daily_dedup_retention_and_idempotence(self):
        now = {"updated_at": "2026-10-17T07:00:00Z", "stars": {"1": 200}}
        snapshots = [
            {"updated_at": "2026-08-01T07:00:00Z", "stars": {"1": 10}},
            {"updated_at": "2026-10-16T07:00:00Z", "stars": {"1": 150}},
            {"updated_at": "2026-10-16T08:00:00Z", "stars": {"1": 160}},
        ]
        kept = retain_snapshots(snapshots, now)
        self.assertEqual(len(kept), 2)
        self.assertEqual(build_source(now, kept)["windows"]["1"]["deltas"]["1"], 40)
        self.assertEqual(retain_snapshots(kept, now), kept)

    def test_daily_build_accumulates_and_exports_browser_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data").mkdir()
            (root / "index.html").write_text(
                '<script src="../data/data.js?v=old"></script><script src="../data/trends.js?v=old"></script>')
            for day, stars in [(16, 100), (17, 130)]:
                for name in SOURCES.values():
                    payload = {"meta": {"updated_at": f"2026-10-{day}T06:00:00Z"},
                               "repos": [{"id": 123, "stars": stars}]}
                    (root / "data" / name).write_text(json.dumps(payload))
                result = build(root)
            for source in SOURCES:
                self.assertEqual(result["sources"][source]["windows"]["1"]["deltas"], {"123": 30})
            self.assertEqual(build(root), result)
            html = (root / "index.html").read_text()
            self.assertIn('../data/data.js?v=202610170600', html)
            self.assertIn('../data/trends.js?v=202610170600', html)
            js = (root / "data/trends.js").read_text()
            self.assertEqual(json.loads(js.removeprefix("window.TRENDS_DATA=").strip().removesuffix(";")), result)


if __name__ == "__main__":
    unittest.main()
