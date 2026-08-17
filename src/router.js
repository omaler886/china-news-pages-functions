const router = {
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


export { router };
