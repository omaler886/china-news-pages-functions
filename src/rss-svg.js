function renderRssBrandSvg(sourceId, kind = 'cover') {
  const normalizedSourceId = normalizeSource(sourceId) || null;
  const sourceName = normalizedSourceId ? (SOURCES[normalizedSourceId]?.name || normalizedSourceId) : '中国新闻聚合';
  const emoji = SOURCE_EMOJIS[normalizedSourceId || ''] || '🛰️';
  const isIcon = kind === 'icon';
  const width = isIcon ? 512 : 1440;
  const height = isIcon ? 512 : 720;
  const title = isIcon ? `${sourceName} RSS` : `${sourceName} RSS Feed`;
  const subtitle = isIcon ? APP_NAME : 'China News Worker';
  const largeFont = isIcon ? 190 : 96;
  const titleFont = isIcon ? 52 : 58;
  const subtitleFont = isIcon ? 26 : 28;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="55%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
    <radialGradient id="glow" cx="0.15" cy="0.15" r="0.9">
      <stop offset="0%" stop-color="#93c5fd" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#93c5fd" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${isIcon ? 96 : 48}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" rx="${isIcon ? 96 : 48}" fill="url(#glow)" />
  <circle cx="${isIcon ? 256 : 190}" cy="${isIcon ? 170 : 170}" r="${isIcon ? 120 : 118}" fill="rgba(255,255,255,0.14)" />
  <text x="${isIcon ? 256 : 190}" y="${isIcon ? 230 : 220}" text-anchor="middle" font-size="${largeFont}" dominant-baseline="middle">${emoji}</text>
  <text x="${isIcon ? 256 : 720}" y="${isIcon ? 348 : 380}" fill="#ffffff" font-size="${titleFont}" font-family="Inter,Segoe UI,Arial,sans-serif" font-weight="700" text-anchor="middle">${escapeXml(title)}</text>
  <text x="${isIcon ? 256 : 720}" y="${isIcon ? 404 : 438}" fill="rgba(255,255,255,0.85)" font-size="${subtitleFont}" font-family="Inter,Segoe UI,Arial,sans-serif" text-anchor="middle">${escapeXml(subtitle)}</text>
  ${isIcon ? '' : `<text x="720" y="520" fill="rgba(255,255,255,0.9)" font-size="34" font-family="Inter,Segoe UI,Arial,sans-serif" text-anchor="middle">${escapeXml(sourceName)}</text>`}
</svg>`;
}


export { renderRssBrandSvg };
