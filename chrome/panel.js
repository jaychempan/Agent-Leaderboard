import {SOURCE_LABELS, INDEX_URL, DAY, compactCatalog, prepareCatalog, searchCatalog, repoURL,
  favoriteRecord, includeFavorites, BOARDS, websiteURL} from './core.mjs';

import {t, setLocale, getLocale, boardLabel, localizedCategory as categoryLabel, useLabel, bindStaticTranslations} from './i18n.mjs';
import {installationPrompt} from './install-prompt.mjs';
const translateStatic = bindStaticTranslations(document.documentElement);
let statusKey = '正在读取离线快照', statusError = '';

const $ = id => document.getElementById(id);
const state = {query: '', source: '', category: '', useCases: [], maxDays: 0, platform: '', language: '', minStars: 0, sort: 'relevance', favoritesOnly: false};
let showAllUses = false;
let themeMode = 'auto';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
const PAGE_SIZE = 30;
let currentPage = 1, totalPages = 1;
let catalog, repos = [], favorites = {}, ready = false, refreshing = false, toastTimer, saveTimer;
let windowId, pendingRequest, lastRequest;
const params = new URLSearchParams(location.search);
const isStandalone = params.has('q');
const number = value => value.toLocaleString(getLocale());
const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString(getLocale()) : t('未知');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function link(label, url) {
  const a = el('a', '', label);
  a.href = url; a.target = '_blank'; a.rel = 'noreferrer';
  return a;
}
function icon(path, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);
  const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', path); svg.append(shape);
  return svg;
}
const boardShortLabel = source => ({skill: 'Skills', mcp: 'MCP', prompt: 'Prompt', framework: getLocale() === 'en' ? 'AI' : '框架', auto_research: getLocale() === 'en' ? 'Research' : '研究'})[source] || t('全部');
const BOARD_ICONS = {
  skill: 'm13 3-8 11h6l-1 7 9-12h-6l1-6Z',
  mcp: 'M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4',
  prompt: 'M5 4h14v12H9l-4 4V4Zm4 4h6m-6 4h4',
  framework: 'M8 3h8v5H8V3Zm-5 13h7v5H3v-5Zm11 0h7v5h-7v-5ZM12 8v4m-6 4v-4h12v4',
  auto_research: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm5-1 5 5M8 10h5m-2.5-2.5v5',
};
function applyTheme() {
  document.documentElement.dataset.theme = themeMode === 'auto' ? (systemTheme.matches ? 'dark' : 'light') : themeMode;
  const modes = ['auto', 'light', 'dark'];
  const next = modes[(modes.indexOf(themeMode) + 1) % modes.length];
  const names = {auto: '跟随系统', light: '浅色', dark: '深色'};
  const paths = {
    auto: 'M3 4h18v12H3V4Zm5 16h8m-4-4v4',
    light: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-6v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
    dark: 'M20 14.2A8.5 8.5 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z',
  };
  $('theme').replaceChildren(icon(paths[themeMode]));
  $('theme').dataset.mode = themeMode;
  $('theme').title = t('主题：{mode}；点击切换为{next}', {mode: t(names[themeMode]), next: t(names[next])});
  $('theme').setAttribute('aria-label', $('theme').title);
}
systemTheme.addEventListener('change', () => { if (themeMode === 'auto') applyTheme(); });
function renderStatus() {
  $('data-status').textContent = `${t(statusKey)}${catalog ? ' · ' + date(catalog.meta.updated_at) : ''}`;
  $('data-status').title = $('data-status').textContent + (statusError ? '\n' + t(statusError) : '');
}
function applyLocale(value) {
  setLocale(value); document.documentElement.lang = getLocale();
  translateStatic(); applyTheme();
  $('locale-toggle').textContent = getLocale() === 'en' ? '中' : 'EN';
  $('locale-toggle').title = getLocale() === 'en' ? '切换为中文' : 'Switch to English';
  $('locale-toggle').setAttribute('aria-label', $('locale-toggle').title);
  $('help').href = getLocale() === 'en' ? 'help-en.html' : 'help.html';
  for (const button of $('sources').children) {
    const source = button.dataset.source;
    button.querySelector('span').textContent = boardShortLabel(source);
    button.title = source ? boardLabel(source) : t('全部');
    button.setAttribute('aria-label', button.title);
  }
  for (const id of ['platform', 'language']) {
    if ($(id).options.length) $(id).options[0].textContent = t(id === 'platform' ? '全部平台' : '全部语言');
  }
  $('refresh').setAttribute('aria-label', t(refreshing ? '正在更新数据' : '更新数据'));
  $('toast').hidden = true;
  update(false); renderStatus();
}
function toast(text) {
  clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function persistState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.session.set({viewState: {...state}}).catch(() => toast(t('本次搜索条件未能保存'))), 150);
}
function update(resetPage = true) {
  if (!ready) return;
  if (resetPage) { currentPage = 1; $('results-scroll').scrollTop = 0; }
  $('query').value = state.query;
  $('platform').value = state.platform; $('language').value = state.language;
  $('min-stars').value = String(state.minStars); $('sort').value = state.sort;
  $('max-days').value = String(state.maxDays);
  $('all').classList.toggle('active', !state.favoritesOnly);
  $('favorites').classList.toggle('active', state.favoritesOnly);
  $('all').setAttribute('aria-pressed', String(!state.favoritesOnly));
  $('favorites').setAttribute('aria-pressed', String(state.favoritesOnly));
  $('favorite-count').textContent = number(Object.keys(favorites).length);
  const filterCount = [state.category, state.platform, state.language, state.minStars, state.maxDays].filter(Boolean).length + state.useCases.length;
  $('filter-count').textContent = filterCount ? `(${filterCount})` : '';
  for (const button of $('sources').children) button.setAttribute('aria-pressed', String(button.dataset.source === state.source));
  const all = state.favoritesOnly ? includeFavorites(repos, favorites) : repos;
  renderFacets(all);
  renderActiveFilters();
  $('website').href = websiteURL(state.source);
  $('website').textContent = t('完整榜单 ↗');
  $('website').title = state.source ? t('打开{board}榜单', {board: boardLabel(state.source)}) : t('打开完整榜单');
  const results = searchCatalog(all, {...state, favorites});
  $('result-count').textContent = t(state.favoritesOnly ? (state.query.trim() ? '{count} 个收藏匹配' : '{count} 个收藏') : (state.query.trim() ? '{count} 个仓库匹配' : '{count} 个仓库'), {count: number(results.length)});
  totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  if (currentPage > totalPages) { currentPage = totalPages; $('results-scroll').scrollTop = 0; }
  const start = (currentPage - 1) * PAGE_SIZE;
  $('results').replaceChildren(...results.slice(start, start + PAGE_SIZE).map(renderRepo));
  $('results').setAttribute('aria-busy', 'false');
  $('empty').hidden = results.length > 0;
  $('empty-hint').textContent = state.favoritesOnly && !Object.keys(favorites).length
    ? t('点击仓库旁的书签按钮，把感兴趣的工具留在这里。') : t('试试更短的关键词，或清除筛选条件。');
  $('pagination').hidden = results.length === 0;
  $('previous-page').disabled = currentPage === 1;
  $('next-page').disabled = currentPage === totalPages;
  $('page-number').value = String(currentPage);
  $('page-number').max = String(totalPages);
  $('page-total').textContent = number(totalPages);
  $('page-status').textContent = results.length ? t('第 {page} 页，共 {total} 页，显示第 {start} 至 {end} 个仓库', {page: currentPage, total: totalPages, start: start + 1, end: Math.min(start + PAGE_SIZE, results.length)}) : t('没有匹配的仓库');
  persistState();
}
function chooseSource(source) {
  state.source = source; state.category = ''; state.useCases = []; showAllUses = false;
  $('use-search').value = '';
}
function toggleUse(useCase) {
  const focusedUse = document.activeElement?.dataset.use;
  state.useCases = state.useCases.includes(useCase) ? state.useCases.filter(value => value !== useCase) : [...state.useCases, useCase];
  update();
  if (focusedUse) [...$('use-cases').children].find(button => button.dataset.use === focusedUse)?.focus({preventScroll: true});
}
function renderFacets(all) {
  const counts = new Map();
  for (const repo of all) {
    for (const [source, facet] of Object.entries(repo.facets || {})) {
      for (const category of facet.categories) {
        const key = `${source}:${category}`; counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  $('category').replaceChildren(new Option(t('全部分类'), ''));
  for (const [source, board] of Object.entries(BOARDS)) {
    if (state.source && state.source !== source) continue;
    const group = el('optgroup'); group.label = boardLabel(source);
    const keys = [...new Set([...Object.keys(board.categories), ...[...counts.keys()].filter(k => k.startsWith(`${source}:`)).map(k => k.split(':')[1])])];
    for (const category of keys) {
      const key = `${source}:${category}`;
      group.append(new Option(`${categoryLabel(source, category)} (${number(counts.get(key) || 0)})`, key));
    }
    $('category').append(group);
  }
  $('category').value = state.category;
  const candidates = searchCatalog(all, {...state, useCases: [], favorites});
  const useCounts = new Map();
  for (const repo of candidates) for (const useCase of repo.use_cases) useCounts.set(useCase, (useCounts.get(useCase) || 0) + 1);
  for (const useCase of state.useCases) if (!useCounts.has(useCase)) useCounts.set(useCase, 0);
  const uses = [...useCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const useQuery = $('use-search').value.trim().toLocaleLowerCase();
  const shown = uses.filter(([useCase]) => [useCase, useLabel(useCase)].some(label => label.toLocaleLowerCase().includes(useQuery)));
  $('use-cases').replaceChildren(...shown.map(([useCase, count]) => {
    const button = el('button', '', useLabel(useCase)); button.dataset.use = useCase;
    button.append(el('span', '', number(count))); button.setAttribute('aria-pressed', String(state.useCases.includes(useCase)));
    button.addEventListener('click', () => toggleUse(useCase)); return button;
  }));
  $('use-label').textContent = state.useCases.length === 1 ? useLabel(state.useCases[0]) : state.useCases.length ? t('已选 {count} 项用途', {count: state.useCases.length}) : t('全部用途');
  $('toggle-uses').title = state.useCases.length ? state.useCases.map(useLabel).join(' / ') : t('按用途筛选，可多选');
  $('clear-uses').disabled = !state.useCases.length;
  $('toggle-uses').setAttribute('aria-expanded', String(showAllUses));
  $('use-picker').hidden = !showAllUses;
  $('no-uses').hidden = shown.length > 0;
}
function renderActiveFilters() {
  const chips = [];
  const add = (label, clear) => {
    const button = el('button', '', `${label} ×`); button.setAttribute('aria-label', t('移除筛选：{label}', {label}));
    button.addEventListener('click', () => { clear(); update(); }); chips.push(button);
  };
  if (state.category) add(categoryLabel(...state.category.split(':')), () => {state.category = '';});
  for (const useCase of state.useCases) add(useLabel(useCase), () => {state.useCases = state.useCases.filter(v => v !== useCase);});
  if (state.platform) add(state.platform, () => {state.platform = '';});
  if (state.language) add(state.language, () => {state.language = '';});
  if (state.minStars) add(`★ ${number(state.minStars)}+`, () => {state.minStars = 0;});
  if (state.maxDays) add(t({30: '近 1 月', 90: '近 3 月', 365: '近 1 年'}[state.maxDays]), () => {state.maxDays = 0;});
  if (chips.length) add(t('清除全部'), resetFilters);
  $('active-filters').replaceChildren(...chips); $('active-filters').hidden = !chips.length;
}
function renderRepo(repo) {
  const article = el('article', 'repo'); article.dataset.repo = repo.key;
  const board = state.source || state.category.split(':')[0] || repo.sources[0];
  const mark = el('span', `repo-mark mark-${board}`); mark.title = boardLabel(board);
  mark.setAttribute('aria-label', boardLabel(board));
  mark.append(icon(BOARD_ICONS[board]), el('span', 'mark-label', board === 'auto_research' && getLocale() === 'en' ? 'R&D' : boardShortLabel(board)));
  const heading = el('div', 'repo-heading');
  const title = el('h2');
  const [owner, name] = repo.full_name.split('/');
  const repoLink = link('', repoURL(repo)); repoLink.className = 'repo-link'; repoLink.title = repo.full_name;
  repoLink.append(el('span', 'repo-name', name));
  title.append(repoLink);
  const save = el('button', 'save'); save.append(icon('M6 3h12v18l-6-4-6 4V3Z'));
  save.title = favorites[repo.key] ? t('取消收藏') : t('收藏仓库');
  save.setAttribute('aria-label', `${favorites[repo.key] ? t('取消收藏') : t('收藏')} ${repo.full_name}`);
  save.setAttribute('aria-pressed', String(Boolean(favorites[repo.key])));
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const key = `favorite:${repo.key}`;
      if (favorites[repo.key]) await chrome.storage.local.remove(key);
      else await chrome.storage.local.set({[key]: favoriteRecord(repo)});
      // storage.onChanged updates every open panel without overwriting other favorites.
    } catch { toast(t('收藏未能保存，请检查浏览器存储空间')); save.disabled = false; }
  });
  const stars = el('span', 'stars', `★ ${number(repo.stars)}`);
  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(installationPrompt(repo, getLocale()));
      toast(t('安装提示已复制，粘贴到 AI 编程工具中使用'));
    } catch { toast(t('安装提示复制失败，请重试')); }
  };
  const install = el('button', 'copy-install');
  install.append(icon('M9 9h11v12H9V9ZM15 9V3H3v12h6'));
  install.title = t('复制安装提示，粘贴到 AI 编程工具');
  install.setAttribute('aria-label', t('复制 {name} 的安装提示', {name: repo.full_name}));
  install.addEventListener('click', copyInstall);
  heading.append(title, stars, install, save);
  const description = el('p', 'description', repo.description || t('此仓库暂无简介，打开 README 查看详情。'));
  const meta = el('div', 'meta');
  const author = el('span', 'owner', owner); author.title = owner; meta.append(author);
  const tag = el('span', `source-tag mark-${board}`, boardLabel(board));
  tag.title = repo.sources.map(source => boardLabel(source)).join(' / '); meta.append(tag);
  if (repo.language) { const language = el('span', 'repo-language', repo.language); language.title = repo.language; meta.append(language); }
  meta.append(link('README', `${repoURL(repo)}#readme`));
  const quickTags = el('div', 'quick-tags');
  const source = state.source || state.category.split(':')[0] || repo.sources[0];
  const category = repo.facets?.[source]?.categories[0];
  if (category) {
    const button = el('button', '', categoryLabel(source, category));
    button.title = `${boardLabel(source)} / ${categoryLabel(source, category)}`;
    button.addEventListener('click', () => { chooseSource(source); state.category = `${source}:${category}`; update(); });
    quickTags.append(button);
  }
  for (const useCase of repo.use_cases.filter(value => value !== categoryLabel(source, category)).slice(0, 2)) {
    const button = el('button', '', useLabel(useCase)); button.addEventListener('click', () => toggleUse(useCase)); quickTags.append(button);
  }
  const details = el('details'); const summary = el('summary', '', t('详情'));
  summary.setAttribute('aria-label', t('查看 {name} 的完整详情', {name: repo.full_name})); details.append(summary);
  const body = el('div', 'detail-body');
  body.append(el('p', '', repo.description || t('暂无简介')));
  body.append(el('p', 'tags', t('所属榜单：{boards}', {boards: repo.sources.map(boardLabel).join(' / ')})));
  if (repo.language) body.append(el('p', 'tags', t('编程语言：{language}', {language: repo.language})));
  if (repo.platforms.length) body.append(el('p', 'tags', t('适用平台：{platforms}（根据目录关键词推断）', {platforms: repo.platforms.join(' / ')})));
  if (repo.use_cases.length) body.append(el('p', 'tags', t('用途：{uses}', {uses: repo.use_cases.map(useLabel).join(' / ')})));
  if (repo.topics.length) body.append(el('p', 'tags', repo.topics.slice(0, 12).map(t => `#${t}`).join(' ')));
  body.append(el('p', 'tags', t('仓库更新：{date}', {date: date(repo.updated_at)})));
  const links = el('div', 'links'); links.append(link(t('查看 README ↗'), `${repoURL(repo)}#readme`));
  const copy = el('button', '', t('复制链接')); copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(repoURL(repo)); toast(t('仓库链接已复制')); }
    catch { toast(t('复制失败，可右键仓库名称复制链接')); }
  });
  const installText = el('button', 'copy-install-text', t('复制安装提示'));
  installText.addEventListener('click', copyInstall);
  links.append(copy, installText); body.append(quickTags, links); details.append(body);
  article.append(mark, heading, description, meta, details);
  return article;
}
function setCatalog(value, label) {
  catalog = value; repos = prepareCatalog(value);
  for (const [id, field, empty] of [['platform', 'platforms', '全部平台'], ['language', 'language', '全部语言']]) {
    const values = [...new Set(repos.flatMap(repo => Array.isArray(repo[field]) ? repo[field] : [repo[field]]))].filter(Boolean).sort();
    $(id).replaceChildren(new Option(t(empty), ''), ...values.map(value => new Option(value, value)));
    if (!values.includes(state[id])) state[id] = '';
  }
  statusKey = label; statusError = ''; renderStatus();
  ready = true; update();
}
async function refresh() {
  if (refreshing) return;
  refreshing = true; $('refresh').disabled = true; $('refresh').classList.add('refreshing'); $('refresh').setAttribute('aria-label', t('正在更新数据'));
  try {
    const response = await fetch(INDEX_URL, {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = compactCatalog(await response.json());
    if (catalog && Date.parse(next.meta.updated_at) < Date.parse(catalog.meta.updated_at)) throw new Error('远程目录比当前目录旧');
    // Reserve local storage capacity for favorites; a large new catalog still works in this session.
    let cached = false;
    if (new TextEncoder().encode(JSON.stringify(next)).length < 8 * 1024 * 1024) {
      try { await chrome.storage.local.set({catalogCache: next, checkedAt: Date.now()}); cached = true; } catch { /* keep usable in memory */ }
    }
    setCatalog(next, cached ? '已更新' : '已更新，未缓存');
    if (!cached) toast(t('目录已更新，但未能缓存；下次仍可使用原有离线数据'));
  } catch (error) {
    statusKey = catalog ? '更新失败，保留离线数据' : '目录读取失败，请重试更新';
    statusError = error.message; renderStatus();
    if (!catalog) { $('result-count').textContent = t('暂无可用目录'); $('results').setAttribute('aria-busy', 'false'); }
  } finally { refreshing = false; $('refresh').disabled = false; $('refresh').classList.remove('refreshing'); $('refresh').setAttribute('aria-label', t('更新数据')); }
}
function resetFilters() { Object.assign(state, {source: '', category: '', useCases: [], maxDays: 0, platform: '', language: '', minStars: 0}); showAllUses = false; $('use-search').value = ''; }
function applyRequest(request) {
  if (!request || request.nonce === lastRequest) return;
  if (!ready) { pendingRequest = request; return; }
  lastRequest = request.nonce;
  state.query = request.query; state.favoritesOnly = false; resetFilters(); update();
  $('query').focus();
  chrome.storage.session.remove(`request:${windowId}`).catch(() => {});
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    let changed = false;
    for (const [key, value] of Object.entries(changes)) {
      if (!key.startsWith('favorite:')) continue;
      if (value.newValue) favorites[key.slice(9)] = value.newValue;
      else delete favorites[key.slice(9)];
      changed = true;
    }
    if (changes.themeMode) { themeMode = ['light', 'dark'].includes(changes.themeMode.newValue) ? changes.themeMode.newValue : 'auto'; applyTheme(); }
    if (changes.uiLocale) { applyLocale(changes.uiLocale.newValue); }
    else if (changed) update(false);
  }
  if (area === 'session' && !isStandalone) applyRequest(changes[`request:${windowId}`]?.newValue);
});

for (const [source, label] of [['', '全部'], ...Object.entries(SOURCE_LABELS)]) {
  const button = el('button', source ? `mark-${source}` : '', '');
  button.append(icon(BOARD_ICONS[source] || 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z'), el('span', '', boardShortLabel(source)));
  button.dataset.source = source; button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(!source));
  button.addEventListener('click', () => { chooseSource(source); update(); }); $('sources').append(button);
}
$('category').addEventListener('change', () => { state.category = $('category').value; if (state.category) state.source = state.category.split(':')[0]; state.useCases = []; $('use-search').value = ''; update(); });
$('toggle-uses').addEventListener('click', () => {
  showAllUses = !showAllUses; update(false);
  if (showAllUses) $('use-search').focus();
});
$('use-search').addEventListener('input', () => renderFacets(state.favoritesOnly ? includeFavorites(repos, favorites) : repos));
$('clear-uses').addEventListener('click', () => { state.useCases = []; update(); });
$('use-picker').addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.stopPropagation(); showAllUses = false; update(false); $('toggle-uses').focus(); }
});
$('query').addEventListener('input', () => { state.query = $('query').value; update(); });
$('search-form').addEventListener('submit', event => { event.preventDefault(); state.query = $('query').value; update(); });
for (const [id, key] of [['platform', 'platform'], ['language', 'language'], ['min-stars', 'minStars'], ['max-days', 'maxDays'], ['sort', 'sort']]) {
  $(id).addEventListener('change', () => { state[key] = ['min-stars', 'max-days'].includes(id) ? Number($(id).value) : $(id).value; update(); });
}
for (const id of ['all', 'favorites']) $(id).addEventListener('click', () => { state.favoritesOnly = id === 'favorites'; update(); });
$('filter-toggle').addEventListener('click', () => { $('filters').hidden = !$('filters').hidden; $('filter-toggle').setAttribute('aria-expanded', String(!$('filters').hidden)); });
$('reset').addEventListener('click', () => { resetFilters(); update(); });
$('clear-search').addEventListener('click', () => { resetFilters(); state.query = ''; if (!Object.keys(favorites).length) state.favoritesOnly = false; update(); $('query').focus(); });
function goToPage(page) {
  if (!Number.isInteger(page)) { $('page-number').value = String(currentPage); return; }
  currentPage = Math.max(1, Math.min(totalPages, page));
  update(false); $('results-scroll').scrollTop = 0;
}
$('previous-page').addEventListener('click', () => goToPage(currentPage - 1));
$('next-page').addEventListener('click', () => goToPage(currentPage + 1));
$('page-form').addEventListener('submit', event => { event.preventDefault(); goToPage($('page-number').valueAsNumber); });
$('page-number').addEventListener('change', () => goToPage($('page-number').valueAsNumber));
$('refresh').addEventListener('click', refresh);
$('locale-toggle').addEventListener('click', async () => {
  const next = getLocale() === 'en' ? 'zh-CN' : 'en';
  applyLocale(next);
  try { await chrome.storage.local.set({uiLocale: next}); }
  catch { toast(t('语言设置未能保存')); }
});
$('theme').addEventListener('click', async () => {
  const modes = ['auto', 'light', 'dark'];
  themeMode = modes[(modes.indexOf(themeMode) + 1) % modes.length];
  applyTheme();
  try { await chrome.storage.local.set({themeMode}); } catch { toast(t('主题设置未能保存')); }
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('query').focus(); }
  if (event.key === 'Escape' && document.activeElement === $('query')) { state.query = ''; update(); }
});

async function init() {
  const [local, session, currentWindow, snapshot] = await Promise.all([
    chrome.storage.local.get(null), chrome.storage.session.get(null), chrome.windows.getCurrent(),
    fetch(chrome.runtime.getURL('data/catalog.json')).then(r => r.json()).then(compactCatalog),
  ]);
  windowId = currentWindow.id;
  themeMode = ['light', 'dark'].includes(local.themeMode) ? local.themeMode : 'auto';
  applyLocale(local.uiLocale || 'zh-CN');
  favorites = Object.fromEntries(Object.entries(local).filter(([key]) => key.startsWith('favorite:')).map(([key, value]) => [key.slice(9), value]));
  if (session.viewState) for (const key of Object.keys(state)) if (typeof session.viewState[key] === typeof state[key]) state[key] = session.viewState[key];
  if (!Array.isArray(state.useCases)) state.useCases = [];
  if (isStandalone) { state.query = (params.get('q') || '').slice(0, 500); state.favoritesOnly = false; resetFilters(); }
  if (isStandalone && params.has('filters')) {
    try {
      const view = JSON.parse(params.get('filters'));
      if (view.source === '' || Object.hasOwn(BOARDS, view.source)) state.source = view.source;
      if (typeof view.category === 'string' && view.category.startsWith(`${state.source}:`)) state.category = view.category;
      if (Array.isArray(view.useCases)) state.useCases = view.useCases.filter(v => typeof v === 'string').slice(0, 100);
      for (const key of ['platform', 'language', 'sort']) if (typeof view[key] === 'string') state[key] = view[key];
      if ([0, 500, 1000, 5000, 10000].includes(view.minStars)) state.minStars = view.minStars;
      if ([0, 30, 90, 365].includes(view.maxDays)) state.maxDays = view.maxDays;
      state.favoritesOnly = view.favoritesOnly === true;
    } catch { /* Ignore malformed optional view state. */ }
  }
  let cached;
  try { if (local.catalogCache?.schema === 2) cached = compactCatalog(local.catalogCache); } catch { /* use the bundled snapshot */ }
  setCatalog(cached && Date.parse(cached.meta.updated_at) >= Date.parse(snapshot.meta.updated_at) ? cached : snapshot,
    cached && Date.parse(cached.meta.updated_at) >= Date.parse(snapshot.meta.updated_at) ? '本地缓存' : '内置快照');
  if (!isStandalone) {
    // Read once more after initialization to cover a context-menu click during startup.
    const requests = await chrome.storage.session.get(`request:${windowId}`);
    applyRequest(pendingRequest || requests[`request:${windowId}`]);
  }
  if (!local.checkedAt || Date.now() - local.checkedAt > DAY) refresh();
}
applyTheme();
init().catch(error => {
  $('result-count').textContent = t('本地目录载入失败');
  $('data-status').textContent = t('请点击更新数据，或重新加载插件');
  $('data-status').title = error.message; $('results').setAttribute('aria-busy', 'false');
});
