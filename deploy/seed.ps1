<#
.SYNOPSIS
  Puts the demo stores and products into your LIVE Firestore database, and/or gives a user a role.

.DESCRIPTION
  Use a project that is only for this demo: seeding overwrites the demo documents (stores, products, inventory).

    .\deploy\seed.ps1 -ProjectId my-quickpick                       # 17 Ahmedabad stores, 93 products
    .\deploy\seed.ps1 -ProjectId my-quickpick -Email me@gmail.com -Role STORE_MANAGER -StoreId store-a

  A role can only be given to a user that already exists (create them in Firebase console > Authentication > Users,
  or let a customer sign up on the website). After changing a role, that user must sign out and in again.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [switch]$SkipSeed,
  [string]$Email = '',
  [ValidateSet('', 'CUSTOMER', 'STORE_STAFF', 'STORE_MANAGER', 'ADMIN')][string]$Role = '',
  [string]$StoreId = ''
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'backend')

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE). Read the message above it." } }

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) { throw "Install the Google Cloud CLI first (https://cloud.google.com/sdk/docs/install)." }

# Talk to the real project, never the local emulators.
Remove-Item Env:FIRESTORE_EMULATOR_HOST -ErrorAction SilentlyContinue
Remove-Item Env:FIREBASE_AUTH_EMULATOR_HOST -ErrorAction SilentlyContinue
$env:GCP_PROJECT_ID = $ProjectId
$env:GOOGLE_CLOUD_PROJECT = $ProjectId

$python = Join-Path (Get-Location) '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
  Step "Setting up Python for the backend (one time)"
  python -m venv .venv; Check 'Creating the Python environment'
  & $python -m pip install -r requirements.txt; Check 'Installing Python packages'
}

Step "Checking you have credentials for the scripts to use"
gcloud auth application-default print-access-token 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "A browser window will open. Sign in with the Google account that owns the project."
  gcloud auth application-default login; Check 'Signing in'
}
gcloud auth application-default set-quota-project $ProjectId 2>$null | Out-Null

if (-not $SkipSeed) {
  Write-Host ""
  Write-Host "This will write the demo stores and products into the LIVE project '$ProjectId'." -ForegroundColor Yellow
  $answer = Read-Host "Type the project id again to continue"
  if ($answer -ne $ProjectId) { throw "Cancelled: that did not match." }
  Step "Seeding Firestore (17 stores, 93 products)"
  & $python -m scripts.seed_dev_data; Check 'Seeding'
}

if ($Email -and $Role) {
  Step "Giving $Email the role $Role"
  $roleArgs = @('-m', 'scripts.set_role', '--email', $Email, '--role', $Role)
  if ($StoreId) { $roleArgs += @('--store-id', $StoreId) }
  & $python @roleArgs; Check 'Setting the role'
  Write-Host "Done. Ask $Email to sign out and sign in again."
}
