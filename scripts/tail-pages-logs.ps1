param(
  [string]$ProjectName = 'china-news-pages-functions',
  [ValidateSet('production','preview')]
  [string]$Environment = 'production',
  [string]$DeploymentId,
  [string]$Search,
  [ValidateSet('pretty','json')]
  [string]$Format = 'pretty'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$resolvedDeploymentId = $DeploymentId
if ([string]::IsNullOrWhiteSpace($resolvedDeploymentId)) {
  $deploymentsJson = npx wrangler pages deployment list --project-name $ProjectName --environment $Environment --json
  $deployments = $deploymentsJson | ConvertFrom-Json
  if (-not $deployments -or $deployments.Count -eq 0) {
    throw "No deployments found for project '$ProjectName' in environment '$Environment'."
  }
  $resolvedDeploymentId = $deployments[0].id
}

$cmd = @('wrangler','pages','deployment','tail',$resolvedDeploymentId,'--project-name',$ProjectName,'--format',$Format)
if ($Search) {
  $cmd += @('--search',$Search)
}

Write-Host "Tailing Pages logs for $ProjectName ($Environment) deployment $resolvedDeploymentId..." -ForegroundColor Cyan
& npx @cmd
