/* ================================================================
   shared.js — Agent Skills Leaderboard · shared app logic
   Each page sets window.PAGE_CONFIG before loading this file.
================================================================ */

/* ── Config ─────────────────────────────────────────────────────── */
const GITHUB_REPO = 'https://github.com/jaychempan/Agent-Skills-Leaderboard';

/* ── i18n ──────────────────────────────────────────────────────── */
const I18N = {
  zh: {
    nav_skills:     'Skills',
    nav_research:   'Auto Research',
    nav_mcp:        'MCP Servers',
    nav_prompts:    'Prompt Library',
    nav_frameworks: 'AI Frameworks',
    nav_favorites:  '收藏',
    skills_title:   'Agent Skills 排行榜',
    skills_sub:     '一站式发现最值得用的 AI Agent Skills · 告别四处翻找，搜索即上手',
    research_title: 'Auto Research 排行榜',
    research_sub:   '一站式发现顶尖 AI 自动研究工具 · 从学术文献到深度调研，一搜即达',
    mcp_title:      'MCP Servers 排行榜',
    mcp_sub:        '发现最热门的 Model Context Protocol 服务器 · 为 Claude 扩展无限能力',
    prompts_title:  'Prompt Library 排行榜',
    prompts_sub:    '精选最实用的 AI 提示词库 · 提示工程、系统提示、场景模板一站直达',
    frameworks_title:'AI Agent Frameworks 排行榜',
    frameworks_sub: '发现顶尖 AI Agent 构建框架 · 从编排到多智能体，快速上手最佳实践',
    search_skills:  '搜索 Skills…',
    search_research:'搜索 Research 工具…',
    search_mcp:     '搜索 MCP Servers…',
    search_prompts: '搜索 Prompt 库…',
    search_frameworks:'搜索 Frameworks…',
    lang_label:    '语言',
    lang_all:      '所有语言',
    stars_all:     '全部',
    time_all:      '全部时间',
    time_1m:       '近 1 月',
    time_3m:       '近 3 月',
    time_1y:       '近 1 年',
    view_grid:     '⊞ 网格',
    view_list:     '≡ 列表',
    tab_all:       '全部',
    af_label:      '筛选：',
    af_clear:      '清除全部',
    no_results:    '没有符合条件的仓库',
    no_results_sub:'请尝试其他关键词或清除筛选条件',
    no_fav:        '还没有收藏的仓库',
    no_fav_sub:    '点击卡片右上角的 ♡ 收藏感兴趣的仓库',
    no_desc:       '暂无描述',
    footer:        '数据来源 GitHub Search API · 每周自动更新',
    col_rank:      '排名',
    col_repo:      '仓库',
    col_stars:     'Stars',
    col_uses:      '用途',
    col_cat:       '分类',
    col_lang:      '语言',
    col_updated:   '更新',
    stat_repos:    '个仓库',
    stat_min:      '星起收录',
    stat_updated:  '更新于',
    stat_top:      '最高',
    stat_visits:   '次访问',
    page_size:     '每页',
  },
  en: {
    nav_skills:     'Skills',
    nav_research:   'Auto Research',
    nav_mcp:        'MCP Servers',
    nav_prompts:    'Prompt Library',
    nav_frameworks: 'AI Frameworks',
    nav_favorites:  'Favorites',
    skills_title:   'Agent Skills Leaderboard',
    skills_sub:     'One-stop discovery for the best AI Agent Skills — search, filter, and find the right tool instantly.',
    research_title: 'Auto Research Leaderboard',
    research_sub:   'One-stop hub for top AI research tools — from deep research agents to literature review, all in one place.',
    mcp_title:      'MCP Servers Leaderboard',
    mcp_sub:        'Discover the most popular Model Context Protocol servers — extend Claude with databases, web, dev tools and more.',
    prompts_title:  'Prompt Library Leaderboard',
    prompts_sub:    'Curated collection of top prompt libraries — engineering guides, system prompts, and templates all in one place.',
    frameworks_title:'AI Agent Frameworks Leaderboard',
    frameworks_sub: 'Top frameworks for building AI agents — orchestration, multi-agent systems, memory, and evaluation tools.',
    search_skills:  'Search Skills…',
    search_research:'Search Research tools…',
    search_mcp:     'Search MCP Servers…',
    search_prompts: 'Search Prompt libraries…',
    search_frameworks:'Search Frameworks…',
    lang_label:    'Language',
    lang_all:      'All Languages',
    stars_all:     'All',
    time_all:      'All time',
    time_1m:       'Past month',
    time_3m:       'Past 3 months',
    time_1y:       'Past year',
    view_grid:     '⊞ Grid',
    view_list:     '≡ List',
    tab_all:       'All',
    af_label:      'Filters: ',
    af_clear:      'Clear all',
    no_results:    'No matching repositories',
    no_results_sub:'Try other keywords or clear filters',
    no_fav:        'No saved repositories',
    no_fav_sub:    'Click ♡ on any card to save it',
    no_desc:       'No description',
    footer:        'Data sourced from GitHub Search API · Updated weekly',
    col_rank:      'Rank',
    col_repo:      'Repository',
    col_stars:     'Stars',
    col_uses:      'Use Cases',
    col_cat:       'Category',
    col_lang:      'Language',
    col_updated:   'Updated',
    stat_repos:    'repositories',
    stat_min:      '+ stars min',
    stat_updated:  'Updated',
    stat_top:      'Top',
    stat_visits:   'visits',
    page_size:     'Per page',
  }
};

/* ── Use-case label translations ────────────────────────────────── */
const UC_EN = {
  // Skills
  "AI 代理":"AI Agents","工具集成":"Tools","工作流自动化":"Automation",
  "Prompt 优化":"Prompts","UI/UX 设计":"UI/UX","资源列表":"Awesome List",
  "知识管理":"Knowledge","搜索":"Search","数据分析":"Data","写作/内容":"Writing",
  "代码生成":"Code Gen","代码审查":"Review","文档生成":"Docs","测试":"Testing",
  "DevOps":"DevOps","安全":"Security","任务规划":"Planning","Web 开发":"Web Dev",
  "模型路由":"Routing","游戏开发":"Game Dev","通用工具":"General",
  // Auto Research
  "自主代理":"Autonomous","代码研究":"Code Research","知识库":"KBase",
  "学术文献":"Literature","深度研究":"Deep Res.","金融数据":"Finance",
  "实验自动化":"Lab Auto","网页搜索":"Web Search","AI 训练":"AI Train",
  "睡眠/后台":"Background","竞争分析":"Competitive","通用研究":"General",
  // MCP
  "数据库连接":"Database","文件系统":"Filesystem","网页浏览":"Web Browse",
  "代码工具":"Dev Tools","生产力":"Productivity","官方服务器":"Official",
  "API集成":"API","通用MCP":"General MCP",
  // Prompts
  "提示工程":"Prompt Eng.","系统提示":"System Prompt","角色扮演":"Roleplay",
  "多语言":"Multilingual","图像生成":"Image Gen","通用提示":"General",
  "写作助手":"Writing","学术写作":"Academic",
  // Frameworks
  "多智能体":"Multi-Agent","工具调用":"Tool Use","记忆管理":"Memory",
  "流程编排":"Orchestration","评估测试":"Evaluation","RAG":"RAG",
  "语音/视觉":"Voice/Vision","通用框架":"General",
};

/* ── Category label translations ────────────────────────────────── */
const CAT_EN = {
  // Skills
  "其他 AI":"Other AI",
  // Auto Research
  "深度研究":"Deep Research","网页研究":"Web Research","文献综述":"Literature",
  "数据分析":"Data Analysis","知识管理":"Knowledge Base","通用研究":"General",
  // Frameworks
  "流程编排":"Orchestration","多智能体":"Multi-Agent","记忆管理":"Memory",
  "工具调用":"Tool Use","评估测试":"Evaluation","通用框架":"General",
  // MCP
  "官方服务器":"Official","数据库":"Database","文件系统":"Filesystem",
  "网页工具":"Web Tools","开发工具":"Dev Tools","生产力":"Productivity","通用MCP":"General MCP",
  // Prompts
  "资源列表":"Awesome List","系统提示":"System Prompts","提示工程":"Prompt Eng.",
  "代码生成":"Code Gen","写作助手":"Writing","通用提示":"General",
};

/* ── App State ──────────────────────────────────────────────────── */
const app = {
  data:         null,
  allRepos:     [],
  filtered:     [],
  lang:         localStorage.getItem('st_lang')  || 'en',
  theme:        localStorage.getItem('st_theme') || 'dark',
  activeTab:    'all',
  searchQ:      '',
  language:     '',
  minStars:     0,
  maxDaysOld:   0,
  selectedUCs:  new Set(),
  viewMode:     localStorage.getItem('st_view') || 'grid',
  favOnly:      false,
  favorites:    new Set(JSON.parse(localStorage.getItem('st_favorites') || '[]')),
  currentPage:  1,
  pageSize:     24,
  pageConfig:   null,
};

/* ── Routes ─────────────────────────────────────────────────────── */
const ROUTES = {
  skills:     { page: 'skills',     dataKey: 'SKILLS_DATA',     noDataHint: 'Run python3 fetch_data.py' },
  mcp:        { page: 'mcp',        dataKey: 'MCP_DATA',        noDataHint: 'Run python3 fetch_mcp.py' },
  research:   { page: 'research',   dataKey: 'AR_DATA',         noDataHint: 'Run python3 fetch_auto_research.py' },
  prompts:    { page: 'prompts',    dataKey: 'PROMPTS_DATA',    noDataHint: 'Run python3 fetch_prompts.py' },
  frameworks: { page: 'frameworks', dataKey: 'FRAMEWORKS_DATA', noDataHint: 'Run python3 fetch_frameworks.py' },
};

/* ── Brand icon map (Skills page) ───────────────────────────────── */
const _GH = 'https://raw.githubusercontent.com';
const _SI = `${_GH}/simple-icons/simple-icons/develop/icons`;
const BRAND_LOGOS = {
  claude:   `<img class="brand-logo" src="${_GH}/anthropics/anthropic-sdk-typescript/main/.github/logo.svg" alt="">`,
  codex:    `<img class="brand-logo" src="${_GH}/openclaw/openclaw/main/docs/assets/sponsors/openai-light.svg" alt="">`,
  cursor:   `<img class="brand-logo" src="${_SI}/cursor.svg" alt="">`,
  copilot:  `<img class="brand-logo" src="${_GH}/primer/octicons/main/icons/copilot-24.svg" alt="">`,
  deepseek: `<img class="brand-logo" src="${_SI}/deepseek.svg" alt="">`,
  openclaw: `<img class="brand-logo" src="${_GH}/openclaw/openclaw/main/ui/public/favicon.svg" alt="">`,
  other:    `<svg class="brand-logo" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l1.8 5.6H20l-4.9 3.5 1.9 5.7L12 13.3l-5 3.5 1.9-5.7L4 7.6h6.2z"/><circle cx="12" cy="20" r="1.5"/></svg>`,
};

function getBrandIcon(catId) {
  if (app.pageConfig?.page === 'skills' && BRAND_LOGOS[catId]) return BRAND_LOGOS[catId];
  const cats = app.data?.categories || {};
  return cats[catId]?.icon || '';
}

/* ── Translation helper ─────────────────────────────────────────── */
function t(key) {
  return (I18N[app.lang] || I18N.zh)[key] || key;
}
function tUC(label) {
  if (app.lang === 'en') return UC_EN[label] || label;
  return label;
}
function tCat(label) {
  if (app.lang === 'en') return CAT_EN[label] || label;
  return label;
}

/* ── Number helpers ─────────────────────────────────────────────── */
function fmtNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
function timeAgo(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (d === 0) return t('today') || (app.lang === 'en' ? 'Today' : '今天');
  if (d === 1) return app.lang === 'en' ? 'Yesterday' : '昨天';
  if (d < 30)  return app.lang === 'en' ? `${d}d ago` : `${d}天前`;
  if (d < 365) return app.lang === 'en' ? `${Math.floor(d/30)}mo ago` : `${Math.floor(d/30)}月前`;
  return app.lang === 'en' ? `${Math.floor(d/365)}yr ago` : `${Math.floor(d/365)}年前`;
}

/* ── Router ─────────────────────────────────────────────────────── */
function router() {
  const hash = location.hash.slice(1) || 'skills';
  const config = ROUTES[hash] || ROUTES.skills;
  app.activeTab   = 'all';
  app.searchQ     = '';
  app.language    = '';
  app.minStars    = 0;
  app.maxDaysOld  = 0;
  app.selectedUCs = new Set();
  app.currentPage = 1;
  app.favOnly     = false;
  window.scrollTo(0, 0);
  init(config);
}

/* ── Init ───────────────────────────────────────────────────────── */
function init(config) {
  app.pageConfig = config;

  // apply stored theme
  document.documentElement.dataset.theme = app.theme === 'light' ? 'light' : 'dark';

  // update page title
  const PAGE_TITLES = {
    skills: 'Agent Skills Leaderboard',
    mcp: 'MCP Servers — Agent Skills Leaderboard',
    research: 'Auto Research — Agent Skills Leaderboard',
    prompts: 'Prompt Library — Agent Skills Leaderboard',
    frameworks: 'AI Frameworks — Agent Skills Leaderboard',
  };
  document.title = PAGE_TITLES[config.page] || 'Agent Skills Leaderboard';

  // load data
  const raw = window[config.dataKey];
  const noData = document.getElementById('noData');
  if (!raw) {
    if (noData) noData.style.display = 'block';
    document.getElementById('grid').innerHTML =
      `<div class="empty-state"><span class="icon">📭</span>${config.noDataHint}</div>`;
    renderNav();
    return;
  }
  if (noData) noData.style.display = 'none';
  app.data     = raw;
  app.allRepos = raw.repos;

  renderNav();
  renderHero();
  renderTabs();
  renderFilterBar();
  renderUCChips();
  applyFilters();
  applyThemeBtn();
  applyLangBtn();
  loadVisitCount();

  // dismiss page loader
  const loader = document.getElementById('pageLoader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 380);
  }
}

/* ── Theme ──────────────────────────────────────────────────────── */
function toggleTheme() {
  app.theme = app.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('st_theme', app.theme);
  document.documentElement.dataset.theme = app.theme;
  applyThemeBtn();
}
function applyThemeBtn() {
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = app.theme === 'dark' ? '☀️' : '🌙';
}

/* ── Language ───────────────────────────────────────────────────── */
function toggleLang() {
  app.lang = app.lang === 'zh' ? 'en' : 'zh';
  localStorage.setItem('st_lang', app.lang);
  renderAll();
}
function applyLangBtn() {
  const btn = document.getElementById('langBtn');
  if (btn) btn.textContent = app.lang === 'zh' ? 'EN' : '中';
}

/* ── Favorites ──────────────────────────────────────────────────── */
function toggleFav(id, btn) {
  if (app.favorites.has(id)) {
    app.favorites.delete(id);
    btn.classList.remove('saved');
    btn.title = '';
  } else {
    app.favorites.add(id);
    btn.classList.add('saved');
  }
  localStorage.setItem('st_favorites', JSON.stringify([...app.favorites]));
  updateFavBtn();
  if (app.favOnly) applyFilters();
}
function toggleFavOnly() {
  app.favOnly = !app.favOnly;
  app.currentPage = 1;
  const btn = document.getElementById('favBtn');
  if (btn) btn.classList.toggle('active', app.favOnly);
  applyFilters();
}
function updateFavBtn() {
  const cnt = document.querySelector('.fav-count');
  if (!cnt) return;
  cnt.textContent = app.favorites.size;
  cnt.classList.toggle('visible', app.favorites.size > 0);
}

/* ── Nav render ─────────────────────────────────────────────────── */
function toggleMobileNav() {
  const nav = document.getElementById('navbar');
  if (nav) nav.classList.toggle('nav-open');
}
document.addEventListener('click', e => {
  const nav = document.getElementById('navbar');
  if (nav && nav.classList.contains('nav-open') && !nav.contains(e.target))
    nav.classList.remove('nav-open');
});

function renderNav() {
  const pg = app.pageConfig.page;
  const nav = document.getElementById('navbar');
  if (!nav) return;
  nav.innerHTML = `
    <a class="nav-brand" href="#skills" onclick="document.getElementById('navbar').classList.remove('nav-open')">
      <img src="favicon.svg" alt="logo" />
      <span class="nav-brand-text">Agent Skills Leaderboard</span>
    </a>
    <button class="nav-hamburger" onclick="toggleMobileNav()" aria-label="Menu" style="display:none">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links">
      <a class="nav-link${pg==='skills'?' active':''}" href="#skills" onclick="document.getElementById('navbar').classList.remove('nav-open')">
        ⚡ <span class="full">${t('nav_skills')}</span>
      </a>
      <a class="nav-link${pg==='research'?' active':''}" href="#research" onclick="document.getElementById('navbar').classList.remove('nav-open')">
        🔬 <span class="full">${t('nav_research')}</span>
      </a>
      <a class="nav-link${pg==='mcp'?' active':''}" href="#mcp" onclick="document.getElementById('navbar').classList.remove('nav-open')">
        🔌 <span class="full">${t('nav_mcp')}</span>
      </a>
      <a class="nav-link${pg==='prompts'?' active':''}" href="#prompts" onclick="document.getElementById('navbar').classList.remove('nav-open')">
        📝 <span class="full">${t('nav_prompts')}</span>
      </a>
      <a class="nav-link${pg==='frameworks'?' active':''}" href="#frameworks" onclick="document.getElementById('navbar').classList.remove('nav-open')">
        🤖 <span class="full">${t('nav_frameworks')}</span>
      </a>
    </div>
    <div class="nav-actions">
      <a class="nav-link nav-friend" href="https://jianchengpan.space/ccf-ddl-tracker/" target="_blank" rel="noopener noreferrer">
        <img src="https://jianchengpan.space/images/ccf-ddl-tracker-logo.png" alt="" />
        <span class="full">CCF DDL Tracker</span>
      </a>
      <a class="nav-link nav-friend" href="https://jianchengpan.space/citation-tracker/" target="_blank" rel="noopener noreferrer">
        <img src="https://jianchengpan.space/images/citation-tracker-logo.png" alt="" />
        <span class="full">Citation Tracker</span>
      </a>
      <span class="nav-divider"></span>
      <a class="nav-btn" href="${GITHUB_REPO}" target="_blank" rel="noopener noreferrer" title="GitHub">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        <span class="full">GitHub</span>
      </a>
      <button class="nav-btn${app.favOnly ? ' active' : ''}" id="favBtn" onclick="toggleFavOnly()">
        ❤ ${t('nav_favorites')} <span class="fav-count${app.favorites.size > 0 ? ' visible' : ''}">${app.favorites.size}</span>
      </button>
      <button class="nav-btn" id="langBtn" onclick="toggleLang()">
        ${app.lang === 'zh' ? 'EN' : '中'}
      </button>
      <button class="nav-btn" id="themeBtn" onclick="toggleTheme()">
        ${app.theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>`;
}

/* ── Hero render ────────────────────────────────────────────────── */
function renderHero() {
  const m = app.data.meta;
  const d = new Date(m.updated_at);
  const updated = d.toLocaleString(app.lang === 'zh' ? 'zh-CN' : 'en-US',
    { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  const top = app.allRepos[0]?.stars ?? 0;
  const cfg = app.pageConfig;

  const titleKey = cfg.page + '_title';
  const subKey   = cfg.page + '_sub';

  const heroEl = document.getElementById('hero');
  if (!heroEl) return;
  heroEl.innerHTML = `
    <div class="hero-logo">
      <img src="favicon.svg" alt="logo" />
      <h1>${t(titleKey)}</h1>
    </div>
    <p class="hero-sub">${t(subKey)}</p>
    <div class="hero-meta">
      <span class="meta-pill"><strong>${m.total}</strong> ${t('stat_repos')}</span>
      <span class="meta-pill"><strong>★${m.min_stars}+</strong> ${t('stat_min')}</span>
      <span class="meta-pill">${t('stat_updated')} <strong>${updated}</strong></span>
      <span class="meta-pill">${t('stat_top')} <strong>★${fmtNum(top)}</strong></span>
    </div>`;
}

/* ── Tabs ───────────────────────────────────────────────────────── */
function renderTabs() {
  const tabs = document.getElementById('tabs');
  if (!tabs) return;
  const cats = app.data.categories;
  const all  = app.allRepos.length;

  const items = [{ id:'all', label: t('tab_all'), count: all }];
  Object.entries(cats).forEach(([id, meta]) => {
    items.push({ id, label: tCat(meta.label), count: meta.count });
  });

  tabs.innerHTML = items.map(it => `
    <button class="tab${it.id === app.activeTab ? ' active' : ''}" data-id="${it.id}"
            onclick="setTab('${it.id}')">
      ${getBrandIcon(it.id)} ${it.label} <span class="cnt">${it.count}</span>
    </button>`).join('');
}

function setTab(id) {
  app.activeTab  = id;
  app.currentPage = 1;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === id));
  applyFilters();
}

/* ── Language select ─────────────────────────────────────────────── */
function renderLangSelect() {
  const sel = document.getElementById('langSelect');
  if (!sel || !app.data) return;
  const langs = [...new Set(app.allRepos.map(r => r.language).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">${t('lang_all')}</option>` +
    langs.map(l => `<option value="${l}"${app.language === l ? ' selected' : ''}>${l}</option>`).join('');
}

/* ── Use-case chips ─────────────────────────────────────────────── */
function renderUCChips() {
  const row = document.getElementById('ucScroller');
  if (!row || !app.data) return;
  const stats = app.data.use_case_stats || {};
  row.innerHTML = Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .map(([uc, cnt]) => `
      <span class="uc-chip${app.selectedUCs.has(uc) ? ' active' : ''}"
            onclick="toggleUC('${uc}')" data-uc="${uc}">
        ${tUC(uc)} <span class="uc-cnt">${cnt}</span>
      </span>`).join('');
}

function toggleUC(uc) {
  if (app.selectedUCs.has(uc)) app.selectedUCs.delete(uc);
  else app.selectedUCs.add(uc);
  document.querySelectorAll('.uc-chip').forEach(el =>
    el.classList.toggle('active', app.selectedUCs.has(el.dataset.uc)));
  app.currentPage = 1;
  applyFilters();
}

/* ── Filter bar controls ─────────────────────────────────────────── */
function onSearch() {
  app.searchQ     = document.getElementById('searchInput').value.toLowerCase();
  app.currentPage = 1;
  applyFilters();
}
function onLangChange() {
  app.language    = document.getElementById('langSelect').value;
  app.currentPage = 1;
  applyFilters();
}
function setLang(lang) {
  app.language    = lang;
  app.currentPage = 1;
  const sel = document.getElementById('langSelect');
  if (sel) sel.value = lang;
  applyFilters();
}
function setStars(val) {
  app.minStars    = parseInt(val);
  app.currentPage = 1;
  document.querySelectorAll('.stars-preset .preset-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.val) === app.minStars));
  applyFilters();
}
function setTime(val) {
  app.maxDaysOld  = parseInt(val);
  app.currentPage = 1;
  document.querySelectorAll('.time-preset .preset-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.val) === app.maxDaysOld));
  applyFilters();
}
function setPageSize(val) {
  app.pageSize    = parseInt(val);
  app.currentPage = 1;
  applyFilters();
}
function setView(mode) {
  app.viewMode = mode;
  localStorage.setItem('st_view', mode);
  document.querySelectorAll('.view-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  renderContent();
}

/* ── Clear all filters ──────────────────────────────────────────── */
function clearFilters() {
  app.searchQ    = '';
  app.language   = '';
  app.minStars   = 0;
  app.maxDaysOld = 0;
  app.selectedUCs.clear();
  app.favOnly    = false;
  app.activeTab  = 'all';
  app.currentPage = 1;

  const si = document.getElementById('searchInput');   if (si) si.value = '';
  const ls = document.getElementById('langSelect');    if (ls) ls.value = '';
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.preset-btn[data-val="0"]').forEach(b => b.classList.add('active'));
  document.querySelectorAll('.uc-chip').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === 'all'));
  const fb = document.getElementById('favBtn'); if (fb) fb.classList.remove('active');
  applyFilters();
}

/* ── Apply filters ──────────────────────────────────────────────── */
function applyFilters() {
  let list = app.activeTab === 'all'
    ? app.allRepos
    : app.allRepos.filter(r => r.category === app.activeTab);

  if (app.favOnly)    list = list.filter(r => app.favorites.has(r.id));
  if (app.searchQ)    list = list.filter(r => (r.full_name + ' ' + r.description).toLowerCase().includes(app.searchQ));
  if (app.language)   list = list.filter(r => r.language === app.language);
  if (app.minStars)   list = list.filter(r => r.stars >= app.minStars);
  if (app.maxDaysOld) {
    const cutoff = Date.now() - app.maxDaysOld * 86400000;
    list = list.filter(r => new Date(r.updated_at) >= cutoff);
  }

  // Update UC chip counts based on pre-UC-filter results
  updateUCCounts(list);

  if (app.selectedUCs.size) {
    list = list.filter(r => [...app.selectedUCs].every(uc => r.use_cases.includes(uc)));
  }

  app.filtered = list;
  renderActiveFilters();
  renderContent();
  renderPagination();
}

function updateUCCounts(list) {
  const counts = {};
  list.forEach(r => (r.use_cases || []).forEach(uc => {
    counts[uc] = (counts[uc] || 0) + 1;
  }));
  document.querySelectorAll('.uc-chip').forEach(chip => {
    const cnt = chip.querySelector('.uc-cnt');
    if (cnt) cnt.textContent = counts[chip.dataset.uc] || 0;
  });
}

/* ── Active filters bar ─────────────────────────────────────────── */
function renderActiveFilters() {
  const bar = document.getElementById('activeFilters');
  if (!bar) return;
  const chips = [];

  if (app.searchQ)    chips.push({ label: `"${app.searchQ}"`,   clear: () => { app.searchQ = ''; document.getElementById('searchInput').value = ''; } });
  if (app.language)   chips.push({ label: app.language,          clear: () => { app.language = ''; document.getElementById('langSelect').value = ''; } });
  if (app.minStars)   chips.push({ label: `★${fmtNum(app.minStars)}+`, clear: () => setStars(0) });
  if (app.maxDaysOld) chips.push({ label: app.maxDaysOld <= 30 ? t('time_1m') : app.maxDaysOld <= 90 ? t('time_3m') : t('time_1y'), clear: () => setTime(0) });
  app.selectedUCs.forEach(uc => chips.push({ label: tUC(uc), clear: () => toggleUC(uc) }));
  if (app.favOnly)    chips.push({ label: '❤ ' + t('nav_favorites'), clear: () => { app.favOnly = false; document.getElementById('favBtn')?.classList.remove('active'); } });

  if (!chips.length) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  bar.innerHTML = `
    <span class="af-label">${t('af_label')}</span>
    ${chips.map((c, i) => `<span class="af-chip" onclick="removeFilter(${i})">${c.label}</span>`).join('')}
    <button class="af-clear" onclick="clearFilters()">${t('af_clear')}</button>`;
  bar._chips = chips;
}
function removeFilter(i) {
  const bar = document.getElementById('activeFilters');
  if (!bar || !bar._chips) return;
  bar._chips[i].clear();
  app.currentPage = 1;
  applyFilters();
}

/* ── Render content (grid or list) ─────────────────────────────── */
function renderContent() {
  if (app.viewMode === 'list') renderList();
  else renderGrid();
}

/* ── Grid ───────────────────────────────────────────────────────── */
const STAR_SVG = `<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="vertical-align:-1px"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/></svg>`;

function renderGrid() {
  const grid = document.getElementById('grid');
  if (!grid) return;
  grid.style.display = '';
  const table = document.getElementById('listTable');
  if (table) table.style.display = 'none';

  const start = (app.currentPage - 1) * app.pageSize;
  const page  = app.filtered.slice(start, start + app.pageSize);
  const rankMap = new Map(app.allRepos.map((r, i) => [r.id, i + 1]));

  if (!page.length) {
    const msg = app.favOnly
      ? `<div class="empty-state"><span class="icon">🤍</span><strong>${t('no_fav')}</strong><p>${t('no_fav_sub')}</p></div>`
      : `<div class="empty-state"><span class="icon">🔍</span><strong>${t('no_results')}</strong><p>${t('no_results_sub')}</p></div>`;
    grid.innerHTML = msg;
    return;
  }

  grid.innerHTML = page.map(repo => cardHTML(repo, rankMap.get(repo.id) ?? 999)).join('');
}

function cardHTML(repo, gr) {
  const rankCls  = gr <= 3 ? ` rank-${gr}` : '';
  const emoji    = gr === 1 ? '🥇' : gr === 2 ? '🥈' : gr === 3 ? '🥉' : null;
  const rankLbl  = emoji ? `${emoji} #${gr}` : `#${gr}`;
  const [owner, name] = repo.full_name.split('/');
  const isSaved  = app.favorites.has(repo.id);
  const cats = app.data.categories;
  const catLbl = tCat(cats[repo.category]?.label || repo.category);
  const catIcon = getBrandIcon(repo.category);
  const ucTags = (repo.use_cases || []).slice(0, 4).map(uc =>
    `<span class="uc-tag${app.selectedUCs.has(uc) ? ' active' : ''}"
           onclick="event.preventDefault();toggleUC('${uc}')">${tUC(uc)}</span>`).join('');
  const lang = repo.language
    ? `<span class="badge lang-badge clickable" onclick="event.preventDefault();event.stopPropagation();setLang('${repo.language}')">${repo.language}</span>`
    : '';

  return `
    <a class="card${rankCls}" href="${repo.url}" target="_blank" rel="noopener">
      <div class="card-header">
        <span class="rank-badge">${rankLbl}</span>
        <div class="card-actions">
          <span class="star-box" style="color:var(--gold)">${STAR_SVG} ${fmtNum(repo.stars)}</span>
          <button class="fav-btn${isSaved ? ' saved' : ''}"
                  onclick="event.preventDefault();event.stopPropagation();toggleFav(${repo.id},this)"
                  title="${isSaved ? '❤' : '♡'}">
            ${isSaved ? '❤' : '♡'}
          </button>
        </div>
      </div>
      <div class="card-name"><span class="owner">${owner}/</span>${name}</div>
      <div class="card-desc" title="${(repo.description || '').replace(/"/g,'&quot;')}">${repo.description || t('no_desc')}</div>
      <div class="card-footer">
        <div class="card-ucs">${ucTags}</div>
        <div class="card-meta">
          ${lang}
          <span class="badge cat-badge ${repo.category} clickable" onclick="event.preventDefault();event.stopPropagation();setTab('${repo.category}')">${catIcon} ${catLbl}</span>
          <span class="fork-info">🍴${fmtNum(repo.forks)} · 🗓️ ${timeAgo(repo.created_at || repo.updated_at)}</span>
        </div>
      </div>
    </a>`;
}

/* ── List view ──────────────────────────────────────────────────── */
function renderList() {
  const grid = document.getElementById('grid');
  if (grid) grid.style.display = 'none';
  const table = document.getElementById('listTable');
  if (!table) return;
  table.style.display = 'table';

  const start  = (app.currentPage - 1) * app.pageSize;
  const page   = app.filtered.slice(start, start + app.pageSize);
  const rankMap = new Map(app.allRepos.map((r, i) => [r.id, i + 1]));
  const cats   = app.data.categories;

  if (!page.length) {
    table.innerHTML = `<tbody><tr><td colspan="8">
      <div class="empty-state"><span class="icon">🔍</span><strong>${t('no_results')}</strong></div>
    </td></tr></tbody>`;
    return;
  }

  const thead = `<thead class="lt-head"><tr>
    <th>${t('col_rank')}</th>
    <th>${t('col_repo')}</th>
    <th>${t('col_stars')}</th>
    <th>${t('col_uses')}</th>
    <th>${t('col_cat')}</th>
    <th>${t('col_lang')}</th>
    <th>${t('col_updated')}</th>
    <th></th>
  </tr></thead>`;

  const tbody = '<tbody>' + page.map(repo => {
    const gr = rankMap.get(repo.id) ?? 999;
    const emoji = gr === 1 ? '🥇' : gr === 2 ? '🥈' : gr === 3 ? '🥉' : `#${gr}`;
    const rkCls = gr <= 3 ? ` lt-rank-${gr}` : '';
    const [owner, name] = repo.full_name.split('/');
    const isSaved = app.favorites.has(repo.id);
    const catLbl = tCat(cats[repo.category]?.label || repo.category);
    const catIcon = getBrandIcon(repo.category);
    const ucTags = (repo.use_cases || []).slice(0, 3).map(uc =>
      `<span class="uc-tag${app.selectedUCs.has(uc) ? ' active' : ''}"
             onclick="toggleUC('${uc}')">${tUC(uc)}</span>`).join(' ');

    return `<tr class="lt-row">
      <td class="lt-rank${rkCls}">${emoji}</td>
      <td class="lt-name">
        <a href="${repo.url}" target="_blank" rel="noopener">
          <span class="owner">${owner}/</span>${name}
        </a>
        <div class="desc" title="${(repo.description || '').replace(/"/g,'&quot;')}">${(repo.description || t('no_desc')).slice(0, 90)}</div>
      </td>
      <td class="lt-stars">★ ${fmtNum(repo.stars)}</td>
      <td class="lt-ucs">${ucTags}</td>
      <td class="lt-cat"><span class="badge cat-badge ${repo.category} clickable" onclick="setTab('${repo.category}')">${catIcon} ${catLbl}</span></td>
      <td class="lt-lang">${repo.language ? `<span class="clickable" onclick="setLang('${repo.language}')">${repo.language}</span>` : '—'}</td>
      <td class="lt-updated">${timeAgo(repo.created_at || repo.updated_at)}</td>
      <td class="lt-fav">
        <button class="fav-btn${isSaved ? ' saved' : ''}"
                onclick="toggleFav(${repo.id},this)">
          ${isSaved ? '❤' : '♡'}
        </button>
      </td>
    </tr>`;
  }).join('') + '</tbody>';

  table.innerHTML = thead + tbody;
}

/* ── Pagination ─────────────────────────────────────────────────── */
function renderPagination() {
  const total = app.filtered.length;
  const pages = Math.ceil(total / app.pageSize);
  const pg    = document.getElementById('pagination');
  if (!pg) return;
  if (pages <= 1) { pg.innerHTML = ''; return; }

  const cur   = app.currentPage;
  const start = (cur - 1) * app.pageSize + 1;
  const end   = Math.min(cur * app.pageSize, total);
  const info  = `<span class="pg-info">${start}–${end} / ${total}</span>`;

  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || (i >= cur - 2 && i <= cur + 2)) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }

  const pgBtns = nums.map(n =>
    n === '…'
      ? `<span class="pg-ellipsis">…</span>`
      : `<button class="pg-btn${n === cur ? ' active' : ''}" onclick="goPage(${n})">${n}</button>`
  ).join('');

  pg.innerHTML = `
    <button class="pg-btn" onclick="goPage(${cur - 1})" ${cur === 1 ? 'disabled' : ''}>←</button>
    ${pgBtns}
    <button class="pg-btn" onclick="goPage(${cur + 1})" ${cur === pages ? 'disabled' : ''}>→</button>
    ${info}`;
}

function goPage(n) {
  const pages = Math.ceil(app.filtered.length / app.pageSize);
  app.currentPage = Math.max(1, Math.min(n, pages));
  renderContent();
  renderPagination();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Render all (used on lang toggle) ──────────────────────────── */
function renderAll() {
  renderNav();
  renderHero();
  renderTabs();
  renderFilterBar();
  renderUCChips();
  applyFilters();
  applyThemeBtn();
  applyLangBtn();
}

/* ── Filter Bar (i18n-aware, rendered from JS) ──────────────────── */
function renderFilterBar() {
  const bar = document.getElementById('filterBar');
  if (!bar || !app.data) return;
  const ph = t('search_' + app.pageConfig.page) || t('search_skills');

  bar.innerHTML = `
    <div class="filter-bar">
      <input type="search" id="searchInput" placeholder="${ph}" oninput="onSearch()"
             value="${app.searchQ.replace(/"/g, '&quot;')}" />
      <select id="langSelect" onchange="onLangChange()">
        <option value="">${t('lang_all')}</option>
      </select>
      <div class="preset-group stars-preset">
        <button class="preset-btn${app.minStars===0    ?' active':''}" data-val="0"     onclick="setStars(0)">${t('stars_all')}</button>
        <button class="preset-btn${app.minStars===500  ?' active':''}" data-val="500"   onclick="setStars(500)">★500+</button>
        <button class="preset-btn${app.minStars===1000 ?' active':''}" data-val="1000"  onclick="setStars(1000)">★1k+</button>
        <button class="preset-btn${app.minStars===5000 ?' active':''}" data-val="5000"  onclick="setStars(5000)">★5k+</button>
        <button class="preset-btn${app.minStars===10000?' active':''}" data-val="10000" onclick="setStars(10000)">★10k+</button>
      </div>
      <div class="preset-group time-preset">
        <button class="preset-btn${app.maxDaysOld===0  ?' active':''}" data-val="0"   onclick="setTime(0)">${t('time_all')}</button>
        <button class="preset-btn${app.maxDaysOld===30 ?' active':''}" data-val="30"  onclick="setTime(30)">${t('time_1m')}</button>
        <button class="preset-btn${app.maxDaysOld===90 ?' active':''}" data-val="90"  onclick="setTime(90)">${t('time_3m')}</button>
        <button class="preset-btn${app.maxDaysOld===365?' active':''}" data-val="365" onclick="setTime(365)">${t('time_1y')}</button>
      </div>
      <select onchange="setPageSize(this.value)" title="${t('page_size')}">
        <option value="24"${app.pageSize===24?' selected':''}>24</option>
        <option value="48"${app.pageSize===48?' selected':''}>48</option>
        <option value="96"${app.pageSize===96?' selected':''}>96</option>
      </select>
      <div class="view-toggle">
        <button class="view-btn${app.viewMode==='grid'?' active':''}" data-mode="grid" onclick="setView('grid')">${t('view_grid')}</button>
        <button class="view-btn${app.viewMode==='list'?' active':''}" data-mode="list" onclick="setView('list')">${t('view_list')}</button>
      </div>
    </div>`;

  renderLangSelect();
}

/* ── Boot ───────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', router);
window.addEventListener('hashchange', router);

/* ── Visit counter ──────────────────────────────────────────────── */
async function loadVisitCount() {
  const key   = app.pageConfig.page;
  const badge = document.getElementById('visitBadge');
  if (!badge) return;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 5000);
    const res  = await fetch(
      `https://api.counterapi.dev/v1/agentskills/${key}/up`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) throw new Error('non-ok');
    const { count } = await res.json();
    badge.textContent = `👁 ${count.toLocaleString()} ${t('stat_visits')}`;
  } catch {
    badge.textContent = '';
  }
}

