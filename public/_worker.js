const APP_NAME = 'china-news-pages-functions';
const COMPAT_DATE = '2026-04-15';
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const SNAPSHOT_LIMIT = MAX_LIMIT;
const RESPONSE_CACHE_TTL = 10 * 60;
const FETCH_CACHE_TTL = 5 * 60;
const KV_SNAPSHOT_TTL = 7 * 24 * 60 * 60;
const KV_SNAPSHOT_KEY = 'china-news:snapshot:v1';
const KV_SNAPSHOT_META_KEY = 'china-news:snapshot-meta:v1';
const KV_HISTORY_INDEX_KEY = 'china-news:history:index:v1';
const KV_HISTORY_ITEM_PREFIX = 'china-news:history:item:v1:';
const KV_TELEGRAM_DIGEST_KEY = 'china-news:telegram:last-digest:v1';
const KV_TELEGRAM_META_KEY = 'china-news:telegram:last-meta:v1';
const KV_EMAIL_DIGEST_KEY = 'china-news:email:last-digest:v1';
const KV_EMAIL_META_KEY = 'china-news:email:last-meta:v1';
const KV_WEBHOOK_DIGEST_KEY = 'china-news:webhook:last-digest:v1';
const KV_WEBHOOK_META_KEY = 'china-news:webhook:last-meta:v1';
const MAX_HISTORY_ITEMS = 120;
const DEFAULT_HISTORY_LIMIT = 30;
const DEFAULT_CRON = '*/30 * * * *';
const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_TRANSLATION_URL = 'https://translate.frostcc.ggff.net';
const TARGET_LANGUAGE = 'zh-CN';
const TRANSLATION_BATCH_SIZE = 5;
const RSS_COPYRIGHT = '© China News Pages Functions. Article metadata belongs to original publishers.';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; china-news-pages-functions/1.0; +https://pages.cloudflare.com/)',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

const CHINA_RELATED_KEYWORDS = [
  /\bchina\b/i,
  /\bchinese\b/i,
  /\bbeijing\b/i,
  /\bshanghai\b/i,
  /\bshenzhen\b/i,
  /\bhong\s*kong\b/i,
  /\btaiwan\b/i,
  /\bxinjiang\b/i,
  /\btibet\b/i,
  /\bguangdong\b/i,
  /\bmacau\b/i
];

const SOURCE_ORDER = ['wsj', 'nytimes', 'bbc', 'cnn', 'scmp', 'zaobao'];
const SOURCE_EMOJIS = {
  wsj: '💼',
  nytimes: '🗽',
  bbc: '🇬🇧',
  cnn: '📺',
  scmp: '🌏',
  zaobao: '📰'
};

const SOURCES = {
  wsj: {
    id: 'wsj',
    name: '华尔街日报',
    type: 'rss',
    upstream: [
      'https://feeds.content.dowjones.io/public/rss/RSSWorldNews',
      'https://feeds.content.dowjones.io/public/rss/socialeconomyfeed',
      'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain',
      'https://feeds.content.dowjones.io/public/rss/RSSWSJD',
      'https://feeds.content.dowjones.io/public/rss/socialpoliticsfeed'
    ],
    load: fetchWsjChinaNews
  },
  nytimes: {
    id: 'nytimes',
    name: '纽约时报',
    type: 'section-html',
    upstream: ['https://www.nytimes.com/topic/destination/china'],
    load: fetchNytChinaNews
  },
  bbc: {
    id: 'bbc',
    name: 'BBC',
    type: 'rss',
    upstream: ['https://feeds.bbci.co.uk/news/world/asia/china/rss.xml'],
    load: fetchBbcChinaNews
  },
  cnn: {
    id: 'cnn',
    name: 'CNN',
    type: 'section-html',
    upstream: ['https://edition.cnn.com/world/china'],
    load: fetchCnnChinaNews
  },
  scmp: {
    id: 'scmp',
    name: '南华早报',
    type: 'section-html',
    upstream: ['https://www.scmp.com/topics/china'],
    load: fetchScmpChinaNews
  },
  zaobao: {
    id: 'zaobao',
    name: '联合早报',
    type: 'section-html',
    upstream: ['https://www.zaobao.com/realtime/china'],
    load: fetchZaobaoChinaNews
  }
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return jsonResponse({ error: 'method_not_allowed' }, 405);
    }

    const url = new URL(request.url);
    const limit = clampInt(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const rawSourceId = url.searchParams.get('source');
    const sourceId = normalizeSource(rawSourceId);
    const refresh = isTruthy(url.searchParams.get('refresh'));
    const notify = isTruthy(url.searchParams.get('notify'));
    const forceNotify = isTruthy(url.searchParams.get('force_notify')) || isTruthy(url.searchParams.get('forceNotify'));
    const historyLimit = clampInt(url.searchParams.get('history_limit') ?? url.searchParams.get('historyLimit') ?? url.searchParams.get('limit'), DEFAULT_HISTORY_LIMIT, 1, MAX_HISTORY_ITEMS);
    const pathname = url.pathname.replace(/\/$/, '') || '/';
    const rssRouteSourceId = parseFixedRssSource(pathname);
    const wantsHtml = /\btext\/html\b/i.test(request.headers.get('accept') || '');

    if (rawSourceId && !sourceId) {
      return jsonResponse({ error: 'invalid_source', supportedSources: SOURCE_ORDER }, 400);
    }

    if ((pathname === '/' && wantsHtml) || pathname === '/dashboard') {
      return htmlResponse(renderDashboardHtml());
    }

    if (pathname === '/rss/cover.svg' || pathname === '/rss/icon.svg') {
      const imageSourceId = normalizeSource(url.searchParams.get('source'));
      const kind = pathname.endsWith('/icon.svg') ? 'icon' : 'cover';
      return svgResponse(renderRssBrandSvg(imageSourceId, kind), 200, {
        'Cache-Control': `public, max-age=${RESPONSE_CACHE_TTL}, s-maxage=${RESPONSE_CACHE_TTL}`
      });
    }

    if (pathname === '/' || pathname === '/healthz') {
      const runtime = await buildRuntimeStatus(env);
      return jsonResponse({
        ok: true,
        name: APP_NAME,
        compatibilityDate: COMPAT_DATE,
        now: new Date().toISOString(),
        timezone: DEFAULT_TIMEZONE,
        endpoints: {
          news: '/api/news?limit=5',
          headlines: '/api/headlines',
          refresh: '/api/refresh?notify=1',
          history: '/api/history?limit=30',
          historyItem: '/api/history?id=<history-id>',
          historyCompare: '/api/history/compare?from=<old>&to=<new>',
          sourceFilter: '/api/news?source=bbc&limit=5',
          status: '/api/status',
          dashboard: '/dashboard',
          comparePage: '/history/compare?from=<old>&to=<new>',
          rss: '/rss?limit=20',
          rssFixedAll: '/rss/all.xml',
          rssFixedSource: '/rss/bbc.xml',
          rssCover: '/rss/cover.svg?source=bbc',
          rssIcon: '/rss/icon.svg?source=bbc',
          pagesNote: 'Pages Functions 无原生 scheduled；如需定时抓取，可外部定时请求 /api/refresh?notify=1'
        },
        scheduledCron: DEFAULT_CRON,
        supportedSources: SOURCE_ORDER.map((id) => ({
          id,
          name: SOURCES[id].name,
          upstream: SOURCES[id].upstream
        })),
        runtime
      });
    }

    if (pathname === '/api/sources') {
      return jsonResponse({
        ok: true,
        generatedAt: new Date().toISOString(),
        sources: SOURCE_ORDER.map((id) => ({
          id,
          name: SOURCES[id].name,
          upstream: SOURCES[id].upstream
        }))
      });
    }

    if (pathname === '/api/status') {
      return jsonResponse({ ok: true, ...(await buildRuntimeStatus(env)) });
    }

    if (pathname === '/api/history') {
      if (!hasKvBinding(env)) {
        return jsonResponse({
          ok: false,
          error: 'kv_not_configured',
          items: []
        }, 503, noStoreHeaders());
      }

      const historyId = cleanText(url.searchParams.get('id') || '');
      if (historyId) {
        const item = await loadHistoryItem(env, historyId);
        if (!item) {
          return jsonResponse({ ok: false, error: 'history_not_found', id: historyId }, 404, noStoreHeaders());
        }
        return jsonResponse({ ok: true, ...item }, 200, noStoreHeaders());
      }

      const history = await loadHistoryIndex(env, historyLimit);
      return jsonResponse({
        ok: true,
        count: history.length,
        items: history
      }, 200, noStoreHeaders());
    }

    if (pathname === '/api/history/compare') {
      if (!hasKvBinding(env)) {
        return jsonResponse({ ok: false, error: 'kv_not_configured' }, 503, noStoreHeaders());
      }

      const fromId = cleanText(url.searchParams.get('from') || '');
      const toId = cleanText(url.searchParams.get('to') || '');
      if (!fromId || !toId) {
        return jsonResponse({ ok: false, error: 'missing_compare_ids' }, 400, noStoreHeaders());
      }

      const compareResult = await buildHistoryCompareResult(env, fromId, toId);
      if (!compareResult.ok) {
        return jsonResponse(compareResult, 404, noStoreHeaders());
      }
      return jsonResponse(compareResult, 200, noStoreHeaders());
    }

    if (pathname === '/history/compare') {
      return htmlResponse(renderComparePageHtml(url));
    }

    if (pathname === '/api/refresh') {
      const result = await refreshSnapshot(env, {
        reason: 'manual',
        notify,
        forceNotify
      });
      return jsonResponse({
        ...projectPayload(result.snapshot, { limit, sourceId }),
        refresh: {
          reason: 'manual',
          persisted: result.persisted,
          telegram: result.telegram,
          email: result.email,
          webhook: result.webhook
        }
      }, 200, noStoreHeaders({ 'X-Data-Source': 'live' }));
    }

    if (pathname === '/rss' || pathname === '/api/rss' || rssRouteSourceId !== null) {
      const effectiveSourceId = rssRouteSourceId === '' ? null : (rssRouteSourceId || sourceId);
      const payload = await getPayloadForRead(env, {
        limit: Math.max(limit, DEFAULT_HISTORY_LIMIT),
        sourceId: effectiveSourceId,
        refresh
      });
      return rssResponse(buildRssXml(payload, { siteUrl: url.origin, sourceId: effectiveSourceId }));
    }

    if (pathname === '/api/news' || pathname === '/api/headlines') {
      const cacheKey = buildCacheKey(url, pathname, limit, sourceId, refresh || notify, forceNotify);
      const edgeCache = caches?.default;

      if (!refresh && !notify && edgeCache) {
        const cached = await edgeCache.match(cacheKey);
        if (cached) {
          return withCors(cached);
        }
      }

      let payload = null;
      let dataSource = 'live';
      let refreshInfo = null;

      if (!refresh && !notify) {
        const snapshot = await loadSnapshotFromKv(env);
        if (snapshot) {
          payload = projectPayload(snapshot, { limit, sourceId });
          dataSource = 'kv';
        }
      }

      if (!payload) {
        const result = await refreshSnapshot(env, {
          reason: 'http',
          notify,
          forceNotify
        });
        payload = projectPayload(result.snapshot, { limit, sourceId });
        refreshInfo = {
          persisted: result.persisted,
          telegram: result.telegram,
          email: result.email,
          webhook: result.webhook
        };
        dataSource = 'live';
      }

      const body = pathname === '/api/headlines'
        ? buildHeadlinesBody(payload, refreshInfo)
        : buildNewsBody(payload, refreshInfo);

      const response = jsonResponse(body, 200, {
        'Cache-Control': `public, max-age=${RESPONSE_CACHE_TTL}, s-maxage=${RESPONSE_CACHE_TTL}`,
        'X-Worker-Cache-TTL': String(RESPONSE_CACHE_TTL),
        'X-Data-Source': dataSource,
        'X-Snapshot-Generated-At': payload.generatedAt || ''
      });

      if (!refresh && !notify && edgeCache) {
        ctx.waitUntil(edgeCache.put(cacheKey, response.clone()));
      }

      return response;
    }

    return jsonResponse({ error: 'not_found' }, 404);
  }
};

async function refreshSnapshot(env, options = {}) {
  const previousSnapshot = await loadSnapshotFromKv(env);
  const liveSnapshot = await buildLiveSnapshot();
  const snapshot = await translateSnapshot(env, liveSnapshot);
  const diff = buildSnapshotDiff(previousSnapshot, snapshot);
  const persisted = await persistSnapshotToKv(env, snapshot, options, {
    previousSnapshot,
    diff
  });
  const notifications = options.notify
    ? await dispatchNotifications(env, snapshot, {
        ...options,
        previousSnapshot,
        diff,
        historyId: persisted.history?.id ?? null
      })
    : {
        telegram: { attempted: false, skipped: true, reason: 'notify_disabled' },
        email: { attempted: false, skipped: true, reason: 'notify_disabled' },
        webhook: { attempted: false, skipped: true, reason: 'notify_disabled' }
      };

  return {
    snapshot,
    persisted,
    diff,
    notifications,
    telegram: notifications.telegram,
    email: notifications.email,
    webhook: notifications.webhook
  };
}

/**
 * 判断文本是否已经包含中文，避免浪费翻译调用并降低延迟。
 * @param {string} text 待检查文本。
 * @returns {boolean} 文本是否包含中文字符。
 */
function containsChinese(text) {
  return /[\u3400-\u9fff]/u.test(String(text || ''));
}

/**
 * 请求一小批 LibreTranslate 译文，避免超过服务端批量限制。
 * @param {object} env Pages Functions 环境绑定。
 * @param {string} sourceId 新闻来源标识。
 * @param {Array<object>} articles 该来源的文章列表。
 * @returns {Promise<Array<[string, {title: string, summary: string}]>>} 文章链接和译文条目。
 */
async function requestArticleTranslations(env, sourceId, articles) {
  const fields = articles.flatMap((article) => [
    ...(!containsChinese(article.title)
      ? [{ articleId: article.link, field: 'title', text: article.title }]
      : []),
    ...(article.summary && !containsChinese(article.summary)
      ? [{ articleId: article.link, field: 'summary', text: article.summary }]
      : [])
  ]);
  if (!fields.length) {
    return [];
  }

  const translationUrl = cleanText(env.TRANSLATION_URL || DEFAULT_TRANSLATION_URL).replace(/\/$/, '');
  const response = await fetch(`${translationUrl}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: fields.map((item) => item.text),
      source: 'en',
      target: 'zh',
      format: 'text',
      api_key: env.LIBRETRANSLATE_API_KEY
    })
  });
  if (!response.ok) {
    throw new Error(`libretranslate_failed ${sourceId} ${response.status}`);
  }

  const payload = await response.json();
  const translatedTexts = Array.isArray(payload.translatedText)
    ? payload.translatedText
    : [payload.translatedText];
  const translations = new Map();
  fields.forEach((field, index) => {
    const currentTranslation = translations.get(field.articleId) ?? {};
    currentTranslation[field.field] = cleanText(translatedTexts[index] || '');
    translations.set(field.articleId, currentTranslation);
  });

  return [...translations.entries()];
}

/**
 * 批量翻译单个来源的文章，限制单次输入规模以避免模型输出截断。
 * @param {object} env Pages Functions 环境绑定。
 * @param {string} sourceId 新闻来源标识。
 * @param {Array<object>} articles 该来源的文章列表。
 * @returns {Promise<Map<string, {title: string, summary: string}>>} 以文章链接为键的译文。
 */
async function translateSourceArticles(env, sourceId, articles) {
  const pendingArticles = articles.filter((article) => {
    return !containsChinese(article.title) || (article.summary && !containsChinese(article.summary));
  });
  const translations = new Map();

  for (let index = 0; index < pendingArticles.length; index += TRANSLATION_BATCH_SIZE) {
    const batch = pendingArticles.slice(index, index + TRANSLATION_BATCH_SIZE);
    const translatedEntries = await requestArticleTranslations(env, sourceId, batch);
    for (const [articleId, translation] of translatedEntries) {
      translations.set(articleId, translation);
    }
  }

  return translations;
}

/**
 * 将译文应用到文章，同时保留原始标题和摘要用于追溯。
 * @param {object} article 原始文章。
 * @param {{title?: string, summary?: string} | undefined} translation 译文。
 * @returns {object} 翻译后的文章。
 */
function applyArticleTranslation(article, translation) {
  const translatedTitle = cleanText(translation?.title || '');
  const translatedSummary = cleanText(translation?.summary || '');
  const title = containsChinese(article.title) ? article.title : translatedTitle || article.title;
  const summary = !article.summary || containsChinese(article.summary)
    ? article.summary
    : translatedSummary || article.summary;

  return {
    ...article,
    originalTitle: article.title,
    originalSummary: article.summary,
    title,
    summary,
    language: TARGET_LANGUAGE,
    translated: title !== article.title || summary !== article.summary
  };
}

/**
 * 翻译整份快照；AI 未配置或调用失败时明确回退到原文。
 * @param {object} env Pages Functions 环境绑定。
 * @param {object} snapshot 原始新闻快照。
 * @returns {Promise<object>} 可直接持久化和推送的快照。
 */
async function translateSnapshot(env, snapshot) {
  const isTranslationEnabled = !['0', 'false', 'off'].includes(
    String(env?.TRANSLATION_ENABLED ?? '1').trim().toLowerCase()
  );
  if (!isTranslationEnabled || !env?.LIBRETRANSLATE_API_KEY) {
    return snapshot;
  }

  const translationFailures = {};
  const translatedSources = await Promise.all(SOURCE_ORDER.map(async (sourceId) => {
    const source = snapshot.sources?.[sourceId];
    if (!source?.items?.length) {
      return [sourceId, source];
    }

    try {
      const translations = await translateSourceArticles(env, sourceId, source.items);
      const items = source.items.map((article) => {
        return applyArticleTranslation(article, translations.get(article.link));
      });
      return [sourceId, { ...source, items, headline: items[0] ?? null }];
    } catch (error) {
      console.error(`translation_failed ${sourceId}`, error);
      translationFailures[sourceId] = toErrorMessage(error);
      return [sourceId, source];
    }
  }));
  const sources = Object.fromEntries(translatedSources);
  const headlines = SOURCE_ORDER.map((sourceId) => sources[sourceId]?.headline).filter(Boolean);
  const articles = SOURCE_ORDER.flatMap((sourceId) => sources[sourceId]?.items ?? []).sort(sortArticles);

  return {
    ...snapshot,
    version: 2,
    headlines,
    articles,
    sources,
    translation: {
      enabled: true,
      targetLanguage: TARGET_LANGUAGE,
      provider: 'LibreTranslate',
      endpoint: cleanText(env.TRANSLATION_URL || DEFAULT_TRANSLATION_URL),
      translatedArticles: articles.filter((article) => article.translated).length,
      failedSources: translationFailures
    }
  };
}

async function getPayloadForRead(env, options = {}) {
  if (!options.refresh) {
    const snapshot = await loadSnapshotFromKv(env);
    if (snapshot) {
      return projectPayload(snapshot, {
        limit: options.limit ?? DEFAULT_LIMIT,
        sourceId: options.sourceId ?? null
      });
    }
  }

  const result = await refreshSnapshot(env, {
    reason: 'http',
    notify: false,
    forceNotify: false
  });

  return projectPayload(result.snapshot, {
    limit: options.limit ?? DEFAULT_LIMIT,
    sourceId: options.sourceId ?? null
  });
}

async function buildLiveSnapshot() {
  const generatedAt = new Date().toISOString();

  const sourceEntries = await Promise.all(SOURCE_ORDER.map(async (id) => {
    const source = SOURCES[id];
    try {
      const items = await source.load(SNAPSHOT_LIMIT);
      const normalizedItems = items
        .slice(0, SNAPSHOT_LIMIT)
        .map((item, index) => normalizeArticle(item, source, index, generatedAt));

      return [id, {
        id,
        name: source.name,
        upstream: source.upstream,
        ok: true,
        headline: normalizedItems[0] ?? null,
        count: normalizedItems.length,
        items: normalizedItems
      }];
    } catch (error) {
      return [id, {
        id,
        name: source.name,
        upstream: source.upstream,
        ok: false,
        headline: null,
        count: 0,
        items: [],
        error: toErrorMessage(error)
      }];
    }
  }));

  const sources = Object.fromEntries(sourceEntries);
  const headlines = SOURCE_ORDER
    .map((id) => sources[id]?.headline)
    .filter(Boolean);

  const articles = SOURCE_ORDER.flatMap((id) => sources[id]?.items ?? []).sort(sortArticles);

  return {
    ok: true,
    version: 1,
    generatedAt,
    snapshotLimit: SNAPSHOT_LIMIT,
    filters: {
      scope: 'china',
      source: 'all',
      limit: SNAPSHOT_LIMIT
    },
    headlines,
    total: articles.length,
    articles,
    sources
  };
}

function projectPayload(snapshot, { limit, sourceId }) {
  const selectedIds = sourceId ? [sourceId] : SOURCE_ORDER;
  const sources = Object.fromEntries(selectedIds.map((id) => {
    const base = snapshot.sources?.[id] ?? {
      id,
      name: SOURCES[id].name,
      upstream: SOURCES[id].upstream,
      ok: false,
      headline: null,
      count: 0,
      items: [],
      error: 'missing_in_snapshot'
    };

    const items = (base.items ?? []).slice(0, limit).map((item, index) => ({
      ...item,
      rank: index + 1
    }));

    return [id, {
      ...base,
      headline: items[0] ?? null,
      count: items.length,
      items
    }];
  }));

  const headlines = selectedIds
    .map((id) => sources[id]?.headline)
    .filter(Boolean);

  const articles = selectedIds.flatMap((id) => sources[id]?.items ?? []).sort(sortArticles);

  return {
    ok: true,
    version: snapshot.version ?? 1,
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    translation: snapshot.translation ?? { enabled: false },
    filters: {
      scope: 'china',
      source: sourceId ?? 'all',
      limit
    },
    headlines,
    total: articles.length,
    articles,
    sources
  };
}

function buildNewsBody(payload, refreshInfo = null) {
  return {
    ...payload,
    cache: {
      snapshotGeneratedAt: payload.generatedAt
    },
    ...(refreshInfo ? { refresh: refreshInfo } : {})
  };
}

function buildHeadlinesBody(payload, refreshInfo = null) {
  return {
    ok: true,
    generatedAt: payload.generatedAt,
    filters: payload.filters,
    headlines: payload.headlines,
    sources: Object.fromEntries(
      Object.entries(payload.sources).map(([id, source]) => [id, {
        id,
        name: source.name,
        headline: source.headline,
        ok: source.ok,
        error: source.error ?? null
      }])
    ),
    cache: {
      snapshotGeneratedAt: payload.generatedAt
    },
    ...(refreshInfo ? { refresh: refreshInfo } : {})
  };
}

async function persistSnapshotToKv(env, snapshot, options = {}, context = {}) {
  if (!hasKvBinding(env)) {
    return { attempted: false, skipped: true, reason: 'kv_not_configured' };
  }

  const headlineDigest = await computeHeadlinesDigest(snapshot.headlines);
  const snapshotDigest = await computeSnapshotDigest(snapshot);
  const diff = context.diff ?? buildSnapshotDiff(context.previousSnapshot, snapshot);
  const existingHistory = await readKvJson(env, KV_HISTORY_INDEX_KEY);
  const historyIndex = Array.isArray(existingHistory?.items) ? existingHistory.items : [];
  const previousEntry = historyIndex[0] ?? null;
  const meta = {
    storedAt: new Date().toISOString(),
    generatedAt: snapshot.generatedAt,
    reason: options.reason ?? 'unknown',
    cron: options.cron ?? null,
    headlineDigest,
    snapshotDigest,
    diff,
    summary: summarizeSnapshot(snapshot)
  };

  let historyPersisted = false;
  let historyEntry = null;
  let nextHistoryIndex = historyIndex;
  const cleanupDeletes = [];
  const writes = [
    env.NEWS_CACHE.put(KV_SNAPSHOT_KEY, JSON.stringify(snapshot), { expirationTtl: KV_SNAPSHOT_TTL }),
    env.NEWS_CACHE.put(KV_SNAPSHOT_META_KEY, JSON.stringify(meta), { expirationTtl: KV_SNAPSHOT_TTL })
  ];

  if (!previousEntry || previousEntry.snapshotDigest !== snapshotDigest) {
    const id = buildHistoryId(snapshot.generatedAt, snapshotDigest);
    const key = `${KV_HISTORY_ITEM_PREFIX}${id}`;
    historyEntry = {
      id,
      key,
      generatedAt: snapshot.generatedAt,
      storedAt: meta.storedAt,
      reason: meta.reason,
      cron: meta.cron,
      headlineDigest,
      snapshotDigest,
      diff,
      repeatCount: 1,
      summary: meta.summary
    };

    nextHistoryIndex = [historyEntry, ...historyIndex]
      .slice(0, MAX_HISTORY_ITEMS);
    historyPersisted = true;

    writes.push(
      env.NEWS_CACHE.put(key, JSON.stringify({
        id,
        key,
        snapshot,
        meta: historyEntry
      }), { expirationTtl: KV_SNAPSHOT_TTL })
    );

    const removed = historyIndex.slice(MAX_HISTORY_ITEMS - 1);
    if (removed.length && typeof env.NEWS_CACHE.delete === 'function') {
      for (const item of removed) {
        if (item?.key) {
          cleanupDeletes.push(env.NEWS_CACHE.delete(item.key));
        }
      }
    }
  } else {
    historyEntry = {
      ...previousEntry,
      storedAt: meta.storedAt,
      reason: meta.reason,
      cron: meta.cron,
      repeatCount: (previousEntry.repeatCount ?? 1) + 1,
      lastSeenAt: meta.storedAt,
      diff,
      summary: meta.summary
    };
    nextHistoryIndex = [historyEntry, ...historyIndex.slice(1)];
    writes.push(
      env.NEWS_CACHE.put(historyEntry.key, JSON.stringify({
        id: historyEntry.id,
        key: historyEntry.key,
        snapshot,
        meta: historyEntry
      }), { expirationTtl: KV_SNAPSHOT_TTL })
    );
  }

  writes.push(
    env.NEWS_CACHE.put(KV_HISTORY_INDEX_KEY, JSON.stringify({
      storedAt: meta.storedAt,
      items: nextHistoryIndex
    }), { expirationTtl: KV_SNAPSHOT_TTL })
  );

  await Promise.all(writes);
  if (cleanupDeletes.length) {
    const cleanupResults = await Promise.allSettled(cleanupDeletes);
    const failedDeletes = cleanupResults.filter((result) => result.status === 'rejected');
    if (failedDeletes.length) {
      console.warn(`history_cleanup_failed ${failedDeletes.length}/${cleanupDeletes.length}`);
    }
  }

  return {
    attempted: true,
    skipped: false,
    key: KV_SNAPSHOT_KEY,
    meta,
    history: {
      persisted: historyPersisted,
      id: historyEntry?.id ?? null,
      snapshotDigest,
      headlineDigest,
      totalItems: nextHistoryIndex.length
    }
  };
}

async function loadSnapshotFromKv(env) {
  if (!hasKvBinding(env)) {
    return null;
  }

  try {
    const snapshot = await readKvJson(env, KV_SNAPSHOT_KEY);
    return snapshot && typeof snapshot === 'object' ? snapshot : null;
  } catch {
    return null;
  }
}

async function loadHistoryIndex(env, limit = DEFAULT_HISTORY_LIMIT) {
  if (!hasKvBinding(env)) {
    return [];
  }

  const history = await readKvJson(env, KV_HISTORY_INDEX_KEY);
  const items = Array.isArray(history?.items) ? history.items : [];
  return items.slice(0, limit);
}

async function loadHistoryItem(env, id) {
  if (!hasKvBinding(env) || !id) {
    return null;
  }

  return readKvJson(env, `${KV_HISTORY_ITEM_PREFIX}${id}`);
}

async function buildRuntimeStatus(env) {
  const snapshotMeta = hasKvBinding(env) ? await readKvJson(env, KV_SNAPSHOT_META_KEY) : null;
  const telegramMeta = hasKvBinding(env) ? await readKvJson(env, KV_TELEGRAM_META_KEY) : null;
  const emailMeta = hasKvBinding(env) ? await readKvJson(env, KV_EMAIL_META_KEY) : null;
  const webhookMeta = hasKvBinding(env) ? await readKvJson(env, KV_WEBHOOK_META_KEY) : null;
  const history = hasKvBinding(env) ? await readKvJson(env, KV_HISTORY_INDEX_KEY) : null;

  return {
    kv: {
      enabled: hasKvBinding(env),
      binding: 'NEWS_CACHE',
      snapshotKey: KV_SNAPSHOT_KEY,
      snapshotMeta,
      historyCount: Array.isArray(history?.items) ? history.items.length : 0
    },
    telegram: {
      enabled: hasTelegramConfig(env),
      chatConfigured: Boolean(env?.TELEGRAM_CHAT_ID),
      threadConfigured: Boolean(env?.TELEGRAM_MESSAGE_THREAD_ID),
      sourceRoutingConfigured: Boolean(parseSourceRouting(env).length),
      lastPush: telegramMeta
    },
    email: {
      enabled: hasEmailConfig(env),
      provider: env?.RESEND_API_KEY ? 'resend' : null,
      lastPush: emailMeta
    },
    webhook: {
      enabled: hasWebhookConfig(env),
      targets: parseWebhookTargets(env).length,
      lastPush: webhookMeta
    },
    cron: {
      supported: false,
      recommended: DEFAULT_CRON,
      timezone: 'UTC',
      note: 'Pages Functions 无原生 scheduled，请用外部定时器请求 /api/refresh?notify=1'
    }
  };
}

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

async function computeHeadlinesDigest(headlines) {
  const content = headlines
    .map((item) => [item.sourceId, item.title, item.link].join('|'))
    .join('\n');

  const bytes = new TextEncoder().encode(content);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function computeSnapshotDigest(snapshot) {
  const content = SOURCE_ORDER.map((id) => {
    const items = snapshot.sources?.[id]?.items ?? [];
    return `${id}:${items.map((item) => [item.title, item.link, item.publishedAt].join('|')).join('||')}`;
  }).join('\n');

  const bytes = new TextEncoder().encode(content);
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function buildSnapshotDiff(previousSnapshot, currentSnapshot) {
  if (!previousSnapshot?.sources) {
    return {
      changedSources: [...SOURCE_ORDER],
      newSources: [...SOURCE_ORDER],
      removedSources: [],
      unchangedSources: [],
      changedCount: SOURCE_ORDER.length
    };
  }

  const changedSources = [];
  const newSources = [];
  const removedSources = [];
  const unchangedSources = [];

  for (const id of SOURCE_ORDER) {
    const previousHeadline = previousSnapshot.sources?.[id]?.headline ?? null;
    const currentHeadline = currentSnapshot.sources?.[id]?.headline ?? null;

    if (!previousHeadline && currentHeadline) {
      changedSources.push(id);
      newSources.push(id);
      continue;
    }

    if (previousHeadline && !currentHeadline) {
      changedSources.push(id);
      removedSources.push(id);
      continue;
    }

    if (!previousHeadline && !currentHeadline) {
      unchangedSources.push(id);
      continue;
    }

    if (
      previousHeadline.title !== currentHeadline.title ||
      previousHeadline.link !== currentHeadline.link ||
      previousHeadline.publishedAt !== currentHeadline.publishedAt
    ) {
      changedSources.push(id);
    } else {
      unchangedSources.push(id);
    }
  }

  return {
    changedSources,
    newSources,
    removedSources,
    unchangedSources,
    changedCount: changedSources.length
  };
}

function buildHistoryId(generatedAt, digest) {
  const ts = String(generatedAt || '')
    .replace(/\.\d+Z$/, 'Z')
    .replace(/[^\dTZ]/g, '');
  return `${ts || Date.now()}-${String(digest || '').slice(0, 12)}`;
}

async function buildHistoryCompareResult(env, fromId, toId) {
  const fromItem = await loadHistoryItem(env, fromId);
  const toItem = await loadHistoryItem(env, toId);

  if (!fromItem || !toItem) {
    return {
      ok: false,
      error: 'history_compare_not_found',
      fromFound: Boolean(fromItem),
      toFound: Boolean(toItem),
      fromId,
      toId
    };
  }

  return {
    ok: true,
    from: {
      id: fromItem.id,
      meta: fromItem.meta,
      generatedAt: fromItem.snapshot.generatedAt
    },
    to: {
      id: toItem.id,
      meta: toItem.meta,
      generatedAt: toItem.snapshot.generatedAt
    },
    diff: compareSnapshots(fromItem.snapshot, toItem.snapshot)
  };
}

function compareSnapshots(fromSnapshot, toSnapshot) {
  const perSource = SOURCE_ORDER.map((id) => {
    const fromHeadline = fromSnapshot.sources?.[id]?.headline ?? null;
    const toHeadline = toSnapshot.sources?.[id]?.headline ?? null;
    let status = 'unchanged';
    if (!fromHeadline && toHeadline) {
      status = 'new';
    } else if (fromHeadline && !toHeadline) {
      status = 'removed';
    } else if (!fromHeadline && !toHeadline) {
      status = 'none';
    } else if (
      fromHeadline.title !== toHeadline.title ||
      fromHeadline.link !== toHeadline.link ||
      fromHeadline.publishedAt !== toHeadline.publishedAt
    ) {
      status = 'changed';
    }

    return {
      sourceId: id,
      sourceName: toSnapshot.sources?.[id]?.name || fromSnapshot.sources?.[id]?.name || id,
      status,
      from: fromHeadline,
      to: toHeadline
    };
  });

  return {
    changedSources: perSource.filter((item) => item.status === 'changed').map((item) => item.sourceId),
    newSources: perSource.filter((item) => item.status === 'new').map((item) => item.sourceId),
    removedSources: perSource.filter((item) => item.status === 'removed').map((item) => item.sourceId),
    unchangedSources: perSource.filter((item) => item.status === 'unchanged').map((item) => item.sourceId),
    perSource
  };
}

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
    async function run() {
      const from = document.getElementById('fromId').value.trim();
      const to = document.getElementById('toId').value.trim();
      if (!from || !to) return;
      history.replaceState({}, '', '/history/compare?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
      const res = await fetch('/api/history/compare?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to));
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('summary').innerHTML = '<pre>' + esc(JSON.stringify(data, null, 2)) + '</pre>';
        document.getElementById('sources').innerHTML = '';
        return;
      }
      document.getElementById('summary').innerHTML = '<pre>' + esc(
        '旧快照：' + fmt(data.from.generatedAt) + '\\n' +
        '新快照：' + fmt(data.to.generatedAt) + '\\n' +
        '变更来源：' + data.diff.changedSources.join('、') + '\\n' +
        '新增来源：' + data.diff.newSources.join('、') + '\\n' +
        '移除来源：' + data.diff.removedSources.join('、')
      ) + '</pre>';
      document.getElementById('sources').innerHTML = data.diff.perSource.map((item) => {
        return '<div class="source">' +
          '<div class="status">' + esc(item.sourceName + ' / ' + item.status) + '</div>' +
          '<div><strong>旧：</strong> ' + (item.from ? '<a href="' + esc(item.from.link) + '" target="_blank" rel="noreferrer">' + esc(item.from.title) + '</a>' : '<span class="muted">无</span>') + '</div>' +
          '<div class="muted">' + esc(item.from?.summary || '') + '</div>' +
          '<hr style="border-color:#334155;border-style:solid none none;margin:12px 0">' +
          '<div><strong>新：</strong> ' + (item.to ? '<a href="' + esc(item.to.link) + '" target="_blank" rel="noreferrer">' + esc(item.to.title) + '</a>' : '<span class="muted">无</span>') + '</div>' +
          '<div class="muted">' + esc(item.to?.summary || '') + '</div>' +
        '</div>';
      }).join('');
    }
    document.getElementById('runBtn').addEventListener('click', run);
    if (document.getElementById('fromId').value && document.getElementById('toId').value) run();
  </script>
</body>
</html>`;
}

function renderRssBrandSvg(sourceId, kind = 'cover') {
  const normalizedSourceId = normalizeSource(sourceId) || null;
  const sourceName = normalizedSourceId ? (SOURCES[normalizedSourceId]?.name || normalizedSourceId) : '中国新闻聚合';
  const emoji = SOURCE_EMOJIS[normalizedSourceId || ''] || '🛰️';
  const isIcon = kind === 'icon';
  const width = isIcon ? 512 : 1440;
  const height = isIcon ? 512 : 720;
  const title = isIcon ? `${sourceName} RSS` : `${sourceName} RSS Feed`;
  const subtitle = isIcon ? APP_NAME : 'China News Worker';
  const largeFont = isIcon ? 190 : 96;
  const titleFont = isIcon ? 52 : 58;
  const subtitleFont = isIcon ? 26 : 28;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="55%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <radialGradient id="glow" cx="0.15" cy="0.15" r="0.9">
      <stop offset="0%" stop-color="#93c5fd" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#93c5fd" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${isIcon ? 96 : 48}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" rx="${isIcon ? 96 : 48}" fill="url(#glow)" />
  <circle cx="${isIcon ? 256 : 190}" cy="${isIcon ? 170 : 170}" r="${isIcon ? 120 : 118}" fill="rgba(255,255,255,0.14)" />
  <text x="${isIcon ? 256 : 190}" y="${isIcon ? 230 : 220}" text-anchor="middle" font-size="${largeFont}" dominant-baseline="middle">${emoji}</text>
  <text x="${isIcon ? 256 : 720}" y="${isIcon ? 348 : 380}" fill="#ffffff" font-size="${titleFont}" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="700" text-anchor="middle">${escapeXml(title)}</text>
  <text x="${isIcon ? 256 : 720}" y="${isIcon ? 404 : 438}" fill="rgba(255,255,255,0.85)" font-size="${subtitleFont}" font-family="Inter,Segoe UI,Arial,sans-serif" text-anchor="middle">${escapeXml(subtitle)}</text>
  ${isIcon ? '' : `<text x="720" y="520" fill="rgba(255,255,255,0.9)" font-size="34" font-family="Inter,Segoe UI,Arial,sans-serif" text-anchor="middle">${escapeXml(sourceName)}</text>`}
</svg>`;
}

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

async function fetchWsjChinaNews(limit) {
  const feeds = await Promise.all(
    SOURCES.wsj.upstream.map(async (url) => parseRssItems(await fetchText(url), SOURCES.wsj.name))
  );

  const items = dedupeArticles(
    feeds
      .flat()
      .filter((item) => matchesChinaTopic([item.title, item.summary, item.categories?.join(' ')].join(' ')))
      .sort(sortArticles)
  );

  return items.slice(0, limit);
}

async function fetchBbcChinaNews(limit) {
  const items = parseRssItems(await fetchText(SOURCES.bbc.upstream[0]), SOURCES.bbc.name);
  return dedupeArticles(items).slice(0, limit);
}

async function fetchNytChinaNews(limit) {
  const html = await fetchText(SOURCES.nytimes.upstream[0]);
  const anchors = extractAnchors(html, 'https://www.nytimes.com');
  const items = dedupeArticles(
    anchors
      .filter(({ href, text }) => /^https:\/\/www\.nytimes\.com\/(?:interactive\/)?\d{4}\/\d{2}\/\d{2}\/.+/.test(href))
      .filter(({ text }) => isUsefulHeadline(text) && !/leer en espa[ñn]ol/i.test(text))
      .map(({ href, text }) => ({
        title: cleanSourceTitle('nytimes', text),
        link: href,
        summary: '',
        publishedAt: extractDateFromUrl(href)
      }))
  );

  return items.slice(0, limit);
}

async function fetchCnnChinaNews(limit) {
  const html = await fetchText(SOURCES.cnn.upstream[0]);
  const anchors = extractAnchors(html, 'https://edition.cnn.com');
  const candidates = dedupeCandidates(
    anchors
      .filter(({ href }) => /^https:\/\/edition\.cnn\.com\/\d{4}\/\d{2}\/\d{2}\//.test(href))
      .filter(({ href }) => !/\/video\//i.test(href))
      .map(({ href, text }) => ({ href, text }))
  );

  return enrichCandidatesWithMeta('cnn', candidates, limit, {
    titleFallback: ({ href, text }) => cleanSourceTitle('cnn', text || slugToTitle(href)),
    maxCandidates: Math.max(limit * 3, limit + 2)
  });
}

async function fetchScmpChinaNews(limit) {
  const html = await fetchText(SOURCES.scmp.upstream[0]);
  const anchors = extractAnchors(html, 'https://www.scmp.com');
  const candidates = dedupeCandidates(
    anchors
      .filter(({ href }) => /^https:\/\/www\.scmp\.com\/news\/china\//.test(href))
      .filter(({ href }) => !/#comments$/i.test(href))
      .map(({ href, text }) => ({ href, text }))
  );

  return enrichCandidatesWithMeta('scmp', candidates, limit, {
    titleFallback: ({ href, text }) => cleanSourceTitle('scmp', firstSentence(text) || slugToTitle(href)),
    summaryFallback: ({ text }) => removeLeadingTitleFromSummary(text),
    maxCandidates: Math.max(limit * 2, limit + 2)
  });
}

async function fetchZaobaoChinaNews(limit) {
  const html = await fetchText(SOURCES.zaobao.upstream[0]);
  const anchors = extractAnchors(html, 'https://www.zaobao.com');
  const items = dedupeArticles(
    anchors
      .filter(({ href }) => /^https:\/\/www\.zaobao\.com\/(?:news|realtime)\/china\//.test(href))
      .filter(({ text }) => isUsefulHeadline(text))
      .map(({ href, text }) => ({
        title: cleanSourceTitle('zaobao', text),
        link: href,
        summary: '',
        publishedAt: extractDateFromUrl(href)
      }))
  );

  return items.slice(0, limit);
}

async function enrichCandidatesWithMeta(sourceId, candidates, limit, options = {}) {
  const maxCandidates = Math.min(candidates.length, options.maxCandidates ?? Math.max(limit * 2, limit));
  const selected = candidates.slice(0, maxCandidates);
  const items = [];

  for (const candidate of selected) {
    if (items.length >= limit) {
      break;
    }

    try {
      const meta = await fetchArticleMeta(candidate.href, sourceId);
      const title = cleanSourceTitle(sourceId, meta.title || options.titleFallback?.(candidate) || candidate.text || slugToTitle(candidate.href));
      if (!isUsefulHeadline(title) || looksLikeImageCredit(title)) {
        continue;
      }

      const summary = cleanText(meta.summary || options.summaryFallback?.(candidate) || '');
      items.push({
        title,
        link: candidate.href,
        summary,
        publishedAt: meta.publishedAt || extractDateFromUrl(candidate.href)
      });
    } catch {
      const fallbackTitle = cleanSourceTitle(sourceId, options.titleFallback?.(candidate) || candidate.text || slugToTitle(candidate.href));
      if (!isUsefulHeadline(fallbackTitle) || looksLikeImageCredit(fallbackTitle)) {
        continue;
      }

      items.push({
        title: fallbackTitle,
        link: candidate.href,
        summary: cleanText(options.summaryFallback?.(candidate) || ''),
        publishedAt: extractDateFromUrl(candidate.href)
      });
    }
  }

  return dedupeArticles(items).slice(0, limit);
}

async function fetchArticleMeta(url, sourceId) {
  const html = await fetchText(url);
  const title =
    extractMetaContent(html, 'property', 'og:title') ||
    extractMetaContent(html, 'name', 'twitter:title') ||
    extractMetaContent(html, 'name', 'title') ||
    extractTitleTag(html);

  const summary =
    extractMetaContent(html, 'property', 'og:description') ||
    extractMetaContent(html, 'name', 'description') ||
    extractMetaContent(html, 'name', 'twitter:description') ||
    '';

  const publishedAt =
    extractMetaContent(html, 'property', 'article:published_time') ||
    extractMetaContent(html, 'name', 'article:published_time') ||
    extractMetaContent(html, 'property', 'og:article:published_time') ||
    extractJsonLdValue(html, 'datePublished') ||
    '';

  return {
    title: cleanSourceTitle(sourceId, title),
    summary,
    publishedAt
  };
}

function parseRssItems(xml, sourceName) {
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  return blocks.map((block) => {
    const categories = [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map((match) => cleanText(match[1]));
    return {
      title: cleanText(extractXmlTag(block, 'title')),
      link: cleanText(extractXmlTag(block, 'link')),
      summary: cleanText(extractXmlTag(block, 'description')),
      publishedAt: cleanDate(extractXmlTag(block, 'pubDate') || extractXmlTag(block, 'dc:date') || extractXmlTag(block, 'published')),
      categories,
      sourceName
    };
  }).filter((item) => item.title && item.link);
}

function extractAnchors(html, baseUrl) {
  const anchors = [];
  const regex = /<a\b[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const rawHref = match[1] || match[2] || '';
    const href = absolutizeUrl(rawHref, baseUrl);
    if (!href || !/^https?:\/\//i.test(href)) {
      continue;
    }

    const text = cleanText(match[3]);
    anchors.push({ href, text });
  }

  return anchors;
}

async function fetchText(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: DEFAULT_HEADERS,
        redirect: 'follow',
        cf: {
          cacheEverything: true,
          cacheTtl: FETCH_CACHE_TTL
        }
      });

      if (!response.ok) {
        throw new Error(`upstream_fetch_failed ${response.status} ${response.statusText} ${url}`);
      }

      const buffer = await response.arrayBuffer();
      return new TextDecoder('utf-8').decode(buffer);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? new Error(`${lastError.message} ${url}`)
    : new Error(`upstream_fetch_failed ${url}`);
}

function normalizeArticle(item, source, rank, fetchedAt = new Date().toISOString()) {
  return {
    sourceId: source.id,
    sourceName: source.name,
    rank: rank + 1,
    title: cleanSourceTitle(source.id, item.title),
    link: normalizeLink(item.link),
    summary: cleanText(item.summary || ''),
    publishedAt: cleanDate(item.publishedAt || ''),
    fetchedAt
  };
}

function normalizeSource(sourceId) {
  if (!sourceId) {
    return null;
  }
  const value = String(sourceId).trim().toLowerCase();
  return SOURCES[value] ? value : null;
}

function parseFixedRssSource(pathname) {
  const match = String(pathname || '').match(/^\/rss\/([a-z0-9_-]+)(?:\.xml)?$/i);
  if (!match) {
    return null;
  }

  const raw = String(match[1] || '').trim().toLowerCase();
  if (!raw || raw === 'all') {
    return '';
  }

  return normalizeSource(raw);
}

function dedupeArticles(items) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const link = normalizeLink(item.link);
    const title = cleanText(item.title || '');
    const key = `${link}::${title}`;
    if (!link || !title || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push({
      ...item,
      link,
      title
    });
  }
  return results;
}

function dedupeCandidates(items) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const href = normalizeLink(item.href);
    if (!href || seen.has(href)) {
      continue;
    }
    seen.add(href);
    results.push({ href, text: cleanText(item.text || '') });
  }
  return results;
}

function matchesChinaTopic(text) {
  const haystack = cleanText(text).toLowerCase();
  return CHINA_RELATED_KEYWORDS.some((pattern) => pattern.test(haystack));
}

function isUsefulHeadline(text) {
  const value = cleanText(text);
  if (!value || value.length < 8) {
    return false;
  }
  if (/^(read more|comments?|share|video|watch)$/i.test(value)) {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return false;
  }
  return /[\p{L}\p{Script=Han}]/u.test(value);
}

function looksLikeImageCredit(text) {
  const value = cleanText(text);
  if (!value) {
    return false;
  }
  return /(?:getty images|reuters|ap(?:\/file)?|shutterstock|bloomberg|afp|sopa images|lightrocket|planet labs|courtesy)/i.test(value) && value.length < 90;
}

function extractXmlTag(xml, tagName) {
  const escaped = escapeRegExp(tagName);
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'i'));
  return match ? match[1] : '';
}

function extractMetaContent(html, attrName, attrValue) {
  const escapedAttrName = escapeRegExp(attrName);
  const escapedAttrValue = escapeRegExp(attrValue);
  const patterns = [
    new RegExp(`<meta[^>]*${escapedAttrName}=["']${escapedAttrValue}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${escapedAttrName}=["']${escapedAttrValue}["'][^>]*>`, 'i')
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return cleanText(match[1]);
    }
  }

  return '';
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(match[1]) : '';
}

function extractJsonLdValue(html, key) {
  const pattern = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"([^"]+)"`, 'i');
  const match = html.match(pattern);
  return match?.[1] ? cleanText(match[1]) : '';
}

function cleanSourceTitle(sourceId, title) {
  let value = cleanText(title);
  if (!value) {
    return '';
  }

  const rules = [
    [/\s*\|\s*CNN.*$/i, ''],
    [/\s*-\s*The New York Times.*$/i, ''],
    [/\s*\|\s*联合早报网.*$/i, ''],
    [/\s*\|\s*South China Morning Post.*$/i, ''],
    [/\s*\|\s*BBC News.*$/i, ''],
    [/\s*\|\s*WSJ.*$/i, '']
  ];

  for (const [pattern, replacement] of rules) {
    value = value.replace(pattern, replacement).trim();
  }

  if (sourceId === 'scmp') {
    value = firstSentence(value) || value;
  }

  return value;
}

function firstSentence(text) {
  const value = cleanText(text);
  if (!value) {
    return '';
  }
  const parts = value.split(/(?<=[.!?。！？])\s+/);
  return cleanText(parts[0] || value);
}

function removeLeadingTitleFromSummary(text) {
  const value = cleanText(text);
  const sentence = firstSentence(value);
  if (sentence && value.startsWith(sentence) && value.length > sentence.length) {
    return cleanText(value.slice(sentence.length));
  }
  return '';
}

function slugToTitle(url) {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.split('/').filter(Boolean).pop() || '';
    return cleanText(slug.replace(/[-_]+/g, ' ').replace(/\.(html?)$/i, ''));
  } catch {
    return cleanText(url);
  }
}

function extractDateFromUrl(url) {
  const match = url.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
  if (!match) {
    const alt = url.match(/story(\d{4})(\d{2})(\d{2})-/);
    if (!alt) {
      return '';
    }
    return `${alt[1]}-${alt[2]}-${alt[3]}T00:00:00.000Z`;
  }
  return `${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`;
}

function cleanDate(value) {
  if (!value) {
    return '';
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? cleanText(value) : new Date(parsed).toISOString();
}

function normalizeLink(link) {
  try {
    const url = new URL(link);
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

function absolutizeUrl(rawHref, baseUrl) {
  if (!rawHref || /^javascript:/i.test(rawHref) || /^mailto:/i.test(rawHref)) {
    return '';
  }

  try {
    return new URL(rawHref, baseUrl).toString();
  } catch {
    return '';
  }
}

function cleanText(input) {
  return decodeHtmlEntities(
    String(input ?? '')
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function truncateText(input, maxLength = 120) {
  const value = cleanText(input);
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    rsquo: '’',
    lsquo: '‘',
    ldquo: '“',
    rdquo: '”',
    ndash: '–',
    mdash: '—',
    hellip: '…'
  };

  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity) => {
    const key = String(entity);
    if (key.startsWith('#x') || key.startsWith('#X')) {
      const codePoint = parseInt(key.slice(2), 16);
      return Number.isNaN(codePoint) ? full : String.fromCodePoint(codePoint);
    }
    if (key.startsWith('#')) {
      const codePoint = parseInt(key.slice(1), 10);
      return Number.isNaN(codePoint) ? full : String.fromCodePoint(codePoint);
    }
    return named[key] ?? full;
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value).replace(/'/g, '&apos;');
}

function formatInTimeZone(value, timeZone) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return String(value ?? '');
  }
}

function toRfc2822(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortArticles(a, b) {
  const aTime = Date.parse(a.publishedAt || '') || 0;
  const bTime = Date.parse(b.publishedAt || '') || 0;
  if (aTime !== bTime) {
    return bTime - aTime;
  }
  return a.title.localeCompare(b.title, 'en');
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

function buildCacheKey(url, pathname, limit, sourceId, refresh, forceNotify) {
  const cacheUrl = new URL(url.origin + pathname);
  cacheUrl.searchParams.set('limit', String(limit));
  if (sourceId) {
    cacheUrl.searchParams.set('source', sourceId);
  }
  if (refresh) {
    cacheUrl.searchParams.set('refresh', '1');
  }
  if (forceNotify) {
    cacheUrl.searchParams.set('force_notify', '1');
  }
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

function noStoreHeaders(extraHeaders = {}) {
  return {
    'Cache-Control': 'no-store',
    ...extraHeaders
  };
}

function settledNotification(result) {
  if (result?.status === 'fulfilled') {
    return result.value;
  }
  return {
    attempted: true,
    skipped: false,
    reason: 'error',
    error: toErrorMessage(result?.reason)
  };
}

function htmlResponse(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function rssResponse(xml, status = 200, extraHeaders = {}) {
  return new Response(xml, {
    status,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${RESPONSE_CACHE_TTL}, s-maxage=${RESPONSE_CACHE_TTL}`,
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function svgResponse(svg, status = 200, extraHeaders = {}) {
  return new Response(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

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

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
