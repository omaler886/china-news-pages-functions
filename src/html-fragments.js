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


export { buildNewsBody, buildHeadlinesBody };
