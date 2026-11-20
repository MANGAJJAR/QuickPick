<#
.SYNOPSIS
  Builds the customer app and the store dashboard and deploys both to Firebase Hosting.

.DESCRIPTION
  -Mode mock : demo data in the browser. No backend, no Firebase login needed by visitors. Safest first deploy.
  -Mode real : the apps talk to the real backend through /api (Firebase Hosting forwards it to Cloud Run).
               Needs the backend deployed first (deploy\backend.ps1) and the Firebase web app keys.

  Run it from the repository root, for example:
    .\deploy\hosting.ps1 -ProjectId my-quickpick -Mode mock
    .\deploy\hosting.ps1 -ProjectId my-quickpick -Mode real -ApiKey AIza... -AppId 1:123:web:abc

  Add -BuildOnly to build and check the output without deploying (no login needed).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [ValidateSet('mock', 'real')][string]$Mode = 'mock',
  [string]$CustomerSite = '',      # defaults to the project's main site:  <ProjectId>.web.app
  [string]$DashboardSite = '',     # defaults to <ProjectId>-store.web.app (created for you)
  [string]$ApiKey = '',            # Firebase console > Project settings > Your apps > Web app
  [string]$AppId = '',
  [string]$AuthDomain = '',        # defaults to <ProjectId>.firebaseapp.com
  [string]$MessagingSenderId = '', # optional (background push)
  [string]$VapidKey = '',          # optional (background push)
  [switch]$BuildOnly
)

# Native commands (npm, firebase) write progress to stderr; we check their exit codes ourselves instead of letting PowerShell abort.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $CustomerSite) { $CustomerSite = $ProjectId }
if (-not $DashboardSite) { $DashboardSite = "$ProjectId-store" }
if (-not $AuthDomain) { $AuthDomain = "$ProjectId.firebaseapp.com" }

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE). Read the message above it." } }

if ($Mode -eq 'real' -and (-not $ApiKey -or -not $AppId)) {
  throw "Real mode needs -ApiKey and -AppId (Firebase console > Project settings > Your apps > Web app > SDK setup and configuration)."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is not installed. Install the LTS version from https://nodejs.org and run this again." }

# Values baked into the build. A shell variable beats the .env files. Anything left unset comes from each app's
# .env.production, which is deliberately blank for the emulator URL and dev keys (setting a variable to an empty
# string in PowerShell would DELETE it and let the dev value from .env leak in, so we never do that).
$env:VITE_USE_MOCKS = if ($Mode -eq 'mock') { 'true' } else { 'false' }
$env:VITE_API_BASE_URL = '/api/v1'                 # same address as the app: Hosting forwards /api to Cloud Run
$env:VITE_FIREBASE_PROJECT_ID = $ProjectId
$env:VITE_FIREBASE_AUTH_DOMAIN = $AuthDomain
if ($ApiKey) { $env:VITE_FIREBASE_API_KEY = $ApiKey }
if ($AppId) { $env:VITE_FIREBASE_APP_ID = $AppId }
if ($MessagingSenderId) { $env:VITE_FIREBASE_MESSAGING_SENDER_ID = $MessagingSenderId }
if ($VapidKey) { $env:VITE_FIREBASE_VAPID_KEY = $VapidKey }

foreach ($app in @('customer-app', 'store-dashboard')) {
  Step "Building $app ($Mode mode)"
  Push-Location "frontend\$app"
  try {
    if (-not (Test-Path 'node_modules')) { npm ci; Check 'npm ci' }
    npm run build
    Check "Build of $app"
  } finally { Pop-Location }
}

$photos = (Get-ChildItem 'frontend\customer-app\dist\products' -Filter *.webp -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Product photos in the customer build: $photos (expected 93)"
if ($photos -lt 93) { Write-Warning "Some product photos are missing from frontend\customer-app\public\products." }

# Safety net: a live site must never be built with your local development settings.
foreach ($app in @('customer-app', 'store-dashboard')) {
  $bundle = (Get-ChildItem "frontend\$app\distssets\*.js" | ForEach-Object { Get-Content $_.FullName -Raw }) -join ''
  if ($bundle -match 'VITE_FIREBASE_AUTH_EMULATOR_URL:`http') { throw "The $app build still points at the local Firebase emulator. Check frontend\$app\.env.production." }
  if ($Mode -eq 'real' -and $bundle -match 'VITE_USE_MOCKS:`true') { throw "The $app build is in mock mode but you asked for real mode." }
}

if ($BuildOnly) { Step "Build finished. Nothing was deployed (-BuildOnly)."; return }

$config = if ($Mode -eq 'mock') { 'firebase.mock.json' } else { 'firebase.json' }
$firebase = @('--yes', 'firebase-tools')

Step "Checking your Firebase login"
npx @firebase 'projects:list' | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Not logged in. A browser window will open: sign in with the Google account that owns the project."
  npx @firebase 'login'; Check 'firebase login'
}

Step "Creating the dashboard site '$DashboardSite' (fine if it already exists)"
npx @firebase 'hosting:sites:create' $DashboardSite '--project' $ProjectId 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) { Write-Host "(continuing: the site probably exists already)"; $global:LASTEXITCODE = 0 }

Step "Linking the two sites to this project"
$rc = @{
  projects = @{ default = $ProjectId }
  targets  = @{ $ProjectId = @{ hosting = @{ customer = @($CustomerSite); dashboard = @($DashboardSite) } } }
} | ConvertTo-Json -Depth 6
Set-Content -Path '.firebaserc' -Value $rc -Encoding UTF8 -ErrorAction Stop

Step "Deploying to Firebase Hosting ($config)"
npx @firebase 'deploy' '--only' 'hosting' '--project' $ProjectId '--config' $config
Check 'Deploy'

Write-Host ""
Write-Host "Done. Your live links:" -ForegroundColor Green
Write-Host "  Customer app:    https://$CustomerSite.web.app"
Write-Host "  Store dashboard: https://$DashboardSite.web.app"
if ($Mode -eq 'mock') { Write-Host "  (mock mode: demo data, use the 'Continue as demo' buttons)" }
