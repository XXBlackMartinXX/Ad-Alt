<#
.SYNOPSIS
    Query the local Postgres database for recent browser ad events without
    returning any private user data.

.DESCRIPTION
    Connects to the local PromptProfit Postgres instance (started via Docker
    Compose) and queries the events table for recent browser_chatgpt entries.

    PRIVACY: This script queries ONLY columns that contain ad identifiers and
    extension metadata — never page content, user prompts, AI responses,
    cookies, auth tokens, or any private data.

    The columns it reads are:
      id, created_at, event_type, adapter_id, ad_decision_id,
      creative_id, campaign_id, session_id, sequence_number, duration_ms

    It never reads:
      page_url, page_title, dom_text, prompt_text, user_data,
      or any unstructured JSON that might contain private content.

.PARAMETER Last
    Number of most-recent events to return. Defaults to 20.

.PARAMETER EventType
    Filter by event type (e.g. impression_requested, impression_rendered,
    viewability_threshold_met, click). Omit to show all types.

.PARAMETER AdapterId
    Filter by adapter ID (e.g. chatgpt). Omit to show all adapters.

.PARAMETER Host
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
    .\scripts\query-local-browser-events.ps1 -Last 5 -EventType impression_requested

.NOTES
    Requires: Docker services running (docker compose up -d postgres)
              psql (PostgreSQL client) in PATH
              Or set PGPASSWORD env var if the database requires a password.
#>
[CmdletBinding()]
param(
    [int]$Last       = 20,
    [string]$EventType = "",
    [string]$AdapterId = "",
    [string]$DbHost   = "127.0.0.1",
    [int]$Port        = 5432,
    [string]$Database = "ad_alt_dev",
    [string]$Username = "postgres"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Check psql is available
# ---------------------------------------------------------------------------

try {
    $psqlVer = (& psql --version 2>&1).Trim()
    Write-Host "Using: $psqlVer" -ForegroundColor DarkGray
} catch {
    Write-Host "ERROR: psql not found in PATH." -ForegroundColor Red
    Write-Host "Install PostgreSQL client tools or add psql to your PATH." -ForegroundColor Red
    Write-Host "On macOS: brew install libpq && brew link --force libpq" -ForegroundColor DarkGray
    Write-Host "On Ubuntu: sudo apt-get install postgresql-client" -ForegroundColor DarkGray
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

$whereClause = "WHERE 1=1"
if ($EventType -ne "") {
    # Sanitize: allow only known event type values (no injection possible).
    $allowed = @("impression_requested","impression_rendered","viewability_threshold_met","click")
    if ($EventType -notin $allowed) {
        Write-Host "ERROR: Unknown event type '$EventType'." -ForegroundColor Red
        Write-Host "Allowed values: $($allowed -join ', ')" -ForegroundColor DarkGray
        exit 1
    }
    $whereClause += " AND event_type = '$EventType'"
}
if ($AdapterId -ne "") {
    # Sanitize: only alphanumeric and hyphens.
    if ($AdapterId -notmatch '^[a-zA-Z0-9_-]+$') {
        Write-Host "ERROR: Invalid adapter_id '$AdapterId'." -ForegroundColor Red
        exit 1
    }
    $whereClause += " AND adapter_id = '$AdapterId'"
}

$query = @"
SELECT $selectCols
FROM   ad_events
$whereClause
ORDER  BY created_at DESC
LIMIT  $Last;
"@

# ---------------------------------------------------------------------------
# Run query
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "Querying local Postgres for recent browser ad events..." -ForegroundColor Cyan
Write-Host "(Privacy: only ad metadata columns are read — no user/content data)" -ForegroundColor DarkGray
Write-Host ""

$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "postgres" }

$psqlArgs = @(
    "--host=$DbHost",
    "--port=$Port",
    "--username=$Username",
    "--dbname=$Database",
    "--command=$query"
)

& psql @psqlArgs
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Host ""
    Write-Host "ERROR: psql exited with code $exitCode." -ForegroundColor Red
    Write-Host "Check that Docker services are running: docker compose up -d postgres" -ForegroundColor DarkGray
    Write-Host "And that the database '$Database' exists: pnpm db:migrate && pnpm db:seed" -ForegroundColor DarkGray
    exit $exitCode
}
