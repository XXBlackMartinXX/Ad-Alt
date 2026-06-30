<#
.SYNOPSIS
    Local click-billing smoke test - submits full impression + click lifecycle and verifies ledger.

.DESCRIPTION
    Submits a complete impression lifecycle followed by a click event, then
    verifies that click ledger entries exist in Postgres with the correct
    invariant: developer_credit + platform_fee === advertiser_charge.

    The click billing rate is 10x the CPM impression rate.

    Automated steps:
      1-5. Same setup as billing/ledger smoke (Docker, migrate, API, key mint)
      6.  GET /v1/ads/decision
      7.  POST impression_requested (makes impression "active")
      8.  POST impression_rendered
      9.  POST viewability_threshold_met (makes impression "billable")
     10.  POST click event
     11.  Query Postgres for click ledger entries + invariant check
     12.  Write ASCII-only report to test-results/local-billing/

    PRIVACY RULES:
    - API key never printed, logged, or committed.
    - No page content, user data, or sensitive fields in any request.

.PARAMETER Help
    Show usage information and exit.

.PARAMETER SkipDocker
    Skip docker compose up -d.

.PARAMETER SkipMigrate
    Skip pnpm db:migrate and pnpm db:seed.

.PARAMETER NoStartApi
    Do not attempt to start the API automatically.

.PARAMETER ApiUrl
    Local API base URL. Defaults to http://127.0.0.1:3001.

.PARAMETER HealthTimeoutSeconds
    Seconds to wait for API health check. Default: 60.

.PARAMETER NoDbVerify
    Skip the Postgres ledger query.

.EXAMPLE
    pnpm -w run smoke:billing:click:local
    .\scripts\run-local-click-billing-smoke.ps1

.NOTES
    EXIT CODES:
      0 - PASS (all checks passed)
      1 - FAILED (assertion failed)
      2 - BLOCKED (prerequisites missing)
      3 - UNSAFE (non-local DB URL or API URL detected)

    LIMITATIONS:
    - Click billing requires a prior billable impression (status=billable).
    - If fraud scoring blocks the viewability event, the impression is not
      billable and the click will also be blocked.
    - No click automation in live smoke; this test uses direct API calls.
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [switch]$SkipDocker,
    [switch]$SkipMigrate,
    [switch]$NoStartApi,
    [string]$ApiUrl              = "http://127.0.0.1:3001",
    [int]$HealthTimeoutSeconds   = 60,
    [switch]$NoDbVerify
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
    Write-Host "  Click-billing smoke: impression lifecycle + click, verifies ledger entries."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  pnpm -w run smoke:billing:click:local"
    Write-Host "  .\scripts\run-local-click-billing-smoke.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -Help                  Show this help and exit."
    Write-Host "  -SkipDocker            Skip docker compose up -d."
    Write-Host "  -SkipMigrate           Skip db:migrate and db:seed."
    Write-Host "  -NoStartApi            Do not auto-start API."
    Write-Host "  -ApiUrl <url>          Local API URL (default: http://127.0.0.1:3001)."
    Write-Host "  -HealthTimeoutSeconds  Seconds to wait for /health (default: 60)."
    Write-Host "  -NoDbVerify            Skip Postgres ledger query."
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
            $envKey = $Matches[1]; $envVal = $Matches[2]
            if (-not (Get-Item -Path ("Env:\" + $envKey) -ErrorAction SilentlyContinue)) {
                Set-Item -Path ("Env:\" + $envKey) -Value $envVal
            }
        }
    }
    Write-Ok ".env loaded"
}

# ---------------------------------------------------------------------------
# Safety: validate DATABASE_URL
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
        Write-Err "UNSAFE: DATABASE_URL does not point to a local database."
        exit 3
    }
    Write-Ok "DATABASE_URL is local"
}

# ---------------------------------------------------------------------------
# Docker, migrate, API health, key mint (same as billing ledger smoke)
# ---------------------------------------------------------------------------

Write-Step "Checking Docker daemon"
$dockerInfo = & docker info 2>&1
if ($LASTEXITCODE -ne 0) { Write-Err "Docker daemon is not running."; exit 2 }
Write-Ok "Docker daemon is running"

if (-not $SkipDocker) {
    Write-Step "Starting Docker services"
    Push-Location $RepoRoot
    try {
        & docker compose up -d 2>&1 | ForEach-Object { Write-Info (Sanitize "$_") }
        if ($LASTEXITCODE -ne 0) { Write-Err "docker compose up -d failed."; Pop-Location; exit 2 }
        Write-Ok "Docker services started"
        Start-Sleep -Seconds 3
    } finally { Pop-Location }
} else {
    Write-Warn "Skipping Docker start (-SkipDocker)."
}

if (-not $SkipMigrate) {
    Write-Step "Running database migrations"
    Push-Location $RepoRoot
    try {
        & pnpm db:migrate 2>&1 | ForEach-Object { Write-Info (Sanitize "$_") }
        if ($LASTEXITCODE -ne 0) { Write-Err "pnpm db:migrate failed."; Pop-Location; exit 2 }
        Write-Ok "Migrations applied"
        & pnpm db:seed 2>&1 | ForEach-Object { Write-Info (Sanitize "$_") }
        if ($LASTEXITCODE -ne 0) { Write-Err "pnpm db:seed failed."; Pop-Location; exit 2 }
        Write-Ok "Seed applied"
    } finally { Pop-Location }
} else {
    Write-Warn "Skipping migrate/seed (-SkipMigrate)."
}

Write-Step ("Checking API health at " + $ApiUrl + "/health")
$healthUri  = $ApiUrl + "/health"
$apiHealthy = $false
$apiJobHandle = $null

function Test-ApiHealth {
    try {
        $r = Invoke-WebRequest -Uri $healthUri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        return $r.StatusCode -eq 200
    } catch { return $false }
}

if (Test-ApiHealth) {
    Write-Ok "API is healthy"
    $apiHealthy = $true
} else {
    Write-Warn "API not reachable"
    if ($NoStartApi) { Write-Err "Use pnpm dev:api to start the API."; exit 2 }
    Write-Info "Starting API as background job..."
    $apiJob = Start-Job -ScriptBlock {
        param($root); Set-Location $root; & pnpm dev:api 2>&1
    } -ArgumentList $RepoRoot
    $apiJobHandle = $apiJob
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        if (Test-ApiHealth) { $apiHealthy = $true; Write-Ok "API is now healthy"; break }
    }
    if (-not $apiHealthy) {
        Write-Err "API did not become healthy."
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }
}

Write-Step "Minting local dev API key"
$keyMinted = $false
if ($env:PROMPTPROFIT_DEV_API_KEY -and $env:PROMPTPROFIT_DEV_API_KEY.Length -gt 0) {
    Write-Ok "PROMPTPROFIT_DEV_API_KEY already set"
} else {
    $getMintScript = Join-Path $ScriptDir "get-local-dev-api-key.ps1"
    if (-not (Test-Path $getMintScript)) {
        Write-Err "Key-minting script not found."
        if ($apiJobHandle) {
            Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
            Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
        }
        exit 2
    }
    $rawOutput = @(& $getMintScript -PrintKey -Quiet -ApiUrl $ApiUrl 2>$null)
    $mintExit  = $LASTEXITCODE
    $mintedKey = if ($rawOutput.Count -gt 0) { $rawOutput[0].Trim() } else { "" }
    if ($mintExit -ne 0 -or $mintedKey.Length -lt 8 -or -not $mintedKey.StartsWith("ppft_")) {
        Write-Err "Key mint failed."
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
# GET ad decision
# ---------------------------------------------------------------------------

Write-Step "Getting ad decision"

$deviceId       = "local-click-smoke-device"
$adDecisionUri  = $ApiUrl + "/v1/ads/decision?deviceId=" + $deviceId + "&adapterName=browser_chatgpt&extensionVersion=0.1.0"
$authHeader = @{
    "Authorization" = ("Bearer " + $env:PROMPTPROFIT_DEV_API_KEY)
    "Content-Type"  = "application/json"
}

$adDecisionResp   = $null
$adDecisionStatus = 0
try {
    $adDecisionResp = Invoke-WebRequest `
        -Uri $adDecisionUri -Method GET `
        -Headers @{ "Authorization" = ("Bearer " + $env:PROMPTPROFIT_DEV_API_KEY) } `
        -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    $adDecisionStatus = [int]$adDecisionResp.StatusCode
} catch {
    Write-Err ("Ad decision request failed: " + $_.Exception.Message)
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

if ($adDecisionStatus -ne 200) {
    Write-Err ("Ad decision: HTTP " + $adDecisionStatus)
    if ($adDecisionStatus -eq 204) { Write-Err "No eligible campaign. Run: pnpm db:seed" }
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

$adJson       = $adDecisionResp.Content | ConvertFrom-Json
$adDecisionId = $adJson.data.adDecisionId
$campaignId   = $adJson.data.campaignId
$creativeId   = $adJson.data.creativeId
$cpmBid       = $adJson.data.cpmBidMicrocents

if (-not $adDecisionId -or -not $campaignId -or -not $creativeId) {
    Write-Err "Ad decision missing required fields."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 2
}

Write-Ok "Ad decision received"

# ---------------------------------------------------------------------------
# Submit impression lifecycle (required before click)
# ---------------------------------------------------------------------------

$sessionId        = [System.Guid]::NewGuid().ToString()
$eventsUri        = $ApiUrl + "/v1/events"

function Invoke-EventPost([string]$eventType, [hashtable]$extraFields, [int]$seq) {
    $baseFields = @{
        eventId          = [System.Guid]::NewGuid().ToString()
        eventType        = $eventType
        deviceId         = $script:deviceId
        sessionId        = $script:sessionId
        extensionVersion = "0.1.0"
        adapterName      = "browser_chatgpt"
        clientTimestamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        sequenceNumber   = $seq
    }
    foreach ($k in $extraFields.Keys) { $baseFields[$k] = $extraFields[$k] }
    $body = $baseFields | ConvertTo-Json -Depth 3 -Compress
    $resp = $null
    try {
        $resp = Invoke-WebRequest `
            -Uri $script:eventsUri -Method POST `
            -Headers $script:authHeader -Body $body `
            -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $status = [int]$resp.StatusCode
        if ($status -ne 200) {
            Write-Warn ("POST " + $eventType + " returned HTTP " + $status)
            return $null
        }
        return $resp.Content | ConvertFrom-Json
    } catch {
        Write-Err ("POST " + $eventType + " failed: " + $_.Exception.Message)
        return $null
    }
}

Write-Step "Posting impression lifecycle (required before click)"

$reqResult = Invoke-EventPost "impression_requested" @{
    adDecisionId = $adDecisionId; campaignId = $campaignId; creativeId = $creativeId
} 0

if ($null -eq $reqResult) {
    Write-Err "impression_requested failed."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
Write-Ok ("impression_requested: " + $reqResult.data.status)

$rendResult = Invoke-EventPost "impression_rendered" @{
    adDecisionId = $adDecisionId
    renderedAt   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
} 1

if ($null -eq $rendResult) {
    Write-Err "impression_rendered failed."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}
Write-Ok ("impression_rendered: " + $rendResult.data.status)

$viewResult = Invoke-EventPost "viewability_threshold_met" @{
    adDecisionId        = $adDecisionId
    displayedDurationMs = 5100
    thresholdMs         = 5000
} 2

if ($null -eq $viewResult) {
    Write-Err "viewability_threshold_met failed. Impression may not be billable."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

$viewStatus    = $viewResult.data.status
$fraudDecision = if ($viewResult.data.fraudDecision) { $viewResult.data.fraudDecision } else { "not_returned" }
Write-Ok ("viewability_threshold_met: " + $viewStatus + " (fraud: " + $fraudDecision + ")")

# Impression must be billable before click can be billed
if ($viewStatus -ne "accepted") {
    Write-Err "viewability_threshold_met not accepted. Click billing will not trigger."
    if ($keyMinted) { Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue }
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# ---------------------------------------------------------------------------
# POST click event
# ---------------------------------------------------------------------------

Write-Step "Posting click event"

$clickResult = Invoke-EventPost "click" @{
    adDecisionId = $adDecisionId
    creativeId   = $creativeId
} 3

# Clear key from env immediately after last event
if ($keyMinted) {
    Remove-Item Env:\PROMPTPROFIT_DEV_API_KEY -ErrorAction SilentlyContinue
    Write-Info "Local dev API key cleared from process environment"
}

if ($null -eq $clickResult) {
    Write-Err "click event failed."
    if ($apiJobHandle) {
        Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
        Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

$clickStatus      = $clickResult.data.status
$clickFraud       = if ($clickResult.data.fraudDecision) { $clickResult.data.fraudDecision } else { "not_returned" }
Write-Ok ("click: " + $clickStatus + " (fraud: " + $clickFraud + ")")

# ---------------------------------------------------------------------------
# Postgres click ledger verification
# ---------------------------------------------------------------------------

$dbChecks    = @()
$invariantOk = $false
$dbVerified  = $false

if (-not $NoDbVerify) {
    Write-Step "Verifying click ledger entries in Postgres"

    # Find click ID by ad decision ID
    $findClickSql = "SELECT id FROM click_events WHERE ad_decision_id = '" + $adDecisionId + "' ORDER BY created_at DESC LIMIT 1;"
    $psqlFindArgs = @(
        "compose", "exec", "-T", "postgres",
        "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
        "-t", "-A", "-c", $findClickSql
    )
    $clickIdOutput = & docker @psqlFindArgs 2>&1
    $findExit = $LASTEXITCODE

    if ($findExit -ne 0) {
        Write-Warn "click_events query failed (Docker/psql unavailable)."
        $dbChecks += "[WARN] DB: click_events query failed"
    } else {
        $clickId = ($clickIdOutput | Out-String).Trim()

        if ($clickId -eq "" -or $clickId -like "*0 rows*" -or $clickId -like "*does not exist*") {
            Write-Warn "No click_events row found (table may not exist or click was not billed)."
            $dbChecks += "[WARN] DB: click_events row not found"
            $dbChecks += "       Click billing requires prior impression status='billable'."
            $dbChecks += "       If fraud blocked the viewability event, click billing is also blocked."
        } else {
            Write-Ok ("click_events row found")

            # Query click ledger entries
            $clickLedgerSql = "SELECT entry_type, amount_microcents FROM ledger_entries WHERE reference_type = 'click' AND reference_id = '" + $clickId + "' ORDER BY entry_type;"
            $psqlClickArgs = @(
                "compose", "exec", "-T", "postgres",
                "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
                "-t", "-A", "-F", "|", "-c", $clickLedgerSql
            )
            $clickLedgerOutput = & docker @psqlClickArgs 2>&1
            $clickLedgerExit = $LASTEXITCODE

            if ($clickLedgerExit -ne 0) {
                $dbChecks += "[WARN] DB: click ledger_entries query failed"
            } else {
                $clickLedgerLines = @(($clickLedgerOutput | Out-String).Trim() -split "`n" | Where-Object { $_.Trim() -ne "" })
                Write-Info ("  click ledger_entries rows: " + $clickLedgerLines.Count)

                $advertiserAmount = $null
                $developerAmount  = $null
                $platformAmount   = $null

                foreach ($line in $clickLedgerLines) {
                    $parts = $line.Trim() -split "\|"
                    if ($parts.Count -lt 2) { continue }
                    $entryType = $parts[0].Trim()
                    $amount    = $parts[1].Trim()
                    Write-Info ("    " + $entryType + ": " + $amount + " microcents")
                    if ($entryType -eq "advertiser_charge")   { $advertiserAmount = [long]$amount }
                    elseif ($entryType -eq "developer_credit") { $developerAmount = [long]$amount }
                    elseif ($entryType -eq "platform_fee")     { $platformAmount  = [long]$amount }
                }

                if ($null -eq $advertiserAmount -or $null -eq $developerAmount -or $null -eq $platformAmount) {
                    $dbChecks += "[WARN] DB: click ledger_entries missing entry types"
                    $dbChecks += ("       Found " + $clickLedgerLines.Count + " rows, expected 3")
                    if ($clickFraud -eq "block") {
                        $dbChecks += "       Click fraud decision was 'block' - billing intentionally skipped"
                    }
                } else {
                    $dbChecks += "[PASS] DB: 3 click ledger_entries rows found"
                    $dbChecks += ("         advertiser_charge:  " + $advertiserAmount + " microcents")
                    $dbChecks += ("         developer_credit:   " + $developerAmount + " microcents")
                    $dbChecks += ("         platform_fee:       " + $platformAmount + " microcents")
                    $dbVerified = $true

                    if ($developerAmount + $platformAmount -eq $advertiserAmount) {
                        $invariantOk = $true
                        $dbChecks += ("[PASS] Click invariant: developer_credit (" + $developerAmount + ") + platform_fee (" + $platformAmount + ") == advertiser_charge (" + $advertiserAmount + ")")
                    } else {
                        $dbChecks += ("[FAIL] CLICK INVARIANT VIOLATED: " + $developerAmount + " + " + $platformAmount + " != " + $advertiserAmount)
                        Write-Err ("CLICK INVARIANT FAILED: " + $developerAmount + " + " + $platformAmount + " != " + $advertiserAmount)
                    }
                }
            }
        }
    }
} else {
    Write-Warn "Skipping Postgres verification (-NoDbVerify)."
    $dbChecks += "[SKIP] DB: ledger verification skipped (-NoDbVerify)"
}

# ---------------------------------------------------------------------------
# Write report
# ---------------------------------------------------------------------------

Write-Step "Writing click-billing smoke report"

$reportDir = Join-Path $RepoRoot "apps/browser-extension/test-results/local-billing"
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$timestamp  = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$reportFile = Join-Path $reportDir ("click-billing-smoke-" + $timestamp + ".md")

$allPassed     = ($clickStatus -eq "accepted") -and $dbVerified -and $invariantOk
$overallResult = if ($allPassed) { "PASS" } else { "FAIL" }

$reportLines = @(
    "# Click-Billing Smoke - " + $overallResult,
    "",
    "Date: " + (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss UTC"),
    "API URL: " + $ApiUrl,
    "Adapter: browser_chatgpt",
    "CPM Bid: " + $cpmBid + " microcents",
    "",
    "## Event Submission",
    "",
    "[" + (if ($reqResult.data.status -eq "accepted") { "PASS" } else { "WARN" }) + "] impression_requested: " + $reqResult.data.status,
    "[" + (if ($rendResult.data.status -eq "accepted") { "PASS" } else { "WARN" }) + "] impression_rendered: " + $rendResult.data.status,
    "[" + (if ($viewStatus -eq "accepted") { "PASS" } else { "FAIL" }) + "] viewability_threshold_met: " + $viewStatus + " (fraud: " + $fraudDecision + ")",
    "[" + (if ($clickStatus -eq "accepted") { "PASS" } else { "FAIL" }) + "] click: " + $clickStatus + " (fraud: " + $clickFraud + ")",
    "",
    "## Click Billing Rate",
    "",
    "Click billing = 10x impression rate (CPM/1000 * 10).",
    "Example for 10000 microcent CPM: click value = 100000 microcents.",
    "",
    "## Postgres Click Ledger Verification",
    ""
)

foreach ($c in $dbChecks) { $reportLines += $c }

$reportLines += ""
$reportLines += "## Result"
$reportLines += ""
$reportLines += $overallResult
$reportLines += ""

if ($overallResult -eq "PASS") {
    $reportLines += "Click billing verified: click event accepted, 3 click ledger entries created,"
    $reportLines += "invariant developer_credit + platform_fee === advertiser_charge confirmed."
} else {
    $reportLines += "Click billing verification FAILED. See checks above."
    if (-not $dbVerified) {
        $reportLines += "PARTIAL: Click billing requires a prior billable impression."
        $reportLines += "If the fraud scorer blocked the viewability event, click billing is also blocked."
        $reportLines += "This is expected behavior: click billing is not end-to-end verified in local dev."
    }
}

$reportContent = $reportLines -join "`n"
Set-Content -Path $reportFile -Value $reportContent -Encoding UTF8
Write-Ok ("Report written to: " + $reportFile)

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

if ($apiJobHandle) {
    Write-Step "Stopping background API job"
    Stop-Job -Job $apiJobHandle -ErrorAction SilentlyContinue
    Remove-Job -Job $apiJobHandle -Force -ErrorAction SilentlyContinue
    Write-Ok "Background API job stopped"
}

Write-Separator
Write-Host ""
Write-Host (Get-Content $reportFile -Raw)
Write-Host ""
Write-Separator

if ($overallResult -eq "PASS") {
    Write-Ok "Click-billing smoke PASSED."
    exit 0
} else {
    Write-Err "Click-billing smoke FAILED or PARTIAL."
    Write-Info "Note: Click billing in local dev may be PARTIAL/BLOCKED (no billing reconciler)."
    Write-Info "See docs/CHATGPT_BROWSER_BETA_READINESS_CHECKLIST.md section 13."
    exit 1
}
