const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/shared.js'), 'utf8');
const i18n = source.slice(source.indexOf('const I18N'), source.indexOf('/* ── Use-case label'));
const counter = source.slice(source.indexOf('/* ── Visit counter'));
function setup(url = 'https://agentskills.media/') {
  const badge = {textContent: '', title: ''};
  const requests = [];
  const timers = new Map();
  const context = vm.createContext({
    app: {lang: 'zh', pageConfig: {page: 'skills'}},
    location: new URL(url),
    document: {getElementById: () => badge},
    AbortController,
    console: {warn() {}},
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        requests.push({url, options, resolve, reject});
        options.signal.addEventListener('abort', () => reject(new Error('Aborted')));
      });
    },
    setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(i18n + '\nfunction t(key) { return I18N[app.lang][key]; }\n' + counter, context);
  return {
    badge, requests, timers, context,
    load: () => context.loadVisitCount(),
    respond: (data, status = 200) => requests[0].resolve({
      ok: status >= 200 && status < 300, status, json: async () => data,
    }),
    timeout: () => [...timers.values()][0](),
  };
}

test('file and unrelated preview pages send no statistics requests', async () => {
  for (const url of ['file:///site/index.html', 'https://preview.example/', 'http://agentskills.media/']) {
    const page = setup(url);
    await page.load();
    assert.equal(page.requests.length, 0, url);
    assert.match(page.badge.textContent, /预览域名未启用/);
  }
});

test('loopback previews count through their own server and label local numbers', async () => {
  for (const url of ['http://127.0.0.1:8080/', 'http://localhost/', 'http://[::1]/']) {
    const page = setup(url);
    const loaded = page.load();
    assert.equal(page.requests[0].url, '/api/visits');
    assert.equal(page.requests[0].options.method, 'POST');
    assert.equal(page.requests[0].options.body, undefined);
    page.respond({today: 2, total: 987, scope: 'local'});
    await loaded;
    assert.equal(page.badge.textContent, '👁 今日访问量 2 （本地）');
    assert.doesNotMatch(page.badge.textContent + page.badge.title, /987/);
    await page.load();
    assert.equal(page.requests.length, 1);
    page.context.app.lang = 'en';
    page.context.renderVisitCount();
    assert.equal(page.badge.textContent, '👁 Visits today 2 (local)');
  }
});

test('one request counts the document; only daily PV is displayed in either language', async () => {
  const page = setup('https://agentskills.media/?q=private#skills');
  const loaded = page.load();
  assert.match(page.badge.textContent, /加载中/);
  const {url, options} = page.requests[0];
  assert.equal(url, 'https://cdn.busuanzi.cc/api.php');
  assert.equal(options.method, 'POST');
  assert.equal(options.referrerPolicy, 'origin');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.deepEqual(JSON.parse(options.body), {url: 'https://agentskills.media/', referrer: ''});
  await page.load();
  assert.equal(page.requests.length, 1, 'No duplicate request while loading');
  page.respond({busuanzi_today_pv: 1234, busuanzi_site_pv: 987654, busuanzi_site_uv: 56789});
  await loaded;
  assert.equal(page.badge.textContent, '👁 今日访问量 1,234');
  assert.doesNotMatch(page.badge.textContent + page.badge.title, /987|567|估算/);
  assert.equal(page.timers.size, 0);
  page.context.app.pageConfig.page = 'mcp';
  page.context.app.lang = 'en';
  await page.load();
  assert.equal(page.badge.textContent, '👁 Visits today 1,234');
  assert.equal(page.requests.length, 1, 'Navigation and language changes never recount');
});

test('uses the server daily count even when it resets; never derives it from totals', async () => {
  for (const today of [1234, 0, '0', '1']) {
    const page = setup();
    const loaded = page.load();
    page.respond({busuanzi_today_pv: today, busuanzi_site_pv: 999999});
    await loaded;
    assert.equal(page.badge.textContent, `👁 今日访问量 ${Number(today).toLocaleString('zh-CN')}`);
  }
});

test('missing or malformed daily values are unavailable, not zero or cumulative PV', async () => {
  for (const value of [undefined, null, -1, 1.5, '1.2K', '1,234', '', ' ', Infinity, {}]) {
    const page = setup();
    const loaded = page.load();
    page.respond({busuanzi_today_pv: value, busuanzi_site_pv: 999999});
    await loaded;
    assert.equal(page.badge.textContent, '访问统计暂不可用');
    assert.equal(page.timers.size, 0);
  }
});

test('HTTP errors, network failures, invalid JSON and timeouts do not retry an increment', async () => {
  for (const fail of [
    page => page.respond({}, 524),
    page => page.requests[0].reject(new Error('Network failure')),
    page => page.requests[0].resolve({ok: true, json: async () => { throw new Error('Invalid JSON'); }}),
    page => page.timeout(),
  ]) {
    const page = setup();
    const loaded = page.load();
    fail(page);
    await loaded;
    assert.equal(page.badge.textContent, '访问统计暂不可用');
    assert.equal(page.timers.size, 0);
    await page.load();
    assert.equal(page.requests.length, 1);
  }
});
