async function refreshSnapshot(env, options = {}) {
  const previousSnapshot = await loadSnapshotFromKv(env);
  const snapshot = await buildLiveSnapshot();
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


export { refreshSnapshot, getPayloadForRead, buildLiveSnapshot, projectPayload };
