<#
.SYNOPSIS
    Opens the latest live ChatGPT smoke report in the default Markdown viewer.

.DESCRIPTION
    Finds the most recently written .md report in
    apps/browser-extension/test-results/live/ and opens it with Invoke-Item
    (respects the OS default app for .md files). Also prints the report
    contents to the console.

    If no reports exist, prints a message and exits cleanly.

.PARAMETER PrintOnly
    Print the report to the console without opening the default viewer.

.PARAMETER ReportDir
    Override the directory to search. Defaults to
    apps/browser-extension/test-results/live/ relative to the repo root.

.EXAMPLE
    # Open the latest report in the default viewer
    .\scripts\open-latest-live-chatgpt-report.ps1

.EXAMPLE
    # Print the latest report to the console only
    .\scripts\open-latest-live-chatgpt-report.ps1 -PrintOnly

.NOTES
    Run `pnpm smoke:chatgpt:live` first to generate a report.
    PRIVACY: This script reads only the generated report file, not any
    ChatGPT page content.
#>

[CmdletBinding()]
param(
    [switch]$PrintOnly,
    [string]$ReportDir = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Ok([string]$msg)   { Write-Host "[OK]  $msg" -ForegroundColor Green }
function Write-Info([string]$msg) { Write-Host "[--]  $msg" -ForegroundColor Cyan }
function Write-Err([string]$msg)  { Write-Host "[ERR] $msg" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Locate report directory
# ---------------------------------------------------------------------------

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot  = Split-Path -Parent $ScriptDir

if ($ReportDir -eq "") {
    $ReportDir = Join-Path $RepoRoot "apps/browser-extension/test-results/live"
}

if (-not (Test-Path $ReportDir)) {
    Write-Info "No report directory found at: $ReportDir"
    Write-Info "Run 'pnpm smoke:chatgpt:live' to generate a report."
    exit 0
}

# ---------------------------------------------------------------------------
# Find the latest report
# ---------------------------------------------------------------------------

$reports = Get-ChildItem -Path $ReportDir -Filter "*.md" -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending

if ($reports.Count -eq 0) {
    Write-Info "No .md reports found in: $ReportDir"
    Write-Info "Run 'pnpm smoke:chatgpt:live' to generate a report."
    exit 0
}

$latest = $reports[0]

Write-Ok "Latest report: $($latest.FullName)"
Write-Ok "Written:       $($latest.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"

if ($reports.Count -gt 1) {
    Write-Info "($($reports.Count - 1) older report(s) also available in $ReportDir)"
}

# ---------------------------------------------------------------------------
# Print report contents
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "---"
Write-Host (Get-Content -Path $latest.FullName -Raw)
Write-Host "---"
Write-Host ""

# ---------------------------------------------------------------------------
# Open in default viewer
# ---------------------------------------------------------------------------

if (-not $PrintOnly) {
    try {
        Invoke-Item $latest.FullName
        Write-Ok "Opened in default viewer."
    } catch {
        Write-Err "Could not open default viewer: $_"
        Write-Info "View the file manually at: $($latest.FullName)"
        exit 1
    }
}
