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
          writes.push(env.NEWS_CACHE.delete(item.key));
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


export { persistSnapshotToKv, loadSnapshotFromKv, loadHistoryIndex, loadHistoryItem };
