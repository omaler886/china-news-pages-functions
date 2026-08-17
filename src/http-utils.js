function renderDashboardHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>China News Worker Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --panel: rgba(15, 23, 42, 0.78);
      --panel-2: rgba(30, 41, 59, 0.78);
      --text: #e5eefc;
      --muted: #94a3b8;
      --accent: #60a5fa;
      --accent-2: #22c55e;
      --danger: #fb7185;
      --border: rgba(148, 163, 184, 0.18);
      --shadow: 0 16px 50px rgba(15, 23, 42, 0.35);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(96, 165, 250, 0.22), transparent 32%),
        radial-gradient(circle at top right, rgba(34, 197, 94, 0.14), transparent 28%),
        linear-gradient(180deg, #020617 0%, #0b1020 100%);
      color: var(--text);
    }
    a { color: #93c5fd; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .wrap { max-width: 1280px; margin: 0 auto; padding: 32px 20px 48px; }
    .hero { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 22px; }
    .hero h1 { margin: 0 0 8px; font-size: 32px; }
    .hero p { margin: 0; color: var(--muted); max-width: 760px; line-height: 1.6; }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; }
    button {
      cursor: pointer;
      border: 1px solid var(--border);
      color: white;
      background: linear-gradient(135deg, rgba(96, 165, 250, 0.28), rgba(59, 130, 246, 0.12));
      padding: 10px 14px;
      border-radius: 12px;
      font-weight: 600;
      box-shadow: var(--shadow);
    }
    button.secondary { background: linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(34, 197, 94, 0.08)); }
    button:disabled { opacity: 0.6; cursor: wait; }
    .grid { display: grid; gap: 16px; }
    .cards { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 20px; }
    .card, .panel {
      background: var(--panel);
      backdrop-filter: blur(18px);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: var(--shadow);
    }
    .card { padding: 18px; }
    .metric { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
    .metric strong { display: block; color: var(--text); font-size: 30px; margin-top: 6px; }
    .layout { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
    .panel { padding: 18px; }
    .panel h2 { margin: 0 0 14px; font-size: 18px; }
    .sources { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
    .source-card {
      padding: 16px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--panel-2);
    }
    .source-card h3 { margin: 0 0 10px; font-size: 17px; display: flex; align-items: center; gap: 8px; }
    .headline-title { display: block; font-size: 16px; line-height: 1.45; margin-bottom: 8px; }
    .summary { color: var(--muted); line-height: 1.6; font-size: 14px; margin: 8px 0; }
    .meta { color: var(--muted); font-size: 12px; display: flex; gap: 12px; flex-wrap: wrap; }
    .item-list { margin: 12px 0 0; padding-left: 18px; color: var(--muted); line-height: 1.5; }
    .history-list { display: grid; gap: 10px; max-height: 720px; overflow: auto; padding-right: 4px; }
    .history-item {
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.55);
      cursor: pointer;
    }
    .history-item.active { border-color: rgba(96, 165, 250, 0.7); }
    .history-item h4 { margin: 0 0 6px; font-size: 15px; }
    .history-item p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      background: rgba(148, 163, 184, 0.12);
      color: var(--muted);
      border: 1px solid var(--border);
    }
    .badge.ok { color: #86efac; }
    .badge.fail { color: #fda4af; }
    .detail-box {
      min-height: 220px;
      border: 1px dashed var(--border);
      border-radius: 14px;
      padding: 14px;
      background: rgba(2, 6, 23, 0.28);
    }
    .detail-box pre {
      white-space: pre-wrap;
      word-break: break-word;
      color: #cbd5e1;
      line-height: 1.55;
      margin: 0;
      font-size: 13px;
    }
    .footer-note { color: var(--muted); font-size: 13px; margin-top: 14px; line-height: 1.6; }
    .loading { color: var(--muted); }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div>
        <h1>China News Worker Dashboard</h1>
        <p>查看当前中国新闻聚合结果、各来源头条、KV 历史快照和 Telegram 推送状态。页面直接调用当前 Worker 的 API。</p>
      </div>
      <div class="actions">
        <button id="refreshBtn">刷新缓存</button>
        <button id="notifyBtn" class="secondary">刷新并推送 Telegram</button>
      </div>
    </section>

    <section class="grid cards" id="summaryCards">
      <div class="card"><div class="metric">状态<strong>加载中</strong></div></div>
    </section>

    <section class="panel" style="margin-bottom: 16px;">
      <h2>来源头条</h2>
      <div id="sourceCards" class="sources">
        <div class="loading">正在加载来源数据…</div>
      </div>
    </section>

    <section class="layout">
      <div class="panel">
        <h2>历史快照</h2>
        <div id="historyList" class="history-list">
          <div class="loading">正在加载历史快照…</div>
        </div>
      </div>
      <div class="panel">
        <h2>快照详情</h2>
        <div id="historyDetail" class="detail-box">
          <pre>请选择左侧快照查看详情。</pre>
        </div>
        <div class="footer-note" id="statusNote"></div>
      </div>
    </section>
  </div>

  <script>
    const state = {
      history: [],
      selectedHistoryId: null
    };

    const sourceEmojis = ${JSON.stringify(SOURCE_EMOJIS)};



    function fmtTime(value) {
      if (!value) return '—';
      try {
        return new Date(value).toLocaleString('zh-CN', {
          hour12: false,
          timeZone: '${DEFAULT_TIMEZONE}'
        });
      } catch (_) {
        return value;
      }
    }

    function esc(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function fetchJSON(url) {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      return { data, headers: res.headers };
    }

    function renderSummary(news, status, history) {
      const successSources = Object.values(news.sources || {}).filter((source) => source.ok).length;
      const failedSources = Object.values(news.sources || {}).filter((source) => !source.ok).length;
      const cards = [
        ['最近快照', fmtTime(news.generatedAt)],
        ['文章总数', news.total || 0],
        ['成功来源', successSources + ' / ' + Object.keys(news.sources || {}).length],
        ['失败来源', failedSources],
        ['历史条目', history.length],
        ['KV 状态', status.kv?.enabled ? '已启用' : '未启用']
      ];

      document.getElementById('summaryCards').innerHTML = cards.map(function(entry) {
        return '<div class="card"><div class="metric">' + esc(entry[0]) + '<strong>' + esc(entry[1]) + '</strong></div></div>';
      }).join('');

      document.getElementById('statusNote').innerHTML =
        'Telegram：' + esc(status.telegram?.enabled ? '已配置' : '未配置') +
        '；Email：' + esc(status.email?.enabled ? '已配置' : '未配置') +
        '；Webhook：' + esc(status.webhook?.enabled ? '已配置' : '未配置') +
        '；最近推送：' + esc(status.telegram?.lastPush?.pushedAt ? fmtTime(status.telegram.lastPush.pushedAt) : '无') +
        '；Cron：' + esc(status.cron?.recommended || '—');
    }

    function renderSources(news) {
      const html = Object.values(news.sources || {}).map(function(source) {
        if (!source.ok) {
          return '<article class="source-card">' +
            '<h3>' + esc((sourceEmojis[source.id] || '•') + ' ' + source.name) + '</h3>' +
            '<div class="badges"><span class="badge fail">抓取失败</span></div>' +
            '<p class="summary">' + esc(source.error || 'unknown error') + '</p>' +
          '</article>';
        }

        const itemList = (source.items || []).slice(0, 5).map(function(item) {
          return '<li><a href="' + esc(item.link) + '" target="_blank" rel="noreferrer">' + esc(item.title) + '</a></li>';
        }).join('');

        return '<article class="source-card">' +
          '<h3>' + esc((sourceEmojis[source.id] || '•') + ' ' + source.name) + '</h3>' +
          (source.headline ? '<a class="headline-title" href="' + esc(source.headline.link) + '" target="_blank" rel="noreferrer">' + esc(source.headline.title) + '</a>' : '<div class="headline-title">暂无头条</div>') +
          (source.headline?.summary ? '<p class="summary">' + esc(source.headline.summary) + '</p>' : '') +
          '<div class="meta"><span>更新时间：' + esc(fmtTime(source.headline?.publishedAt || source.headline?.fetchedAt)) + '</span><span>条数：' + esc(source.count) + '</span></div>' +
          (itemList ? '<ol class="item-list">' + itemList + '</ol>' : '') +
        '</article>';
      }).join('');

      document.getElementById('sourceCards').innerHTML = html || '<div class="loading">暂无数据</div>';
    }

    function renderHistoryList(items) {
      state.history = items;
      if (!items.length) {
        document.getElementById('historyList').innerHTML = '<div class="loading">暂无历史快照（请先配置 KV 并执行一次刷新）</div>';
        return;
      }

      if (!state.selectedHistoryId) {
        state.selectedHistoryId = items[0].id;
      }

      document.getElementById('historyList').innerHTML = items.map(function(item, index) {
        const changed = item.diff?.changedSources?.length || 0;
        const failed = item.summary?.failedSources?.length || 0;
        const active = item.id === state.selectedHistoryId ? ' active' : '';
        const compareLink = items[index + 1]
          ? '<div style="margin-top:8px;"><a href="/history/compare?from=' + encodeURIComponent(items[index + 1].id) + '&to=' + encodeURIComponent(item.id) + '" target="_blank" rel="noreferrer">与上一条对比</a></div>'
          : '';
        return '<div class="history-item' + active + '" data-id="' + esc(item.id) + '">' +
          '<h4>' + esc(fmtTime(item.generatedAt)) + '</h4>' +
          '<p>原因：' + esc(item.reason || 'unknown') + '</p>' +
          '<div class="badges">' +
            '<span class="badge ok">变化源 ' + esc(changed) + '</span>' +
            '<span class="badge">文章 ' + esc(item.summary?.totalArticles ?? 0) + '</span>' +
            '<span class="badge ' + (failed ? 'fail' : 'ok') + '">失败源 ' + esc(failed) + '</span>' +
          '</div>' +
          compareLink +
        '</div>';
      }).join('');

      for (const el of document.querySelectorAll('.history-item')) {
        el.addEventListener('click', function() {
          state.selectedHistoryId = this.dataset.id;
          renderHistoryList(state.history);
          loadHistoryDetail(this.dataset.id);
        });
      }
    }

    async function loadHistoryDetail(id) {
      const container = document.getElementById('historyDetail');
      container.innerHTML = '<pre>正在加载快照详情…</pre>';
      try {
        const { data } = await fetchJSON('/api/history?id=' + encodeURIComponent(id));
        const sourceLines = Object.values(data.snapshot.sources || {}).map(function(source) {
          return (source.ok ? '✓ ' : '✗ ') + source.name + ' [' + source.count + '] ' + (source.headline?.title || source.error || '无数据');
        }).join('\\n');

        const changed = data.meta?.diff?.changedSources?.join('、') || '无';
        container.innerHTML = '<pre>' +
          esc(
            '时间：' + fmtTime(data.meta?.generatedAt || data.snapshot.generatedAt) + '\\n' +
            '原因：' + (data.meta?.reason || 'unknown') + '\\n' +
            '变化来源：' + changed + '\\n' +
            '总文章数：' + (data.snapshot.total || 0) + '\\n\\n' +
            sourceLines
          ) +
        '</pre>';
      } catch (error) {
        container.innerHTML = '<pre>' + esc('加载失败：' + error.message) + '</pre>';
      }
    }

    async function loadDashboard() {
      try {
        const [{ data: news }, { data: history }, { data: status }] = await Promise.all([
          fetchJSON('/api/news?limit=5'),
          fetchJSON('/api/history?limit=20').catch(function() { return { data: { items: [] } }; }),
          fetchJSON('/api/status')
        ]);

        renderSummary(news, status, history.items || []);
        renderSources(news);
        renderHistoryList(history.items || []);
        if (state.selectedHistoryId) {
          loadHistoryDetail(state.selectedHistoryId);
        }
      } catch (error) {
        document.getElementById('sourceCards').innerHTML = '<div class="loading">加载失败：' + esc(error.message) + '</div>';
      }
    }

    async function runRefresh(url, button) {
      const oldText = button.textContent;
      button.disabled = true;
      button.textContent = '处理中…';
      try {
        await fetchJSON(url);
        await loadDashboard();
      } catch (error) {
        alert('操作失败：' + error.message);
      } finally {
        button.disabled = false;
        button.textContent = oldText;
      }
    }

    document.getElementById('refreshBtn').addEventListener('click', function() {
      runRefresh('/api/refresh', this);
    });
    document.getElementById('notifyBtn').addEventListener('click', function() {
      runRefresh('/api/refresh?notify=1', this);
    });

    loadDashboard();
  </script>
</body>
</html>`;
}



export { renderDashboardHtml, fmtTime, esc, fetchJSON, renderSummary, renderSources, renderHistoryList, loadHistoryDetail, loadDashboard, runRefresh };
