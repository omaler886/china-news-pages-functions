param(
  [string]$ProjectName = 'china-news-pages-functions',
  [ValidateSet('production','preview')]
  [string]$Environment = 'production',
  [string]$Search,
  [ValidateSet('pretty','json')]
  [string]$Format = 'pretty'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$cmd = @('wrangler','pages','deployment','tail','--project-name',$ProjectName,'--environment',$Environment,'--format',$Format)
if ($Search) {
  $cmd += @('--search',$Search)
}

Write-Host "Tailing Pages logs for $ProjectName ($Environment)..." -ForegroundColor Cyan
& npx @cmd
