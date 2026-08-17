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


export { computeHeadlinesDigest, computeSnapshotDigest, buildSnapshotDiff, buildHistoryId, buildHistoryCompareResult, compareSnapshots };
