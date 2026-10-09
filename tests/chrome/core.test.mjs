import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compactCatalog, prepareCatalog, searchCatalog, includeFavorites, favoriteRecord, repoURL, BOARDS} from '../../chrome/core.mjs';

const item = (name, extra = {}) => ({full_name: name, source_type: 'skill', description: 'browser 浏览器自动化',
  platforms: ['codex'], topics: ['testing'], use_cases: ['开发工具'], language: 'TypeScript', stars: 200,
  updated_at: '2026-10-01T00:00:00Z', ...extra});
const payload = items => ({meta: {updated_at: '2026-10-09T00:00:00Z'}, items});
const repos = prepareCatalog(compactCatalog(payload([
  item('team/browser', {stars: 100}), item('team/browser', {source_type: 'mcp', stars: 300, platforms: ['claude']}),
  item('other/tool', {stars: 10000, description: 'browser helper', language: 'Python', updated_at: '2026-10-08T00:00:00Z'}),
  item('team/unrelated', {description: 'nothing relevant', platforms: [], topics: []}),
])));
test('merges duplicate repositories but preserves all categories and platforms', () => {
  assert.equal(repos.length, 3);
  assert.deepEqual(repos[0].sources, ['skill', 'mcp']);
  assert.deepEqual(repos[0].platforms, ['codex', 'claude']);
  assert.equal(repos[0].stars, 300);
});
test('keyword relevance precedes popularity; all words must match; Chinese supported', () => {
  assert.equal(searchCatalog(repos, {query: 'browser'})[0].full_name, 'team/browser');
  assert.equal(searchCatalog(repos, {query: 'browser', sort: 'stars'})[0].full_name, 'other/tool');
  assert.equal(searchCatalog(repos, {query: '浏览器 codex'}).length, 1);
  assert.equal(searchCatalog(repos, {query: 'browser nonexistent'}).length, 0);
  assert.equal(searchCatalog(repos, {query: 'ＢＲＯＷＳＥＲ'})[0].full_name, 'team/browser');
});
test('combines category, platform, language, stars and date sorting', () => {
  assert.deepEqual(searchCatalog(repos, {source: 'mcp', platform: 'claude', minStars: 200}).map(r => r.full_name), ['team/browser']);
  assert.equal(searchCatalog(repos, {language: 'Python', minStars: 20000}).length, 0);
  assert.equal(searchCatalog(repos, {sort: 'recent'})[0].full_name, 'other/tool');
});
test('favorites survive catalog removal, are deduplicated, and remain searchable', () => {
  const favorites = {'team/browser': favoriteRecord(repos[0])};
  assert.equal(includeFavorites(repos, favorites).length, 3);
  const remaining = includeFavorites(repos.slice(1), favorites);
  assert.equal(searchCatalog(remaining, {favoritesOnly: true, favorites, query: 'browser'})[0].full_name, 'team/browser');
});
test('rejects malformed remote indexes and unsafe names, never uses remote URLs', () => {
  for (const data of [null, {}, payload([]), payload([item('javascript:alert(1)')]), payload([item('owner/repo', {source_type: '__proto__'})])]) {
    assert.throws(() => compactCatalog(data));
  }
  const safe = compactCatalog(payload([item('owner/repo', {url: 'javascript:alert(1)', stars: -1})]));
  assert.equal(repoURL(safe.items[0]), 'https://github.com/owner/repo');
  assert.equal(safe.items[0].stars, 0);
  assert.equal(safe.items[0].url, undefined);
});
test('current project index supports every board with a bounded cache footprint', () => {
  const data = compactCatalog(JSON.parse(fs.readFileSync(new URL('../../data/discovery_index.json', import.meta.url))));
  const all = prepareCatalog(data);
  assert.ok(all.length > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(data)) < 8 * 1024 * 1024);
  for (const source of ['skill', 'mcp', 'prompt', 'framework', 'auto_research']) assert.ok(searchCatalog(all, {source}).length);
  assert.equal(all.length, new Set(data.items.map(item => item.full_name.toLowerCase())).size);
});

test('every website category and two-use-case combination produces the same repositories', () => {
  const all = prepareCatalog(compactCatalog(JSON.parse(fs.readFileSync(new URL('../../data/discovery_index.json', import.meta.url)))));
  const files = {skill: 'data', mcp: 'mcp_data', prompt: 'prompts_data', framework: 'frameworks_data', auto_research: 'auto_research_data'};
  const names = rows => [...new Set(rows.map(r => r.full_name.toLowerCase()))].sort();
  for (const [source, file] of Object.entries(files)) {
    const website = JSON.parse(fs.readFileSync(new URL(`../../data/${file}.json`, import.meta.url)));
    assert.deepEqual(BOARDS[source].categories, Object.fromEntries(Object.entries(website.categories).map(([key, meta]) => [key, meta.label])));
    for (const category of Object.keys(website.categories)) {
      const expected = website.repos.filter(r => (r.categories || [r.category]).includes(category));
      assert.deepEqual(names(searchCatalog(all, {source, category: `${source}:${category}`})), names(expected), `${source}/${category}`);
    }
    const useCases = Object.keys(website.use_case_stats).slice(0, 2);
    const expected = website.repos.filter(r => useCases.every(uc => r.use_cases.includes(uc)));
    assert.deepEqual(names(searchCatalog(all, {source, useCases})), names(expected), `${source} AND use cases`);
    const now = Date.parse('2026-10-09T12:00:00Z');
    const recent = website.repos.filter(r => Date.parse(r.updated_at) >= now - 30 * 86400000 && r.stars >= 1000);
    assert.deepEqual(names(searchCatalog(all, {source, maxDays: 30, minStars: 1000, now})), names(recent), `${source} recent and stars`);
  }
});

test('categories and uses from another board cannot leak through a merged repository', () => {
  const all = prepareCatalog(compactCatalog(payload([
    item('team/shared', {category: 'general', source_type: 'mcp', use_cases: ['搜索'], stars: 50}),
    item('team/shared', {category: 'general', source_type: 'framework', use_cases: ['流程编排'], stars: 5000}),
  ])));
  assert.equal(searchCatalog(all, {source: 'mcp', category: 'framework:general'}).length, 0);
  assert.equal(searchCatalog(all, {source: 'mcp', useCases: ['流程编排']}).length, 0);
  assert.equal(searchCatalog(all, {source: 'mcp', minStars: 1000}).length, 0);
  assert.equal(searchCatalog(all, {source: 'framework', category: 'framework:general', useCases: ['流程编排']}).length, 1);
  const favorites = {'team/shared': favoriteRecord(all[0])};
  assert.equal(searchCatalog(includeFavorites([], favorites), {source: 'mcp', category: 'mcp:general'}).length, 1);
});
