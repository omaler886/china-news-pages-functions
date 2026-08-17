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


export { buildRuntimeStatus };
