<#
.SYNOPSIS
  Deploys the QuickPick API to Google Cloud Run and sets up its secrets and the scheduled order-expiry job.

.DESCRIPTION
  Run it from the repository root after installing the Google Cloud CLI and signing in (see docs\DEPLOYMENT.md):
    .\deploy\backend.ps1 -ProjectId my-quickpick

  It is safe to run again: every step checks whether it is already done. Running it again redeploys the latest code.
  No Docker needed: Google builds the container for you (Cloud Build).
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Region = 'asia-south1',        # Mumbai. Must match the region in firebase.json
  [string]$ServiceName = 'quickpick-api', # Must match "serviceId" in firebase.json
  [string]$CorsOrigins = ''               # Not needed when the apps call /api through Firebase Hosting
)

# Native commands write progress to stderr; we check exit codes ourselves instead of letting PowerShell abort.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE). Read the message above it." } }
function Quiet { param([scriptblock]$Block) & $Block 2>$null | Out-Null; return ($LASTEXITCODE -eq 0) }

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "The Google Cloud CLI (gcloud) is not installed. Install it from https://cloud.google.com/sdk/docs/install, open a NEW PowerShell window, run 'gcloud auth login', then run this again."
}

Step "Using project $ProjectId in $Region"
gcloud config set project $ProjectId | Out-Null; Check 'Selecting the project'
$account = (gcloud auth list --filter=status:ACTIVE --format='value(account)') 2>$null
if (-not $account) { throw "You are not signed in. Run: gcloud auth login" }
Write-Host "Signed in as $account"

Step "Turning on the Google services we use (takes a minute the first time)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com firestore.googleapis.com cloudscheduler.googleapis.com --project $ProjectId
Check 'Enabling services (is billing turned on for this project? Cloud Run needs the Blaze/billing plan)'

Step "Making sure the Firestore database exists"
if (-not (Quiet { gcloud firestore databases describe --project $ProjectId })) {
  gcloud firestore databases create --location=$Region --type=firestore-native --project $ProjectId
  Check 'Creating the Firestore database'
} else { Write-Host "Already there." }

$sa = "quickpick-api@$ProjectId.iam.gserviceaccount.com"
Step "Creating the API's own limited account ($sa)"
if (-not (Quiet { gcloud iam service-accounts describe $sa --project $ProjectId })) {
  gcloud iam service-accounts create quickpick-api --display-name 'QuickPick API' --project $ProjectId
  Check 'Creating the service account'
  Start-Sleep -Seconds 8   # give Google a moment to make the new account visible
} else { Write-Host "Already there." }
gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$sa" --role='roles/datastore.user' --condition=None | Out-Null
Check 'Letting the API use Firestore'

function New-RandomHex([int]$bytes) {
  $buf = New-Object byte[] $bytes
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($buf); $rng.Dispose()
  return (($buf | ForEach-Object { $_.ToString('x2') }) -join '')
}

function Ensure-Secret([string]$name) {
  if (-not (Quiet { gcloud secrets describe $name --project $ProjectId })) {
    Write-Host "Creating secret '$name' with a fresh random value (it is never printed or saved on your disk)."
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
      [System.IO.File]::WriteAllText($tmp, (New-RandomHex 32))
      gcloud secrets create $name --replication-policy=automatic --data-file=$tmp --project $ProjectId
      Check "Creating secret $name"
    } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
  } else { Write-Host "Secret '$name' already exists, keeping it." }
  gcloud secrets add-iam-policy-binding $name --member="serviceAccount:$sa" --role='roles/secretmanager.secretAccessor' --project $ProjectId | Out-Null
  Check "Letting the API read secret $name"
}

Step "Creating the API's secrets (pickup-code signing key and the scheduler password)"
Ensure-Secret 'pickup-token-secret'
Ensure-Secret 'job-secret'

Step "Deploying the API to Cloud Run (building the container takes a few minutes)"
$envVars = "ENVIRONMENT=production,GCP_PROJECT_ID=$ProjectId,EXPIRY_SWEEP_INTERVAL_SECONDS=0"
if ($CorsOrigins) { $envVars += ",CORS_ALLOW_ORIGINS=$CorsOrigins" }
gcloud run deploy $ServiceName --source backend --region $Region --project $ProjectId `
  --service-account $sa --allow-unauthenticated `
  --set-env-vars $envVars `
  --set-secrets 'PICKUP_TOKEN_SECRET=pickup-token-secret:latest,JOB_SECRET=job-secret:latest' `
  --min-instances 0 --max-instances 3 --memory 512Mi --cpu 1
Check 'Cloud Run deploy'

$url = (gcloud run services describe $ServiceName --region $Region --project $ProjectId --format='value(status.url)')
Write-Host "API address: $url"

Step "Scheduling the order-expiry job (runs every minute so uncollected orders release their stock)"
$jobSecret = (gcloud secrets versions access latest --secret=job-secret --project $ProjectId)
$jobUri = "$url/api/v1/internal/jobs/expire-orders"
$action = if (Quiet { gcloud scheduler jobs describe quickpick-expire-orders --location $Region --project $ProjectId }) { 'update' } else { 'create' }
gcloud scheduler jobs $action http quickpick-expire-orders --location $Region --project $ProjectId `
  --schedule '* * * * *' --uri $jobUri --http-method POST --headers "X-Job-Secret=$jobSecret"
Check 'Creating the scheduler job'

Step "Checking the API answers"
try {
  $health = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 60
  Write-Host "GET /health -> $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch { Write-Warning "Could not reach $url/health yet: $($_.Exception.Message). Wait a minute and open it in a browser." }

Write-Host ""
Write-Host "Done. The API is live at $url" -ForegroundColor Green
Write-Host "Next: seed the demo stores (deploy\seed.ps1), create your users, then deploy the websites (deploy\hosting.ps1 -Mode real)."
