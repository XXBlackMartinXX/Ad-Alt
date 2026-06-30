<#
.SYNOPSIS
    Query the local Postgres database for recent browser impression events without
    returning any private user data.

.DESCRIPTION
    Connects to the local PromptProfit Postgres instance via Docker Compose
    (no local psql installation required) and queries the impression_events table
    for recent browser adapter entries.

    PRIVACY: This script queries ONLY columns that contain ad identifiers and
    extension metadata - never page content, user prompts, AI responses,
    cookies, auth tokens, or any private data.

    The columns it reads are:
      id, created_at, adapter_name, status, ad_decision_id,
      campaign_id, creative_id, device_id, requested_at, rendered_at

    It never reads:
      user_id, fraud_signals, idempotency_key, or any payload JSON.

.PARAMETER Help
    Show usage information and exit.

.PARAMETER Limit
    Number of most-recent events to return. Defaults to 20.

.PARAMETER SinceMinutes
    Return only events created in the last N minutes. Omit to show all.

.PARAMETER EventType
    Filter by event status (impression_requested=requested, impression_rendered=rendered,
    viewability_threshold_met=viewable). Omit to show all.

.PARAMETER Adapter
    Filter by adapter name substring (e.g. chatgpt). Omit to show all adapters.

.PARAMETER Json
    Output results as JSON rows using row_to_json().

.PARAMETER DbUser
    Postgres user. Defaults to promptprofit.

.PARAMETER DbName
    Database name. Defaults to promptprofit_dev.

.EXAMPLE
    # Show the 20 most-recent impression events
    .\scripts\query-local-browser-events.ps1

.EXAMPLE
    # Show last 5 events from chatgpt adapter
    .\scripts\query-local-browser-events.ps1 -Limit 5 -Adapter chatgpt

.EXAMPLE
    # Show events from the last 10 minutes as JSON
    .\scripts\query-local-browser-events.ps1 -SinceMinutes 10 -Json

.NOTES
    Requires: Docker daemon running with postgres container active.
              No local psql installation needed - uses docker compose exec.
    Run: docker compose up -d postgres
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [int]$Limit         = 20,
    [int]$SinceMinutes  = 0,
    [string]$EventType  = "",
    [string]$Adapter    = "",
    [switch]$Json,
    [string]$DbUser     = "promptprofit",
    [string]$DbName     = "promptprofit_dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ---------------------------------------------------------------------------
# Help mode
# ---------------------------------------------------------------------------

if ($Help) {
    Write-Host ""
    Write-Host "SYNOPSIS" -ForegroundColor Cyan
    Write-Host "  Query the local Postgres database for recent browser impression events."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  .\scripts\query-local-browser-events.ps1 [-Limit <int>] [-SinceMinutes <int>]"
    Write-Host "                                            [-EventType <string>] [-Adapter <string>]"
    Write-Host "                                            [-Json] [-DbUser <user>] [-DbName <name>]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -Help            Show this help and exit."
    Write-Host "  -Limit <int>     Number of most-recent events to return (default: 20)."
    Write-Host "  -SinceMinutes    Return only events from the last N minutes."
    Write-Host "  -EventType       Filter by status: impression_requested (=requested),"
    Write-Host "                   impression_rendered (=rendered), viewability_threshold_met (=viewable)."
    Write-Host "  -Adapter         Substring filter on adapter_name (e.g. chatgpt)."
    Write-Host "  -Json            Output as JSON rows."
    Write-Host "  -DbUser          Postgres user (default: promptprofit)."
    Write-Host "  -DbName          Database name (default: promptprofit_dev)."
    Write-Host ""
    Write-Host "PRIVACY"
    Write-Host "  Only safe metadata columns are read: id, created_at, adapter_name, status,"
    Write-Host "  ad_decision_id, campaign_id, creative_id, device_id, requested_at, rendered_at."
    Write-Host "  Never reads: user_id, fraud_signals, idempotency_key, payload JSON."
    Write-Host ""
    Write-Host "PREREQUISITES"
    Write-Host "  docker compose up -d postgres"
    Write-Host "  pnpm db:migrate && pnpm db:seed"
    Write-Host "  No local psql required - uses docker compose exec."
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Check docker is available
# ---------------------------------------------------------------------------

$dockerCheck = & docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERR] Docker daemon is not running or docker is not in PATH." -ForegroundColor Red
    Write-Host "      Start Docker Desktop, then retry." -ForegroundColor DarkGray
    exit 1
}

# ---------------------------------------------------------------------------
# Validate parameters
# ---------------------------------------------------------------------------

$statusFilter = ""
if ($EventType -ne "") {
    $statusMap = @{
        "impression_requested"    = "requested"
        "impression_rendered"     = "rendered"
        "viewability_threshold_met" = "viewable"
        "requested"               = "requested"
        "rendered"                = "rendered"
        "viewable"                = "viewable"
        "billable"                = "billable"
        "reconciled"              = "reconciled"
    }
    if ($statusMap.ContainsKey($EventType)) {
        $statusFilter = $statusMap[$EventType]
    } else {
        Write-Host ("[ERR] Unknown event type '" + $EventType + "'.") -ForegroundColor Red
        Write-Host "      Allowed: impression_requested, impression_rendered, viewability_threshold_met" -ForegroundColor DarkGray
        exit 1
    }
}

if ($Adapter -ne "" -and $Adapter -notmatch '^[a-zA-Z0-9_-]+$') {
    Write-Host ("[ERR] Invalid adapter value '" + $Adapter + "' (alphanumeric/hyphen only).") -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# Build privacy-safe query
# ---------------------------------------------------------------------------

# PRIVACY: select only ad-side metadata columns, never user/content data.
$selectCols = "id, created_at, adapter_name, status, ad_decision_id, campaign_id, creative_id, device_id, requested_at, rendered_at"

$where = @("1=1")

if ($SinceMinutes -gt 0) {
    $where += ("created_at >= NOW() - INTERVAL '" + $SinceMinutes + " minutes'")
}

if ($statusFilter -ne "") {
    $where += ("status = '" + $statusFilter + "'")
}

if ($Adapter -ne "") {
    $where += ("adapter_name LIKE '%" + $Adapter + "%'")
}

$whereClause = "WHERE " + ($where -join " AND ")

if ($Json) {
    $query = ("SELECT row_to_json(t) FROM (SELECT " + $selectCols + " FROM impression_events " + $whereClause + " ORDER BY created_at DESC LIMIT " + $Limit + ") t;")
} else {
    $query = ("SELECT " + $selectCols + " FROM impression_events " + $whereClause + " ORDER BY created_at DESC LIMIT " + $Limit + ";")
}

# ---------------------------------------------------------------------------
# Run query via docker compose exec (no local psql required)
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "[--] Querying local Postgres (impression_events) via Docker..." -ForegroundColor Cyan
Write-Host "[--] Privacy: only ad metadata columns read - no user/content data" -ForegroundColor DarkGray
if ($SinceMinutes -gt 0) {
    Write-Host ("[--] Filter: last " + $SinceMinutes + " minutes") -ForegroundColor DarkGray
}
if ($statusFilter -ne "") {
    Write-Host ("[--] Filter: status = " + $statusFilter) -ForegroundColor DarkGray
}
if ($Adapter -ne "") {
    Write-Host ("[--] Filter: adapter_name LIKE '%" + $Adapter + "%'") -ForegroundColor DarkGray
}
Write-Host ""

$psqlArgs = @(
    "compose", "exec", "-T", "postgres",
    "psql", "-U", $DbUser, "-d", $DbName,
    "-c", $query
)

& docker @psqlArgs
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[ERR] docker compose exec postgres psql failed (exit $exitCode)." -ForegroundColor Red
    Write-Host "      Check that Docker services are running: docker compose up -d postgres" -ForegroundColor DarkGray
    Write-Host ("      And that database '" + $DbName + "' exists: pnpm db:migrate && pnpm db:seed") -ForegroundColor DarkGray
    exit $exitCode
}
