import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
SHARED_JS = ROOT / "src" / "shared.js"
MCP_QUICK_USE_ZH = ROOT / "docs" / "mcp-quick-use.zh.md"


class SiteMcpUsageTests(unittest.TestCase):
    def test_homepage_has_mcp_usage_mount(self):
        html = INDEX.read_text(encoding="utf-8")

        self.assertIn('id="mcpUsage"', html)

    def test_homepage_cache_busts_shared_assets(self):
        html = INDEX.read_text(encoding="utf-8")

        self.assertRegex(html, r'src/shared\.css\?v=\d+')
        self.assertRegex(html, r'src/shared\.js\?v=\d+')

    def test_mcp_usage_promotes_one_command_install_without_manual_config_block(self):
        js = SHARED_JS.read_text(encoding="utf-8")

        self.assertIn("scripts/install.sh", js)
        self.assertIn("curl -fsSL", js)
        self.assertIn("SKILLS_DISCOVERY_CONFIGURE_CLIENTS", js)
        self.assertNotIn("scripts/uninstall.sh", js)
        self.assertNotIn("clientConfig", js)
        self.assertNotIn("mcp-config", js)
        self.assertNotIn("mcp-usage-side", js)

    def test_homepage_has_collapsed_usage_examples_linking_to_quick_doc(self):
        js = SHARED_JS.read_text(encoding="utf-8")

        self.assertIn("<details", js)
        self.assertIn("使用示例", js)
        self.assertIn("docs/mcp-quick-use.zh.md", js)
        self.assertIn("codex mcp list", js)
        self.assertIn("codex exec", js)

    def test_quick_use_doc_has_simple_codex_examples(self):
        text = MCP_QUICK_USE_ZH.read_text(encoding="utf-8")

        self.assertIn("# MCP 快速使用", text)
        self.assertIn("codex mcp list", text)
        self.assertIn("skills-discovery", text)
        self.assertIn("Claude code writing skills", text)


if __name__ == "__main__":
    unittest.main()
