# China News Pages Functions

这是 **Cloudflare Pages Functions 全后端版**。

和前面那个 `china-news-pages` 静态版不同，这一版是：

- 直接用 Pages Advanced Mode `_worker.js`
- 所有路由都在 Pages Functions 内处理
- 不再依赖单独的 Worker 域名

项目目录：

- `D:\New project\china-news-pages-functions`

核心文件：

- `D:\New project\china-news-pages-functions\public\_worker.js`
- `D:\New project\china-news-pages-functions\wrangler.toml`
- `D:\New project\china-news-pages-functions\package.json`

## 功能

这一版保留了原 Worker 版的大部分 HTTP 能力：

- Dashboard 页面
- 历史快照列表/详情
- 历史快照差异对比页
- RSS 输出
- RSS 固定多路由
- RSS 图标/封面 SVG
- KV 持久化缓存
- Telegram 推送
- Telegram 按来源分频道推送
- Email 推送（Resend）
- Webhook 推送

## 路由

- `/`
- `/dashboard`
- `/api/news`
- `/api/headlines`
- `/api/refresh`
- `/api/history`
- `/api/history/compare`
- `/api/status`
- `/rss`
- `/rss/all.xml`
- `/rss/wsj.xml`
- `/rss/nytimes.xml`
- `/rss/bbc.xml`
- `/rss/cnn.xml`
- `/rss/scmp.xml`
- `/rss/zaobao.xml`
- `/rss/icon.svg`
- `/rss/cover.svg`
- `/history/compare`

## 重要说明

### Pages Functions 与 Worker 的一个关键区别

**Cloudflare Pages Functions 没有 Worker 那样的原生 `scheduled()` Cron 入口。**

也就是说：

- 这版可以手动调用 `/api/refresh?notify=1`
- 但不能像纯 Worker 那样直接用 `scheduled()` 自动跑 Cron

如果你还需要“定时抓取”，建议：

1. 继续保留你现在的 Worker 版做 cron
2. 或者使用外部定时器请求：

```bash
https://<your-pages-domain>/api/refresh?notify=1
```

比如：

- GitHub Actions schedule
- cron-job.org
- 自己的服务器 crontab
- Cloudflare 另一个 Worker 作为调度器

## 本地开发

```bash
cd D:\New project\china-news-pages-functions
npm install
npm run dev
```

## 部署

### 方式 1

```bash
cd D:\New project\china-news-pages-functions
npx wrangler pages deploy public --project-name china-news-pages-functions
```

### 方式 2

```bash
cd D:\New project\china-news-pages-functions
powershell -ExecutionPolicy Bypass -File .\deploy-pages-functions.ps1
```

### 方式 3

```bash
cd D:\New project\china-news-pages-functions
.\deploy-pages-functions.cmd
```

## KV / Secret

Pages Functions 同样可以绑定 KV 和 Secret。

### KV

先创建 KV namespace，然后填到：

- `D:\New project\china-news-pages-functions\wrangler.toml`

### Secret

可以用：

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put EMAIL_FROM
npx wrangler secret put EMAIL_TO
npx wrangler secret put WEBHOOK_URLS
```

其他可选变量见：

- `D:\New project\china-news-pages-functions\.dev.vars.example`

## 和静态 Pages 版的区别

### `china-news-pages`

- 纯静态前端
- 依赖单独的 Worker API
- 适合前后端分离

### `china-news-pages-functions`

- Pages 自己就是后端
- 一套代码直接处理 API + HTML + RSS
- 更像“Pages 平台上的完整应用”

## 推荐用法

如果你要：

- **最稳的定时抓取**：继续用 Worker 版
- **完整的 Pages 代码形态**：用这版
- **展示层 Pages + 抓取层 Worker**：用前面的静态版
