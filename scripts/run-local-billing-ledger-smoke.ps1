<#
.SYNOPSIS
    Local billing/ledger smoke test - submits full event lifecycle and verifies ledger entries.

.DESCRIPTION
    Submits a complete impression event lifecycle (impression_requested,
    impression_rendered, viewability_threshold_met) to the local API and
    verifies that ledger entries are created in Postgres with the correct
    invariant: developer_credit + platform_fee === advertiser_charge.

    No browser required. All steps are automated API calls.

    Automated steps:
      1. Load .env if present (DATABASE_URL safety check applied)
      2. Validate DATABASE_URL points only to a local host
      3. Check Docker daemon is running
      4. Start Docker services (optional)
      5. Run: pnpm db:migrate and pnpm db:seed (optional)
      6. Check API health at http://127.0.0.1:3001/health
      7. Auto-mint local dev API key (never stored or printed)
      8. GET /v1/ads/decision - obtain ad decision IDs
      9. POST impression_requested event
     10. POST impression_rendered event
     11. POST viewability_threshold_met event (triggers synchronous billing)
     12. GET /v1/ledger/me - verify developer credit entry
     13. Query Postgres for all 3 ledger entry types + invariant check
     14. Write ASCII-only report to test-results/local-billing/

    PRIVACY RULES:
    - API key is held only in process memory. Never printed, logged, or committed.
    - No page content, user data, or sensitive fields in any request.
    - Reports contain no keys, tokens, or sensitive data.
    - Device ID is a fixed smoke-test identifier (not a real user device).

.PARAMETER Help
    Show usage information and exit.

.PARAMETER SkipDocker
    Skip docker compose up -d. Use when services are already running.

.PARAMETER SkipMigrate
    Skip pnpm db:migrate and pnpm db:seed.

.PARAMETER NoStartApi
    Do not attempt to start the API automatically. Print start command and exit
    if the API is not reachable.

.PARAMETER ApiUrl
    Local API base URL. Defaults to http://127.0.0.1:3001.

.PARAMETER HealthTimeoutSeconds
    Seconds to wait for API health check. Default: 60.

.PARAMETER NoDbVerify
    Skip the post-run Postgres ledger query.

.PARAMETER SinceMinutes
    When querying the DB, look back this many minutes. Default: 10.

.EXAMPLE
    pnpm -w run smoke:billing:local
    .\scripts\run-local-billing-ledger-smoke.ps1

.EXAMPLE
    .\scripts\run-local-billing-ledger-smoke.ps1 -SkipDocker -SkipMigrate

.NOTES
    EXIT CODES:
      0 - PASS (all checks passed)
      1 - FAILED (assertion failed)
      2 - BLOCKED (prerequisites missing)
      3 - UNSAFE (non-local DB URL or API URL detected)
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$SkipDocker,
    [switch]$SkipMigrate,
    [switch]$NoStartApi,
    [string]$ApiUrl              = "http://127.0.0.1:3001",
    [int]$HealthTimeoutSeconds   = 60,
    [switch]$NoDbVerify,
    [int]$SinceMinutes           = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Step([string]$msg)  { Write-Host ""; Write-Host ("[>>] " + $msg) -ForegroundColor Cyan }
function Write-Ok([string]$msg)    { Write-Host ("[OK] " + $msg) -ForegroundColor Green }
function Write-Info([string]$msg)  { Write-Host ("[--] " + $msg) -ForegroundColor Cyan }
function Write-Warn([string]$msg)  { Write-Host ("[!!] " + $msg) -ForegroundColor Yellow }
function Write-Err([string]$msg)   { Write-Host ("[XX] " + $msg) -ForegroundColor Red }
function Write-Separator           { Write-Host ("-" * 60) -ForegroundColor DarkGray }

function Sanitize([string]$text) {
    return ($text -replace '[^\x20-\x7E]', '?').TrimEnd()
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir

# ---------------------------------------------------------------------------
# Help mode
# ---------------------------------------------------------------------------

if ($Help) {
    Write-Host ""
    Write-Host "SYNOPSIS" -ForegroundColor Cyan
    Write-Host "  Local billing/ledger smoke: submits full event lifecycle and verifies ledger."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  pnpm -w run smoke:billing:local"
    Write-Host "  .\scripts\run-local-billing-ledger-smoke.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -Help                  Show this help and exit."
    Write-Host "  -SkipDocker            Skip docker compose up -d."
    Write-Host "  -SkipMigrate           Skip db:migrate and db:seed."
    Write-Host "  -NoStartApi            Do not auto-start API."
    Write-Host "  -ApiUrl <url>          Local API URL (default: http://127.0.0.1:3001)."
    Write-Host "  -HealthTimeoutSeconds  Seconds to wait for /health (default: 60)."
    Write-Host "  -NoDbVerify            Skip Postgres ledger query."
    Write-Host "  -SinceMinutes <int>    DB query lookback window (default: 10)."
    Write-Host ""
    Write-Host "EXIT CODES"
    Write-Host "  0 = PASS  1 = FAILED  2 = BLOCKED  3 = UNSAFE"
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Safety: validate API URL is local
# ---------------------------------------------------------------------------

Write-Step "Safety check: validating local-only API URL"

$allowedHosts = @("localhost", "127.0.0.1", "::1")
$apiUri = $null
try {
    $apiUri = [System.Uri]$ApiUrl
} catch {
    Write-Err ("Invalid API URL: " + $ApiUrl)
    exit 3
}

$isLocalApi = $false
foreach ($h in $allowedHosts) {
    if ($apiUri.Host -eq $h) { $isLocalApi = $true; break }
}

if (-not $isLocalApi) {
    Write-Err "UNSAFE: API URL does not point to a local host."
    Write-Err ("  Provided: " + $ApiUrl)
    Write-Err "  This script only runs against localhost/127.0.0.1."
    exit 3
}

Write-Ok ("API URL is local: " + $ApiUrl)

# ---------------------------------------------------------------------------
# Load .env if present
# ---------------------------------------------------------------------------

$dotEnvPath = Join-Path $RepoRoot ".env"
if (Test-Path $dotEnvPath) {
    Write-Step "Loading .env"
    $envLines = Get-Content $dotEnvPath -ErrorAction SilentlyContinue
    foreach ($line in $envLines) {
        $line = $line.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { continue }
        if ($line -match '^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?$') {
            $envKey = $Matches[1]
            $envVal = $Matches[2]
            if (-not (Get-Item -Path ("Env:\" + $envKey) -ErrorAction SilentlyContinue)) {
                Set-Item -Path ("Env:\" + $envKey) -Value $envVal
            }
        }
    }
    Write-Ok ".env loaded (existing env vars take precedence)"
}

# ---------------------------------------------------------------------------
# Safety: validate DATABASE_URL points to local host
# ---------------------------------------------------------------------------

$dbUrl = $env:DATABASE_URL
if ($dbUrl) {
    Write-Step "Safety check: validating DATABASE_URL is local"
    $isLocalDb = $false
    foreach ($h in @("localhost", "127.0.0.1", "::1")) {
        if ($dbUrl -like ("*" + $h + "*")) { $isLocalDb = $true; break }
    }
    foreach ($svc in @("postgres", "db", "database")) {
        if ($dbUrl -like ("*@" + $svc + ":*") -or $dbUrl -like ("*@" + $svc + "/*")) {
            $isLocalDb = $true; break
        }
    }
    if (-not $isLocalDb) {
        Write-Err "UNSAFE: DATABASE_URL does not appear to point to a local database."
        Write-Err "  This script is for local development only."
        exit 3
    }
    Write-Ok "DATABASE_URL is local (host validated)"
} else {
    Write-Warn "DATABASE_URL is not set. Skipping DB URL safety check."
}

# ---------------------------------------------------------------------------
# Step 1: Check Docker daemon
# ---------------------------------------------------------------------------

Write-Step "Checking Docker daemon"

$dockerInfo = & docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Docker daemon is not running."
    Write-Err "Start Docker Desktop or the Docker service, then re-run."
    exit 2
}
Write-Ok "Docker daemon is running"

# ---------------------------------------------------------------------------
# Step 2: Start Docker services (optional)
# ---------------------------------------------------------------------------

if (-not $SkipDocker) {
    Write-Step "Starting Docker services"
    Push-Location $RepoRoot
    try {
        & docker compose up -d 2>&1 | ForEach-Object { Write-Info (Sanitize "$_") }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "docker compose up -d failed."
            Pop-Location
            exit 2
        }
        Write-Ok "Docker services started"
        Write-Info "Waiting 3s for Postgres to accept connections..."
        Start-Sleep -Seconds 3
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping Docker start (-SkipDocker). Assuming services are running."
}

# ---------------------------------------------------------------------------
# Step 3: Database migrate + seed (optional)
# ---------------------------------------------------------------------------

if (-not $SkipMigrate) {
    Write-Step "Running database migrations"
    Push-Location $RepoRoot
    try {
        & pnpm db:migrate 2>&1 | ForEach-Object { Write-Info (Sanitize "$_") }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "pnpm db:migrate failed."
            Pop-Location
            exit 2
        }
        Write-Ok "Migrations applied"

        Write-Step "Running database seed (idempotent)"
        & pnpm db:seed 2>&1 | ForEach-Object { Write-Info (Sanitize "$_") }
        if ($LASTEXITCODE -ne 0) {
            Write-Err "pnpm db:seed failed."
            Pop-Location
            exit 2
        }
        Write-Ok "Seed applied (or already present)"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping migrate/seed (-SkipMigrate)."
}

# ---------------------------------------------------------------------------
# Step 4: Check API health / optionally start API
# ---------------------------------------------------------------------------

Write-Step ("Checking API health at " + $ApiUrl + "/health")

$healthUri  = $ApiUrl + "/health"
$apiHealthy = $false
$apiJobHandle = $null

function Test-ApiHealth {
    try {
        $r = Invoke-WebRequest -Uri $healthUri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (Test-ApiHealth) {
    Write-Ok "API is healthy and reachable"
    $apiHealthy = $true
} else {
    Write-Warn ("API not reachable at " + $healthUri)

    if ($NoStartApi) {
        Write-Err "-NoStartApi is set. Cannot auto-start API."
        Write-Err "Start the API manually: pnpm dev:api"
        exit 2
    }

    Write-Info "Attempting to start API as a background job..."
    $apiJob = Start-Job -ScriptBlock {
        param($root)
        Set-Location $root
        & pnpm dev:api 2>&1
    } -ArgumentList $RepoRoot

    $apiJobHandle = $apiJob

    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    $dots = 0
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        $dots++
        if ($dots % 5 -eq 0) {
            Write-Info ("Waiting for API health... (" + [int]((($deadline) - (Get-Date)).TotalSeconds) + "s remaining)")
        }
        if (Test-ApiHealth) {
            $apiHealthy = $true
            Write-Ok "API is now healthy"
            break
        }
    }

    if (-not $apiHealthy) {
        Write-Err ("API did not become healthy within " + $HealthTimeoutSeconds + "s.")
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }
}

# ---------------------------------------------------------------------------
# Step 5: Mint local dev API key
# ---------------------------------------------------------------------------

Write-Step "Checking for local dev API key"

$keyMinted = $false

if ($env:PROMPTPROFIT_DEV_API_KEY -and $env:PROMPTPROFIT_DEV_API_KEY.Length -gt 0) {
    Write-Ok "PROMPTPROFIT_DEV_API_KEY is already set (using existing key)"
} else {
    Write-Info "PROMPTPROFIT_DEV_API_KEY not set. Auto-minting from dev@example.com..."

    $getMintScript = Join-Path $ScriptDir "get-local-dev-api-key.ps1"
    if (-not (Test-Path $getMintScript)) {
        Write-Err ("Key-minting script not found: " + $getMintScript)
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }

    $rawOutput = @(& $getMintScript -PrintKey -Quiet -ApiUrl $ApiUrl 2>$null)
    $mintExit  = $LASTEXITCODE
    $mintedKey = if ($rawOutput.Count -gt 0) { $rawOutput[0].Trim() } else { "" }

    if ($mintExit -ne 0) {
        Write-Err ("Key mint helper exited " + $mintExit + ". Cannot continue.")
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }

    if ($mintedKey.Length -lt 8 -or -not $mintedKey.StartsWith("ppft_")) {
        Write-Err "Key mint helper returned an unexpected key format."
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }

    $env:PROMPTPROFIT_DEV_API_KEY = $mintedKey
    $keyMinted = $true
    Write-Ok "Local dev API key minted (LOCAL ONLY, not printed)"
}

# ---------------------------------------------------------------------------
# Step 6: GET ad decision
# ---------------------------------------------------------------------------

Write-Step "Getting ad decision from local API"

$deviceId    = "local-billing-smoke-device"
$adDecisionUri = $ApiUrl + "/v1/ads/decision?deviceId=" + $deviceId + "&adapterName=browser_chatgpt&extensionVersion=0.1.0"

$adDecisionResp = $null
$adDecisionStatus = 0
try {
    $adDecisionResp = Invoke-WebRequest `
        -Uri $adDecisionUri `
        -Method GET `
        -Headers @{ "Authorization" = ("Bearer " + $env:PROMPTPROFIT_DEV_API_KEY) } `
        -UseBasicParsing `
        -TimeoutSec 10 `
        -ErrorAction Stop
    $adDecisionStatus = [int]$adDecisionResp.StatusCode
} catch {
    if ($_.Exception.Response -ne $null) {
        try { $adDecisionStatus = [int]$_.Exception.Response.StatusCode } catch { $adDecisionStatus = 0 }
    }
    Write-Err ("Ad decision request failed: " + $_.Exception.Message)
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

if ($adDecisionStatus -eq 204) {
    Write-Err "Ad decision: 204 No Content - no eligible campaign for browser_chatgpt."
    Write-Err "Run: pnpm db:seed"
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

if ($adDecisionStatus -ne 200) {
    Write-Err ("Ad decision: unexpected HTTP " + $adDecisionStatus + ".")
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

$adDecisionJson = $null
try {
    $adDecisionJson = $adDecisionResp.Content | ConvertFrom-Json
} catch {
    Write-Err "Failed to parse ad decision JSON response."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

$adDecisionId    = $adDecisionJson.data.adDecisionId
$campaignId      = $adDecisionJson.data.campaignId
$creativeId      = $adDecisionJson.data.creativeId
$cpmBidMicrocents = $adDecisionJson.data.cpmBidMicrocents

if (-not $adDecisionId -or -not $campaignId -or -not $creativeId) {
    Write-Err "Ad decision response missing required fields (adDecisionId, campaignId, creativeId)."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

Write-Ok ("Ad decision received (IDs present, not printed)")

# ---------------------------------------------------------------------------
# Step 7: Generate session/event metadata
# ---------------------------------------------------------------------------

$sessionId        = [System.Guid]::NewGuid().ToString()
$extensionVersion = "0.1.0"
$adapterName      = "browser_chatgpt"
$nowTimestamp     = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$authHeader = @{
    "Authorization"  = ("Bearer " + $env:PROMPTPROFIT_DEV_API_KEY)
    "Content-Type"   = "application/json"
}

$eventsUri = $ApiUrl + "/v1/events"

function Invoke-EventPost([string]$eventType, [hashtable]$extraFields, [int]$seq) {
    $baseFields = @{
        eventId          = [System.Guid]::NewGuid().ToString()
        eventType        = $eventType
        deviceId         = $script:deviceId
        sessionId        = $script:sessionId
        extensionVersion = $script:extensionVersion
        adapterName      = $script:adapterName
        clientTimestamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        sequenceNumber   = $seq
    }
    foreach ($k in $extraFields.Keys) { $baseFields[$k] = $extraFields[$k] }

    $body = $baseFields | ConvertTo-Json -Depth 3 -Compress
    $resp = $null
    $status = 0
    try {
        $resp = Invoke-WebRequest `
            -Uri $script:eventsUri `
            -Method POST `
            -Headers $script:authHeader `
            -Body $body `
            -UseBasicParsing `
            -TimeoutSec 15 `
            -ErrorAction Stop
        $status = [int]$resp.StatusCode
    } catch {
        if ($_.Exception.Response -ne $null) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
        }
        Write-Err ("POST " + $eventType + " failed: " + $_.Exception.Message)
        if ($status -ne 0) { Write-Err ("  HTTP " + $status) }
        return $null
    }

    if ($status -ne 200) {
        Write-Err ("POST " + $eventType + " returned HTTP " + $status)
        if ($resp -ne $null -and $resp.Content) {
            Write-Err ("  Body: " + (Sanitize $resp.Content))
        }
        return $null
    }

    $respJson = $null
    try { $respJson = $resp.Content | ConvertFrom-Json } catch {}
    return $respJson
}

# ---------------------------------------------------------------------------
# Step 8: POST impression_requested
# ---------------------------------------------------------------------------

Write-Step "Posting impression_requested"

$reqResult = Invoke-EventPost "impression_requested" @{
    adDecisionId = $adDecisionId
    campaignId   = $campaignId
    creativeId   = $creativeId
} 0

if ($null -eq $reqResult) {
    Write-Err "impression_requested event failed."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

$reqStatus = $reqResult.data.status
Write-Ok ("impression_requested: " + $reqStatus)

# ---------------------------------------------------------------------------
# Step 9: POST impression_rendered
# ---------------------------------------------------------------------------

Write-Step "Posting impression_rendered"

$renderedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$rendResult = Invoke-EventPost "impression_rendered" @{
    adDecisionId = $adDecisionId
    renderedAt   = $renderedAt
} 1

if ($null -eq $rendResult) {
    Write-Err "impression_rendered event failed."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

$rendStatus = $rendResult.data.status
Write-Ok ("impression_rendered: " + $rendStatus)

# ---------------------------------------------------------------------------
# Step 10: POST viewability_threshold_met (triggers synchronous billing)
# ---------------------------------------------------------------------------

Write-Step "Posting viewability_threshold_met (billing trigger)"

# displayedDurationMs must be 3000-300000; use 5100 (above production 5000ms threshold)
$viewResult = Invoke-EventPost "viewability_threshold_met" @{
    adDecisionId      = $adDecisionId
    displayedDurationMs = 5100
    thresholdMs         = 5000
} 2

# Clear key from env immediately after last event submission
if ($keyMinted) {
    Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue
    Write-Info "Local dev API key cleared from process environment"
}

if ($null -eq $viewResult) {
    Write-Err "viewability_threshold_met event failed. Billing was NOT triggered."
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

$viewStatus     = $viewResult.data.status
$fraudDecision  = if ($viewResult.data.fraudDecision) { $viewResult.data.fraudDecision } else { "not_returned" }
Write-Ok ("viewability_threshold_met: " + $viewStatus + " (fraud: " + $fraudDecision + ")")

# Billing is synchronous: if the event was accepted with fraud=pass, ledger was written.
$billingTriggered = ($viewStatus -eq "accepted" -and ($fraudDecision -eq "pass" -or $fraudDecision -eq "not_returned"))

if (-not $billingTriggered) {
    Write-Warn ("Billing may not have triggered. status=" + $viewStatus + " fraud=" + $fraudDecision)
    Write-Warn "Check the API logs for ledger_budget_exhausted or fraud_blocked."
}

# ---------------------------------------------------------------------------
# Step 11: GET /v1/ledger/me - verify developer credit
# ---------------------------------------------------------------------------

Write-Step "Verifying developer ledger entries via GET /v1/ledger/me"

$ledgerChecks = @()

# Re-mint key for the ledger query
$getMintScript2 = Join-Path $ScriptDir "get-local-dev-api-key.ps1"
$ledgerKey = ""
if (Test-Path $getMintScript2) {
    $rawOutput2 = @(& $getMintScript2 -PrintKey -Quiet -ApiUrl $ApiUrl 2>$null)
    $mintExit2  = $LASTEXITCODE
    if ($mintExit2 -eq 0 -and $rawOutput2.Count -gt 0) {
        $ledgerKey = $rawOutput2[0].Trim()
    }
}

if ($ledgerKey.Length -lt 8) {
    Write-Warn "Could not mint key for ledger query. Skipping API ledger verification."
    $ledgerChecks += "[SKIP] Ledger API verification (key unavailable)"
} else {
    $ledgerUri = $ApiUrl + "/v1/ledger/me?limit=5&page=1"
    $ledgerResp = $null
    $ledgerStatus = 0
    try {
        $ledgerResp = Invoke-WebRequest `
            -Uri $ledgerUri `
            -Method GET `
            -Headers @{ "Authorization" = ("Bearer " + $ledgerKey) } `
            -UseBasicParsing `
            -TimeoutSec 10 `
            -ErrorAction Stop
        $ledgerStatus = [int]$ledgerResp.StatusCode
    } catch {
        if ($_.Exception.Response -ne $null) {
            try { $ledgerStatus = [int]$_.Exception.Response.StatusCode } catch { $ledgerStatus = 0 }
        }
        Write-Warn ("Ledger API request failed: " + $_.Exception.Message)
        $ledgerStatus = 0
    }

    # Clear ledger query key immediately
    Remove-Variable -Name ledgerKey -ErrorAction SilentlyContinue

    if ($ledgerStatus -eq 200) {
        $ledgerJson = $null
        try { $ledgerJson = $ledgerResp.Content | ConvertFrom-Json } catch {}

        if ($null -ne $ledgerJson -and $null -ne $ledgerJson.data) {
            $totalEarned = $ledgerJson.data.totalEarnedMicrocents
            $entryCount  = if ($ledgerJson.data.entries) { @($ledgerJson.data.entries).Count } else { 0 }
            Write-Ok ("Ledger API: totalEarnedMicrocents=" + $totalEarned + ", entries=" + $entryCount)

            if ($entryCount -gt 0) {
                $newestEntry = $ledgerJson.data.entries[0]
                Write-Info ("  Newest entry: type=" + $newestEntry.entryType + " ref=" + $newestEntry.referenceType + " amount=" + $newestEntry.amountMicrocents)
                if ($newestEntry.entryType -eq "developer_credit" -and $newestEntry.referenceType -eq "impression") {
                    $ledgerChecks += "[PASS] Ledger API: developer_credit entry present for impression"
                } else {
                    $ledgerChecks += "[WARN] Ledger API: newest entry is not impression developer_credit (may be older run)"
                }
            } else {
                $ledgerChecks += "[WARN] Ledger API: no entries returned (billing may not have triggered)"
            }
        } else {
            $ledgerChecks += "[WARN] Ledger API: response missing data field"
        }
    } else {
        $ledgerChecks += ("[WARN] Ledger API: HTTP " + $ledgerStatus)
    }
}

# ---------------------------------------------------------------------------
# Step 12: Postgres ledger verification
# ---------------------------------------------------------------------------

$dbChecks   = @()
$invariantOk = $false
$dbVerified  = $false

if (-not $NoDbVerify) {
    Write-Step "Verifying ledger entries in Postgres"

    # Step 12a: Find the impression ID for this ad decision
    $findImpressionSql = "SELECT id FROM impression_events WHERE ad_decision_id = '" + $adDecisionId + "' LIMIT 1;"
    $psqlFindArgs = @(
        "compose", "exec", "-T", "postgres",
        "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
        "-t", "-A", "-c", $findImpressionSql
    )
    $impressionIdOutput = & docker @psqlFindArgs 2>&1
    $findExit = $LASTEXITCODE

    if ($findExit -ne 0) {
        Write-Warn "Could not query impression_events (docker compose exec failed)."
        $dbChecks += "[WARN] DB: impression_events query failed (Docker/psql unavailable)"
    } else {
        $impressionId = ($impressionIdOutput | Out-String).Trim()

        if ($impressionId -eq "" -or $impressionId -like "*0 rows*") {
            Write-Warn "No impression_events row found for this ad decision."
            $dbChecks += "[WARN] DB: impression_events row not found for ad decision"
            $dbChecks += "       (Impression may not have been created - check fraud/kill-switch)"
        } elseif ($impressionId -notmatch '^[0-9a-f-]{36}$') {
            Write-Warn ("Unexpected impression ID format: '" + (Sanitize $impressionId) + "'")
            $dbChecks += "[WARN] DB: unexpected impression ID format"
        } else {
            Write-Ok ("impression_events row found (ID present)")

            # Step 12b: Query ledger_entries for all 3 types for this impression
            $ledgerSql = "SELECT entry_type, amount_microcents FROM ledger_entries WHERE reference_type = 'impression' AND reference_id = '" + $impressionId + "' ORDER BY entry_type;"
            $psqlLedgerArgs = @(
                "compose", "exec", "-T", "postgres",
                "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
                "-t", "-A", "-F", "|", "-c", $ledgerSql
            )
            $ledgerOutput = & docker @psqlLedgerArgs 2>&1
            $ledgerExit = $LASTEXITCODE

            if ($ledgerExit -ne 0) {
                Write-Warn "ledger_entries query failed."
                $dbChecks += "[WARN] DB: ledger_entries query failed"
            } else {
                $ledgerLines = @(($ledgerOutput | Out-String).Trim() -split "`n" | Where-Object { $_.Trim() -ne "" })
                Write-Info ("  ledger_entries rows: " + $ledgerLines.Count)

                $advertiserAmount = $null
                $developerAmount  = $null
                $platformAmount   = $null

                foreach ($line in $ledgerLines) {
                    $parts = $line.Trim() -split "\|"
                    if ($parts.Count -lt 2) { continue }
                    $entryType = $parts[0].Trim()
                    $amount    = $parts[1].Trim()
                    Write-Info ("    " + $entryType + ": " + $amount + " microcents")
                    if ($entryType -eq "advertiser_charge")  { $advertiserAmount = [long]$amount }
                    elseif ($entryType -eq "developer_credit") { $developerAmount = [long]$amount }
                    elseif ($entryType -eq "platform_fee")     { $platformAmount  = [long]$amount }
                }

                if ($null -eq $advertiserAmount -or $null -eq $developerAmount -or $null -eq $platformAmount) {
                    Write-Warn "Not all 3 ledger entry types found."
                    $dbChecks += "[WARN] DB: ledger_entries missing entry types (billing may not have triggered)"
                    $dbChecks += ("       Found " + $ledgerLines.Count + " rows (expected 3: advertiser_charge, developer_credit, platform_fee)")
                    if ($fraudDecision -eq "block") {
                        $dbChecks += "       Fraud decision was 'block' - billing intentionally skipped"
                    }
                } else {
                    $dbChecks += ("[PASS] DB: 3 ledger_entries rows found for impression")
                    $dbChecks += ("         advertiser_charge:  " + $advertiserAmount + " microcents")
                    $dbChecks += ("         developer_credit:   " + $developerAmount + " microcents")
                    $dbChecks += ("         platform_fee:       " + $platformAmount + " microcents")
                    $dbVerified = $true

                    # Invariant check
                    if ($developerAmount + $platformAmount -eq $advertiserAmount) {
                        $invariantOk = $true
                        $dbChecks += ("[PASS] Invariant: developer_credit (" + $developerAmount + ") + platform_fee (" + $platformAmount + ") == advertiser_charge (" + $advertiserAmount + ")")
                    } else {
                        $dbChecks += ("[FAIL] INVARIANT VIOLATED: " + $developerAmount + " + " + $platformAmount + " != " + $advertiserAmount)
                        Write-Err ("INVARIANT FAILED: " + $developerAmount + " + " + $platformAmount + " != " + $advertiserAmount)
                    }
                }
            }
        }
    }
} else {
    Write-Warn "Skipping Postgres ledger verification (-NoDbVerify)."
    $dbChecks += "[SKIP] DB: ledger verification skipped (-NoDbVerify)"
}

# ---------------------------------------------------------------------------
# Step 13: Write report
# ---------------------------------------------------------------------------

Write-Step "Writing billing/ledger smoke report"

$reportDir = Join-Path $RepoRoot "apps/browser-extension/test-results/local-billing"
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$timestamp   = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportFile  = Join-Path $reportDir ("billing-ledger-smoke-" + $timestamp + ".md")

$allChecksPassed = ($viewStatus -eq "accepted") -and $dbVerified -and $invariantOk
$overallResult   = if ($allChecksPassed) { "PASS" } else { "FAIL" }

$reportLines = @(
    "# Billing/Ledger Smoke - " + $overallResult,
    "",
    "Date: " + (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss UTC"),
    "API URL: " + $ApiUrl,
    "Adapter: " + $adapterName,
    "CPM Bid: " + $cpmBidMicrocents + " microcents",
    "",
    "## Event Submission",
    "",
    "[" + (if ($reqStatus -eq "accepted" -or $reqStatus -eq "duplicate") { "PASS" } else { "FAIL" }) + "] impression_requested: " + $reqStatus,
    "[" + (if ($rendStatus -eq "accepted" -or $rendStatus -eq "duplicate") { "PASS" } else { "FAIL" }) + "] impression_rendered: " + $rendStatus,
    "[" + (if ($viewStatus -eq "accepted") { "PASS" } else { "FAIL" }) + "] viewability_threshold_met: " + $viewStatus + " (fraud: " + $fraudDecision + ")",
    ""
)

$reportLines += "## Ledger API Verification"
$reportLines += ""
foreach ($c in $ledgerChecks) { $reportLines += $c }

$reportLines += ""
$reportLines += "## Postgres Ledger Verification"
$reportLines += ""
foreach ($c in $dbChecks) { $reportLines += $c }

$reportLines += ""
$reportLines += "## Result"
$reportLines += ""
$reportLines += $overallResult

$reportLines += ""
if ($overallResult -eq "PASS") {
    $reportLines += "Billing pipeline verified: impression events accepted, 3 ledger entries created,"
    $reportLines += "and invariant developer_credit + platform_fee === advertiser_charge confirmed."
} else {
    $reportLines += "Billing verification FAILED. See checks above for details."
    if (-not $dbVerified) {
        $reportLines += "DB verification did not find all 3 ledger entry types."
        $reportLines += "If fraud decision was 'block', billing is intentionally skipped."
        $reportLines += "Check local campaign budget and fraud configuration."
    }
    if (-not $invariantOk -and $dbVerified) {
        $reportLines += "CRITICAL: Ledger invariant violated. This indicates a billing calculation bug."
    }
}

$reportContent = $reportLines -join "`n"
Set-Content -Path $reportFile -Value $reportContent -Encoding UTF8
Write-Ok ("Report written to: " + $reportFile)

# ---------------------------------------------------------------------------
# Cleanup: stop background API job if we started it
# ---------------------------------------------------------------------------

if ($apiJobHandle) {
    Write-Step "Stopping background API job"
    Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
    Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    Write-Ok "Background API job stopped"
}

# ---------------------------------------------------------------------------
# Final output
# ---------------------------------------------------------------------------

Write-Separator
Write-Host ""
Write-Host (Get-Content $reportFile -Raw)
Write-Host ""
Write-Separator

if ($overallResult -eq "PASS") {
    Write-Ok "Billing/ledger smoke PASSED."
    exit 0
} else {
    Write-Err "Billing/ledger smoke FAILED."
    exit 1
}
