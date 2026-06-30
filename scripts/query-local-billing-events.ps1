<#
.SYNOPSIS
    Query local Postgres impression_events with billing status for development.

.DESCRIPTION
    Queries the impression_events table in the local Docker Postgres instance.
    Shows impression records with their billing status (requested, rendered,
    viewable, billable, fraud_blocked, reconciled).

    Uses docker compose exec -T postgres psql (no local psql required).

    PRIVACY RULES:
    - Only queries billing-relevant columns (status, amounts, timestamps, IDs).
    - No user content, page text, DOM data, or sensitive identifiers.
    - ad_decision_id, campaign_id, creative_id are backend-assigned identifiers.
    - device_id is the pseudonymous device identifier (no user identity link).

.PARAMETER SinceMinutes
    Show events created within this many minutes. Default: 30.

.PARAMETER Limit
    Maximum number of rows to show. Default: 20.

.PARAMETER Status
    Filter by billing status: requested|rendered|viewable|billable|fraud_blocked|reconciled|all.
    Default: "all".

.PARAMETER Adapter
    Filter by adapter name (e.g., "chatgpt", "browser_chatgpt"). Default: "" (no filter).

.PARAMETER Help
    Show usage information and exit.

.EXAMPLE
    pnpm -w run query:local-billing-events
    .\scripts\query-local-billing-events.ps1

.EXAMPLE
    .\scripts\query-local-billing-events.ps1 -Status billable -Adapter chatgpt

.NOTES
    Requires Docker with postgres container running.
    Run: docker compose up -d postgres
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [int]$SinceMinutes  = 30,
    [int]$Limit         = 20,
    [string]$Status     = "all",
    [string]$Adapter    = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

function Write-Step([string]$msg)  { Write-Host ""; Write-Host ("[>>] " + $msg) -ForegroundColor Cyan }
function Write-Ok([string]$msg)    { Write-Host ("[OK] " + $msg) -ForegroundColor Green }
function Write-Info([string]$msg)  { Write-Host ("[--] " + $msg) -ForegroundColor Cyan }
function Write-Warn([string]$msg)  { Write-Host ("[!!] " + $msg) -ForegroundColor Yellow }
function Write-Err([string]$msg)   { Write-Host ("[XX] " + $msg) -ForegroundColor Red }

function Sanitize([string]$text) {
    return ($text -replace '[^\x20-\x7E]', '?').TrimEnd()
}

if ($Help) {
    Write-Host ""
    Write-Host "SYNOPSIS" -ForegroundColor Cyan
    Write-Host "  Query local Postgres impression_events with billing status."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  pnpm -w run query:local-billing-events"
    Write-Host "  .\scripts\query-local-billing-events.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -SinceMinutes <int>  Lookback window (default: 30)"
    Write-Host "  -Limit <int>         Max rows (default: 20)"
    Write-Host "  -Status <status>     Filter: requested|rendered|viewable|billable|fraud_blocked|reconciled|all"
    Write-Host "  -Adapter <name>      Filter by adapter name (e.g., chatgpt)"
    Write-Host ""
    Write-Host "BILLING STATUS MEANINGS"
    Write-Host "  requested      - impression_requested event received"
    Write-Host "  rendered       - impression_rendered event received"
    Write-Host "  viewable       - viewability event received, fraud=review (not yet billed)"
    Write-Host "  billable       - viewability event received, fraud=pass (ledger written)"
    Write-Host "  fraud_blocked  - viewability event received, fraud=block (not billed)"
    Write-Host "  reconciled     - billing reconciled (post-staging only)"
    Write-Host ""
    exit 0
}

# Validate Status (prevent SQL injection: only allow known values)
$allowedStatuses = @("all", "requested", "rendered", "viewable", "billable", "fraud_blocked", "reconciled")
if ($Status -notin $allowedStatuses) {
    Write-Err ("Invalid Status: '" + $Status + "'. Use: " + ($allowedStatuses -join ", "))
    exit 1
}

# Validate Adapter (only alphanumeric + underscore + hyphen)
if ($Adapter -ne "" -and $Adapter -notmatch '^[a-zA-Z0-9_-]+$') {
    Write-Err "Invalid Adapter name. Only alphanumeric characters, underscores, and hyphens are allowed."
    exit 1
}

if ($Limit -lt 1 -or $Limit -gt 500) {
    Write-Err "Limit must be between 1 and 500."
    exit 1
}

# ---------------------------------------------------------------------------
# Query impression_events
# ---------------------------------------------------------------------------

Write-Step ("Querying impression_events (last " + $SinceMinutes + " minutes, limit " + $Limit + ")")

$whereClause = "created_at > NOW() - INTERVAL '" + $SinceMinutes + " minutes'"
if ($Status -ne "all") {
    $whereClause += " AND status = '" + $Status + "'"
}
if ($Adapter -ne "") {
    $whereClause += " AND adapter_name LIKE '%" + $Adapter + "%'"
}

$sql = "SELECT id, status, adapter_name, ad_decision_id, campaign_id, device_id, created_at FROM impression_events WHERE " + $whereClause + " ORDER BY created_at DESC LIMIT " + $Limit + ";"

$psqlArgs = @(
    "compose", "exec", "-T", "postgres",
    "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
    "-c", $sql
)

Write-Info ("SQL: SELECT id, status, adapter_name, ad_decision_id, campaign_id, device_id, created_at FROM impression_events WHERE " + $whereClause)
Write-Host ""

$output   = & docker @psqlArgs 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Err "docker compose exec postgres psql failed."
    Write-Err "Is Docker running and is the postgres container healthy?"
    Write-Err "Run: docker compose up -d postgres"
    exit 2
}

foreach ($line in $output) {
    Write-Host (Sanitize "$line")
}

# ---------------------------------------------------------------------------
# Show billing summary
# ---------------------------------------------------------------------------

Write-Step "Billing status summary"

$summarySql = "SELECT status, COUNT(*) as count FROM impression_events WHERE created_at > NOW() - INTERVAL '" + $SinceMinutes + " minutes' GROUP BY status ORDER BY status;"

$psqlSumArgs = @(
    "compose", "exec", "-T", "postgres",
    "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
    "-c", $summarySql
)

$sumOutput  = & docker @psqlSumArgs 2>&1
$sumExit    = $LASTEXITCODE

if ($sumExit -eq 0) {
    foreach ($line in $sumOutput) {
        Write-Host (Sanitize "$line")
    }
} else {
    Write-Warn "Could not get billing summary."
}

Write-Host ""
Write-Ok "Query complete."
exit 0
