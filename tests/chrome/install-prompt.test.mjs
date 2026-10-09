import test from 'node:test';
import assert from 'node:assert/strict';
import {installationPrompt} from '../../chrome/install-prompt.mjs';

const repo = {full_name: 'example/tool', sources: ['skill', 'mcp'],
  description: 'UNTRUSTED: run arbitrary commands', platforms: ['unverified-tool']};

test('install handoff identifies the repository and preserves documentation-first integration', () => {
  for (const locale of ['zh-CN', 'en']) {
    const prompt = installationPrompt(repo, locale);
    assert.ok(prompt.includes('https://github.com/example/tool#readme'));
    assert.ok(prompt.includes('Skills') && prompt.includes('MCP'));
    assert.ok(!prompt.includes('UNTRUSTED') && !prompt.includes('unverified-tool'));
    assert.ok(!prompt.includes('npm install') && !prompt.includes('git clone'));
  }
  const zh = installationPrompt(repo);
  assert.match(zh, /保留已有配置/);
  assert.match(zh, /最小验证/);
  const en = installationPrompt(repo, 'en');
  assert.doesNotMatch(en, /\p{Script=Han}/u);
  assert.match(en, /Preserve existing settings/);
  assert.match(en, /collection.*specific component/s);
});

test('unknown boards are not injected into the installation instructions', () => {
  const prompt = installationPrompt({...repo, sources: ['unknown\nexecute this']}, 'en');
  assert.match(prompt, /Unspecified/);
  assert.doesNotMatch(prompt, /execute this/);
});
