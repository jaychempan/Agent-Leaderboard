/* In-page trend panel. Source data and history must share a timestamp. */
(() => {
  const sources = {
    skills: {key: 'SKILLS_DATA', zh: 'Skills 技能', en: 'Skills'},
    research: {key: 'AR_DATA', zh: '自动化研究', en: 'Auto Research'},
    mcp: {key: 'MCP_DATA', zh: 'MCP 服务器', en: 'MCP Servers'},
    prompts: {key: 'PROMPTS_DATA', zh: 'Prompt 库', en: 'Prompts'},
    frameworks: {key: 'FRAMEWORKS_DATA', zh: 'AI 框架', en: 'Frameworks'},
  };
  const state = {source: 'skills', days: 1, sort: 'rate',
    lang: localStorage.getItem('st_lang') || 'zh'};
  const $ = id => document.getElementById('trend-' + id);
  const text = (zh, en) => state.lang === 'zh' ? zh : en;
  const number = value => value.toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US');
  const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${fmtNum(Math.abs(value))}`;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
  const percentage = rate => rate === null ? '—' : `+${rate.toLocaleString(state.lang === 'zh' ? 'zh-CN' : 'en-US', {maximumFractionDigits: 1})}%`;

  // Reuse homepage artwork without coupling the overlay to the active home board.
  const uniqueIcon = (markup, prefix) => markup
    .replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}-${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}-${id})`);
  function sourceIcon(source) {
    const icon = document.querySelector(`#navbar a[href="#${source}"] .nav-icon`);
    return icon ? `<span class="trend-source-icon" aria-hidden="true">${uniqueIcon(icon.outerHTML, `trend-tab-${source}`)}</span>` : '';
  }
  function projectIcons(repo) {
    const categories = window[sources[state.source].key]?.categories || {};
    const brands = state.source === 'skills' ? [] : (repo.agentTags || _CAT_PATTERNS
      .filter(([, pattern]) => pattern.test(`${repo.full_name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase()))
      .map(([key]) => key));
    const keys = [...new Set([...(repo.categories || [repo.category]), ...brands])];
    const entries = keys.flatMap(key => {
      const icon = (state.source === 'skills' || brands.includes(key) ? BRAND_LOGOS[key] : null)
        || (key === 'general' ? ICON_GENERAL : CAT_ICONS[key]);
      const label = tCat(categories[key]?.label || window.SKILLS_DATA.categories[key]?.label || key);
      return icon ? [{key, icon, label}] : [];
    });
    return `<span class="trend-project-icons">${entries.slice(0, 4).map(({key, icon, label}) =>
      `<span class="trend-project-icon" title="${escape(label)}" role="img" aria-label="${escape(label)}">${uniqueIcon(icon, `trend-${repo.id}-${key}`)}</span>`
    ).join('')}${entries.length > 4 ? `<span class="trend-more-icons" title="${escape(entries.slice(4).map(item => item.label).join(', '))}">+${entries.length - 4}</span>` : ''}</span>`;
  }

  function getData() {
    const data = window[sources[state.source].key];
    const trends = window.TRENDS_DATA?.sources?.[state.source];
    const windowData = trends?.updated_at === data?.meta?.updated_at ? trends.windows?.[state.days] : null;
    const repos = data?.repos || [];
    const comparable = repos.flatMap(repo => {
      const delta = windowData?.deltas?.[repo.id];
      if (!Number.isFinite(delta)) return [];
      const baseline = repo.stars - delta;
      return [{repo, delta, rate: baseline > 0 ? delta / baseline * 100 : null}];
    });
    const rising = comparable.filter(item => item.delta > 0);
    const ranked = rising.filter(item => state.sort !== 'rate' || item.rate !== null).sort((a, b) =>
      (state.sort === 'rate' ? b.rate - a.rate : b.delta - a.delta) || b.delta - a.delta || b.repo.stars - a.repo.stars || a.repo.id - b.repo.id);
    return {data, windowData, comparable, rising, ranked};
  }

  function renderRows(result) {
    const visible = result.ranked.slice(0, 20);
    $('ranking').innerHTML = visible.map(({repo, delta, rate}, index) => {
      const [owner, ...name] = repo.full_name.split('/');
      // Construct the GitHub destination from the repository identity.
      const url = `https://github.com/${repo.full_name.split('/').map(encodeURIComponent).join('/')}`;
      return `<li data-id="${repo.id}"><a class="project${index < 3 ? ` rank-${index + 1}` : ''}" href="${url}" target="_blank" rel="noopener noreferrer">
        <span class="trend-rank" aria-label="${text(`第 ${index + 1} 名`, `Rank ${index + 1}`)}">${['🥇', '🥈', '🥉'][index] || index + 1}</span>
        <div class="trend-project-info"><div class="trend-project-name"><span class="owner">${escape(owner)}/</span><strong>${escape(name.join('/'))}</strong></div>${projectIcons(repo)}<p class="trend-description">${escape(repo.description || text('暂无描述', 'No description'))}</p></div>
        <span class="star-box" title="${text('累计 Stars', 'Total stars')}: ${number(repo.stars)}"><span aria-hidden="true">★</span> ${fmtNum(repo.stars)}</span>
        <div class="growth" title="+${number(delta)} Stars"><strong>${state.sort === 'rate' ? percentage(rate) : signed(delta)}</strong><small>${state.sort === 'rate' ? `${signed(delta)} Stars` : percentage(rate)}</small></div>
      </a></li>`;
    }).join('');
    $('empty').hidden = !!result.ranked.length;
    $('empty').textContent = !result.windowData?.baseline_at
      ? text('这个时间范围的历史数据还不足，试试其他时间范围。', 'Not enough history yet. Try another time range.')
      : text('这个分类暂时没有符合条件的上升项目。', 'No qualifying rising projects in this category yet.');
  }

  function render() {
    const focusedId = document.activeElement?.id;
    const focusedDay = document.activeElement?.dataset.days;
    const focusedSource = document.activeElement?.dataset.source;
    const {data, windowData, comparable, rising, ranked} = getData();
    $('title').textContent = text('趋势榜', 'Trending');
    $('collapse').setAttribute('aria-label', text('收起到右下角', 'Minimize to corner'));
    $('collapse').title = text('收起到右下角', 'Minimize to corner');
    $('close').setAttribute('aria-label', text('关闭趋势榜', 'Close trending'));
    $('close').title = text('关闭趋势榜', 'Close trending');
    $('projectColumn').textContent = text('项目', 'Project');
    $('growthColumn').textContent = state.sort === 'rate' ? text('涨幅 / 新增 Stars', 'Growth / Stars gained') : text('新增 Stars / 涨幅', 'Stars gained / Growth');
    $('dismiss').setAttribute('aria-label', text('关闭趋势榜', 'Close trending'));
    $('sourceTabs').setAttribute('aria-label', text('板块', 'Sections'));
    $('sourceTabs').innerHTML = Object.entries(sources).map(([key, source]) => `<button type="button" data-source="${key}" aria-pressed="${key === state.source}">${sourceIcon(key)}<span>${source[state.lang]}</span></button>`).join('');
    $('periods').setAttribute('aria-label', text('时间范围', 'Time range'));
    $('periods').innerHTML = [[1, '日榜', 'Daily'], [7, '周榜', 'Weekly'], [30, '月榜', 'Monthly']].map(([days, zh, en]) => `<button data-days="${days}" type="button" title="${text(`近 ${days} 天`, `Past ${days} days`)}" aria-pressed="${days === state.days}">${text(zh, en)}</button>`).join('');
    const net = comparable.reduce((sum, item) => sum + item.delta, 0);
    $('overview').innerHTML = windowData?.baseline_at
      ? text(`<span class="trend-stat"><strong>${number(rising.length)}</strong> / ${number(comparable.length)} 个项目上涨</span><span class="trend-stat">Stars 净增 <strong class="${net > 0 ? 'net-positive' : ''}">${signed(net)}</strong></span>`,
        `<span class="trend-stat"><strong>${number(rising.length)}</strong> of ${number(comparable.length)} projects rising</span><span class="trend-stat"><strong class="${net > 0 ? 'net-positive' : ''}">${signed(net)}</strong> net stars</span>`)
      : text('正在积累历史数据', 'Building observation history');
    $('overview').title = windowData?.baseline_at ? `${text('Stars 净增', 'Net stars')}: ${number(net)}` : '';
    $('projectsLabel').textContent = text('前 20 名', 'Top 20');
    $('sortLabel').textContent = text('排序', 'Sort by');
    $('sort').querySelector('[value="rate"]').textContent = text('增长率', 'Growth rate');
    $('sort').querySelector('[value="delta"]').textContent = text('新增 Stars', 'Stars gained');
    $('sort').value = state.sort;
    renderRows({windowData, ranked});
    $('dateRange').textContent = windowData?.baseline_at
      ? `${windowData.baseline_at.slice(0, 10)} — ${data.meta.updated_at.slice(0, 10)} UTC`
      : '';
    $('methodLabel').textContent = text('如何计算', 'How this works');
    $('methodText').textContent = text(
      '基于站内每日 Stars 快照，增量为期末减期初，涨幅为增量除以期初 Stars。概览统计当前分类中有对比数据的项目，净增包含下降项目；榜单只展示正增长项目。新收录项目需积累历史，期初为零的项目不参与增长率排序。每日抓取可能保留旧记录，因此反映站内观测变化，并非实时 GitHub 增长。',
      'Based on daily recorded stars: gains equal current minus baseline, and growth rate equals gains divided by baseline. The overview covers comparable projects in this category; net stars include declines. Rankings show positive growth only. New entries need history; zero baselines are excluded from rate sorting. Collection can retain older records, so these are observed changes, not live GitHub activity.');
    if (focusedDay) $('panel').querySelector(`[data-days="${focusedDay}"]`)?.focus({preventScroll: true});
    else if (focusedSource) $('panel').querySelector(`[data-source="${focusedSource}"]`)?.focus({preventScroll: true});
    else if (focusedId) document.getElementById(focusedId)?.focus({preventScroll: true});
  }

  let returnFocus = null;
  let previousOverflow = '';
  let panelScroll = 0;
  let minimized = false;
  let closing = false;
  const panel = $('panel');
  function updateDock() {
    const period = {1: text('日榜', 'Daily'), 7: text('周榜', 'Weekly'), 30: text('月榜', 'Monthly')}[state.days];
    $('expand').textContent = `↗ ${sources[state.source][state.lang]} · ${period}`;
    $('expand').setAttribute('aria-label', text('展开趋势榜', 'Expand trending'));
  }
  window.openTrendPanel = function(source, resume = false) {
    if (panel.open || closing) return;
    if (!resume) returnFocus = document.activeElement;
    state.lang = app.lang;
    if (!resume) {
      state.source = Object.hasOwn(sources, source) ? source : 'skills';
      panelScroll = 0;
    }
    render();
    updateDock();
    $('dock').hidden = true;
    closeMobileNav();
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    minimized = false;
    panel.showModal();
    $('body').scrollTop = panelScroll;
    $('close').focus({preventScroll: true});
  };
  function closePanel(collapse = false) {
    if (!panel.open) return;
    panelScroll = $('body').scrollTop;
    minimized = collapse;
    closing = true;
    panel.close();
  }
  panel.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    updateDock();
    $('dock').hidden = !minimized;
    const target = minimized ? $('expand') : returnFocus?.getClientRects().length ? returnFocus
      : document.querySelector('.nav-hamburger');
    target?.focus({preventScroll: true});
    closing = false;
  });
  panel.addEventListener('cancel', event => { event.preventDefault(); closePanel(); });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePanel();
  });
  $('close').addEventListener('click', () => closePanel());
  $('collapse').addEventListener('click', () => closePanel(true));
  $('expand').addEventListener('click', () => window.openTrendPanel(state.source, true));
  $('dismiss').addEventListener('click', () => {
    $('dock').hidden = true;
    document.querySelector('.nav-trending')?.focus({preventScroll: true});
  });
  $('sourceTabs').addEventListener('click', event => {
    const source = event.target.closest('[data-source]')?.dataset.source;
    if (!Object.hasOwn(sources, source)) return;
    state.source = source; render(); $('body').scrollTop = 0;
  });
  $('periods').addEventListener('click', event => {
    const days = Number(event.target.closest('[data-days]')?.dataset.days);
    if (![1, 7, 30].includes(days)) return;
    state.days = days; render();
  });
  $('sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
  // Existing bookmarks open the overlay on the matching home board.
  window.addEventListener('DOMContentLoaded', () => {
    const url = new URL(location.href);
    if (url.searchParams.get('trending') !== '1') return;
    url.searchParams.delete('trending');
    history.replaceState(null, '', url);
    window.openTrendPanel(app.pageConfig.page);
  });
})();
