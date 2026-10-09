import {BOARDS, UC_EN, CAT_EN} from './taxonomy.mjs';
let locale = 'zh-CN';
export const getLocale = () => locale;
export const setLocale = value => { locale = value === 'en' ? 'en' : 'zh-CN'; };
export const MESSAGES_EN = {
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
