async function dispatchNotifications(env, snapshot, options = {}) {
  const settled = await Promise.allSettled([
    maybeSendTelegram(env, snapshot, options),
    maybeSendEmail(env, snapshot, options),
    maybeSendWebhook(env, snapshot, options)
  ]);

  return {
    telegram: settledNotification(settled[0]),
    email: settledNotification(settled[1]),
    webhook: settledNotification(settled[2])
  };
}

async function maybeSendTelegram(env, snapshot, options = {}) {
  if (!hasTelegramConfig(env)) {
    return { attempted: false, skipped: true, reason: 'telegram_not_configured' };
  }

  const digest = await computeHeadlinesDigest(snapshot.headlines);
  const lastDigest = hasKvBinding(env) ? await env.NEWS_CACHE.get(KV_TELEGRAM_DIGEST_KEY) : null;

  if (!options.forceNotify && lastDigest && lastDigest === digest) {
    return { attempted: true, skipped: true, reason: 'unchanged' };
  }

  const results = [];
  const disableDefault = isTruthy(env?.TELEGRAM_DISABLE_DEFAULT_PUSH);
  if (!disableDefault) {
    const message = buildTelegramMessage(snapshot, options);
    const result = await sendTelegramMessage(env, {
      chatId: env.TELEGRAM_CHAT_ID,
      threadId: env.TELEGRAM_MESSAGE_THREAD_ID,
      text: message,
      disableNotification: isTruthy(env.TELEGRAM_DISABLE_NOTIFICATION)
    });
    results.push({
      scope: 'default',
      chatId: env.TELEGRAM_CHAT_ID,
      messageId: result?.result?.message_id ?? null
    });
  }

  const routed = await sendTelegramSourceRoutes(env, snapshot, options);
  results.push(...routed);

  const meta = {
    pushedAt: new Date().toISOString(),
    generatedAt: snapshot.generatedAt,
    reason: options.reason ?? 'unknown',
    cron: options.cron ?? null,
    digest,
    headlineCount: snapshot.headlines.length,
    deliveries: results
  };

  if (hasKvBinding(env)) {
    await Promise.all([
      env.NEWS_CACHE.put(KV_TELEGRAM_DIGEST_KEY, digest, { expirationTtl: KV_SNAPSHOT_TTL }),
      env.NEWS_CACHE.put(KV_TELEGRAM_META_KEY, JSON.stringify(meta), { expirationTtl: KV_SNAPSHOT_TTL })
    ]);
  }

  return {
    attempted: true,
    skipped: false,
    reason: 'sent',
    deliveryCount: results.length,
    routesSent: routed.length,
    messageId: results[0]?.messageId ?? null,
    headlineCount: meta.headlineCount
  };
}

async function sendTelegramSourceRoutes(env, snapshot, options = {}) {
  const routes = parseSourceRouting(env);
  if (!routes.length) {
    return [];
  }

  const diff = options.diff ?? buildSnapshotDiff(options.previousSnapshot, snapshot);
  const changed = new Set(diff.changedSources.length ? diff.changedSources : snapshot.headlines.map((item) => item.sourceId));
  const deliveries = [];

  for (const route of routes) {
    if (!changed.has(route.sourceId) && !options.forceNotify) {
      continue;
    }

    const headline = snapshot.sources?.[route.sourceId]?.headline;
    if (!headline) {
      continue;
    }

    const text = buildTelegramSourceMessage(route.sourceId, headline, snapshot, options);
    const result = await sendTelegramMessage(env, {
      chatId: route.chatId,
      threadId: route.threadId,
      text,
      disableNotification: route.disableNotification
    });

    deliveries.push({
      scope: route.sourceId,
      chatId: route.chatId,
      threadId: route.threadId ?? null,
      messageId: result?.result?.message_id ?? null
    });
  }

  return deliveries;
}

function buildTelegramMessage(snapshot, options = {}) {
  const diff = options.diff ?? buildSnapshotDiff(options.previousSnapshot, snapshot);
  const changedSources = diff.changedSources.length
    ? diff.changedSources
    : snapshot.headlines.map((headline) => headline.sourceId);
  const changedSet = new Set(changedSources);
  const lines = [];

  lines.push('🛰️ <b>中国新闻快报</b>');
  lines.push(`<code>${escapeHtml(formatInTimeZone(snapshot.generatedAt, DEFAULT_TIMEZONE))} (${DEFAULT_TIMEZONE})</code>`);
  lines.push('');

  lines.push(`更新来源：<b>${changedSources.length}</b> / ${SOURCE_ORDER.length}`);
  lines.push(`成功来源：<b>${SOURCE_ORDER.filter((id) => snapshot.sources?.[id]?.ok).length}</b> / ${SOURCE_ORDER.length}`);

  if (diff.changedSources.length) {
    lines.push(`变化列表：${escapeHtml(diff.changedSources.map((id) => snapshot.sources?.[id]?.name || id).join('、'))}`);
  } else if (options.forceNotify) {
    lines.push('变化列表：无（强制推送）');
  }

  lines.push('');

  for (const headline of snapshot.headlines) {
    if (!changedSet.has(headline.sourceId) && !options.forceNotify) {
      continue;
    }

    const prefix = SOURCE_EMOJIS[headline.sourceId] || '•';
    lines.push(`${prefix} <b>${escapeHtml(headline.sourceName)}</b>`);
    lines.push(`<a href="${escapeHtml(headline.link)}">${escapeHtml(headline.title)}</a>`);

    if (headline.summary) {
      lines.push(`<i>${escapeHtml(truncateText(headline.summary, 120))}</i>`);
    }

    if (headline.publishedAt) {
      lines.push(`发布时间：${escapeHtml(formatInTimeZone(headline.publishedAt, DEFAULT_TIMEZONE))}`);
    }

    lines.push('');
  }
  const failedSources = SOURCE_ORDER.filter((id) => snapshot.sources?.[id] && !snapshot.sources[id].ok);
  if (failedSources.length) {
    lines.push(`⚠️ 失败源：${escapeHtml(failedSources.join(', '))}`);
  }

  if (options.reason) {
    lines.push(`触发方式：${escapeHtml(options.reason)}`);
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function buildTelegramSourceMessage(sourceId, headline, snapshot, options = {}) {
  const sourceName = snapshot.sources?.[sourceId]?.name || sourceId;
  const prefix = SOURCE_EMOJIS[sourceId] || '•';
  const lines = [
    `${prefix} <b>${escapeHtml(sourceName)} 更新</b>`,
    `<a href="${escapeHtml(headline.link)}">${escapeHtml(headline.title)}</a>`
  ];

  if (headline.summary) {
    lines.push(`<i>${escapeHtml(truncateText(headline.summary, 180))}</i>`);
  }
  if (headline.publishedAt) {
    lines.push(`发布时间：${escapeHtml(formatInTimeZone(headline.publishedAt, DEFAULT_TIMEZONE))}`);
  }
  if (options.reason) {
    lines.push(`触发方式：${escapeHtml(options.reason)}`);
  }

  return lines.join('\n');
}

async function sendTelegramMessage(env, { chatId, threadId, text, disableNotification }) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_notification: Boolean(disableNotification),
    link_preview_options: {
      is_disabled: true
    }
  };

  if (threadId) {
    payload.message_thread_id = Number(threadId);
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.ok === false) {
    throw new Error(`telegram_send_failed ${response.status} ${result?.description || response.statusText}`);
  }

  return result;
}

async function maybeSendEmail(env, snapshot, options = {}) {
  if (!hasEmailConfig(env)) {
    return { attempted: false, skipped: true, reason: 'email_not_configured' };
  }

  const digest = await computeHeadlinesDigest(snapshot.headlines);
  const lastDigest = hasKvBinding(env) ? await env.NEWS_CACHE.get(KV_EMAIL_DIGEST_KEY) : null;
  if (!options.forceNotify && lastDigest && lastDigest === digest) {
    return { attempted: true, skipped: true, reason: 'unchanged' };
  }

  const recipients = parseEmailList(env.EMAIL_TO);
  const subjectPrefix = cleanText(env.EMAIL_SUBJECT_PREFIX || '[China News]');
  const subject = `${subjectPrefix} ${formatInTimeZone(snapshot.generatedAt, DEFAULT_TIMEZONE)} 更新`;
  const html = buildEmailHtml(snapshot, options);
  const text = buildEmailText(snapshot, options);

  const payload = {
    from: env.EMAIL_FROM,
    to: recipients,
    subject,
    html,
    text
  };

  const cc = parseEmailList(env.EMAIL_CC);
  const bcc = parseEmailList(env.EMAIL_BCC);
  const replyTo = parseEmailList(env.EMAIL_REPLY_TO);
  if (cc.length) payload.cc = cc;
  if (bcc.length) payload.bcc = bcc;
  if (replyTo.length) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    throw new Error(`email_send_failed ${response.status} ${result?.message || result?.error?.message || response.statusText}`);
  }

  const meta = {
    pushedAt: new Date().toISOString(),
    generatedAt: snapshot.generatedAt,
    reason: options.reason ?? 'unknown',
    digest,
    emailId: result?.id ?? null,
    recipients
  };

  if (hasKvBinding(env)) {
    await Promise.all([
      env.NEWS_CACHE.put(KV_EMAIL_DIGEST_KEY, digest, { expirationTtl: KV_SNAPSHOT_TTL }),
      env.NEWS_CACHE.put(KV_EMAIL_META_KEY, JSON.stringify(meta), { expirationTtl: KV_SNAPSHOT_TTL })
    ]);
  }

  return {
    attempted: true,
    skipped: false,
    reason: 'sent',
    emailId: meta.emailId,
    recipientCount: recipients.length
  };
}

async function maybeSendWebhook(env, snapshot, options = {}) {
  const targets = parseWebhookTargets(env);
  if (!targets.length) {
    return { attempted: false, skipped: true, reason: 'webhook_not_configured' };
  }

  const digest = await computeHeadlinesDigest(snapshot.headlines);
  const lastDigest = hasKvBinding(env) ? await env.NEWS_CACHE.get(KV_WEBHOOK_DIGEST_KEY) : null;
  if (!options.forceNotify && lastDigest && lastDigest === digest) {
    return { attempted: true, skipped: true, reason: 'unchanged' };
  }

  const body = {
    event: 'china_news_update',
    generatedAt: snapshot.generatedAt,
    reason: options.reason ?? 'unknown',
    historyId: options.historyId ?? null,
    diff: options.diff ?? buildSnapshotDiff(options.previousSnapshot, snapshot),
    summary: summarizeSnapshot(snapshot),
    headlines: snapshot.headlines,
    sources: Object.fromEntries(SOURCE_ORDER.map((id) => [id, {
      name: snapshot.sources?.[id]?.name || id,
      ok: Boolean(snapshot.sources?.[id]?.ok),
      headline: snapshot.sources?.[id]?.headline ?? null,
      error: snapshot.sources?.[id]?.error ?? null
    }]))
  };
  const bodyText = JSON.stringify(body);
  const signature = env.WEBHOOK_SIGNING_SECRET
    ? await computeHmacSha256(env.WEBHOOK_SIGNING_SECRET, bodyText)
    : null;

  const deliveries = [];
  for (const target of targets) {
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      ...target.headers
    };
    if (signature) {
      headers['X-China-News-Signature'] = `sha256=${signature}`;
    }

    const response = await fetch(target.url, {
      method: 'POST',
      headers,
      body: bodyText
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`webhook_send_failed ${response.status} ${target.url} ${text.slice(0, 200)}`);
    }

    deliveries.push({ url: target.url, status: response.status });
  }

  const meta = {
    pushedAt: new Date().toISOString(),
    generatedAt: snapshot.generatedAt,
    reason: options.reason ?? 'unknown',
    digest,
    targetCount: deliveries.length,
    deliveries
  };

  if (hasKvBinding(env)) {
    await Promise.all([
      env.NEWS_CACHE.put(KV_WEBHOOK_DIGEST_KEY, digest, { expirationTtl: KV_SNAPSHOT_TTL }),
      env.NEWS_CACHE.put(KV_WEBHOOK_META_KEY, JSON.stringify(meta), { expirationTtl: KV_SNAPSHOT_TTL })
    ]);
  }

  return {
    attempted: true,
    skipped: false,
    reason: 'sent',
    targetCount: deliveries.length
  };
}


export { dispatchNotifications, maybeSendTelegram, sendTelegramSourceRoutes, buildTelegramMessage, buildTelegramSourceMessage, sendTelegramMessage, maybeSendEmail, maybeSendWebhook };
