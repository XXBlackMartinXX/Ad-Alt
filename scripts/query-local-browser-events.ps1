<#
.SYNOPSIS
    Query the local Postgres database for recent browser ad events without
    returning any private user data.

.DESCRIPTION
    Connects to the local PromptProfit Postgres instance (started via Docker
    Compose) and queries the events table for recent browser_chatgpt entries.

    PRIVACY: This script queries ONLY columns that contain ad identifiers and
    extension metadata - never page content, user prompts, AI responses,
    cookies, auth tokens, or any private data.

    The columns it reads are:
      id, created_at, event_type, adapter_id, ad_decision_id,
      creative_id, campaign_id, session_id, sequence_number, duration_ms

    It never reads:
      page_url, page_title, dom_text, prompt_text, user_data,
      or any unstructured JSON that might contain private content.

.PARAMETER Help
    Show usage information and exit.

.PARAMETER Limit
    Number of most-recent events to return. Defaults to 20.

.PARAMETER SinceMinutes
    Return only events created in the last N minutes. Omit to show all.

.PARAMETER EventType
    Filter by event type (e.g. impression_requested, impression_rendered,
    viewability_threshold_met, click). Omit to show all types.

.PARAMETER Adapter
    Filter by adapter ID (e.g. chatgpt). Omit to show all adapters.

.PARAMETER Json
    Output results as JSON instead of table format.

.PARAMETER DbHost
    Postgres host. Defaults to 127.0.0.1.

.PARAMETER Port
    Postgres port. Defaults to 5432.

.PARAMETER Database
    Database name. Defaults to ad_alt_dev.

.PARAMETER Username
    Postgres username. Defaults to postgres.

.EXAMPLE
    # Show the 20 most-recent browser events
    .\scripts\query-local-browser-events.ps1

.EXAMPLE
    # Show last 5 impression_requested events
    .\scripts\query-local-browser-events.ps1 -Limit 5 -EventType impression_requested

.EXAMPLE
    # Show events from the last 10 minutes as JSON
    .\scripts\query-local-browser-events.ps1 -SinceMinutes 10 -Json

.EXAMPLE
    # Show only chatgpt adapter events
    .\scripts\query-local-browser-events.ps1 -Adapter chatgpt

.NOTES
    Requires: Docker services running (docker compose up -d postgres)
              psql (PostgreSQL client) in PATH
              Set PGPASSWORD env var if the database requires a non-default password.
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [int]$Limit         = 20,
    [int]$SinceMinutes  = 0,
    [string]$EventType  = "",
    [string]$Adapter    = "",
    [switch]$Json,
    [string]$DbHost     = "127.0.0.1",
    [int]$Port          = 5432,
    [string]$Database   = "ad_alt_dev",
    [string]$Username   = "postgres"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Help mode
# ---------------------------------------------------------------------------

if ($Help) {
    Write-Host ""
    Write-Host "SYNOPSIS" -ForegroundColor Cyan
    Write-Host "  Query the local Postgres database for recent browser ad events."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  .\scripts\query-local-browser-events.ps1 [-Limit <int>] [-SinceMinutes <int>]"
    Write-Host "                                            [-EventType <string>] [-Adapter <string>]"
    Write-Host "                                            [-Json] [-DbHost <host>] [-Port <int>]"
    Write-Host "                                            [-Database <name>] [-Username <user>]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -Help            Show this help and exit."
    Write-Host "  -Limit <int>     Number of most-recent events to return (default: 20)."
    Write-Host "  -SinceMinutes    Return only events from the last N minutes."
    Write-Host "  -EventType       Filter: impression_requested | impression_rendered |"
    Write-Host "                           viewability_threshold_met | click"
    Write-Host "  -Adapter         Filter by adapter ID (e.g. chatgpt)."
    Write-Host "  -Json            Output as JSON (psql --tuples-only + \\x on)."
    Write-Host "  -DbHost          Postgres host (default: 127.0.0.1)."
    Write-Host "  -Port            Postgres port (default: 5432)."
    Write-Host "  -Database        Database name (default: ad_alt_dev)."
    Write-Host "  -Username        Postgres username (default: postgres)."
    Write-Host ""
    Write-Host "PRIVACY"
    Write-Host "  Only ad metadata columns are read: id, created_at, event_type,"
    Write-Host "  adapter_id, ad_decision_id, creative_id, campaign_id, session_id,"
    Write-Host "  sequence_number, duration_ms."
    Write-Host "  Never reads: page_url, page_title, dom_text, prompt_text, user_data."
    Write-Host ""
    Write-Host "PREREQUISITES"
    Write-Host "  docker compose up -d postgres"
    Write-Host "  pnpm db:migrate && pnpm db:seed"
    Write-Host "  psql in PATH (PostgreSQL client tools)"
    Write-Host ""
    exit 0
}

# ---------------------------------------------------------------------------
# Check psql is available
# ---------------------------------------------------------------------------

try {
    $psqlVer = (& psql --version 2>&1).ToString().Trim()
    Write-Host ("Using: " + $psqlVer) -ForegroundColor DarkGray
} catch {
    Write-Host "[ERR] psql not found in PATH." -ForegroundColor Red
    Write-Host "      Install PostgreSQL client tools or add psql to your PATH." -ForegroundColor Red
    Write-Host "      On macOS:  brew install libpq && brew link --force libpq" -ForegroundColor DarkGray
    Write-Host "      On Ubuntu: sudo apt-get install postgresql-client" -ForegroundColor DarkGray
    exit 1
}

# ---------------------------------------------------------------------------
# Build privacy-safe query
# ---------------------------------------------------------------------------

# PRIVACY: select only ad-side metadata columns, never user/content data.
$selectCols = @(
    "id",
    "created_at",
    "event_type",
    "adapter_id",
    "ad_decision_id",
    "creative_id",
    "campaign_id",
    "session_id",
    "sequence_number",
    "duration_ms"
) -join ", "

$where = @("1=1")

if ($SinceMinutes -gt 0) {
    $where += ("created_at >= NOW() - INTERVAL '" + $SinceMinutes + " minutes'")
}

if ($EventType -ne "") {
    $allowed = @("impression_requested","impression_rendered","viewability_threshold_met","click")
    if ($EventType -notin $allowed) {
        Write-Host ("[ERR] Unknown event type '" + $EventType + "'.") -ForegroundColor Red
        Write-Host ("      Allowed values: " + ($allowed -join ", ")) -ForegroundColor DarkGray
        exit 1
    }
    $where += ("event_type = '" + $EventType + "'")
}

if ($Adapter -ne "") {
    if ($Adapter -notmatch '^[a-zA-Z0-9_-]+$') {
        Write-Host ("[ERR] Invalid adapter value '" + $Adapter + "' (alphanumeric/hyphen only).") -ForegroundColor Red
        exit 1
    }
    $where += ("adapter_id = '" + $Adapter + "'")
}

$whereClause = "WHERE " + ($where -join " AND ")

if ($Json) {
    $query = @"
SELECT row_to_json(t) FROM (
  SELECT $selectCols
  FROM   ad_events
  $whereClause
  ORDER  BY created_at DESC
  LIMIT  $Limit
) t;
"@
} else {
    $query = @"
SELECT $selectCols
FROM   ad_events
$whereClause
ORDER  BY created_at DESC
LIMIT  $Limit;
"@
}

# ---------------------------------------------------------------------------
# Run query
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "[--] Querying local Postgres for recent browser ad events..." -ForegroundColor Cyan
Write-Host "[--] Privacy: only ad metadata columns are read - no user/content data" -ForegroundColor DarkGray
if ($SinceMinutes -gt 0) {
    Write-Host ("[--] Filtering: last " + $SinceMinutes + " minutes") -ForegroundColor DarkGray
}
if ($EventType -ne "") {
    Write-Host ("[--] Filtering: event_type = " + $EventType) -ForegroundColor DarkGray
}
if ($Adapter -ne "") {
    Write-Host ("[--] Filtering: adapter_id = " + $Adapter) -ForegroundColor DarkGray
}
Write-Host ""

if (-not $env:PGPASSWORD) {
    $env:PGPASSWORD = "postgres"
}

$psqlArgs = @(
    ("--host=" + $DbHost),
    ("--port=" + $Port),
    ("--username=" + $Username),
    ("--dbname=" + $Database),
    ("--command=" + $query)
)

& psql @psqlArgs
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "[ERR] psql exited with code $exitCode." -ForegroundColor Red
    Write-Host "      Check that Docker services are running: docker compose up -d postgres" -ForegroundColor DarkGray
    Write-Host ("      And that database '" + $Database + "' exists: pnpm db:migrate && pnpm db:seed") -ForegroundColor DarkGray
    exit $exitCode
}
