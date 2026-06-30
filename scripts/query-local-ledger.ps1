<#
.SYNOPSIS
    Query local Postgres ledger_entries and balances tables for development.

.DESCRIPTION
    Queries the ledger_entries and balances tables in the local Docker Postgres
    instance. Shows recent ledger activity and account balances.

    Uses docker compose exec -T postgres psql (no local psql required).

    PRIVACY RULES:
    - Queries only ledger_entries and balances tables (no user content).
    - Selected columns contain only financial metadata (amounts, timestamps, types).
    - No API keys, no page content, no user-identifiable data.

.PARAMETER SinceMinutes
    Show ledger entries created within this many minutes. Default: 30.

.PARAMETER Limit
    Maximum number of ledger_entries rows to show. Default: 20.

.PARAMETER AccountType
    Filter by account type: "developer", "advertiser", "platform", or "all". Default: "all".

.PARAMETER ReferenceType
    Filter by reference type: "impression", "click", "refund", "payout", or "all". Default: "all".

.PARAMETER ShowBalances
    Also show the balances table.

.PARAMETER Help
    Show usage information and exit.

.EXAMPLE
    pnpm -w run query:local-ledger
    .\scripts\query-local-ledger.ps1

.EXAMPLE
    .\scripts\query-local-ledger.ps1 -AccountType developer -SinceMinutes 60

.NOTES
    Requires Docker with postgres container running.
    Run: docker compose up -d postgres
#>
[CmdletBinding()]
param(
    [switch]$Help,
    [int]$SinceMinutes     = 30,
    [int]$Limit            = 20,
    [string]$AccountType   = "all",
    [string]$ReferenceType = "all",
    [switch]$ShowBalances
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
    Write-Host "  Query local Postgres ledger_entries and balances for development."
    Write-Host ""
    Write-Host "USAGE"
    Write-Host "  pnpm -w run query:local-ledger"
    Write-Host "  .\scripts\query-local-ledger.ps1 [options]"
    Write-Host ""
    Write-Host "OPTIONS"
    Write-Host "  -SinceMinutes <int>       Lookback window (default: 30)"
    Write-Host "  -Limit <int>              Max rows (default: 20)"
    Write-Host "  -AccountType <type>       Filter: developer|advertiser|platform|all (default: all)"
    Write-Host "  -ReferenceType <type>     Filter: impression|click|refund|payout|all (default: all)"
    Write-Host "  -ShowBalances             Also show balances table"
    Write-Host ""
    exit 0
}

# Validate AccountType parameter (no SQL injection: only allow known values)
$allowedAccountTypes = @("all", "developer", "advertiser", "platform")
if ($AccountType -notin $allowedAccountTypes) {
    Write-Err ("Invalid AccountType: '" + $AccountType + "'. Use: " + ($allowedAccountTypes -join ", "))
    exit 1
}

$allowedReferenceTypes = @("all", "impression", "click", "refund", "payout")
if ($ReferenceType -notin $allowedReferenceTypes) {
    Write-Err ("Invalid ReferenceType: '" + $ReferenceType + "'. Use: " + ($allowedReferenceTypes -join ", "))
    exit 1
}

if ($Limit -lt 1 -or $Limit -gt 500) {
    Write-Err "Limit must be between 1 and 500."
    exit 1
}

# ---------------------------------------------------------------------------
# Query ledger_entries
# ---------------------------------------------------------------------------

Write-Step ("Querying ledger_entries (last " + $SinceMinutes + " minutes, limit " + $Limit + ")")

$whereClause = "created_at > NOW() - INTERVAL '" + $SinceMinutes + " minutes'"
if ($AccountType -ne "all") {
    $whereClause += " AND account_type = '" + $AccountType + "'"
}
if ($ReferenceType -ne "all") {
    $whereClause += " AND reference_type = '" + $ReferenceType + "'"
}

$ledgerSql = "SELECT entry_type, reference_type, account_type, amount_microcents, balance_after_microcents, created_at FROM ledger_entries WHERE " + $whereClause + " ORDER BY created_at DESC LIMIT " + $Limit + ";"

$psqlArgs = @(
    "compose", "exec", "-T", "postgres",
    "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
    "-c", $ledgerSql
)

Write-Info ("SQL: " + $ledgerSql)
Write-Host ""

$output = & docker @psqlArgs 2>&1
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
# Query balances (optional)
# ---------------------------------------------------------------------------

if ($ShowBalances) {
    Write-Step "Querying balances"

    $balanceSql = "SELECT account_id, account_type, balance_microcents, updated_at FROM balances ORDER BY account_type, account_id LIMIT 20;"

    $psqlBalArgs = @(
        "compose", "exec", "-T", "postgres",
        "psql", "-U", "promptprofit", "-d", "promptprofit_dev",
        "-c", $balanceSql
    )

    Write-Info "SQL: SELECT account_id, account_type, balance_microcents, updated_at FROM balances"
    Write-Host ""

    $balOutput = & docker @psqlBalArgs 2>&1
    $balExit   = $LASTEXITCODE

    if ($balExit -ne 0) {
        Write-Warn "balances query failed."
    } else {
        foreach ($line in $balOutput) {
            Write-Host (Sanitize "$line")
        }
    }
}

Write-Host ""
Write-Ok "Query complete."
exit 0
