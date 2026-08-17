function buildEmailHtml(snapshot, options = {}) {
  const diff = options.diff ?? buildSnapshotDiff(options.previousSnapshot, snapshot);
  const changed = new Set(diff.changedSources.length ? diff.changedSources : snapshot.headlines.map((item) => item.sourceId));
  const items = snapshot.headlines.filter((item) => changed.has(item.sourceId) || options.forceNotify);

  const rows = items.map((headline) => {
    return `<tr>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><strong>${escapeHtml(headline.sourceName)}</strong></td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;">
        <div style="margin-bottom:6px;"><a href="${escapeHtml(headline.link)}">${escapeHtml(headline.title)}</a></div>
        ${headline.summary ? `<div style="color:#475569;font-size:13px;line-height:1.6;">${escapeHtml(truncateText(headline.summary, 180))}</div>` : ''}
      </td>
      <td style="padding:12px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;">${escapeHtml(formatInTimeZone(headline.publishedAt || headline.fetchedAt, DEFAULT_TIMEZONE))}</td>
    </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN">
<body style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;color:#0f172a;padding:24px;">
  <h2 style="margin-top:0;">中国新闻快报</h2>
  <p>更新时间：<strong>${escapeHtml(formatInTimeZone(snapshot.generatedAt, DEFAULT_TIMEZONE))}</strong></p>
  <p>变化来源：${escapeHtml(diff.changedSources.map((id) => snapshot.sources?.[id]?.name || id).join('、') || '无')}</p>
  <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;">
    <thead>
      <tr style="background:#e2e8f0;text-align:left;">
        <th style="padding:12px;">来源</th>
        <th style="padding:12px;">标题</th>
        <th style="padding:12px;">时间</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="3" style="padding:16px;">没有检测到变化来源。</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

function buildEmailText(snapshot, options = {}) {
  const diff = options.diff ?? buildSnapshotDiff(options.previousSnapshot, snapshot);
  const changed = new Set(diff.changedSources.length ? diff.changedSources : snapshot.headlines.map((item) => item.sourceId));
  const lines = [
    '中国新闻快报',
    `更新时间：${formatInTimeZone(snapshot.generatedAt, DEFAULT_TIMEZONE)}`,
    `变化来源：${diff.changedSources.map((id) => snapshot.sources?.[id]?.name || id).join('、') || '无'}`,
    ''
  ];

  for (const headline of snapshot.headlines) {
    if (!changed.has(headline.sourceId) && !options.forceNotify) {
      continue;
    }
    lines.push(`[${headline.sourceName}] ${headline.title}`);
    lines.push(headline.link);
    if (headline.summary) {
      lines.push(truncateText(headline.summary, 180));
    }
    lines.push(`发布时间：${formatInTimeZone(headline.publishedAt || headline.fetchedAt, DEFAULT_TIMEZONE)}`);
    lines.push('');
  }

  return lines.join('\n').trim();
}


export { buildEmailHtml, buildEmailText };
