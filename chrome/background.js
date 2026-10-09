const MENU_ID = 'agent-search-selection';
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(console.error);
async function configureLanguage(recreateMenu = false) {
  const {uiLocale} = await chrome.storage.local.get('uiLocale');
  const english = uiLocale === 'en';
  const title = english ? 'Search Agent Leaderboard for “%s”' : '在 Agent 排行榜搜索“%s”';
  if (recreateMenu) chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({id: MENU_ID, title, contexts: ['selection']});
  });
  else chrome.contextMenus.update(MENU_ID, {title}, () => { void chrome.runtime.lastError; });
  chrome.action.setTitle({title: english ? 'Open Agent Search' : '打开 Agent 搜索助手'});
  chrome.omnibox.setDefaultSuggestion({description: english
    ? 'Search Agent Skills, MCP servers, prompts, frameworks, and research tools'
    : '搜索 Agent Skills、MCP、Prompt、AI 框架和研究工具'});
}
chrome.runtime.onInstalled.addListener(() => configureLanguage(true).catch(console.error));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.uiLocale) configureLanguage().catch(console.error);
});
configureLanguage().catch(console.error);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText || !tab) return;
  const query = info.selectionText.trim().slice(0, 500);
  // open must happen during the user gesture, before awaiting storage.
  const opening = chrome.sidePanel.open({windowId: tab.windowId});
  chrome.storage.session.set({[`request:${tab.windowId}`]: {query, nonce: crypto.randomUUID()}}).catch(console.error);
  opening.catch(() => chrome.tabs.create({url: searchURL(query)}));
});

function searchURL(query) {
  return `${chrome.runtime.getURL('panel.html')}?q=${encodeURIComponent(query.slice(0, 500))}`;
}
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = searchURL(text);
  if (disposition === 'currentTab') chrome.tabs.update({url});
  else chrome.tabs.create({url, active: disposition !== 'newBackgroundTab'});
});
