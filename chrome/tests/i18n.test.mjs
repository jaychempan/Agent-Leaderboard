import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BOARDS, UC_EN, CAT_EN} from '../taxonomy.mjs';
import {setLocale, t, localizedCategory, useLabel, boardLabel, MESSAGES_EN} from '../i18n.mjs';

test('all bundled Chinese categories and use cases have English website labels', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../data/catalog.json', import.meta.url)));
  for (const board of Object.values(BOARDS)) {
    assert.ok(board.labelEn);
    for (const label of Object.values(board.categories)) if (/\p{Script=Han}/u.test(label)) assert.ok(CAT_EN[label], label);
  }
  for (const use of new Set(catalog.items.flatMap(item => item.use_cases))) {
    if (/\p{Script=Han}/u.test(use)) assert.ok(UC_EN[use], use);
  }
});
test('static interface and interpolated messages translate both ways', () => {
  const html = fs.readFileSync(new URL('../panel.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/>([^<>]+)</g)) {
    const label = match[1].trim();
    if (/\p{Script=Han}/u.test(label)) assert.ok(MESSAGES_EN[label], label);
  }
  setLocale('en');
  assert.equal(t('已选 {count} 项用途', {count: 2}), '2 uses selected');
  assert.equal(localizedCategory('mcp', 'database'), 'Database');
  assert.equal(useLabel('数据库连接'), 'Database');
  assert.equal(boardLabel('mcp'), 'MCP Servers');
  setLocale('zh-CN');
  assert.equal(localizedCategory('mcp', 'database'), '数据库');
  assert.equal(t('已选 {count} 项用途', {count: 2}), '已选 2 项用途');
});
