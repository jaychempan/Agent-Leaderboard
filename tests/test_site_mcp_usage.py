import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
SHARED_JS = ROOT / "src" / "shared.js"


class SiteMcpUsageTests(unittest.TestCase):
    def test_homepage_has_mcp_usage_mount(self):
        html = INDEX.read_text(encoding="utf-8")

        self.assertIn('id="mcpUsage"', html)

    def test_mcp_usage_promotes_one_command_install_and_client_config(self):
        js = SHARED_JS.read_text(encoding="utf-8")

        self.assertIn("scripts/install.sh", js)
        self.assertIn("curl -fsSL", js)
        self.assertIn('"command": "skills-discovery-mcp"', js)
        self.assertIn("scripts/uninstall.sh", js)


if __name__ == "__main__":
    unittest.main()
