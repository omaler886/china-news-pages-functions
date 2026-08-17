async function computeHmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function summarizeSnapshot(snapshot) {
  const sourceSummary = SOURCE_ORDER.map((id) => ({
    id,
    ok: Boolean(snapshot.sources?.[id]?.ok),
    count: snapshot.sources?.[id]?.count ?? 0
  }));

  return {
    totalArticles: snapshot.total ?? 0,
    headlineCount: snapshot.headlines?.length ?? 0,
    successfulSources: sourceSummary.filter((item) => item.ok).length,
    failedSources: sourceSummary.filter((item) => !item.ok).map((item) => item.id),
    sourceSummary
  };
}

function hasKvBinding(env) {
  return Boolean(env?.NEWS_CACHE && typeof env.NEWS_CACHE.get === 'function' && typeof env.NEWS_CACHE.put === 'function');
}

function hasTelegramConfig(env) {
  return Boolean(env?.TELEGRAM_BOT_TOKEN && env?.TELEGRAM_CHAT_ID);
}

function hasEmailConfig(env) {
  return Boolean(env?.RESEND_API_KEY && env?.EMAIL_FROM && env?.EMAIL_TO);
}

function hasWebhookConfig(env) {
  return parseWebhookTargets(env).length > 0;
}

async function readKvJson(env, key) {
  if (!hasKvBinding(env)) {
    return null;
  }

  try {
    return await env.NEWS_CACHE.get(key, 'json');
  } catch {
    const raw = await env.NEWS_CACHE.get(key);
    return raw ? JSON.parse(raw) : null;
  }
}

function parseSourceRouting(env) {
  const raw = env?.TELEGRAM_SOURCE_ROUTING;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeSourceRoute(item))
        .filter(Boolean);
    }

    return Object.entries(parsed).map(([sourceId, config]) => normalizeSourceRoute({ sourceId, ...config })).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeSourceRoute(route) {
  const sourceId = normalizeSource(route?.sourceId);
  const chatId = cleanText(route?.chatId ?? route?.chat_id ?? '');
  if (!sourceId || !chatId) {
    return null;
  }

  const threadId = cleanText(route?.threadId ?? route?.thread_id ?? '');
  return {
    sourceId,
    chatId,
    threadId: threadId || null,
    disableNotification: isTruthy(route?.disableNotification ?? route?.disable_notification ?? false)
  };
}

function parseWebhookTargets(env) {
  const raw = env?.WEBHOOK_URLS || env?.WEBHOOK_URL || '';
  const globalHeaders = parseJsonObject(env?.WEBHOOK_HEADERS_JSON);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === 'string') {
          return { url: item, headers: { ...globalHeaders } };
        }
        const url = cleanText(item?.url || '');
        if (!url) return null;
        return {
          url,
          headers: { ...globalHeaders, ...parseJsonObject(item?.headers) }
        };
      }).filter(Boolean);
    }
  } catch {
    // fall through to plain string parsing
  }

  return String(raw)
    .split(/[\r\n,]+/)
    .map((item) => cleanText(item))
    .filter(Boolean)
    .map((url) => ({ url, headers: { ...globalHeaders } }));
}

function parseJsonObject(raw) {
  if (!raw) {
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseEmailList(raw) {
  return String(raw || '')
    .split(/[,\n;]/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}


export { computeHmacSha256, summarizeSnapshot, hasKvBinding, hasTelegramConfig, hasEmailConfig, hasWebhookConfig, readKvJson, parseSourceRouting, normalizeSourceRoute, parseWebhookTargets, parseJsonObject, parseEmailList };
