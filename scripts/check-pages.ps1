param(
  [string]$BaseUrl = 'https://china-news-pages-functions.pages.dev'
)

$ErrorActionPreference = 'Stop'
$urls = @(
  "$BaseUrl/api/status",
  "$BaseUrl/api/news?limit=3",
  "$BaseUrl/rss/all.xml",
  "$BaseUrl/dashboard",
  "$BaseUrl/history/compare"
)

foreach ($url in $urls) {
  Write-Host "Checking $url" -ForegroundColor Cyan
  $resp = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 60
  Write-Host ("OK {0} {1}" -f [int]$resp.StatusCode, $url) -ForegroundColor Green
}
