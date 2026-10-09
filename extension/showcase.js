import {installationPrompt} from '../chrome/install-prompt.mjs';
const zh = {
  skip:'跳转到正文', navInstall:'下载安装', navGuide:'使用指南', navUpdates:'版本更新',
  product:'Chrome 搜索助手', headline:'找 AI 工具，<br>就在浏览器侧边。',
  intro:'把 Skills、MCP、Prompt、AI 框架和研究工具放进紧凑的侧边栏。找到项目后，复制安装提示，交给你自己的 AI 编程工具继续完成安装。',
  get:'获取插件', source:'查看源码', compatibility:'Chrome 116+ · 免费开源 · 无需账号',
  flowFind:'找到项目', flowCopy:'复制安装提示', flowUse:'交给 AI 编程工具',
  new:'1.6 新增：每个仓库都能一键复制安装提示。', whatsNew:'查看更新',
  caption:'插件真实界面，预览随本页语言和主题切换。',
  featuresTitle:'整个工具目录，随手可查。', featuresIntro:'沿用官网五大榜单和分类，把常用操作留在当前网页旁。',
  f1Title:'带着需求找项目', f1:'搜索名称和用途，组合分类与筛选条件；也可以选中网页文字，直接通过右键菜单搜索。',
  f2Title:'接着交给 AI 安装', f2:'复制包含仓库和 README 地址的安装提示，让 AI 检查环境，按项目文档配置并验证结果。',
  f3Title:'把想用的工具留下来', f3:'本地收藏感兴趣的仓库。每页 30 条，可直接跳转页码；完整简介与标签按需展开，列表保持紧凑。',
  f4Title:'明暗、中英文、离线都可用', f4:'内置完整目录快照，断网仍可搜索。即时切换中英文，主题默认跟随系统，也可手动选择浅色或深色。',
  installTitle:'把它放进你的侧边栏。', installIntro:'下载安装包，在桌面版 Chrome 中加载即可。当前提供本地安装版，尚未上架 Chrome 应用商店。',
  download:'下载 ZIP 安装包', downloadNote:'已包含图标和离线目录，无需安装构建工具。', sourceAlternative:'也可以直接加载源码中的 chrome/ 文件夹',
  step1Title:'解压，保留这个文件夹', step1:'将下载的 ZIP 解压到一个固定位置。插件使用期间，请保留该文件夹。',
  step2Title:'打开 Chrome 扩展管理页', copyAddress:'复制地址', step2:'将地址粘贴到新标签页，打开右上角的“开发者模式”。',
  step3Title:'加载已解压的扩展程序', step3:'点击“加载已解压的扩展程序”，选择包含 manifest.json 的文件夹。如果使用项目源码，选择其中的 chrome/ 文件夹。',
  step4Title:'固定图标，开始搜索', step4:'打开 Chrome 的扩展程序菜单，固定 Agent Leaderboard。点击插件图标，即可打开侧边栏。',
  guideTitle:'从找到项目，到接入工作区。', guideIntro:'三个步骤，不用离开正在阅读的网页。',
  g1Title:'找到合适的项目', g1:'选择 Skills、MCP、Prompt、AI 框架或研究榜单，再按分类、平台、编程语言、Stars 或更新时间筛选。多选用途时，结果需同时匹配。',
  g2Title:'查看详情，复制提示', g2:'打开 README 或展开“详情”。点击书签旁的复制图标，复制包含仓库地址与文档链接的安装提示。',
  g3Title:'粘贴到 AI 编程工具', g3:'交给 Claude Code、Codex、Cursor 等助手识别实际安装方式。如果仓库是资源合集，先确认你需要的具体组件。',
  tryTitle:'试一下，复制给你的 AI', tryText:'以 microsoft/playwright-mcp 为例，复制插件实际生成的安装提示。内容跟随当前页面语言。',
  copyPrompt:'复制示例安装提示', handoffNote:'复制操作不会安装软件，也不会自动发送给 AI 服务。粘贴到你自己的工具后再继续。', previewPrompt:'展开完整安装提示',
  shortcuts:'还有两种快捷入口', omnibox:'在 Chrome 地址栏输入，按 Tab，再输入搜索词。', shortcutText:'打开侧边栏。可在 chrome://extensions/shortcuts 修改。',
  faqTitle:'你可能还想知道。', q1:'目录内容会自动更新吗？', a1:'官网目录每日更新。插件打开时，如果距上次成功检查已超过 24 小时，会检查新版目录；也可手动刷新。断网或更新失败时继续使用本地缓存或内置快照，底部会显示实际数据日期。',
  q2:'插件本身如何升级？', a2:'下载新版 ZIP，解压后覆盖原插件文件夹中的文件，再到 chrome://extensions 点击 Agent Leaderboard 的“重新加载”。保留原文件夹，不要先卸载，这样本地收藏和设置会保留。目录刷新只更新数据，不会升级插件代码。',
  q3:'能和 ChatGPT 或其他插件一起用吗？', a3:'可以同时使用，再把安装提示粘贴到你选择的 AI 工具。本插件不读取它们的对话，也不对接其私有接口；接收提示的助手需要具备相应的工作区与命令执行能力，才能真正执行安装。',
  q4:'搜索和收藏会上传吗？', a4:'无需账号。搜索在本地完成，收藏保存在当前 Chrome 配置中。插件没有统计追踪，不读取浏览历史、Cookie 或网页正文；收藏不会同步到官网或其他设备，卸载插件会删除本地数据。',
  q5:'所有仓库都能直接安装吗？', a5:'不一定，有些条目是合集、文档或提示词。目录平台标签根据关键词推断，不代表兼容性已验证。安装提示会要求 AI 先读官方文档，选择适当的使用方式，保留已有配置，并如实说明不支持的情况。',
  updatesTitle:'版本更新', current:'当前版本', updateTitle:'找到工具后，再往前走一步。',
  u1:'每个仓库旁新增复制安装提示按钮，“详情”中也可直接复制。', u2:'中英文提示包含仓库及 README 地址、环境识别、按文档安装与结果验证。', u3:'同时包含紧凑侧栏、五大榜单、多用途筛选、分页、本地收藏、离线搜索和跟随系统主题。',
  fullDocs:'查看完整插件文档', back:'返回排行榜', feedback:'反馈问题', privacy:'数据与隐私',
};
const entries = [...document.querySelectorAll('[data-copy]')].map(node => ({node, key:node.dataset.copy, en:node.innerHTML}));
const read = key => {try {return localStorage.getItem(key);} catch {return null;}};
const save = (key,value) => {try {localStorage.setItem(key,value);} catch {}};
let language = read('st_lang') === 'zh' ? 'zh' : 'en';
const media = matchMedia('(prefers-color-scheme: dark)');
let manualTheme = ['light','dark'].includes(read('st_theme')) ? read('st_theme') : null;
const example = {full_name:'microsoft/playwright-mcp', sources:['mcp']};
let toastTimer;
function render() {
  const isZh = language === 'zh', theme = manualTheme || (media.matches ? 'dark' : 'light');
  document.documentElement.lang = isZh ? 'zh-CN' : 'en';
  document.documentElement.dataset.theme = theme;
  for (const {node,key,en} of entries) node.innerHTML = isZh ? zh[key] : en;
  document.getElementById('full-docs').href=isZh?'../chrome/help.html':'../chrome/help-en.html';
  document.title = isZh ? 'Chrome 搜索插件 · Agent Leaderboard' : 'Chrome extension · Agent Leaderboard';
  document.querySelector('meta[name=description]').content = isZh ? '在 Chrome 侧边栏发现 Skills、MCP 和 AI 工具。下载 Agent Leaderboard 插件，了解使用方法，并复制安装提示交给你的 AI 编程工具。' : 'Find Skills, MCP servers and AI tools in your Chrome side panel. Download Agent Leaderboard, learn the workflow, and copy installation prompts for your AI coding tool.';
  document.getElementById('language').textContent = isZh ? 'EN' : '中';
  document.getElementById('language').setAttribute('aria-label',isZh?'Switch to English':'切换为中文');
  document.getElementById('theme').setAttribute('aria-label',isZh?`切换为${theme==='light'?'深色':'浅色'}主题`:`Switch to ${theme==='light'?'dark':'light'} theme`);
  document.querySelector('nav').setAttribute('aria-label',isZh?'页面导航':'Page navigation');
  const preview=document.getElementById('preview-image');
  preview.src=`assets/panel-${language}-${theme}.png`;
  preview.alt=isZh?'Agent Leaderboard 插件实拍：仓库搜索、筛选、复制安装提示与收藏按钮':'Actual Agent Leaderboard extension: repository search, filters, copy install prompt and bookmarks';
  document.getElementById('prompt-text').textContent=installationPrompt(example,isZh?'zh-CN':'en');
  document.getElementById('toast').hidden=true;
}
function toast(text) { clearTimeout(toastTimer); const node=document.getElementById('toast');node.textContent=text;node.hidden=false;toastTimer=setTimeout(()=>node.hidden=true,4000); }
async function copy(text,success) {
  try {await navigator.clipboard.writeText(text);toast(success);}
  catch {toast(language==='zh'?'复制失败，请选中文字手动复制。':'Copy failed. Select the text and copy it manually.');}
}
document.getElementById('language').addEventListener('click',()=>{language=language==='zh'?'en':'zh';save('st_lang',language);render();});
document.getElementById('theme').addEventListener('click',()=>{manualTheme=document.documentElement.dataset.theme==='light'?'dark':'light';save('st_theme',manualTheme);render();});
document.getElementById('copy-address').addEventListener('click',()=>copy('chrome://extensions',language==='zh'?'地址已复制，粘贴到 Chrome 地址栏打开。':'Address copied. Paste it into Chrome’s address bar.'));
document.getElementById('copy-prompt').addEventListener('click',()=>copy(installationPrompt(example,language==='zh'?'zh-CN':'en'),language==='zh'?'安装提示已复制，粘贴到你的 AI 编程工具。':'Install prompt copied. Paste it into your AI coding tool.'));
media.addEventListener('change',()=>{if(!manualTheme)render();});
window.addEventListener('storage',event=>{if(event.key==='st_lang'){language=event.newValue==='zh'?'zh':'en';render();}if(event.key==='st_theme'){manualTheme=['light','dark'].includes(event.newValue)?event.newValue:null;render();}});
render();
fetch('../chrome/manifest.json').then(response=>{if(!response.ok)throw new Error('manifest');return response.json();}).then(manifest=>{for(const node of document.querySelectorAll('.version'))node.textContent=`v${manifest.version}`;}).catch(()=>{/* Authored release label remains available offline. */});
