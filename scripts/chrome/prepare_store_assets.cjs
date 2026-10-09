/* Rebuild store artwork from the real extension. Requires Playwright and Chrome.
 * Output stays outside chrome/ and never changes the extension package.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'store-assets');
const raw = path.join(root, 'artifacts/store-assets');
const dataURL = (file, type = 'image/png') => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;
const logo = dataURL(path.join(root, 'extension/assets/logo.svg'), 'image/svg+xml');
const copy = {
  'zh-CN': [
    ['搜索你的下一个\nAI 工具', '在浏览器侧边栏发现 Skills、MCP、Prompt、AI 框架和研究工具。', ['一个入口，搜索五类资源', '查看 Stars、分类与仓库简介', '直接打开 GitHub 与 README']],
    ['把范围缩小，\n把工具找准', '从榜单、分类和用途出发，继续按平台、语言与 Stars 筛选。', ['用不同图标区分资源类型', '组合筛选条件，缩小结果范围', '按相关度、Stars 或更新排序']],
    ['复制安装提示，\n交给 AI 编程工具', '把仓库地址与安装要求一起复制，再粘贴到你正在使用的 AI 编程工具。', ['找到仓库，点击复制按钮', '让 AI 阅读项目文档与配置要求', '按项目实际支持的方式接入']],
    ['好用的项目，\n留在收藏里', '把值得尝试的仓库集中保存，下次打开侧边栏即可继续探索。', ['点击书签，保存感兴趣的项目', '在收藏中继续搜索与筛选', '收藏保存在当前浏览器本地']],
    ['中文或 English，明亮或深色', '一键切换界面语言；主题可跟随系统，也可手动选择。', []],
  ],
  en: [
    ['Find your next\nAI tool', 'Discover Skills, MCP servers, prompts, AI frameworks and research tools in your browser sidebar.', ['Search across five resource boards', 'See stars, categories and descriptions', 'Open GitHub repositories and READMEs']],
    ['Narrow the search.\nFind the right tool.', 'Start with a board, category or use case. Refine by platform, language and stars.', ['Recognize resource types at a glance', 'Combine filters to focus your results', 'Sort by relevance, stars or updates']],
    ['Copy a setup prompt.\nContinue with AI.', 'Copy the repository and setup instructions, then paste them into your AI coding tool.', ['Find a repository and click copy', 'Ask AI to read its setup documentation', 'Use the integration the project supports']],
    ['Keep the projects\nyou want to try', 'Save useful repositories in one place and pick up where you left off.', ['Bookmark repositories as you browse', 'Search and filter your saved projects', 'Favorites stay in your local browser']],
    ['Two languages. Light and dark.', 'Switch between Chinese and English. Follow your system theme or choose your own.', []],
  ],
};
const slugs = ['01-search', '02-filters', '03-copy-setup-prompt', '04-favorites', '05-language-and-theme'];
const style = `
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:#17263a;background:#f3f6fc;-webkit-font-smoothing:antialiased}
.brand{display:flex;align-items:center;gap:15px;font-size:24px;font-weight:650;letter-spacing:-.5px}.brand img{width:48px;height:48px}
.top{position:absolute;left:52px;top:42px}.copy{position:absolute;left:52px;top:195px;width:622px}
h1{font-size:49px;line-height:1.2;letter-spacing:-1.8px;font-weight:730;margin:0 0 28px;white-space:pre-line}
.copy p{font-size:22px;line-height:1.7;color:#54657d;max-width:570px;margin:0 0 42px}
ul{list-style:none;padding:0;margin:0}li{font-size:20px;line-height:1.55;margin:17px 0;padding-left:24px;position:relative}li:before{content:'';position:absolute;left:0;top:11px;width:7px;height:7px;background:#3269cb;border-radius:50%}
.foot{position:absolute;bottom:32px;left:52px;font-size:16px;color:#687a91}
.panel{position:absolute;right:48px;top:44px;width:480px;background:white;border:1px solid #d4deee;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px #23486e16}
.panel-bar{height:44px;display:flex;align-items:center;padding:0 16px;gap:10px;font-size:14px;font-weight:600;color:#52637a;background:#fff;border-bottom:1px solid #e3e9f1}.panel-bar img{width:23px;height:23px}
.panel>img{display:block;width:100%;height:auto}.rail{position:absolute;left:708px;top:0;width:572px;height:800px;background:#e6edf9;z-index:-1}
.duo .top{top:30px}.duo h1{position:absolute;left:52px;top:110px;font-size:38px;margin:0;letter-spacing:-1px}.duo .sub{position:absolute;left:52px;top:168px;font-size:19px;color:#54657d;margin:0}
.duo .panel{top:233px;width:374px;border-radius:13px}.duo .panel.one{left:240px;right:auto}.duo .panel.two{right:240px}.duo .panel-bar{height:34px;font-size:13px}.duo .panel-bar img{width:20px;height:20px}.duo .panel.two .panel-bar{background:#17212e;color:#dbe5f2;border-color:#344356}.duo .foot{bottom:17px;font-size:13px}
.promo{background:#245ac0;color:white}.promo .site{font-size:18px;color:#c9d9fa;letter-spacing:.2px}.small{display:flex;flex-direction:column;align-items:center;justify-content:center}.small .mark{width:100px;height:100px;margin-bottom:18px}.small h1{font-size:29px;letter-spacing:-.9px;margin:0 0 13px}.small p{font-size:16px;color:#dce7ff;margin:0}.small:after,.marquee:after{content:'';position:absolute;bottom:0;left:0;right:0;height:7px;background:#e3b341}
.marquee .brand{position:absolute;left:64px;top:46px;font-size:24px}.marquee .brand img{width:54px;height:54px}.marquee h1{position:absolute;left:64px;top:164px;font-size:61px;letter-spacing:-2.2px;line-height:1.13;margin:0}.marquee p{position:absolute;left:66px;top:338px;font-size:22px;color:#dce7ff;line-height:1.6;margin:0;max-width:685px}.marquee .site{position:absolute;left:66px;bottom:49px}.marquee .panel{right:72px;top:38px;width:438px;box-shadow:0 18px 50px #102d6838}
`;
const brand = `<div class="brand"><img src="${logo}">Agent Leaderboard</div>`;
const frame = (image, label, cls = '') => `<div class="panel ${cls}"><div class="panel-bar"><img src="${logo}">${label}</div><img src="${image}"></div>`;
const html = (body, cls = '') => `<!doctype html><html><meta charset="utf-8"><style>${style}</style><body class="${cls}">${body}</body></html>`;

(async () => {
  fs.mkdirSync(raw, {recursive:true});
  for (const locale of ['zh-CN', 'en', 'common']) fs.mkdirSync(path.join(out, locale), {recursive:true});
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-store-')), {
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless:true, deviceScaleFactor:2, viewport:{width:480, height:660},
    ignoreDefaultArgs:['--disable-extensions'], args:['--enable-unsafe-extension-debugging'],
  });
  const shots = {};
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const {id} = await cdp.send('Extensions.loadUnpacked', {path:path.join(root, 'chrome')});
    await context.route('https://agentskills.media/data/discovery_index.json', route => route.fulfill({contentType:'application/json', body:fs.readFileSync(path.join(root, 'data/discovery_index.json'), 'utf8')}));
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForFunction(() => document.getElementById('data-status').textContent.startsWith('已更新'));
    async function query(value) {
      await page.locator('#query').fill(value);
      await page.locator('#search-form').evaluate(form => form.requestSubmit());
      await page.locator('#results .repo').first().waitFor();
    }
    async function capture(key) {
      await page.evaluate(() => { document.activeElement?.blur(); });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const file = path.join(raw, `${key}.png`);
      await page.screenshot({path:file});
      shots[key] = dataURL(file);
    }
    for (const locale of ['zh-CN', 'en']) {
      await page.evaluate(async locale => {
        const stored = await chrome.storage.local.get(null);
        await chrome.storage.local.remove(Object.keys(stored).filter(key => key.startsWith('favorite:')));
        await chrome.storage.local.set({uiLocale:locale, themeMode:'light'});
      }, locale);
      await page.waitForFunction(locale => document.documentElement.lang === locale && document.documentElement.dataset.theme === 'light', locale);
      await page.locator('#all').click();
      await page.locator('#sources button[data-source=""]').click();
      await query('browser');
      await capture(`${locale}-search`);
      await query('');
      await page.locator('#sources button[data-source="mcp"]').click();
      await page.locator('#filter-toggle').click();
      await page.locator('#min-stars').selectOption('1000');
      await capture(`${locale}-filters`);
      await page.locator('#reset').click();
      await page.locator('#filter-toggle').click();
      await page.locator('#sources button[data-source=""]').click();
      await query('context7');
      await page.locator('#results .repo summary').first().click();
      await capture(`${locale}-copy`);
      await query('browser');
      for (let i = 0; i < 5; i++) {
        await page.locator('#results .save').nth(i).click();
        await page.waitForFunction(n => document.getElementById('favorite-count').textContent === String(n), i + 1);
      }
      await query('');
      await page.locator('#favorites').click();
      await capture(`${locale}-favorites`);
      await page.locator('#all').click();
      await query('browser');
      await page.evaluate(() => chrome.storage.local.set({themeMode:'dark'}));
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      await capture(`${locale}-dark`);
    }
    const designContext = await context.browser().newContext({deviceScaleFactor:1});
    const manifest = [];
    async function render(file, width, height, document) {
      const design = await designContext.newPage();
      await design.setViewportSize({width, height});
      await design.setContent(document);
      await design.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
      await design.evaluate(() => document.fonts.ready);
      await design.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const overflow = await design.evaluate(() => [...document.querySelectorAll('h1,.copy,li')].some(node => node.scrollWidth > node.clientWidth + 1));
      assert.equal(overflow, false, `Text overflow: ${file}`);
      const dest = path.join(out, file);
      await design.screenshot({path:dest});
      const png = fs.readFileSync(dest);
      assert.equal(png.readUInt32BE(16), width);
      assert.equal(png.readUInt32BE(20), height);
      assert.equal(png[24], 8, `Not 8-bit: ${file}`);
      assert.equal(png[25], 2, `Not RGB PNG: ${file}`);
      manifest.push({file, width, height, format:'PNG RGB, 24-bit, no alpha'});
      await design.close();
    }
    for (const locale of ['zh-CN', 'en']) {
      for (let n = 0; n < 5; n++) {
        const [title, subtitle, points] = copy[locale][n];
        const label = locale === 'en' ? 'Agent search assistant' : 'Agent 搜索助手';
        const body = n === 4
          ? `<div class="top">${brand}</div><h1>${title}</h1><p class="sub">${subtitle}</p>${frame(shots['zh-CN-search'], '中文 · 浅色', 'one')}${frame(shots['en-dark'], 'English · Dark', 'two')}`
          : `<div class="rail"></div><div class="top">${brand}</div><div class="copy"><h1>${title}</h1><p>${subtitle}</p><ul>${points.map(p => `<li>${p}</li>`).join('')}</ul></div>${frame(shots[`${locale}-${['search','filters','copy','favorites'][n]}`], label)}`;
        await render(`${locale}/${slugs[n]}-1280x800.png`, 1280, 800, html(`${body}<div class="foot">agentskills.media</div>`, n === 4 ? 'duo' : ''));
      }
    }
    await render('common/small-promo-440x280.png', 440, 280, html(`<img class="mark" src="${logo}"><h1>Agent Leaderboard</h1><p>Skills · MCP · Prompts · AI tools</p>`, 'promo small'));
    await render('common/marquee-1400x560.png', 1400, 560, html(`${brand}<h1>Find your next<br>AI tool.</h1><p>Search Skills, MCP servers and more.<br>Keep useful projects close at hand.</p><span class="site">agentskills.media</span>${frame(shots['en-search'], 'Agent search assistant')}`, 'promo marquee'));
    fs.copyFileSync(path.join(root, 'chrome/icons/icon-128.png'), path.join(out, 'common/store-icon-128.png'));
    const icon = fs.readFileSync(path.join(out, 'common/store-icon-128.png'));
    assert.equal(icon.readUInt32BE(16),128); assert.equal(icon.readUInt32BE(20),128);
    manifest.push({file:'common/store-icon-128.png',width:128,height:128,format:'PNG with transparency; original extension icon'});
    fs.writeFileSync(path.join(out, 'asset-manifest.json'), JSON.stringify({extensionVersion:JSON.parse(fs.readFileSync(path.join(root,'chrome/manifest.json'))).version, generatedAt:new Date().toISOString(), assets:manifest}, null, 2)+'\n');
    const cards = (files) => files.map(item => `<figure><a href="${item.file}"><img src="${item.file}" alt="${item.file}"></a><figcaption><a href="${item.file}" download>${item.file}</a><br>${item.width} × ${item.height}</figcaption></figure>`).join('');
    fs.writeFileSync(path.join(out,'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Leaderboard 商店素材</title><style>body{margin:32px auto;padding:0 24px;max-width:1400px;font:16px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#17263a;background:#f3f6fc}h1{font-size:30px}h2{margin-top:40px}a{color:#245ac0}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:24px}figure{margin:0}img{width:100%;height:auto;border:1px solid #d5deeb;border-radius:8px;background:white}figcaption{font-size:13px;overflow-wrap:anywhere}.common img{max-height:280px;object-fit:contain}nav{display:flex;gap:24px;flex-wrap:wrap}</style><h1>Agent Leaderboard · Chrome 商店素材</h1><p>插件 v1.6.0 的真实界面。中文和英文各 5 张截图，公共图标与宣传图各上传一份。</p><nav><a href="Chrome-Web-Store-Assets.zip" download>下载全部素材 ZIP</a><a href="README.md">上传说明</a><a href="#zh">中文截图</a><a href="#en">English screenshots</a></nav><h2>公共素材</h2><section class="common">${cards(manifest.filter(item=>item.file.startsWith('common/')))}</section><h2 id="zh">中文截图 · 按 01—05 顺序上传</h2><section>${cards(manifest.filter(item=>item.file.startsWith('zh-CN/')))}</section><h2 id="en">English screenshots · Upload in order</h2><section>${cards(manifest.filter(item=>item.file.startsWith('en/')))}</section></html>`);
    await designContext.close();
    const archive = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-store-archive-')), 'Chrome-Web-Store-Assets.zip');
    execFileSync('zip', ['-q', '-r', archive, 'common', 'zh-CN', 'en', 'README.md', 'index.html', 'asset-manifest.json'], {cwd:out});
    fs.copyFileSync(archive, path.join(out, 'Chrome-Web-Store-Assets.zip'));
    console.log(`Generated and verified ${manifest.length} store assets in store-assets/. Promotional images and screenshots are 24-bit RGB PNGs without alpha.`);
  } finally { await context.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
