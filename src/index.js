import {
  APP_NAME, COMPAT_DATE, DEFAULT_LIMIT, MAX_LIMIT, SNAPSHOT_LIMIT,
  RESPONSE_CACHE_TTL, FETCH_CACHE_TTL, KV_SNAPSHOT_TTL,
  KV_SNAPSHOT_KEY, KV_SNAPSHOT_META_KEY, KV_HISTORY_INDEX_KEY,
  KV_HISTORY_ITEM_PREFIX, KV_TELEGRAM_DIGEST_KEY, KV_TELEGRAM_META_KEY,
  KV_EMAIL_DIGEST_KEY, KV_EMAIL_META_KEY, KV_WEBHOOK_DIGEST_KEY,
  KV_WEBHOOK_META_KEY, MAX_HISTORY_ITEMS, DEFAULT_HISTORY_LIMIT,
  DEFAULT_CRON, DEFAULT_TIMEZONE, RSS_COPYRIGHT,
  DEFAULT_HEADERS, CHINA_RELATED_KEYWORDS, SOURCE_ORDER,
  SOURCE_EMOJIS
} from './constants.js';

export { SOURCES } from './sources.js';

import { SOURCES } from './sources.js';

import {
  refreshSnapshot, getPayloadForRead, buildLiveSnapshot, projectPayload
} from './snapshot.js';

import {
  buildNewsBody, buildHeadlinesBody
} from './html-fragments.js';

import {
  persistSnapshotToKv, loadSnapshotFromKv, loadHistoryIndex, loadHistoryItem
} from './kv.js';

import { buildRuntimeStatus } from './status.js';

import {
  dispatchNotifications, maybeSendTelegram, sendTelegramSourceRoutes,
  buildTelegramMessage, buildTelegramSourceMessage, sendTelegramMessage,
  maybeSendEmail, maybeSendWebhook
} from './notifications.js';

import {
  computeHeadlinesDigest, computeSnapshotDigest, buildSnapshotDiff,
  buildHistoryId, buildHistoryCompareResult, compareSnapshots
} from './digest.js';

import { buildEmailHtml, buildEmailText } from './history.js';

import { buildRssXml, renderComparePageHtml } from './rss.js';

import { renderRssBrandSvg } from './rss-svg.js';

import {
  computeHmacSha256, summarizeSnapshot, hasKvBinding, hasTelegramConfig,
  hasEmailConfig, hasWebhookConfig, readKvJson, parseSourceRouting,
  normalizeSourceRoute, parseWebhookTargets, parseJsonObject, parseEmailList
} from './env-helpers.js';

import {
  fetchWsjChinaNews, fetchBbcChinaNews, fetchNytChinaNews,
  fetchCnnChinaNews, fetchScmpChinaNews, fetchZaobaoChinaNews,
  enrichCandidatesWithMeta, fetchArticleMeta
} from './fetchers.js';

import {
  parseRssItems, extractAnchors, fetchText, normalizeArticle,
  normalizeSource, parseFixedRssSource, dedupeArticles, dedupeCandidates,
  matchesChinaTopic, isUsefulHeadline, looksLikeImageCredit,
  extractXmlTag, extractMetaContent, extractTitleTag, extractJsonLdValue,
  cleanSourceTitle, firstSentence, removeLeadingTitleFromSummary,
  slugToTitle, extractDateFromUrl, cleanDate, normalizeLink,
  absolutizeUrl, cleanText, truncateText, decodeHtmlEntities,
  escapeHtml, escapeXml, formatInTimeZone, toRfc2822, escapeRegExp,
  sortArticles, clampInt, isTruthy, buildCacheKey
} from './parsers.js';

import {
  jsonResponse, corsHeaders, noStoreHeaders, settledNotification,
  htmlResponse, rssResponse, svgResponse, renderDashboardHtml
} from './http-utils.js';



import { withCors, toErrorMessage } from './dashboard-js.js';

export { router } from './router.js';
export default (await import('./router.js')).router;

