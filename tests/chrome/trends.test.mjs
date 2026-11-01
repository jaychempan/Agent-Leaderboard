import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compactCatalog} from '../../chrome/core.mjs';
import {TRENDS_URL, compactTrends, rankTrends} from '../../chrome/trends.mjs';

const updatedAt = '2026-11-01T08:00:00.123456+00:00';
const baselineAt = '2026-10-31T08:00:00.654321+00:00';
const item = (id, stars, extra = {}) => ({source_id: id, full_name: `team/repo-${id}`, source_type: 'skill',
  description: 'browser 浏览器 tools', stars, platforms: ['codex'], topics: ['testing'], use_cases: ['开发工具'],
  categories: ['other'], language: 'TypeScript', updated_at: updatedAt, ...extra});
const catalog = (items, extra = {}) => compactCatalog({meta: {updated_at: '2026-11-01T09:00:00Z'},
  sources: {skill: {meta: {updated_at: updatedAt}}, mcp: {meta: {updated_at: updatedAt}}}, items, ...extra});
const rawHistory = (deltas = {}, extra = {}) => ({version: 1, sources: {skills: {updated_at: updatedAt,
  windows: {'1': {baseline_at: baselineAt, deltas}}}}, ...extra});
const history = deltas => compactTrends(rawHistory(deltas));

test('compacts real five-source history, preserves 1/7/30 day deltas and exact source timestamps', () => {
  const raw = JSON.parse(readFileSync(new URL('../../data/trends.json', import.meta.url)));
  const data = compactTrends(raw);
  assert.equal(TRENDS_URL, 'https://agentskills.media/data/trends.json');
  const sources = {skill: 'skills', mcp: 'mcp', prompt: 'prompts', framework: 'frameworks', auto_research: 'research'};
  assert.deepEqual(Object.keys(data.sources).sort(), Object.keys(sources).sort());
  for (const [extension, website] of Object.entries(sources)) {
    assert.equal(data.sources[extension].updated_at, raw.sources[website].updated_at);
    for (const days of [1, 7, 30]) assert.deepEqual(data.sources[extension].windows[days], raw.sources[website].windows[days]);
  }
  assert.deepEqual(compactTrends(data), data, 'cached compact history may be validated again');
});

test('all five boards and daily/weekly/monthly rankings match the website observations and tie rules', () => {
  const read = name => JSON.parse(readFileSync(new URL('../../data/' + name + '.json', import.meta.url)));
  const raw = read('trends'), data = compactTrends(raw), index = compactCatalog(read('discovery_index'));
  const sources = {skill: ['skills', 'data'], mcp: ['mcp', 'mcp_data'], prompt: ['prompts', 'prompts_data'],
    framework: ['frameworks', 'frameworks_data'], auto_research: ['research', 'auto_research_data']};
  for (const [source, [website, file]] of Object.entries(sources)) {
    const board = read(file);
    for (const days of [1, 7, 30]) {
      const window = raw.sources[website].windows[days];
      // Independently apply src/trends.js's website algorithm to raw board rows,
      // including duplicate names, rather than reusing the extension data path.
      const comparable = board.repos.flatMap(repo => {
        const delta = window.deltas[repo.id];
        if (!Number.isFinite(delta)) return [];
        return [{repo, delta, rate: repo.stars - delta > 0 ? delta / (repo.stars - delta) * 100 : null}];
      });
      const rising = comparable.filter(value => value.delta > 0);
      for (const sort of ['rate', 'delta']) {
        const expected = rising.filter(value => sort !== 'rate' || value.rate !== null).sort((a, b) =>
          (sort === 'rate' ? b.rate - a.rate : b.delta - a.delta) || b.delta - a.delta || b.repo.stars - a.repo.stars || a.repo.id - b.repo.id);
        const actual = rankTrends(index, data, {source, days, sort});
        assert.equal(actual.status, 'ready', `${source}/${days}/${sort}`);
        assert.equal(actual.comparableCount, comparable.length); assert.equal(actual.risingCount, rising.length);
        assert.equal(actual.net, comparable.reduce((sum, value) => sum + value.delta, 0));
        assert.equal(actual.baselineAt, window.baseline_at); assert.equal(actual.updatedAt, board.meta.updated_at);
        assert.deepEqual(actual.ranked.map(value => [value.repo.source_id, value.repo.stars, value.delta, value.rate]),
          expected.map(value => [value.repo.id, value.repo.stars, value.delta, value.rate]), `${source}/${days}/${sort}`);
        assert.ok(actual.ranked.every(value => value.repo.id === value.repo.source_id && value.repo.key && value.repo.search
          && value.repo.facets[source].stars === value.repo.stars && value.repo.sources.includes(source)));
      }
    }
  }
});

test('rejects mismatched or absent source times even if the global build time or parsed millisecond matches', () => {
  const data = history({1: 10}), valid = catalog([item(1, 100)]);
  const changed = structuredClone(valid); changed.sources.skill.updated_at = '2026-11-01T08:00:00.123457+00:00';
  assert.equal(Date.parse(changed.sources.skill.updated_at), Date.parse(updatedAt), 'the synthetic times differ below millisecond precision');
  assert.equal(rankTrends(changed, data).status, 'mismatch');
  const missing = catalog([item(1, 100)], {sources: {}, meta: {updated_at: updatedAt}});
  assert.equal(rankTrends(missing, data).status, 'mismatch');
  assert.deepEqual(rankTrends(missing, data).ranked, []);
  assert.equal(rankTrends(valid, data).status, 'ready');
});

test('missing history stays distinct from a valid observation window with no rising repositories', () => {
  const index = catalog([item(1, 100)]), data = history({1: -4});
  assert.equal(rankTrends(index, data, {days: 7}).status, 'missing_history');
  assert.equal(rankTrends(index, null).status, 'missing_history');
  const empty = compactTrends(rawHistory({}, {sources: {skills: {updated_at: updatedAt, windows: {}}}}));
  assert.equal(empty.sources.skill.updated_at, updatedAt);
  assert.equal(rankTrends(index, empty).baselineAt, null);
  const ready = rankTrends(index, data);
  assert.equal(ready.status, 'ready'); assert.equal(ready.comparableCount, 1);
  assert.equal(ready.risingCount, 0); assert.equal(ready.net, -4); assert.deepEqual(ready.ranked, []);
  const noBaseline = compactTrends(rawHistory({}, {sources: {skills: {updated_at: updatedAt,
    windows: {1: {baseline_at: null, deltas: {'1': 100}}}}}}));
  assert.equal(rankTrends(index, noBaseline).status, 'missing_history');
  assert.equal(rankTrends(index, noBaseline).net, 0, 'deltas with no baseline cannot invent observed growth');
});

test('zero baselines participate in delta rankings only; overview net includes declines', () => {
  const index = catalog([item(1, 100), item(2, 110), item(3, 95), item(4, 1)]), data = history({1: 100, 2: 10, 3: -5, 4: 2});
  const rate = rankTrends(index, data), delta = rankTrends(index, data, {sort: 'delta'});
  assert.equal(rate.comparableCount, 4); assert.equal(rate.risingCount, 3); assert.equal(rate.net, 107);
  assert.deepEqual(rate.ranked.map(value => value.repo.id), [2]);
  assert.deepEqual(delta.ranked.map(value => value.repo.id), [1, 2, 4]);
  assert.equal(delta.ranked[0].rate, null); assert.equal(delta.ranked[2].rate, null);
});

test('preserves same-name source observations instead of using another board IDs or merged star totals', () => {
  const index = catalog([item(1, 100, {full_name: 'team/shared'}), item(2, 200, {full_name: 'team/shared'}),
    item(99, 1000000, {full_name: 'team/shared', source_type: 'mcp', description: 'other-board-only'})]);
  const result = rankTrends(index, history({1: 10, 2: 20, 99: 999999}));
  assert.equal(result.comparableCount, 2); assert.equal(result.risingCount, 2); assert.equal(result.net, 30);
  assert.deepEqual(result.ranked.map(value => [value.repo.id, value.repo.stars]), [[2, 200], [1, 100]]);
  assert.ok(result.ranked.every(value => value.repo.facets.skill.stars === value.repo.stars && value.repo.sources.length === 1));
  assert.deepEqual(rankTrends(index, history({1: 10, 2: 20}), {query: 'other-board-only'}).ranked, []);
});

test('applies deterministic rate/delta ties and filters query text without changing whole-board overview totals', () => {
  const index = catalog([item(2, 110), item(1, 110), item(3, 220), item(4, 120, {description: 'different'})]);
  const data = history({1: 10, 2: 10, 3: 20, 4: 20});
  assert.deepEqual(rankTrends(index, data).ranked.map(value => value.repo.id), [4, 3, 1, 2]);
  assert.deepEqual(rankTrends(index, data, {sort: 'delta'}).ranked.map(value => value.repo.id), [3, 4, 1, 2]);
  const searched = rankTrends(index, data, {query: 'ＢＲＯＷＳＥＲ 浏览器'});
  assert.deepEqual(searched.ranked.map(value => value.repo.id), [3, 1, 2]);
  assert.equal(searched.comparableCount, 4); assert.equal(searched.risingCount, 4); assert.equal(searched.net, 60);
  assert.equal(rankTrends(index, data, {query: 'browser missingword'}).ranked.length, 0);
});

test('rejects malformed histories and strips unrelated remote metadata', () => {
  for (const value of [null, {}, {version: 2, sources: {}}, {version: 1, sources: []}, {version: 1, sources: {}}]) assert.throws(() => compactTrends(value));
  for (const [key, delta] of [['0', 1], ['01', 1], ['9007199254740992', 1], ['1', NaN], ['1', Infinity], ['1', 1.5], ['1', '20']]) {
    assert.throws(() => compactTrends(rawHistory({[key]: delta})));
  }
  assert.throws(() => compactTrends(rawHistory({}, {sources: {skills: {updated_at: 'invalid', windows: {}}}})));
  assert.throws(() => compactTrends(rawHistory({}, {sources: {skills: {updated_at: updatedAt, windows: {
    1: {baseline_at: '2026-12-01T00:00:00Z', deltas: {}}}}}})));
  const safe = compactTrends({...rawHistory({1: -2}), arbitrary_url: 'javascript:bad'});
  assert.equal(safe.arbitrary_url, undefined);
  assert.throws(() => compactTrends(rawHistory({}, {sources: {skills: {updated_at: updatedAt, windows: {}}, skill: {updated_at: updatedAt, windows: {}}}})), 'ambiguous duplicate source aliases are rejected');
});
