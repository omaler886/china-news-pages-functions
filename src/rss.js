function buildRssXml(payload, { siteUrl, sourceId }) {
  const sourceName = sourceId ? (payload.sources?.[sourceId]?.name || sourceId) : '全部来源';
  const feedTitle = sourceId
    ? `China News Feed - ${sourceName}`
    : 'China News Feed - All Sources';
  const feedDescription = sourceId
    ? `${sourceName} 中国相关新闻 RSS 聚合输出`
    : '中国新闻聚合 RSS 输出';
  const feedPath = sourceId ? `/rss/${sourceId}.xml` : '/rss/all.xml';
  const selfUrl = `${siteUrl}${feedPath}`;
  const coverUrl = `${siteUrl}/rss/cover.svg${sourceId ? `?source=${sourceId}` : ''}`;
  const iconUrl = `${siteUrl}/rss/icon.svg${sourceId ? `?source=${sourceId}` : ''}`;
  const channelTitle = sourceId
    ? `China News Feed - ${payload.sources?.[sourceId]?.name || sourceId}`
    : 'China News Feed - All Sources';
  const items = payload.articles.map((item) => {
    const title = `${item.sourceName} | ${item.title}`;
    return `<item>
  <title>${escapeXml(title)}</title>
  <link>${escapeXml(item.link)}</link>
  <guid>${escapeXml(item.link)}</guid>
  <description>${escapeXml(item.summary || item.title)}</description>
  <pubDate>${escapeXml(toRfc2822(item.publishedAt || item.fetchedAt))}</pubDate>
  <category>${escapeXml(item.sourceName)}</category>
  <source url="${escapeXml(selfUrl)}">${escapeXml(item.sourceName)}</source>
</item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:atom="http://www.w3.org/2005/Atom"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:webfeeds="http://webfeeds.org/rss/1.0">
<channel>
  <title>${escapeXml(channelTitle)}</title>
  <link>${escapeXml(siteUrl)}</link>
  <atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml" />
  <description>${escapeXml(feedDescription)}</description>
  <language>zh-cn</language>
  <copyright>${escapeXml(RSS_COPYRIGHT)}</copyright>
  <generator>${escapeXml(APP_NAME)}</generator>
  <docs>https://www.rssboard.org/rss-specification</docs>
  <ttl>30</ttl>
  <lastBuildDate>${escapeXml(toRfc2822(payload.generatedAt))}</lastBuildDate>
  <image>
    <url>${escapeXml(coverUrl)}</url>
    <title>${escapeXml(feedTitle)}</title>
    <link>${escapeXml(selfUrl)}</link>
    <description>${escapeXml(feedDescription)}</description>
    <width>1440</width>
    <height>720</height>
  </image>
  <itunes:image href="${escapeXml(coverUrl)}" />
  <webfeeds:icon>${escapeXml(iconUrl)}</webfeeds:icon>
  <webfeeds:logo>${escapeXml(coverUrl)}</webfeeds:logo>
  <webfeeds:accentColor>2563eb</webfeeds:accentColor>
  ${items}
</channel>
</rss>`;
}

function renderComparePageHtml(url) {
  const from = cleanText(url.searchParams.get('from') || '');
  const to = cleanText(url.searchParams.get('to') || '');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>历史快照差异对比</title>
  <style>
    body{margin:0;font-family:Inter,system-ui,sans-serif;background:#020617;color:#e2e8f0}
    .wrap{max-width:1100px;margin:0 auto;padding:28px 18px 40px}
    h1{margin:0 0 12px}
    .bar,.card{background:#0f172a;border:1px solid #334155;border-radius:16px;padding:16px}
    .bar{display:flex;gap:12px;flex-wrap:wrap;align-items:end;margin-bottom:16px}
    input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #475569;background:#020617;color:#fff}
    label{display:block;font-size:13px;color:#94a3b8;margin-bottom:6px}
    button{padding:10px 14px;border-radius:10px;border:1px solid #334155;background:#2563eb;color:#fff;cursor:pointer}
    .grid{display:grid;gap:14px}
    .sources{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
    .source{background:#111827;border:1px solid #334155;border-radius:14px;padding:14px}
    .status{font-size:12px;color:#93c5fd;margin-bottom:8px}
    .muted{color:#94a3b8}
    a{color:#93c5fd}
    pre{white-space:pre-wrap;line-height:1.6}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>历史快照差异对比</h1>
    <div class="bar">
      <div style="flex:1 1 280px">
        <label>旧快照 ID</label>
        <input id="fromId" value="${escapeHtml(from)}" placeholder="history id">
      </div>
      <div style="flex:1 1 280px">
        <label>新快照 ID</label>
        <input id="toId" value="${escapeHtml(to)}" placeholder="history id">
      </div>
      <div><button id="runBtn">开始对比</button></div>
      <div><a href="/dashboard">返回 Dashboard</a></div>
    </div>
    <div id="summary" class="card"><pre>输入两个 history id 开始对比。</pre></div>
    <div id="sources" class="grid sources" style="margin-top:14px;"></div>
  </div>
  <script>
    const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
    const fmt = (v) => { try { return new Date(v).toLocaleString('zh-CN',{hour12:false,timeZone:'${DEFAULT_TIMEZONE}'}); } catch { return v || '—'; } };

export { buildRssXml, renderComparePageHtml };
