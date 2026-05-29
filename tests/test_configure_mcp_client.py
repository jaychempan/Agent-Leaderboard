import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIGURE_SCRIPT = ROOT / "scripts" / "configure_mcp_client.py"
COMMAND_PATH = "/tmp/skills-discovery-mcp"


class ConfigureMcpClientTests(unittest.TestCase):
    def run_configure(self, home: Path, *clients: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "python3",
                str(CONFIGURE_SCRIPT),
                "--home",
                str(home),
                "--command",
                COMMAND_PATH,
                "--clients",
                ",".join(clients),
            ],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_configures_codex_toml_without_removing_existing_servers(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = home / ".codex" / "config.toml"
            config.parent.mkdir()
            config.write_text(
                '[mcp_servers.existing]\nurl = "http://127.0.0.1:8765/mcp"\n',
                encoding="utf-8",
            )

            result = self.run_configure(home, "codex")

            self.assertEqual(result.returncode, 0, result.stderr)
            text = config.read_text(encoding="utf-8")
            self.assertIn("[mcp_servers.existing]", text)
            self.assertIn("[mcp_servers.skills-discovery]", text)
            self.assertIn(f'command = "{COMMAND_PATH}"', text)
            self.assertTrue(list(config.parent.glob("config.toml.bak-*")))

    def test_configures_claude_desktop_json_and_preserves_preferences(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = home / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
            config.parent.mkdir(parents=True)
            config.write_text(json.dumps({"preferences": {"menuBarEnabled": False}}), encoding="utf-8")

            result = self.run_configure(home, "claude")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(config.read_text(encoding="utf-8"))
            self.assertEqual(payload["preferences"]["menuBarEnabled"], False)
            self.assertEqual(payload["mcpServers"]["skills-discovery"]["command"], COMMAND_PATH)
            self.assertTrue(list(config.parent.glob("claude_desktop_config.json.bak-*")))

    def test_configures_cursor_mcp_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)

            result = self.run_configure(home, "cursor")

            self.assertEqual(result.returncode, 0, result.stderr)
            config = home / ".cursor" / "mcp.json"
            payload = json.loads(config.read_text(encoding="utf-8"))
            self.assertEqual(payload["mcpServers"]["skills-discovery"]["command"], COMMAND_PATH)

    def test_replaces_existing_skills_discovery_entries_idempotently(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            config = home / ".codex" / "config.toml"
            config.parent.mkdir()
            config.write_text(
                '[mcp_servers.skills-discovery]\ncommand = "/old/path"\nargs = ["old"]\n',
                encoding="utf-8",
            )

            first = self.run_configure(home, "codex")
            second = self.run_configure(home, "codex")

            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertEqual(second.returncode, 0, second.stderr)
            text = config.read_text(encoding="utf-8")
            self.assertEqual(text.count("[mcp_servers.skills-discovery]"), 1)
            self.assertIn(f'command = "{COMMAND_PATH}"', text)
            self.assertNotIn('args = ["old"]', text)

    def test_auto_only_configures_existing_client_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            codex = home / ".codex" / "config.toml"
            codex.parent.mkdir()
            codex.write_text('model = "gpt-5"\n', encoding="utf-8")

            result = self.run_configure(home, "auto")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("[mcp_servers.skills-discovery]", codex.read_text(encoding="utf-8"))
            self.assertFalse((home / ".cursor" / "mcp.json").exists())

    def test_auto_configures_codex_when_codex_home_exists_without_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            (home / ".codex").mkdir()

            result = self.run_configure(home, "auto")

            self.assertEqual(result.returncode, 0, result.stderr)
            config = home / ".codex" / "config.toml"
            self.assertTrue(config.exists())
            self.assertIn("[mcp_servers.skills-discovery]", config.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
