export const APP_NAME = 'china-news-pages-functions';
export const COMPAT_DATE = '2026-04-15';
export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 10;
export const SNAPSHOT_LIMIT = MAX_LIMIT;
export const RESPONSE_CACHE_TTL = 10 * 60;
export const FETCH_CACHE_TTL = 5 * 60;
export const KV_SNAPSHOT_TTL = 7 * 24 * 60 * 60;
export const KV_SNAPSHOT_KEY = 'china-news:snapshot:v1';
export const KV_SNAPSHOT_META_KEY = 'china-news:snapshot-meta:v1';
export const KV_HISTORY_INDEX_KEY = 'china-news:history:index:v1';
export const KV_HISTORY_ITEM_PREFIX = 'china-news:history:item:v1:';
export const KV_TELEGRAM_DIGEST_KEY = 'china-news:telegram:last-digest:v1';
export const KV_TELEGRAM_META_KEY = 'china-news:telegram:last-meta:v1';
export const KV_EMAIL_DIGEST_KEY = 'china-news:email:last-digest:v1';
export const KV_EMAIL_META_KEY = 'china-news:email:last-meta:v1';
export const KV_WEBHOOK_DIGEST_KEY = 'china-news:webhook:last-digest:v1';
export const KV_WEBHOOK_META_KEY = 'china-news:webhook:last-meta:v1';
export const MAX_HISTORY_ITEMS = 120;
export const DEFAULT_HISTORY_LIMIT = 30;
export const DEFAULT_CRON = '*/30 * * * *';
export const DEFAULT_TIMEZONE = 'Asia/Shanghai';
export const RSS_COPYRIGHT = '© China News Pages Functions. Article metadata belongs to original publishers.';

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; china-news-pages-functions/1.0; +https://pages.cloudflare.com/)',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

export const CHINA_RELATED_KEYWORDS = [
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

export const SOURCE_ORDER = ['wsj', 'nytimes', 'bbc', 'cnn', 'scmp', 'zaobao'];
export const SOURCE_EMOJIS = {
  wsj: '💼',
  nytimes: '🗽',
  bbc: '🇬🇧',
  cnn: '📺',
  scmp: '🌏',
  zaobao: '📰'
};

