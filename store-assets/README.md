# Agent Leaderboard · Chrome 商店素材

适用于当前插件 v1.6.0。图标沿用原有透明底领奖台 Logo，所有界面截图来自本项目的实际插件和本地目录数据。

## 对应上传位置

| 商店后台字段 | 文件 | 尺寸 |
| --- | --- | --- |
| 商店图标 | `common/store-icon-128.png` | 128 × 128 |
| 屏幕截图（中文） | `zh-CN/01-…` 至 `zh-CN/05-…` | 每张 1280 × 800 |
| 屏幕截图（英文） | `en/01-…` 至 `en/05-…` | 每张 1280 × 800 |
| 小型宣传图块 | `common/small-promo-440x280.png` | 440 × 280 |
| 顶部宣传图块 | `common/marquee-1400x560.png` | 1400 × 560 |

中文页面按 01—05 上传 `zh-CN/` 中的 5 张图片。英文页面使用 `en/` 中的 5 张；不要把两套共 10 张一起上传到同一个截图栏。

公共宣传图使用产品英文名称和简短英文文案，可放在“全球通用的资源”中。没有宣传视频时，YouTube 视频字段留空。

## 截图顺序

1. **搜索发现**：在侧边栏搜索五类 AI 资源。
2. **分类筛选**：展示 MCP 榜单与 Stars 等筛选条件。
3. **复制安装提示**：仓库详情中的复制按钮；功能是复制提示，再粘贴到 AI 编程工具，不能直接自动安装项目。
4. **本地收藏**：收藏示例及仓库列表，收藏保存在当前浏览器。
5. **语言与主题**：实际中文浅色、英文深色界面对照。

截图和两张宣传图均已校验为 **24 位 RGB PNG，无 alpha 透明通道**。图标为支持透明背景的 PNG。导出的文件尺寸与格式记录在 `asset-manifest.json`。

图片中的仓库内容和 Stars 来自生成时的本地目录快照，仅用于功能展示，之后可能变化。

## 预览与重新生成

打开 `index.html` 查看全部素材，也可在项目本地服务器中访问：

http://localhost:8765/store-assets/

`Chrome-Web-Store-Assets.zip` 是独立的商店素材包。上传插件代码仍使用项目的 `dist/Chrome.zip`。

生成脚本位于 `scripts/chrome/prepare_store_assets.cjs`。安装或指定 Playwright 后，在项目根目录运行：

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/chrome/prepare_store_assets.cjs
```

脚本使用隔离的 Chrome 配置和实际扩展界面截取，不访问个人浏览器状态。原始高清截图位于忽略跟踪的 `artifacts/store-assets/`。素材不放入 `chrome/`，不会改变插件运行文件或安装包。

尺寸与格式参考：[Chrome 官方图片指南](https://developer.chrome.com/docs/webstore/images)。素材已在本地准备，尚未上传或提交商店审核。
