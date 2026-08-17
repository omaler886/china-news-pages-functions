# Refactoring Plan: Modularize _worker.js

## Current State

`public/_worker.js` is a single 2648-line file. The `src/` directory contains
the intended modular split, but template literal boundaries need to be resolved
before esbuild bundling can replace the single file.

## Intended Module Structure

| Module | Responsibility |
|--------|---------------|
| constants.js | All const declarations (app name, KV keys, TTLs) |
| sources.js | SOURCES config object with per-source fetch/parsing rules |
| router.js | export default with fetch handler and route dispatch |
| snapshot.js | refreshSnapshot, getPayloadForRead, buildLiveSnapshot, projectPayload |
| html-fragments.js | buildNewsBody, buildHeadlinesBody |
| kv.js | persistSnapshotToKv, loadSnapshotFromKv, loadHistoryIndex, loadHistoryItem |
| status.js | buildRuntimeStatus |
| notifications.js | Telegram/email/webhook dispatch |
| digest.js | Digest computation, snapshot diff, history comparison |
| history.js | buildEmailHtml, buildEmailText |
| rss.js | buildRssXml, renderComparePageHtml |
| rss-svg.js | renderRssBrandSvg |
| env-helpers.js | Env config detection, KV JSON read, source routing parse |
| fetchers.js | Per-source news fetchers (WSJ, BBC, NYT, CNN, SCMP, Zaobao) |
| parsers.js | RSS parsing, article normalization, text utilities |
| http-utils.js | renderDashboardHtml (large HTML template) |
| dashboard-js.js | withCors, toErrorMessage |

## Next Steps

1. Fix template literal boundaries in rss.js (renderComparePageHtml has a multi-line template)
2. Move fmtTime/esc/fetchJSON etc out of renderDashboardHtml template literal into a real module
3. Switch build.mjs to esbuild bundling
4. Verify bundled output matches original behavior
