/* Optional icon regeneration: PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/chrome/render_icons.cjs
 * The SVG and PNGs are checked in; ordinary builds use these assets without a browser dependency.
 */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const chromeRoot = path.join(root, 'chrome');
const artifacts = path.join(root, 'artifacts/extension');
const dataURL = file => `data:image/svg+xml;base64,${fs.readFileSync(file).toString('base64')}`;

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  });
  try {
    const page = await browser.newPage({deviceScaleFactor: 1});
    const logo = dataURL(path.join(root, 'extension/assets/logo.svg'));
    for (const size of [16, 32, 48, 128]) {
      const {png, ...pixels} = await page.evaluate(async ({logo, size}) => {
        const img = new Image(); img.src = logo; await img.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, size, size);
        return {width: canvas.width, height: canvas.height,
          corner: ctx.getImageData(0, 0, 1, 1).data[3],
          background: [...ctx.getImageData(Math.floor(size * .1), Math.floor(size * .1), 1, 1).data],
          bar: ctx.getImageData(Math.floor(size / 2), Math.floor(size * .7), 1, 1).data[3],
          png: canvas.toDataURL('image/png').split(',')[1]};
      }, {logo, size});
      assert.deepEqual(pixels, {width: size, height: size, corner: 0, background: [0, 0, 0, 0], bar: 255});
      fs.writeFileSync(path.join(chromeRoot, `icons/icon-${size}.png`), Buffer.from(png, 'base64'));
    }
    fs.mkdirSync(artifacts, {recursive: true});
    const beforePath = path.join(artifacts, 'logo-before.svg');
    const original = dataURL(fs.existsSync(beforePath) ? beforePath : path.join(chromeRoot, '../favicon.svg'));
    const beforeLabel = fs.existsSync(beforePath) ? '调整前 · 透明底' : '官网原图';
    await page.setViewportSize({width: 640, height: 270});
    await page.setContent(`<style>
      *{box-sizing:border-box}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#eef2f7;color:#1f2937}
      main{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px}h2{font-size:14px;margin:0 0 12px;font-weight:600}
      .samples{display:flex;align-items:center;justify-content:space-around;height:180px;border-radius:12px;background:#fff}
      .dark{background:#0d1117}.samples img{width:76px;height:76px}small{display:block;text-align:center;margin-top:10px;color:#63758a}.dark small{color:#9caec2}
      </style><main><section><h2>调整前 / 调整后 · 浅色</h2><div class="samples"><div><img src="${original}"><small>${beforeLabel}</small></div><div><img src="${logo}"><small>放大后 · 透明底</small></div></div></section>
      <section><h2>调整前 / 调整后 · 深色</h2><div class="samples dark"><div><img src="${original}"><small>${beforeLabel}</small></div><div><img src="${logo}"><small>放大后 · 透明底</small></div></div></section></main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.screenshot({path: path.join(artifacts, 'logo-preview.png')});
    console.log('Rendered and verified 16/32/48/128px icons with fully transparent backgrounds from extension/assets/logo.svg.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
