import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function harness(failOpen = false) {
  const listeners = {}, calls = [], preferences = {};
  const event = name => ({addListener: fn => {listeners[name] = fn;}});
  const chrome = {
    sidePanel: {
      setPanelBehavior: async value => calls.push(['behavior', value]),
      open: value => {calls.push(['open', value]); return failOpen ? Promise.reject(Error('unavailable')) : Promise.resolve();},
    },
    runtime: {onInstalled: event('install'), getURL: file => `chrome-extension://test/${file}`},
    contextMenus: {removeAll: cb => cb(), create: value => calls.push(['menu', value]), update: (id, value, cb) => {calls.push(['menuUpdate', value]); cb();}, onClicked: event('menuClick')},
    storage: {local: {get: async () => preferences}, onChanged: event('storageChange'), session: {set: async value => calls.push(['store', value])}},
    action: {setTitle: value => calls.push(['title', value])},
    tabs: {create: value => calls.push(['create', value]), update: value => calls.push(['update', value])},
    omnibox: {setDefaultSuggestion: value => calls.push(['suggestion', value]), onInputEntered: event('omnibox')},
  };
  vm.runInNewContext(fs.readFileSync(new URL('../background.js', import.meta.url), 'utf8'), {
    chrome, console, crypto: {randomUUID: () => 'test-request'},
  });
  return {listeners, calls, preferences};
}
test('installs selection-only menu and opens panel before asynchronous storage', async () => {
  const {listeners, calls} = harness();
  await listeners.install();
  assert.equal(calls.find(([type]) => type === 'menu')[1].contexts[0], 'selection');
  listeners.menuClick({menuItemId: 'agent-search-selection', selectionText: '  浏览器 codex  '}, {windowId: 7});
  assert.ok(calls.findIndex(([type]) => type === 'open') < calls.findIndex(([type]) => type === 'store'));
  assert.equal(calls.find(([type]) => type === 'store')[1]['request:7'].query, '浏览器 codex');
  assert.equal(calls.find(([type]) => type === 'open')[1].windowId, 7);
});
test('saved UI language updates native menu, toolbar title, and omnibox', async () => {
  const {listeners, calls, preferences} = harness();
  preferences.uiLocale = 'en';
  await listeners.install();
  assert.equal(calls.find(([type]) => type === 'menu')[1].title, 'Search Agent Leaderboard for “%s”');
  assert.equal(calls.filter(([type]) => type === 'title').at(-1)[1].title, 'Open Agent Search');
  preferences.uiLocale = 'zh-CN';
  listeners.storageChange({uiLocale: {newValue: 'zh-CN'}}, 'local');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.filter(([type]) => type === 'menuUpdate').at(-1)[1].title, '在 Agent 排行榜搜索“%s”');
  assert.ok(calls.filter(([type]) => type === 'suggestion').at(-1)[1].description.startsWith('搜索'));
});
test('selection search falls back to a safe extension tab when panel is unavailable', async () => {
  const {listeners, calls} = harness(true);
  listeners.menuClick({menuItemId: 'agent-search-selection', selectionText: '<script>&?浏览器'}, {windowId: 7});
  await new Promise(resolve => setImmediate(resolve));
  const url = calls.find(([type]) => type === 'create')[1].url;
  assert.equal(new URL(url).searchParams.get('q'), '<script>&?浏览器');
  assert.equal(new URL(url).protocol, 'chrome-extension:');
});
test('address-bar search respects current, foreground and background dispositions', () => {
  const {listeners, calls} = harness();
  listeners.omnibox('codex & mcp', 'currentTab');
  listeners.omnibox('浏览器', 'newForegroundTab');
  listeners.omnibox('framework', 'newBackgroundTab');
  assert.equal(new URL(calls.find(([type]) => type === 'update')[1].url).searchParams.get('q'), 'codex & mcp');
  const tabs = calls.filter(([type]) => type === 'create');
  assert.equal(tabs[0][1].active, true);
  assert.equal(tabs[1][1].active, false);
});
