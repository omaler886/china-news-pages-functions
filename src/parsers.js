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


export { parseRssItems, extractAnchors, fetchText, normalizeArticle, normalizeSource, parseFixedRssSource, dedupeArticles, dedupeCandidates, matchesChinaTopic, isUsefulHeadline, looksLikeImageCredit, extractXmlTag, extractMetaContent, extractTitleTag, extractJsonLdValue, cleanSourceTitle, firstSentence, removeLeadingTitleFromSummary, slugToTitle, extractDateFromUrl, cleanDate, normalizeLink, absolutizeUrl, cleanText, truncateText, decodeHtmlEntities, escapeHtml, escapeXml, formatInTimeZone, toRfc2822, escapeRegExp, sortArticles, clampInt, isTruthy, buildCacheKey, jsonResponse, corsHeaders, noStoreHeaders, settledNotification, htmlResponse, rssResponse, svgResponse };
