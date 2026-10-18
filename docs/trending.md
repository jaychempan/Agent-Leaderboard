# Trending leaderboard / 趋势榜

Trending opens as a native dialog on the homepage from the top navigation (inside the menu on mobile). The circled hero-summary link has been removed. Opening or switching the overlay does not navigate or modify the homepage filters or scroll position. Minimize turns the panel into a small bottom-right dock; expanding restores its selected section, period, sort and panel scroll. Close, Escape or the backdrop dismiss the panel. Keyboard focus stays inside the open dialog and returns when it closes.

点击顶部「趋势榜」在当前主页展开浮层，标题下方不再重复放入口。「收起」折叠成右下角按钮，再次展开保留选择；「×」、Esc 或点击浮层外部可关闭。浮层使用五个完整板块的数据，不按编码 Agent 细分。日榜、周榜、月榜分别对应近 1 / 7 / 30 天，始终只展示前 20 名。主题和语言跟随主页。旧的 `trending/` 地址会转到对应主页并展开浮层。

## Calculation

- The panel initially opens on Daily, sorted by growth rate. Weekly, Monthly and absolute Stars gained remain selectable. The top three use the same medal symbols as the homepage; all other positions use numbers.
- 趋势榜默认显示日榜并按增长率排序，可切换周榜、月榜和新增 Stars。前三名使用与主页一致的 🥇🥈🥉 奖牌，其余名次显示数字。
- Net gain = current recorded stars − baseline recorded stars. Growth rate = net gain / baseline × 100%.
- Baselines use the most recent snapshot on the UTC date exactly 1, 7, or 30 days before the source dataset's update date. These are daily observation windows, not exact rolling-hour intervals. Actual comparison dates are shown in the UI.
- Repositories are matched by stable GitHub numeric ID. Missing baselines are excluded, never interpreted as zero. Only positive gains appear. A baseline of zero has no defined percentage and is excluded from rate sorting.
- Ties use absolute gain, then total stars, then numeric ID. The default total-star board is unchanged.
- These are changes in the site's recorded data, not live or exhaustive GitHub activity. Existing collectors incrementally merge search results, so some repositories may retain older star counts. A later refresh can therefore include previously unobserved gains. Do not interpret this as exact GitHub event-time growth.
- Missing dates produce an explicit insufficient-history state. If a trend payload and the corresponding source have different update timestamps, the UI also treats that trend data as unavailable.

## Data updates

```sh
# After running the existing fetch scripts:
python3 scripts/build_trends.py

# Optional one-time recovery/bootstrap from a full local Git history:
python3 scripts/build_trends.py --from-git
```

The daily workflow runs the builder after fetching. `data/star_history.json` retains up to 40 days per source and is not loaded by the browser. `data/trends.json` and `data/trends.js` contain compact deltas. The builder updates source-data and trend-data cache versions in `index.html`. The homepage loads the small trend delta payload; history stays out of the browser. Repeating the builder with unchanged source data is idempotent. Git bootstrap requires local commits; routine updates work with a shallow checkout because snapshots are committed with the data.

## Local validation

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
python3 -m http.server 8767 --bind 127.0.0.1
# In another terminal, with playwright-core available:
node tests/trends-browser.cjs
```

Set `PLAYWRIGHT_MODULE` to an absolute playwright-core module path, `CHROME_PATH` to a Chrome executable, and `SITE_BASE_URL` to override the preview URL when necessary. The browser check covers open/minimize/restore/close, Escape/backdrop dismissal and focus containment, preserved homepage search/scroll/URL, every source/window/sort combination, Top 20, stale data, old URL redirects and responsive layouts in both languages and themes. Screenshots go to `artifacts/trends/` (ignored by Git).
