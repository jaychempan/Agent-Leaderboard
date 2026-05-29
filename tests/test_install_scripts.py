import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSTALL_SCRIPT = ROOT / "scripts" / "install.sh"
UNINSTALL_SCRIPT = ROOT / "scripts" / "uninstall.sh"
README = ROOT / "README.md"
README_ZH = ROOT / "README.zh.md"


class InstallScriptTests(unittest.TestCase):
    def test_install_and_uninstall_scripts_have_valid_bash_syntax(self):
        for script in (INSTALL_SCRIPT, UNINSTALL_SCRIPT):
            with self.subTest(script=script.name):
                self.assertTrue(script.exists(), f"{script} should exist")
                result = subprocess.run(
                    ["bash", "-n", str(script)],
                    cwd=ROOT,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_install_script_creates_isolated_runtime_and_command_wrapper(self):
        text = INSTALL_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("set -euo pipefail", text)
        self.assertIn("https://github.com/jaychempan/Agent-Leaderboard.git", text)
        self.assertIn("SKILLS_DISCOVERY_REPO_URL", text)
        self.assertIn("SKILLS_DISCOVERY_REF", text)
        self.assertIn("SKILLS_DISCOVERY_INSTALL_DIR", text)
        self.assertIn("SKILLS_DISCOVERY_BIN_DIR", text)
        self.assertIn(".local/share/skills-discovery-mcp", text)
        self.assertIn(".local/bin", text)
        self.assertIn("command -v git", text)
        self.assertIn("command -v python3", text)
        self.assertIn("python3 -m venv", text)
        self.assertIn("skills-discovery-mcp", text)
        self.assertIn("mcp.skills_discovery.server", text)

    def test_uninstall_script_removes_matching_install_dir_and_wrapper(self):
        text = UNINSTALL_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("set -euo pipefail", text)
        self.assertIn("SKILLS_DISCOVERY_INSTALL_DIR", text)
        self.assertIn("SKILLS_DISCOVERY_BIN_DIR", text)
        self.assertIn(".local/share/skills-discovery-mcp", text)
        self.assertIn(".local/bin", text)
        self.assertIn("skills-discovery-mcp", text)
        self.assertIn("rm -rf", text)

    def test_readmes_document_one_command_install_and_mcp_config(self):
        readme = README.read_text(encoding="utf-8")
        readme_zh = README_ZH.read_text(encoding="utf-8")

        for text in (readme, readme_zh):
            with self.subTest(readme=text[:20]):
                self.assertIn("scripts/install.sh", text)
                self.assertIn("scripts/uninstall.sh", text)
                self.assertIn("skills-discovery-mcp", text)
                self.assertIn('"command": "skills-discovery-mcp"', text)


if __name__ == "__main__":
    unittest.main()
