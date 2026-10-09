import {BOARDS, UC_EN} from './taxonomy.mjs';
export {BOARDS};
export const SOURCE_LABELS = Object.fromEntries(Object.entries(BOARDS).map(([key, board]) => [key, board.label]));
export const categoryLabel = (source, category) => BOARDS[source]?.categories[category] || category;
export const websiteURL = source => `https://agentskills.media/${source ? '#' + BOARDS[source].route : ''}`;
export const INDEX_URL = 'https://agentskills.media/data/discovery_index.json';
export const DAY = 24 * 60 * 60 * 1000;
const list = value => Array.isArray(value) ? value.filter(v => typeof v === 'string').slice(0, 100) : [];
const string = value => typeof value === 'string' ? value.slice(0, 10000) : '';

// Store only data used by this UI. Remote data is never executed as JavaScript.
export function compactCatalog(payload) {
  if (!payload || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100000
      || !Number.isFinite(Date.parse(payload.meta?.updated_at))) throw new Error('目录格式无效');
  const items = payload.items.map(item => {
    if (!item || !/^[\w.-]+\/[\w.-]+$/.test(item.full_name) || !Object.hasOwn(SOURCE_LABELS, item.source_type)) {
      throw new Error('目录包含无效仓库');
    }
    return {
      full_name: item.full_name, description: string(item.description), source_type: item.source_type,
      stars: Number.isFinite(item.stars) && item.stars >= 0 ? Math.floor(item.stars) : 0,
      language: string(item.language), updated_at: string(item.updated_at),
      category: string(item.category), categories: list(item.categories),
      topics: list(item.topics), platforms: list(item.platforms), use_cases: list(item.use_cases),
    };
  });
  return {schema: 2, meta: {updated_at: payload.meta.updated_at, total: items.length}, items};
}

export function categoriesOf(item) {
  return item.categories?.length ? item.categories : item.category ? [item.category] : [];
}

export function prepareCatalog(catalog) {
  const repos = new Map();
  for (const item of catalog.items) {
    const key = item.full_name.toLowerCase();
    const existing = repos.get(key);
    const facet = {categories: categoriesOf(item), use_cases: item.use_cases, stars: item.stars,
      language: item.language, updated_at: item.updated_at, platforms: item.platforms};
    if (!existing) {
      repos.set(key, {...item, key, facets: {[item.source_type]: facet}, sources: [item.source_type], descriptions: [item.description]});
      continue;
    }
    for (const field of ['topics', 'platforms', 'use_cases']) existing[field] = [...new Set([...existing[field], ...item[field]])];
    existing.sources = [...new Set([...existing.sources, item.source_type])];
    const previous = existing.facets[item.source_type];
    existing.facets[item.source_type] = previous ? {
      ...previous, stars: Math.max(previous.stars, facet.stars),
      updated_at: Date.parse(facet.updated_at) > Date.parse(previous.updated_at) ? facet.updated_at : previous.updated_at,
      categories: [...new Set([...previous.categories, ...facet.categories])],
      use_cases: [...new Set([...previous.use_cases, ...facet.use_cases])],
      platforms: [...new Set([...previous.platforms, ...facet.platforms])],
    } : facet;
    existing.descriptions.push(item.description);
    existing.stars = Math.max(existing.stars, item.stars);
    if (Date.parse(item.updated_at) > Date.parse(existing.updated_at)) existing.updated_at = item.updated_at;
    if (!existing.description) existing.description = item.description;
  }
  return [...repos.values()].map(item => ({...item, search: [item.full_name, ...item.descriptions,
    ...item.sources, ...item.sources.map(s => SOURCE_LABELS[s]), ...item.sources.map(s => BOARDS[s]?.labelEn || s), item.language,
    ...item.topics, ...item.platforms, ...item.use_cases, ...item.use_cases.map(use => UC_EN[use] || use)].join(' ').normalize('NFKC').toLowerCase()}));
}

export function queryTokens(query) {
  return query.normalize('NFKC').toLowerCase().trim().split(/\s+/u).filter(Boolean).slice(0, 30);
}

export function searchCatalog(repos, {query = '', source = '', category = '', useCases = [], maxDays = 0,
  now = Date.now(), platform = '', language = '', minStars = 0,
  sort = 'relevance', favoritesOnly = false, favorites = {}} = {}) {
  const tokens = queryTokens(query);
  const results = [];
  for (const original of repos) {
    const [categorySource, categoryId] = category.split(':');
    const scope = source || categorySource;
    if (category && ((source && source !== categorySource) || !original.facets?.[categorySource]?.categories.includes(categoryId))) continue;
    const repo = scope && original.facets?.[scope] ? {...original, ...original.facets[scope]} : original;
    if ((source && !repo.sources.includes(source)) || (platform && !repo.platforms.includes(platform))
      || (language && repo.language !== language) || repo.stars < minStars || (favoritesOnly && !favorites[repo.key])) continue;
    if (maxDays && !(Date.parse(repo.updated_at) >= now - maxDays * DAY)) continue;
    if (!useCases.every(useCase => repo.use_cases.includes(useCase))) continue;
    if (!tokens.every(token => repo.search.includes(token))) continue;
    const name = repo.full_name.toLowerCase();
    const score = tokens.reduce((n, token) => n + (name === token || name.split('/')[1] === token ? 100 : name.includes(token) ? 20 : 1), 0);
    results.push({repo, score});
  }
  results.sort((a, b) => {
    if (sort === 'recent') {
      const delta = (Date.parse(b.repo.updated_at) || 0) - (Date.parse(a.repo.updated_at) || 0);
      if (delta) return delta;
    }
    if (sort === 'relevance' && tokens.length && a.score !== b.score) return b.score - a.score;
    return b.repo.stars - a.repo.stars || a.repo.full_name.localeCompare(b.repo.full_name);
  });
  return results.map(row => row.repo);
}

export const repoURL = repo => `https://github.com/${repo.full_name}`;
export function favoriteRecord(repo) {
  // Keep the record so favorites remain viewable if a future catalog removes a repo.
  const {search, descriptions, ...record} = repo;
  return record;
}
export function includeFavorites(repos, favorites) {
  const keys = new Set(repos.map(repo => repo.key));
  const missing = Object.values(favorites).filter(repo => !keys.has(repo.key));
  return repos.concat(missing.map(repo => ({...repo, search: [repo.full_name, repo.description,
    ...repo.sources, ...repo.sources.map(s => BOARDS[s]?.labelEn || s), ...repo.platforms, ...repo.topics, ...repo.use_cases, ...repo.use_cases.map(use => UC_EN[use] || use), repo.language].join(' ').normalize('NFKC').toLowerCase()})));
}
