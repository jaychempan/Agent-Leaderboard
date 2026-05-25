/* ================================================================
   shared.js — Agent Skills Leaderboard · shared app logic
   Each page sets window.PAGE_CONFIG before loading this file.
================================================================ */

/* ── Config ─────────────────────────────────────────────────────── */
const GITHUB_REPO = 'https://github.com/jaychempan/Agent-Leaderboard';

/* ── i18n ──────────────────────────────────────────────────────── */
const I18N = {
  zh: {
    nav_skills:     'Skills 技能',
    nav_research:   '自动化研究',
    nav_mcp:        'MCP 服务器',
    nav_prompts:    'Prompt 库',
    nav_frameworks: 'AI 框架',
    nav_favorites:  '收藏',
    skills_title:   'Agent Skills 排行榜',
    skills_sub:     '一站式发现最值得用的 AI Agent Skills · 告别四处翻找，搜索即上手',
    research_title: 'Auto Research 排行榜',
    research_sub:   '一站式发现顶尖 AI 自动研究工具 · 从学术文献到深度调研，一搜即达',
    mcp_title:      'MCP Servers 排行榜',
    mcp_sub:        '发现最热门的 Model Context Protocol 服务器 · 为 AI 接入数据库、网络、开发工具等无限能力',
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
    footer:        '数据来源 GitHub Search API · 每日自动更新',
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
    mcp_sub:        'Discover the most popular Model Context Protocol servers — connect any AI to databases, web, dev tools and more.',
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
    footer:        'Data sourced from GitHub Search API · Updated daily',
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
  "数据分析":"Data Analysis","知识管理":"Knowledge Base","通用研究":"General Research",
  // Frameworks
  "流程编排":"Orchestration","多智能体":"Multi-Agent","记忆管理":"Memory",
  "工具调用":"Tool Use","评估测试":"Evaluation","通用框架":"General FW",
  // MCP
  "官方服务器":"Official","数据库":"Database","文件系统":"Filesystem",
  "网页工具":"Web Tools","开发工具":"Dev Tools","生产力":"Productivity","通用MCP":"General MCP",
  // Prompts
  "资源列表":"Awesome List","系统提示":"System Prompts","提示工程":"Prompt Eng.",
  "代码生成":"Code Gen","写作助手":"Writing","通用提示":"General Prompts",
};

/* ── App State ──────────────────────────────────────────────────── */
const app = {
  data:         null,
  allRepos:     [],
  filtered:     [],
  lang:         localStorage.getItem('st_lang')  || 'en',
  theme:        localStorage.getItem('st_theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
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

/* ── Official brand links (Skills page) ─────────────────────────── */
const BRAND_LINKS = {
  claude:   {
    home: 'https://claude.ai',
    homeLabel: 'claude.ai',
    skills: 'https://docs.anthropic.com/en/docs/claude-code',
    skillsLabel: 'Claude Code Docs',
    desc_zh: 'Anthropic 出品的 AI 助手 · Claude Code 为开发者带来自主编码能力',
    desc_en: "Anthropic's AI assistant — Claude Code brings agentic coding to your workflow",
  },
  codex:    {
    home: 'https://platform.openai.com',
    homeLabel: 'platform.openai.com',
    skills: 'https://platform.openai.com/docs',
    skillsLabel: 'OpenAI Docs',
    desc_zh: 'OpenAI 代码生成模型 · 驱动众多开发者工具与自动补全',
    desc_en: "OpenAI's code model — powering developer tools and AI completions",
  },
  cursor:   {
    home: 'https://cursor.com',
    homeLabel: 'cursor.com',
    skills: 'https://cursor.com/features',
    skillsLabel: 'Cursor Features',
    desc_zh: 'AI 优先的代码编辑器 · 深度集成 LLM 的开发体验',
    desc_en: 'AI-first code editor with deep LLM integration and inline chat',
  },
  copilot:  {
    home: 'https://github.com/features/copilot',
    homeLabel: 'github.com/copilot',
    skills: 'https://github.com/marketplace',
    skillsLabel: 'GitHub Marketplace',
    desc_zh: 'GitHub AI 编程助手 · 无缝融入开发工作流的智能补全',
    desc_en: "GitHub's AI coding assistant — seamlessly integrated into your dev workflow",
  },
  gemini:   {
    home: 'https://gemini.google.com',
    homeLabel: 'gemini.google.com',
    skills: 'https://ai.google.dev/gemini-api/docs',
    skillsLabel: 'Gemini API Docs',
    desc_zh: 'Google 旗舰 AI 模型 · 多模态能力强大，深度融入 Google 生态',
    desc_en: "Google's flagship AI model — multimodal, powerful, and deeply integrated with Google's ecosystem",
  },
  deepseek: {
    home: 'https://deepseek.com',
    homeLabel: 'deepseek.com',
    skills: 'https://github.com/deepseek-ai',
    skillsLabel: 'DeepSeek GitHub',
    desc_zh: '开源 AI 模型 · 专为代码与推理优化，性能卓越',
    desc_en: 'Open-source AI models — optimized for code generation and advanced reasoning',
  },
  openclaw: {
    home: null,
    homeLabel: null,
    skills: null,
    skillsLabel: null,
    desc_zh: '开源 AI 编程工具与社区扩展生态',
    desc_en: 'Open-source AI coding tools and community-built extensions',
  },
  hermes:   {
    home: 'https://hermes-agent.nousresearch.com',
    homeLabel: 'hermes-agent.nousresearch.com',
    skills: 'https://nousresearch.com',
    skillsLabel: 'NousResearch',
    desc_zh: 'NousResearch 出品 · 专为函数调用与工具使用优化的 Agent 模型',
    desc_en: "NousResearch's agent model — optimized for function calling and tool use",
  },
};

/* ── Brand icon map (Skills page) ───────────────────────────────── */
const _GH = 'https://raw.githubusercontent.com';
const _SI = `${_GH}/simple-icons/simple-icons/develop/icons`;
const BRAND_LOGOS = {
  claude:   `<svg class="brand-logo" viewBox="0 0 248 248" fill="none"><path d="M52.4285 162.873L98.7844 136.879L99.5485 134.602L98.7844 133.334H96.4921L88.7237 132.862L62.2346 132.153L39.3113 131.207L17.0249 130.026L11.4214 128.844L6.2 121.873L6.7094 118.447L11.4214 115.257L18.171 115.847L33.0711 116.911L55.485 118.447L71.6586 119.392L95.728 121.873H99.5485L100.058 120.337L98.7844 119.392L97.7656 118.447L74.5877 102.732L49.4995 86.1905L36.3823 76.62L29.3779 71.7757L25.8121 67.2858L24.2839 57.3608L30.6515 50.2716L39.3113 50.8623L41.4763 51.4531L50.2636 58.1879L68.9842 72.7209L93.4357 90.6804L97.0015 93.6343L98.4374 92.6652L98.6571 91.9801L97.0015 89.2625L83.757 65.2772L69.621 40.8192L63.2534 30.6579L61.5978 24.632C60.9565 22.1032 60.579 20.0111 60.579 17.4246L67.8381 7.49965L71.9133 6.19995L81.7193 7.49965L85.7946 11.0443L91.9074 24.9865L101.714 46.8451L116.996 76.62L121.453 85.4816L123.873 93.6343L124.764 96.1155H126.292V94.6976L127.566 77.9197L129.858 57.3608L132.15 30.8942L132.915 23.4505L136.608 14.4708L143.994 9.62643L149.725 12.344L154.437 19.0788L153.8 23.4505L150.998 41.6463L145.522 70.1215L141.957 89.2625H143.994L146.414 86.7813L156.093 74.0206L172.266 53.698L179.398 45.6635L187.803 36.802L193.152 32.5484H203.34L210.726 43.6549L207.415 55.1159L196.972 68.3492L188.312 79.5739L175.896 96.2095L168.191 109.585L168.882 110.689L170.738 110.53L198.755 104.504L213.91 101.787L231.994 98.7149L240.144 102.496L241.036 106.395L237.852 114.311L218.495 119.037L195.826 123.645L162.07 131.592L161.696 131.893L162.137 132.547L177.36 133.925L183.855 134.279H199.774L229.447 136.524L237.215 141.605L241.8 147.867L241.036 152.711L229.065 158.737L213.019 154.956L175.45 145.977L162.587 142.787H160.805V143.85L171.502 154.366L191.242 172.089L215.82 195.011L217.094 200.682L213.91 205.172L210.599 204.699L188.949 188.394L180.544 181.069L161.696 165.118H160.422V166.772L164.752 173.152L187.803 207.771L188.949 218.405L187.294 221.832L181.308 223.959L174.813 222.777L161.187 203.754L147.305 182.486L136.098 163.345L134.745 164.2L128.075 235.42L125.019 239.082L117.887 241.8L111.902 237.31L108.718 229.984L111.902 215.452L115.722 196.547L118.779 181.541L121.58 162.873L123.291 156.636L123.14 156.219L121.773 156.449L107.699 175.752L86.304 204.699L69.3663 222.777L65.291 224.431L58.2867 220.768L58.9235 214.27L62.8713 208.48L86.304 178.705L100.44 160.155L109.551 149.507L109.462 147.967L108.959 147.924L46.6977 188.512L35.6182 189.93L30.7788 185.44L31.4156 178.115L33.7079 175.752L52.4285 162.873Z" fill="#D97757"/></svg>`,
  codex:    `<svg class="brand-logo brand-logo--dark-invert" viewBox="0 0 24 24" fill="currentColor"><path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/></svg>`,
  cursor:   `<svg class="brand-logo brand-logo--dark-invert" viewBox="0 0 24 24" fill="currentColor"><path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/></svg>`,
  copilot:  `<svg class="brand-logo brand-logo--dark-invert" viewBox="0 0 24 24" fill="currentColor"><path d="M23.922 16.992c-.861 1.495-5.859 5.023-11.922 5.023-6.063 0-11.061-3.528-11.922-5.023A.641.641 0 0 1 0 16.736v-2.869a.841.841 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.195 10.195 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952 1.399-1.136 3.392-2.093 6.122-2.093 2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.832.832 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256ZM12.172 11h-.344a4.323 4.323 0 0 1-.355.508C10.703 12.455 9.555 13 7.965 13c-1.725 0-2.989-.359-3.782-1.259a2.005 2.005 0 0 1-.085-.104L4 11.741v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.323 4.323 0 0 1-.355-.508h-.016.016Zm.641-2.935c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z"/><path d="M14.5 14.25a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Zm-5 0a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1Z"/></svg>`,
  gemini:   `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="bl-gemini" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#4285F4"/><stop offset="100%" stop-color="#8ab4f8"/></linearGradient></defs><path d="M12 2.5C11.7 5.5 10.5 8.5 8 12C10.5 15.5 11.7 18.5 12 21.5C12.3 18.5 13.5 15.5 16 12C13.5 8.5 12.3 5.5 12 2.5Z" fill="url(#bl-gemini)"/><path d="M2.5 12C5.5 11.7 8.5 10.5 12 8C15.5 10.5 18.5 11.7 21.5 12C18.5 12.3 15.5 13.5 12 16C8.5 13.5 5.5 12.3 2.5 12Z" fill="url(#bl-gemini)"/></svg>`,
  deepseek: `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358a1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" fill="#4D6BFE"/></svg>`,
  openclaw: `<svg class="brand-logo" viewBox="0 0 120 120" fill="none"><defs><linearGradient id="bl-openclaw" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ff4d4d"/><stop offset="100%" stop-color="#991b1b"/></linearGradient></defs><path d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z" fill="url(#bl-openclaw)"/><path d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z" fill="url(#bl-openclaw)"/><path d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z" fill="url(#bl-openclaw)"/><circle cx="45" cy="35" r="6" fill="#050810"/><circle cx="75" cy="35" r="6" fill="#050810"/><circle cx="46" cy="34" r="2.5" fill="#00e5cc"/><circle cx="76" cy="34" r="2.5" fill="#00e5cc"/></svg>`,
  hermes:   `<svg class="brand-logo" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,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" width="48" height="48"/></svg>`,
  other:    `<svg class="brand-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bl-other" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fde68a"/><stop offset="100%" stop-color="#f59e0b"/></linearGradient></defs><path d="M12 2l2.5 7.6H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.5 2.4-7.4L2 9.6h7.5Z" fill="url(#bl-other)"/></svg>`,
};

/* ── Category icon map (MCP / Frameworks / Prompts / Auto-Research) ─ */
const CAT_ICONS = {
  // ── MCP ──────────────────────────────────────────────────────────
  official:     `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-official" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs><path d="M3 22V10.5L12 3l9 7.5V22h-6v-6h-6v6H3z" fill="url(#ci-official)"/></svg>`,
  database:     `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-database" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#34d399"/></linearGradient></defs><ellipse cx="12" cy="6" rx="8" ry="2.5" fill="url(#ci-database)"/><path d="M4 6v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V6" fill="url(#ci-database)" opacity=".75"/><path d="M4 11v5c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-5" fill="url(#ci-database)" opacity=".5"/></svg>`,
  filesystem:   `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-filesystem" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#c4b5fd"/></linearGradient></defs><path d="M3 7a2 2 0 012-2h4l2 2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" fill="url(#ci-filesystem)"/></svg>`,
  web:          `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-web" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#67e8f9"/></linearGradient></defs><circle cx="12" cy="12" r="9" fill="url(#ci-web)" opacity=".15"/><circle cx="12" cy="12" r="9" stroke="url(#ci-web)" stroke-width="1.5" fill="none"/><path d="M12 3c-3 3-4.5 6-4.5 9s1.5 6 4.5 9M12 3c3 3 4.5 6 4.5 9s-1.5 6-4.5 9M3 12h18M4.5 8h15M4.5 16h15" stroke="url(#ci-web)" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  dev_tools:    `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-dev_tools" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l2.7-2.7a6 6 0 01-7.4 7.4l-6.3 6.3a2.12 2.12 0 01-3-3l6.3-6.3a6 6 0 017.4-7.4l-2.7 2.7z" fill="url(#ci-dev_tools)"/></svg>`,
  productivity: `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-productivity" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#8b949e"/><stop offset="100%" stop-color="#c9d1d9"/></linearGradient></defs><rect x="3" y="4" width="18" height="18" rx="2" fill="url(#ci-productivity)" opacity=".2"/><rect x="3" y="4" width="18" height="18" rx="2" stroke="url(#ci-productivity)" stroke-width="1.5" fill="none"/><path d="M16 2v4M8 2v4M3 10h18M9 15l2 2 4-4" stroke="url(#ci-productivity)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  // ── Frameworks ───────────────────────────────────────────────────
  orchestration:`<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-orchestration" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#fb923c"/></linearGradient></defs><circle cx="12" cy="4" r="2.5" fill="url(#ci-orchestration)"/><circle cx="4" cy="19" r="2.5" fill="url(#ci-orchestration)"/><circle cx="20" cy="19" r="2.5" fill="url(#ci-orchestration)"/><path d="M12 6.5L5 16.8M12 6.5L19 16.8M5 19h14" stroke="url(#ci-orchestration)" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  multi_agent:  `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-multi_agent" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#34d399"/></linearGradient></defs><circle cx="12" cy="5" r="3" fill="url(#ci-multi_agent)"/><circle cx="4.5" cy="18" r="3" fill="url(#ci-multi_agent)" opacity=".75"/><circle cx="19.5" cy="18" r="3" fill="url(#ci-multi_agent)" opacity=".75"/><path d="M12 8v3.5M9.5 16L7 12M14.5 16L17 12" stroke="url(#ci-multi_agent)" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  memory:       `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-memory" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#c4b5fd"/></linearGradient></defs><path d="M9.5 2C6.46 2 4 4.46 4 7.5c0 2.08 1.13 3.9 2.82 4.9L7 12.5V14h2v2h6v-2h2v-1.5l.18-.1A5.5 5.5 0 0019.5 2H9.5z" fill="url(#ci-memory)" opacity=".85"/><path d="M10 16v2M14 16v2M8.5 20h7" stroke="url(#ci-memory)" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  tools:        `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-tools" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#67e8f9"/></linearGradient></defs><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l2.7-2.7a6 6 0 01-7.4 7.4l-6.3 6.3a2.12 2.12 0 01-3-3l6.3-6.3a6 6 0 017.4-7.4l-2.7 2.7z" fill="url(#ci-tools)"/></svg>`,
  evaluation:   `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-evaluation" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs><rect x="3" y="14" width="4" height="8" rx="1" fill="url(#ci-evaluation)"/><rect x="10" y="9" width="4" height="13" rx="1" fill="url(#ci-evaluation)" opacity=".8"/><rect x="17" y="4" width="4" height="18" rx="1" fill="url(#ci-evaluation)" opacity=".6"/></svg>`,
  // ── Prompts ──────────────────────────────────────────────────────
  collection:   `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-collection" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#fb923c"/></linearGradient></defs><path d="M4 3v18M12 3v18M20 3v18M4 3l4 3 4-3 4 3 4-3M4 21l4-3 4 3 4-3 4 3" stroke="url(#ci-collection)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  system:       `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-system" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#34d399"/></linearGradient></defs><path d="M12 2l1.8 3.5L17.5 7l-3.5 1.7L12 12l-1.8-3.3L6.5 7l3.5-1.8L12 2zM5 15l.9 2.2L7.8 18l-1.9.8L5 21l-.9-2.1L2.2 18l1.9-.9L5 15zM19 14l.8 1.8L21.8 17l-2 .8L19 19.5l-.8-1.8L16.2 17l2-.8L19 14z" fill="url(#ci-system)"/></svg>`,
  engineering:  `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-engineering" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#c4b5fd"/></linearGradient></defs><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" fill="url(#ci-engineering)" opacity=".75"/><path d="M8 9h8M8 13h5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  coding:       `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-coding" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#67e8f9"/></linearGradient></defs><polyline points="8,6 3,12 8,18" stroke="url(#ci-coding)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><polyline points="16,6 21,12 16,18" stroke="url(#ci-coding)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/><line x1="14" y1="4" x2="10" y2="20" stroke="url(#ci-coding)" stroke-width="2" stroke-linecap="round"/></svg>`,
  writing:      `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-writing" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="url(#ci-writing)" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" fill="url(#ci-writing)" opacity=".85"/></svg>`,
  // ── Auto Research ─────────────────────────────────────────────────
  deep_research:`<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-deep_research" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#fb923c"/></linearGradient></defs><circle cx="10" cy="10" r="7" fill="url(#ci-deep_research)" opacity=".2"/><circle cx="10" cy="10" r="7" stroke="url(#ci-deep_research)" stroke-width="1.5" fill="none"/><circle cx="10" cy="10" r="3.5" fill="url(#ci-deep_research)" opacity=".55"/><circle cx="10" cy="10" r="1.5" fill="url(#ci-deep_research)"/><line x1="15.5" y1="15.5" x2="21" y2="21" stroke="url(#ci-deep_research)" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  web_research: `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-web_research" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#34d399"/></linearGradient></defs><circle cx="12" cy="12" r="9" fill="url(#ci-web_research)" opacity=".15"/><circle cx="12" cy="12" r="9" stroke="url(#ci-web_research)" stroke-width="1.5" fill="none"/><path d="M12 3c-3 3-4.5 6-4.5 9s1.5 6 4.5 9M12 3c3 3 4.5 6 4.5 9s-1.5 6-4.5 9M3 12h18" stroke="url(#ci-web_research)" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  literature:   `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-literature" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#c4b5fd"/></linearGradient></defs><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="url(#ci-literature)" stroke-width="1.5" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" fill="url(#ci-literature)" opacity=".3"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke="url(#ci-literature)" stroke-width="1.5" fill="none"/><path d="M8 7h8M8 11h6" stroke="url(#ci-literature)" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  data_research:`<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-data_research" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#67e8f9"/></linearGradient></defs><polyline points="3,18 8,11 12,14 17,7 21,9" fill="none" stroke="url(#ci-data_research)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="3" y1="21" x2="21" y2="21" stroke="url(#ci-data_research)" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  knowledge_base:`<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-knowledge_base" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#fbbf24"/></linearGradient></defs><path d="M12 2a7 7 0 015 11.74V16H7v-2.26A7 7 0 0112 2z" fill="url(#ci-knowledge_base)" opacity=".85"/><rect x="9" y="16" width="6" height="2" rx="1" fill="url(#ci-knowledge_base)"/><rect x="10" y="18" width="4" height="2" rx="1" fill="url(#ci-knowledge_base)" opacity=".7"/></svg>`,
};

const ICON_GENERAL = `<svg class="brand-logo" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ci-general" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#8b949e"/><stop offset="100%" stop-color="#c9d1d9"/></linearGradient></defs><circle cx="6" cy="6" r="2.5" fill="url(#ci-general)"/><circle cx="12" cy="6" r="2.5" fill="url(#ci-general)" opacity=".75"/><circle cx="18" cy="6" r="2.5" fill="url(#ci-general)" opacity=".5"/><circle cx="6" cy="12" r="2.5" fill="url(#ci-general)" opacity=".75"/><circle cx="12" cy="12" r="2.5" fill="url(#ci-general)" opacity=".55"/><circle cx="18" cy="12" r="2.5" fill="url(#ci-general)" opacity=".35"/><circle cx="6" cy="18" r="2.5" fill="url(#ci-general)" opacity=".5"/><circle cx="12" cy="18" r="2.5" fill="url(#ci-general)" opacity=".35"/><circle cx="18" cy="18" r="2.5" fill="url(#ci-general)" opacity=".2"/></svg>`;

function getBrandIcon(catId) {
  if (app.pageConfig?.page === 'skills' && BRAND_LOGOS[catId]) return BRAND_LOGOS[catId];
  if (catId === 'general') return ICON_GENERAL;
  return CAT_ICONS[catId] || '';
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
function navigate(page) {
  const newHash = page === 'skills' ? '' : page;
  const cur = location.hash.replace(/^#\/?/, '') || 'skills';
  if (cur === page) {
    router(); // hash won't change, so hashchange won't fire
  } else {
    location.hash = newHash; // hashchange will fire and call router()
  }
}

function router() {
  const seg = location.hash.replace(/^#\/?/, '') || 'skills';
  const config = ROUTES[seg] || ROUTES.skills;
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
  updatePageTitle();

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
  enrichAgentTags();
  enrichRepoCategories();

  renderNav();
  renderHero();
  renderTabs();
  renderBrandSpotlight();
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
function toggleFav(id) {
  const saved = app.favorites.has(id);
  if (saved) app.favorites.delete(id);
  else       app.favorites.add(id);
  localStorage.setItem('st_favorites', JSON.stringify([...app.favorites]));
  document.querySelectorAll(`.fav-btn[data-id="${id}"]`).forEach(b => {
    b.classList.toggle('saved', !saved);
    b.textContent = saved ? '♡' : '❤';
  });
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

/* ── Favorites modal ────────────────────────────────────────────── */
const FAV_SECTION_LABELS = {
  skills:     { en: 'Skills',        zh: 'Skills 技能' },
  mcp:        { en: 'MCP Servers',   zh: 'MCP 服务器' },
  research:   { en: 'Auto Research', zh: '自动化研究' },
  prompts:    { en: 'Prompt Library',zh: 'Prompt 库' },
  frameworks: { en: 'AI Frameworks', zh: 'AI 框架' },
};

function openFavModal() {
  // Group favorites by source page
  const sections = Object.entries(ROUTES).map(([page, cfg]) => {
    const repos = (window[cfg.dataKey]?.repos || [])
      .filter(r => app.favorites.has(r.id))
      .sort((a, b) => b.stars - a.stars);
    return { page, label: FAV_SECTION_LABELS[page][app.lang] || page, repos };
  }).filter(s => s.repos.length > 0);

  let modal = document.getElementById('favModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'favModal';
    modal.className = 'fav-modal-overlay';
    modal.addEventListener('click', closeFavModal);
    document.body.appendChild(modal);
  }

  if (!sections.length) {
    modal.innerHTML = `
      <div class="fav-modal" onclick="event.stopPropagation()">
        <div class="fav-modal-header">
          <span>❤ ${t('nav_favorites')}</span>
          <button class="fav-modal-close" onclick="closeFavModal()">✕</button>
        </div>
        <div class="empty-state"><span class="icon">🤍</span><strong>${t('no_fav')}</strong><p>${t('no_fav_sub')}</p></div>
      </div>`;
  } else {
    const tabsHtml = sections.map((s, i) => `
      <button class="fav-modal-tab${i === 0 ? ' active' : ''}" onclick="switchFavTab('${s.page}')" data-page="${s.page}">
        ${s.label} <span class="cnt">${s.repos.length}</span>
      </button>`).join('');

    const sectionsHtml = sections.map((s, i) => {
      const allForPage = window[ROUTES[s.page]?.dataKey]?.repos || [];
      const rankMap = new Map(allForPage.map((r, idx) => [r.id, idx + 1]));
      return `
      <div class="fav-modal-section${i === 0 ? '' : ' hidden'}" data-page="${s.page}">
        <div class="fav-modal-grid">${s.repos.map(r => cardHTML(r, rankMap.get(r.id) ?? 999)).join('')}</div>
      </div>`;
    }).join('');

    modal.innerHTML = `
      <div class="fav-modal" onclick="event.stopPropagation()">
        <div class="fav-modal-header">
          <span>❤ ${t('nav_favorites')}</span>
          <button class="fav-modal-close" onclick="closeFavModal()">✕</button>
        </div>
        <div class="fav-modal-tabs">${tabsHtml}</div>
        ${sectionsHtml}
      </div>`;
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function switchFavTab(page) {
  document.querySelectorAll('#favModal .fav-modal-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('#favModal .fav-modal-section').forEach(s =>
    s.classList.toggle('hidden', s.dataset.page !== page));
}

function closeFavModal() {
  const modal = document.getElementById('favModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFavModal(); });

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
    <a class="nav-brand" href="#" onclick="event.preventDefault();navigate('skills');document.getElementById('navbar').classList.remove('nav-open')">
      <img src="favicon.svg" alt="logo" />
      <span class="nav-brand-text">${app.lang === 'zh' ? 'Agent 排行榜' : 'Agent Leaderboard'}</span>
    </a>
    <button class="nav-hamburger" onclick="toggleMobileNav()" aria-label="Menu" style="display:none">
      <span></span><span></span><span></span>
    </button>
    <div class="nav-links">
      <a class="nav-link${pg==='skills'?' active':''}" href="#skills" onclick="event.preventDefault();navigate('skills');document.getElementById('navbar').classList.remove('nav-open')">
        <svg class="nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ni-skills" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#f97316"/></linearGradient></defs><path d="M13 2L4.5 13H10L9 22L19.5 11H14L13 2Z" fill="url(#ni-skills)"/></svg>
        <span class="full">${t('nav_skills')}</span>
      </a>
      <a class="nav-link${pg==='research'?' active':''}" href="#research" onclick="event.preventDefault();navigate('research');document.getElementById('navbar').classList.remove('nav-open')">
        <svg class="nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ni-research" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#a78bfa"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><circle cx="10" cy="10" r="6.5" stroke="url(#ni-research)" stroke-width="2.2"/><line x1="15.2" y1="15.2" x2="21" y2="21" stroke="url(#ni-research)" stroke-width="2.5" stroke-linecap="round"/><circle cx="8.2" cy="10" r="1.4" fill="#a78bfa"/><circle cx="11.8" cy="10" r="1.4" fill="#6366f1"/><path d="M8.2 10 L10 7.8 L11.8 10" fill="none" stroke="#a78bfa" stroke-width="1.2" stroke-linecap="round"/></svg>
        <span class="full">${t('nav_research')}</span>
      </a>
      <a class="nav-link${pg==='mcp'?' active':''}" href="#mcp" onclick="event.preventDefault();navigate('mcp');document.getElementById('navbar').classList.remove('nav-open')">
        <svg class="nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ni-mcp" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs><rect x="9" y="9" width="6" height="6" rx="1.5" fill="url(#ni-mcp)"/><circle cx="3.5" cy="12" r="1.8" fill="#22d3ee"/><circle cx="20.5" cy="12" r="1.8" fill="#3b82f6"/><circle cx="12" cy="3.5" r="1.8" fill="#22d3ee"/><circle cx="12" cy="20.5" r="1.8" fill="#3b82f6"/><line x1="9" y1="12" x2="5.3" y2="12" stroke="#22d3ee" stroke-width="1.4"/><line x1="15" y1="12" x2="18.7" y2="12" stroke="#3b82f6" stroke-width="1.4"/><line x1="12" y1="9" x2="12" y2="5.3" stroke="#22d3ee" stroke-width="1.4"/><line x1="12" y1="15" x2="12" y2="18.7" stroke="#3b82f6" stroke-width="1.4"/></svg>
        <span class="full">${t('nav_mcp')}</span>
      </a>
      <a class="nav-link${pg==='prompts'?' active':''}" href="#prompts" onclick="event.preventDefault();navigate('prompts');document.getElementById('navbar').classList.remove('nav-open')">
        <svg class="nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ni-prompts" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#10b981"/></linearGradient></defs><rect x="5" y="4" width="14" height="16" rx="2" fill="url(#ni-prompts)"/><line x1="8.5" y1="9" x2="15.5" y2="9" stroke="white" stroke-width="1.5" stroke-linecap="round"/><line x1="8.5" y1="12.5" x2="15.5" y2="12.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/><line x1="8.5" y1="16" x2="13" y2="16" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
        <span class="full">${t('nav_prompts')}</span>
      </a>
      <a class="nav-link${pg==='frameworks'?' active':''}" href="#frameworks" onclick="event.preventDefault();navigate('frameworks');document.getElementById('navbar').classList.remove('nav-open')">
        <svg class="nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ni-frameworks" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs><rect x="8.5" y="3" width="7" height="4" rx="1" fill="url(#ni-frameworks)" opacity="0.6"/><rect x="5" y="9" width="14" height="4" rx="1" fill="url(#ni-frameworks)" opacity="0.8"/><rect x="2.5" y="15" width="19" height="4" rx="1.5" fill="url(#ni-frameworks)"/></svg>
        <span class="full">${t('nav_frameworks')}</span>
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
      <button class="nav-btn" id="favBtn" onclick="openFavModal()">
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
  const catEntries = Object.entries(cats);
  // 'other' always last, regardless of data insertion order
  const sorted = [
    ...catEntries.filter(([id]) => id !== 'other'),
    ...catEntries.filter(([id]) => id === 'other'),
  ];
  sorted.forEach(([id, meta]) => {
    items.push({ id, label: tCat(meta.label), count: meta.count });
  });

  tabs.innerHTML = items.map(it => `
    <button class="tab${it.id === app.activeTab ? ' active' : ''}" data-id="${it.id}"
            onclick="setTab('${it.id}')">
      ${getBrandIcon(it.id)} ${it.label} <span class="cnt">${it.count}</span>
    </button>`).join('');
  syncTabsScrollBtn();
  tabs.removeEventListener('scroll', syncTabsScrollBtn);
  tabs.addEventListener('scroll', syncTabsScrollBtn, { passive: true });
}

function syncTabsScrollBtn() {
  const tabs = document.getElementById('tabs');
  const btnR = document.getElementById('tabsScrollBtn');
  const btnL = document.getElementById('tabsScrollBtnLeft');
  if (!tabs) return;
  const atEnd   = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 8;
  const atStart = tabs.scrollLeft <= 8;
  if (btnR) btnR.classList.toggle('hidden', atEnd);
  if (btnL) btnL.classList.toggle('hidden', atStart);
}

function scrollTabsRight() {
  const tabs = document.getElementById('tabs');
  if (tabs) tabs.scrollBy({ left: 240, behavior: 'smooth' });
}

function scrollTabsLeft() {
  const tabs = document.getElementById('tabs');
  if (tabs) tabs.scrollBy({ left: -240, behavior: 'smooth' });
}

function setTab(id) {
  app.activeTab  = id;
  app.currentPage = 1;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === id));
  renderBrandSpotlight();
  applyFilters();
}

/* ── Brand spotlight ─────────────────────────────────────────────── */
function renderBrandSpotlight() {
  const el = document.getElementById('brandSpotlight');
  if (!el) return;
  const id = app.activeTab;
  const info = BRAND_LINKS[id];
  if (!info || id === 'all') { el.innerHTML = ''; return; }

  const logo = BRAND_LOGOS[id] || '';
  const desc = app.lang === 'zh' ? info.desc_zh : info.desc_en;
  const cats = app.data?.categories || {};
  const count = cats[id]?.count ?? '';

  const homeBtn = info.home
    ? `<a class="bs-link bs-primary" href="${info.home}" target="_blank" rel="noopener">↗ ${info.homeLabel}</a>`
    : '';
  const skillsBtn = info.skills
    ? `<a class="bs-link" href="${info.skills}" target="_blank" rel="noopener">📖 ${info.skillsLabel}</a>`
    : '';

  el.innerHTML = `
    <div class="brand-spotlight">
      <div class="bs-logo">${logo}</div>
      <div class="bs-body">
        <div class="bs-name">${tCat(cats[id]?.label || id)}<span class="bs-count">${count ? ` · ${count} repos` : ''}</span></div>
        <div class="bs-desc">${desc}</div>
      </div>
      <div class="bs-links">${homeBtn}${skillsBtn}</div>
    </div>`;
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
  syncUCScrollBtn();
  row.addEventListener('scroll', syncUCScrollBtn, { passive: true });
}

function syncUCScrollBtn() {
  const row = document.getElementById('ucScroller');
  const btnR = document.getElementById('ucScrollBtn');
  const btnL = document.getElementById('ucScrollBtnLeft');
  if (!row) return;
  const atEnd   = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
  const atStart = row.scrollLeft <= 8;
  if (btnR) btnR.classList.toggle('hidden', atEnd);
  if (btnL) btnL.classList.toggle('hidden', atStart);
}

function scrollUCRight() {
  const row = document.getElementById('ucScroller');
  if (row) row.scrollBy({ left: 240, behavior: 'smooth' });
}

function scrollUCLeft() {
  const row = document.getElementById('ucScroller');
  if (row) row.scrollBy({ left: -240, behavior: 'smooth' });
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

/* ── Client-side multi-category computation (fallback for old data) ── */
const _CAT_PATTERNS = [
  ['claude',   /claude|anthropic/i],
  ['codex',    /\bcodex\b|gpt.?4|chatgpt/i],
  ['gemini',   /\bgemini\b/i],
  ['cursor',   /\bcursor\b/i],
  ['copilot',  /copilot/i],
  ['deepseek', /deepseek/i],
  ['openclaw', /openclaw/i],
  ['hermes',   /hermes[\s-]?agent|nousresearch/i],
];

function enrichRepoCategories() {
  // Multi-category tab filtering only applies to the Skills page
  if (app.pageConfig?.page !== 'skills') return;
  (app.allRepos || []).forEach(repo => {
    if (repo.categories) return;
    const nameTopics = (repo.full_name + ' ' + (repo.topics || []).join(' ')).toLowerCase();
    const desc       = (repo.description || '').toLowerCase();
    const nameCats   = _CAT_PATTERNS.filter(([, re]) => re.test(nameTopics)).map(([c]) => c);
    const descCats   = _CAT_PATTERNS.filter(([, re]) => re.test(desc)).map(([c]) => c);
    const seen       = [...new Set([...nameCats, ...descCats])];
    repo.categories  = seen.length ? seen : [repo.category];
  });
  // Recompute per-category counts based on multi-category assignments
  const cats = app.data?.categories;
  if (!cats) return;
  const counts = {};
  (app.allRepos || []).forEach(repo => {
    (repo.categories || [repo.category]).forEach(c => { counts[c] = (counts[c] || 0) + 1; });
  });
  Object.keys(cats).forEach(id => { cats[id].count = counts[id] || 0; });
}

function enrichAgentTags() {
  // Detect agent brand mentions on every page for logo display
  (app.allRepos || []).forEach(repo => {
    if (repo.agentTags) return;
    const text = (
      repo.full_name + ' ' +
      (repo.description || '') + ' ' +
      (repo.topics || []).join(' ')
    ).toLowerCase();
    repo.agentTags = _CAT_PATTERNS.filter(([, re]) => re.test(text)).map(([c]) => c);
  });
}

/* ── Apply filters ──────────────────────────────────────────────── */
function applyFilters() {
  let list = app.activeTab === 'all'
    ? app.allRepos
    : app.allRepos.filter(r => (r.categories || [r.category]).includes(app.activeTab));

  if (app.favOnly) list = list.filter(r => app.favorites.has(r.id));
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
    const uc  = chip.dataset.uc;
    const n   = counts[uc] || 0;
    const cnt = chip.querySelector('.uc-cnt');
    if (cnt) cnt.textContent = n;
    // hide zero-count chips unless they're actively selected
    chip.style.display = (n === 0 && !app.selectedUCs.has(uc)) ? 'none' : '';
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
  const isSkills = app.pageConfig?.page === 'skills';
  let catBadges;
  if (isSkills) {
    const repoCats = repo.categories || [repo.category];
    catBadges = repoCats.map(c =>
      `<span class="badge cat-badge ${c} clickable" onclick="event.preventDefault();event.stopPropagation();setTab('${c}')">${getBrandIcon(c)} ${tCat(cats[c]?.label || c)}</span>`
    ).join('');
  } else {
    catBadges =
      `<span class="badge cat-badge ${repo.category} clickable" onclick="event.preventDefault();event.stopPropagation();setTab('${repo.category}')">${getBrandIcon(repo.category)} ${tCat(cats[repo.category]?.label || repo.category)}</span>` +
      (repo.agentTags || []).map(a => BRAND_LOGOS[a]
        ? `<span class="agent-tag" title="${a}">${BRAND_LOGOS[a]}</span>`
        : ''
      ).join('');
  }
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
          <button class="fav-btn${isSaved ? ' saved' : ''}" data-id="${repo.id}"
                  onclick="event.preventDefault();event.stopPropagation();toggleFav(${repo.id})">
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
          ${catBadges}
          <span class="fork-info"><svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z"/></svg>${fmtNum(repo.forks)} · <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"/></svg> ${timeAgo(repo.created_at || repo.updated_at)}</span>
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
    const isSkillsL = app.pageConfig?.page === 'skills';
    let catBadgesL;
    if (isSkillsL) {
      const repoCatsL = repo.categories || [repo.category];
      catBadgesL = repoCatsL.map(c =>
        `<span class="badge cat-badge ${c} clickable" onclick="setTab('${c}')">${getBrandIcon(c)} ${tCat(cats[c]?.label || c)}</span>`
      ).join('');
    } else {
      catBadgesL =
        `<span class="badge cat-badge ${repo.category} clickable" onclick="setTab('${repo.category}')">${getBrandIcon(repo.category)} ${tCat(cats[repo.category]?.label || repo.category)}</span>` +
        (repo.agentTags || []).map(a => BRAND_LOGOS[a]
          ? `<span class="agent-tag" title="${a}">${BRAND_LOGOS[a]}</span>`
          : ''
        ).join('');
    }
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
      <td class="lt-cat">${catBadgesL}</td>
      <td class="lt-lang">${repo.language ? `<span class="clickable" onclick="setLang('${repo.language}')">${repo.language}</span>` : '—'}</td>
      <td class="lt-updated">${timeAgo(repo.created_at || repo.updated_at)}</td>
      <td class="lt-fav">
        <button class="fav-btn${isSaved ? ' saved' : ''}" data-id="${repo.id}"
                onclick="toggleFav(${repo.id})">
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
function updatePageTitle() {
  document.title = 'Agent Leaderboard';
}

function renderAll() {
  renderNav();
  renderHero();
  renderTabs();
  renderFilterBar();
  renderUCChips();
  applyFilters();
  applyThemeBtn();
  applyLangBtn();
  updatePageTitle();
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
window.addEventListener('resize', () => { syncTabsScrollBtn(); syncUCScrollBtn(); });

// Auto-follow system theme only if user hasn't manually set one
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
  if (localStorage.getItem('st_theme')) return;
  app.theme = e.matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = app.theme;
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = app.theme === 'dark' ? '☀️' : '🌙';
});

/* ── Visit counter ──────────────────────────────────────────────── */
let _visitLoaded = false;
async function loadVisitCount() {
  if (_visitLoaded) return;
  _visitLoaded = true;
  const key   = app.pageConfig.page;
  const badge = document.getElementById('visitBadge');
  if (!badge) return;
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 8000);
    const res  = await fetch(
      `https://api.counterapi.dev/v1/agentskills/${key}/up`,
      { signal: ctrl.signal }
    );
    clearTimeout(tid);
    if (!res.ok) throw new Error('non-ok');
    const data  = await res.json();
    const count = data?.count;
    if (typeof count !== 'number') throw new Error('no count');
    badge.textContent = `👁 ${count.toLocaleString()} ${t('stat_visits')}`;
  } catch {
    badge.textContent = '';
  }
}

