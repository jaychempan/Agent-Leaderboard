const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../src/shared.js'), 'utf8');
const i18n = source.slice(source.indexOf('const I18N'), source.indexOf('/* ── Use-case label'));
const counter = source.slice(source.indexOf('/* ── Visit counter'));
function setup(url = 'https://agentskills.media/', storage = new Map()) {
  const badge = {textContent: '', title: ''};
  const requests = [];
  const timers = new Map();
  const context = vm.createContext({
    app: {lang: 'zh', pageConfig: {page: 'skills'}}, location: new URL(url),
    document: {getElementById: () => badge}, AbortController, Date,
    crypto: {randomUUID},
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
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
    badge, requests, timers, context, storage,
    load: () => context.loadVisitCount(),
    respond: (data, status = 200, identity = '') => requests[0].resolve({
      ok: status >= 200 && status < 300, status, json: async () => data,
      headers: {get: key => key === 'Set-Bsz-Identity' ? identity : null},
    }),
    timeout: () => [...timers.values()][0](),
  };
}
const counts = (today = 1234, visitors = 56) => ({success: true, data: {page_pv: today, site_uv: visitors, site_pv: 987654}});

test('homepage has no conflict markers and loads each script exactly once', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.doesNotMatch(html, /^(?:<{7}|={7}|>{7})/m);
  const scripts = [...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map(match => match[1]);
  assert.equal(scripts.filter(src => src === 'src/shared.js').length, 1);
  assert.equal(scripts.length, new Set(scripts).size);
});

test('unrelated previews and other GitHub Pages projects do not count', async () => {
  for (const url of ['file:///site/index.html', 'https://preview.example/', 'http://agentskills.media/',
    'https://jaychempan.github.io/Other/', 'https://jaychempan.github.io/Agent-Leaderboard-other/']) {
    const page = setup(url);
    await page.load();
    assert.equal(page.requests.length, 0, url);
    assert.match(page.badge.textContent, /预览域名未启用/);
  }
});

test('production and project Pages use one canonical daily bucket without queries', async () => {
  for (const url of ['https://agentskills.media/?q=private#skills',
    'https://jaychempan.github.io/Agent-Leaderboard/', 'https://jaychempan.github.io/Agent-Leaderboard/index.html']) {
    const page = setup(url);
    const loaded = page.load();
    assert.match(page.badge.textContent, /加载中/);
    const request = page.requests[0];
    assert.equal(request.url, 'https://busuanzi.9420.ltd/api');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.referrerPolicy, 'origin');
    assert.equal(request.options.credentials, 'omit');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.body, undefined);
    assert.equal(request.options.headers['x-bsz-referer'], `https://agentskills.media/__visits/${page.context.visitDay()}`);
    await page.load();
    assert.equal(page.requests.length, 1);
    page.respond(counts());
    await loaded;
    assert.equal(page.badge.textContent, '👁 今日访问量 1,234 · 累计访客人数 56');
    assert.doesNotMatch(page.badge.textContent, /987654/);
    assert.equal(page.timers.size, 0);
    page.context.app.pageConfig.page = 'mcp';
    page.context.app.lang = 'en';
    await page.load();
    assert.equal(page.badge.textContent, '👁 Visits today 1,234 · Total visitors 56');
    assert.equal(page.requests.length, 1, 'Navigation and language changes never recount');
  }
});

test('Shanghai midnight changes the shared daily bucket regardless of device timezone', () => {
  const {context} = setup();
  assert.equal(context.visitDay(new Date('2026-10-23T15:59:59Z')), '2026-10-23');
  assert.equal(context.visitDay(new Date('2026-10-23T16:00:00Z')), '2026-10-24');
  assert.equal(context.visitDay(new Date('2026-12-31T16:00:00Z')), '2027-01-01');
});

test('signed visitor identity persists between document loads, not just daily', async () => {
  const first = setup();
  const load = first.load();
  first.respond(counts(1, 1), 200, 'signed-test-identity');
  await load;
  const second = setup('https://agentskills.media/', first.storage);
  const load2 = second.load();
  assert.equal(second.requests[0].options.headers.Authorization, 'Bearer signed-test-identity');
  second.respond(counts(2, 1));
  await load2;
  assert.equal(second.badge.textContent, '👁 今日访问量 2 · 累计访客人数 1');
});

test('blocked optional storage still allows server-side counting', async () => {
  const page = setup();
  page.context.localStorage = {getItem() {throw Error('blocked');}, setItem() {throw Error('blocked');}};
  const loaded = page.load();
  page.respond(counts(), 200, 'signed-test-identity');
  await loaded;
  assert.match(page.badge.textContent, /累计访客人数 56/);
});

test('local preview has isolated, persistent anonymous visitor IDs', async () => {
  for (const url of ['http://127.0.0.1:8080/', 'http://localhost/', 'http://[::1]/']) {
    const page = setup(url);
    const loaded = page.load();
    assert.equal(page.requests[0].url, '/api/visits');
    const identity = JSON.parse(page.requests[0].options.body).visitor;
    assert.match(identity, /^[0-9a-f-]{36}$/);
    assert.equal(page.storage.get('st_local_visit_id'), identity);
    page.respond({today: 2, total: 987, visitors: 1, scope: 'local'});
    await loaded;
    assert.equal(page.badge.textContent, '👁 今日访问量 2 · 累计访客人数 1 （本地）');
    assert.doesNotMatch(page.badge.textContent, /987/);
  }
});

test('zero and digit strings are valid; missing metrics never become fake zero or total PV', async () => {
  for (const value of [0, '0', '1234', undefined, null, -1, 1.5, '1.2K', '1,234', '', ' ', Infinity, {}, Number.MAX_SAFE_INTEGER + 1]) {
    const valid = [0, '0', '1234'].includes(value);
    for (const metric of ['today', 'visitors']) {
      const page = setup();
      const loaded = page.load();
      const data = counts();
      data.data[metric === 'today' ? 'page_pv' : 'site_uv'] = value;
      page.respond(data);
      await loaded;
      const expected = valid ? Number(value).toLocaleString('zh-CN') : '—';
      assert.equal(page.badge.textContent, metric === 'today'
        ? `👁 今日访问量 ${expected} · 累计访客人数 56`
        : `👁 今日访问量 1,234 · 累计访客人数 ${expected}`);
    }
  }
});

test('HTTP errors, rejection, malformed responses and timeouts never retry an increment', async () => {
  for (const fail of [
    page => page.respond({}, 524), page => page.respond({success: false}),
    page => page.respond({success: true, data: {site_pv: 99999}}),
    page => page.requests[0].reject(new Error('Network failure')),
    page => page.requests[0].resolve({ok: true, json: async () => { throw new Error('Invalid JSON'); }}),
    page => page.timeout(),
  ]) {
    const page = setup(); const loaded = page.load(); fail(page); await loaded;
    assert.equal(page.badge.textContent, '访问统计暂不可用');
    assert.equal(page.timers.size, 0);
    await page.load(); assert.equal(page.requests.length, 1);
  }
});
