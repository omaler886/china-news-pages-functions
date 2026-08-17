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


export { fetchWsjChinaNews, fetchBbcChinaNews, fetchNytChinaNews, fetchCnnChinaNews, fetchScmpChinaNews, fetchZaobaoChinaNews, enrichCandidatesWithMeta, fetchArticleMeta };
