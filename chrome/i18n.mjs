import {BOARDS, UC_EN, CAT_EN} from './taxonomy.mjs';
let locale = 'zh-CN';
export const getLocale = () => locale;
export const setLocale = value => { locale = value === 'en' ? 'en' : 'zh-CN'; };
export const MESSAGES_EN = {
  '趋势':'Trending', '趋势时间和排序':'Trend period and sorting', '趋势周期':'Trend period', '趋势排序':'Trend sorting',
  '日':'Day', '周':'Week', '月':'Month', '增长率':'Growth rate', '新增 Stars':'Stars gained',
  '第 {rank} 名':'Rank {rank}', '趋势前 {count} 名':'Top {count} rising repositories', '暂无可用趋势':'Trends unavailable',
  '本榜单 {count} 个可比仓库，{rising} 个上升，净增 {net} Stars':'Board: {count} comparable repositories, {rising} rising, {net} net stars',
  '计算方法':'How trends are calculated',
  '按每日快照比较 Stars，仅展示正增长；增长率不包含起点为 0 的仓库。快照可能沿用较早记录，并非 GitHub 实时事件。':'Daily star snapshots, positive growth only. Rate sorting excludes zero baselines. Snapshots may retain older records; these are observed changes, not live GitHub events.',
  '新增 {delta} Stars，增长率 {rate}':'{delta} stars gained, {rate} growth',
  '还没有足够的历史快照':'Not enough history yet', '趋势数据正在更新':'Trend snapshots are updating',
  '没有匹配的上升仓库':'No matching rising repositories', '这段时间暂无上升仓库':'No rising repositories in this period',
  '当前周期缺少历史记录，请换一个周期或稍后更新。':'This period has no baseline yet. Try another period or refresh later.',
  '目录和趋势快照时间不同，请更新数据后重试。':'Catalog and trend snapshots differ. Refresh and try again.',
  '试试其他关键词、榜单或周期。':'Try another query, board, or period.', '清除搜索':'Clear search',
  '官网趋势 ↗':'Website trends ↗', '打开官网趋势榜':'Open website trends',
  '暂时无法读取最新目录和趋势':'The latest catalog and trends could not be loaded',
  '目录与趋势时间不一致，请稍后重试':'Catalog and trend timestamps differ. Try again later.',
  '远程趋势比当前快照旧':'Remote trends are older than the current snapshot',

  '收藏账号':'Favorites account', '收藏随账号同步':'Sync favorites with your account',
  '本地收藏可合并到 GitHub 账号':'Merge local favorites with your GitHub account',
  'GitHub 登录':'Sign in with GitHub', '同步':'Sync', '退出':'Sign out', '其他':'Other',
  '正在处理账号操作…':'Updating your account…', '正在同步收藏…':'Syncing favorites…',
  '部分收藏仅保存在本机':'Some favorites are still local', '已与官网同步':'Synced with the website',
  '离线显示上次同步的收藏':'Offline: showing your last synced favorites', '请同步以获取最新收藏':'Sync to get the latest favorites',
  '{count} 条旧收藏待同步，仍保留在本机':'{count} older favorites still need syncing and remain on this device',
  'GitHub 登录未完成，请重试':'GitHub sign-in did not finish. Please try again.',
  '登录校验已失效，请重新登录':'The sign-in check has expired. Please sign in again.',
  'GitHub 授权已取消':'GitHub authorization was cancelled.',
  'GitHub 登录配置暂不可用，请联系维护者':'GitHub sign-in is misconfigured. Please contact the maintainer.',
  '本次授权已失效，请重新登录':'This authorization is no longer valid. Please sign in again.',
  '请先验证 GitHub 主邮箱，再登录':'Verify your primary GitHub email address before signing in.',
  '暂时无法连接 GitHub，请稍后重试':'GitHub could not be reached. Please try again later.',
  '暂时无法读取 GitHub 账号，请稍后重试':'Your GitHub account could not be loaded. Please try again later.',
  '无法确认 GitHub 账号，请联系维护者':'Your GitHub identity could not be verified. Please contact the maintainer.',
  '登录暂时无法保存，请稍后重试':'Your sign-in could not be saved. Please try again later.',
  '浏览器暂时无法保存数据，请重试':'Browser storage is unavailable. Please try again.',
  '账号已变化，请重新同步收藏':'Your account changed. Please sync favorites again.',
  '登录已过期，请重新登录':'Your session expired. Please sign in again.',
  '暂时无法连接，收藏修改未保存':'Unable to connect. Your favorite changes were not saved.',
  '收藏修改未保存，请联网后重试':'Your favorite changes were not saved. Reconnect and try again.',
  '部分本地收藏尚未导入，请重试同步':'Some local favorites have not imported yet. Try syncing again.',
  '暂时无法同步收藏，请稍后重试':'Favorites could not be synced. Please try again later.',
  '收藏服务暂不可用，请重新加载插件':'Favorites are unavailable. Please reload the extension.',
  '仓库 #{id}':'Repository #{id}',
  '仓库资料暂不可用，收藏记录仍已保留。':'Repository details are unavailable. Your favorite is still saved.',
  'Agent 搜索助手': 'Agent Search',
  '跟随系统': 'System', '浅色': 'Light', '深色': 'Dark',
  '主题：{mode}；点击切换为{next}': 'Theme: {mode}; click for {next}',
  '搜索和筛选': 'Search and filters', '搜索 Agent 工具': 'Search Agent tools',
  '搜索名称、用途或关键词': 'Search tools or keywords', '搜索': 'Search',
  '切换明暗主题': 'Toggle light / dark theme', '在新标签页打开': 'Open in a new tab',
  '查看范围': 'View', '发现': 'Discover', '收藏': 'Favorites', '筛选': 'Filters',
  '榜单': 'Boards', '全部': 'All', '框架': 'Frameworks', '研究': 'Research',
  '分类': 'Category', '全部分类': 'All categories', '全部用途': 'All use cases',
  '选择用途': 'Select use cases', '用途多选 · 同时匹配': 'Match all selected uses',
  '清空已选': 'Clear selection', '查找用途': 'Find a use case',
  '查找用途，如代码、研究…': 'Find uses, e.g. code, research…', '用途标签': 'Use cases',
  '没有匹配的用途，试试其他关键词。': 'No matching uses. Try another keyword.',
  '适用平台': 'Platform', '全部平台': 'All platforms', '编程语言': 'Language',
  '全部语言': 'All languages', '最低 Stars': 'Minimum stars', '不限': 'Any',
  '更新时间': 'Updated', '全部时间': 'All time', '近 1 月': 'Past month',
  '近 3 月': 'Past 3 months', '近 1 年': 'Past year', '重置筛选': 'Reset filters',
  '已选条件': 'Active filters', '正在载入目录…': 'Loading catalog…', '排序': 'Sort',
  '相关度优先': 'Relevance', 'Stars 最多': 'Most stars', '最近更新': 'Recently updated',
  '仓库搜索结果': 'Repository results', '没有找到匹配的仓库': 'No matching repositories',
  '试试更短的关键词，或清除筛选条件。': 'Try a shorter query or clear your filters.',
  '清除搜索和筛选': 'Clear search and filters', '仓库分页': 'Repository pages',
  '上一页': 'Previous page', '‹ 上一页': '‹ Previous', '下一页': 'Next page', '下一页 ›': 'Next ›',
  '跳转到页码': 'Go to page', '页': 'pages', '正在读取离线快照': 'Loading offline catalog',
  '更新数据': 'Refresh catalog', '完整榜单 ↗': 'Website ↗', '使用说明': 'Help',
  '未知': 'Unknown', '本次搜索条件未能保存': 'Could not save this search',
  '打开{board}榜单': 'Open {board}', '打开完整榜单': 'Open the full leaderboard',
  '{count} 个仓库': '{count} repositories', '{count} 个仓库匹配': '{count} matching repositories',
  '{count} 个收藏': '{count} favorites', '{count} 个收藏匹配': '{count} matching favorites',
  '点击仓库旁的书签按钮，把感兴趣的工具留在这里。': 'Use the bookmark button next to a repository to save it here.',
  '第 {page} 页，共 {total} 页，显示第 {start} 至 {end} 个仓库': 'Page {page} of {total}, repositories {start}–{end}',
  '没有匹配的仓库': 'No matching repositories', '已选 {count} 项用途': '{count} uses selected',
  '按用途筛选，可多选': 'Filter by use case; select multiple', '移除筛选：{label}': 'Remove filter: {label}',
  '清除全部': 'Clear all', '取消收藏': 'Remove favorite', '收藏仓库': 'Save repository',
  '收藏未能保存，请检查浏览器存储空间': 'Could not save favorite. Check browser storage.',
  '此仓库暂无简介，打开 README 查看详情。': 'No description. Open the README for details.',
  '详情': 'Details', '查看 {name} 的完整详情': 'View full details for {name}', '暂无简介': 'No description',
  '所属榜单：{boards}': 'Boards: {boards}', '编程语言：{language}': 'Language: {language}',
  '适用平台：{platforms}（根据目录关键词推断）': 'Platforms: {platforms} (inferred from catalog keywords)',
  '用途：{uses}': 'Use cases: {uses}', '仓库更新：{date}': 'Repository updated: {date}',
  '查看 README ↗': 'Read README ↗', '复制链接': 'Copy link', '仓库链接已复制': 'Repository link copied',
  '复制失败，可右键仓库名称复制链接': 'Copy failed. Right-click the repository name to copy its link.',
  '复制安装提示': 'Copy install prompt',
  '复制安装提示，粘贴到 AI 编程工具': 'Copy install prompt for your AI coding tool',
  '复制 {name} 的安装提示': 'Copy install prompt for {name}',
  '安装提示已复制，粘贴到 AI 编程工具中使用': 'Install prompt copied. Paste it into your AI coding tool.',
  '安装提示复制失败，请重试': 'Could not copy the install prompt. Please try again.',
  '正在更新数据': 'Refreshing catalog', '远程目录比当前目录旧': 'Remote catalog is older than the current one',
  '已更新': 'Updated', '已更新，未缓存': 'Updated, not cached',
  '目录已更新，但未能缓存；下次仍可使用原有离线数据': 'Catalog updated but could not be cached. Previous offline data remains available.',
  '更新失败，保留离线数据': 'Update failed; using offline data',
  '目录读取失败，请重试更新': 'Catalog unavailable. Try refreshing.', '暂无可用目录': 'No catalog available',
  '主题设置未能保存': 'Could not save theme preference', '语言设置未能保存': 'Could not save language preference',
  '本地缓存': 'Cached catalog', '内置快照': 'Bundled catalog', '本地目录载入失败': 'Local catalog failed to load',
  '请点击更新数据，或重新加载插件': 'Refresh the catalog or reload the extension',
  '目录格式无效': 'Invalid catalog format', '目录包含无效仓库': 'Catalog contains an invalid repository',
};
export function t(key, values = {}) {
  const message = locale === 'en' ? MESSAGES_EN[key] || key : key;
  return message.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}
export const useLabel = value => locale === 'en' ? UC_EN[value] || value : value;
export const boardLabel = source => locale === 'en' ? BOARDS[source]?.labelEn || source : BOARDS[source]?.label || source;
export const localizedCategory = (source, category) => {
  const label = BOARDS[source]?.categories[category] || category;
  return locale === 'en' ? CAT_EN[label] || label : label;
};
export function bindStaticTranslations(root) {
  // Capture authored labels once. Dynamic lists use t() during rendering.
  const entries = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, key = node.textContent.trim();
    if (Object.hasOwn(MESSAGES_EN, key)) entries.push(() => {
      if (node.isConnected) node.textContent = node.textContent.replace(/\S[\s\S]*\S|\S/, t(key));
    });
  }
  for (const node of root.querySelectorAll('*')) for (const attribute of ['title', 'aria-label', 'placeholder']) {
    const key = node.getAttribute(attribute);
    if (Object.hasOwn(MESSAGES_EN, key)) entries.push(() => {
      if (node.isConnected) node.setAttribute(attribute, t(key));
    });
  }
  return () => entries.forEach(apply => apply());
}
