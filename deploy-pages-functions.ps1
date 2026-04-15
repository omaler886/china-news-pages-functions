param(
  [string]$ProjectName = 'china-news-pages-functions'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot
Write-Host "Deploying Pages Functions project: $ProjectName" -ForegroundColor Cyan
npx wrangler pages deploy public --project-name $ProjectName
