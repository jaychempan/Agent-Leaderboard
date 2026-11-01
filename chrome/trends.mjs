import {prepareCatalog, queryTokens} from './core.mjs';

export const TRENDS_URL = 'https://agentskills.media/data/trends.json';
const SOURCES = Object.freeze({skill: 'skills', mcp: 'mcp', prompt: 'prompts', framework: 'frameworks', auto_research: 'research'});
const SOURCE_KEYS = new Map(Object.entries(SOURCES).flatMap(([extension, website]) => [[extension, extension], [website, extension]]));
const DAYS = [1, 7, 30];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const idOf = value => /^[1-9]\d{0,15}$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

// Only observation timestamps and integer deltas belong in the cached history.
// Keep raw timestamps: parsing to milliseconds would lose source microseconds.
export function compactTrends(payload) {
  if (!object(payload) || payload.version !== 1 || !object(payload.sources)) throw new Error('趋势格式无效');
  const sources = {};
  for (const [name, value] of Object.entries(payload.sources)) {
    const source = SOURCE_KEYS.get(name);
    if (!source) continue;
    if (Object.hasOwn(sources, source) || !object(value) || !timestamp(value.updated_at) || !object(value.windows)) throw new Error('趋势来源无效');
    const windows = {};
    for (const days of DAYS) {
      const input = value.windows[days];
      if (input === undefined) { windows[days] = {baseline_at: null, deltas: {}}; continue; }
      if (!object(input) || (input.baseline_at !== null && !timestamp(input.baseline_at)) || !object(input.deltas)
          || Object.keys(input.deltas).length > 100000
          || (input.baseline_at !== null && Date.parse(input.baseline_at) > Date.parse(value.updated_at))) throw new Error('趋势窗口无效');
      const deltas = {};
      for (const [key, delta] of Object.entries(input.deltas)) {
        if (!idOf(key) || !Number.isSafeInteger(delta)) throw new Error('趋势增量无效');
        deltas[key] = delta;
      }
      windows[days] = {baseline_at: input.baseline_at, deltas};
    }
    sources[source] = {updated_at: value.updated_at, windows};
  }
  if (!Object.keys(sources).length) throw new Error('趋势来源无效');
  return {version: 1, sources};
}

export function rankTrends(catalog, trends, {source = 'skill', days = 1, sort = 'rate', query = ''} = {}) {
  days = Number(days);
  if (!Object.hasOwn(SOURCES, source) || !DAYS.includes(days) || !['rate', 'delta'].includes(sort)) throw new Error('趋势选项无效');
  const updatedAt = catalog?.sources?.[source]?.updated_at;
  const history = trends?.sources?.[source];
  const result = {status: 'missing_history', ranked: [], comparableCount: 0, risingCount: 0, net: 0,
    baselineAt: null, updatedAt: timestamp(updatedAt) ? updatedAt : null};
  if (!history) return result;
  if (!timestamp(updatedAt) || history.updated_at !== updatedAt || !Array.isArray(catalog?.items)) return {...result, status: 'mismatch'};
  const window = history.windows?.[days];
  if (!timestamp(window?.baseline_at) || !object(window?.deltas)) return result;
  const comparable = [];
  for (const item of catalog.items) {
    if (item.source_type !== source || !idOf(item.source_id) || !Object.hasOwn(window.deltas, item.source_id)) continue;
    const delta = window.deltas[item.source_id];
    if (!Number.isFinite(delta)) continue;
    // A source can contain two retained IDs for the same repository name. The
    // website counts both observations; global catalog merging would lose one.
    const repo = {...prepareCatalog({items: [item]})[0], id: item.source_id};
    const baseline = repo.stars - delta;
    comparable.push({repo, delta, rate: baseline > 0 ? delta / baseline * 100 : null});
  }
  const rising = comparable.filter(item => item.delta > 0);
  const tokens = queryTokens(typeof query === 'string' ? query : '');
  const ranked = rising.filter(item => (sort !== 'rate' || item.rate !== null) && tokens.every(token => item.repo.search.includes(token)))
    .sort((a, b) => (sort === 'rate' ? b.rate - a.rate : b.delta - a.delta)
      || b.delta - a.delta || b.repo.stars - a.repo.stars || a.repo.id - b.repo.id);
  return {...result, status: 'ready', ranked, comparableCount: comparable.length, risingCount: rising.length,
    net: comparable.reduce((sum, item) => sum + item.delta, 0), baselineAt: window.baseline_at};
}
