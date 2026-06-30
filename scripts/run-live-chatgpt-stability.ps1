<#
.SYNOPSIS
    Runs the live ChatGPT smoke test N times and reports aggregate stability.

.DESCRIPTION
    Repeatedly invokes the live ChatGPT smoke test (pnpm smoke:chatgpt:live),
    collects PASSED / FAILED / INCONCLUSIVE results from the generated
    Markdown reports, and prints an aggregate summary.

    Each individual run is a separate Playwright process that opens Chromium
    with the extension loaded and navigates to ChatGPT. Results are determined
    from the report written to test-results/live/ after each run.

    PRIVACY: This script never reads ChatGPT page content, user prompts,
    AI responses, cookies, auth tokens, or any private data. It only checks
    the result summary in the generated Markdown report.

.PARAMETER Runs
    Number of smoke-test runs to perform. Default: 3.

.PARAMETER DelayBetweenRunsSeconds
    Seconds to wait between runs to allow the browser to fully close and
    Playwright to release resources. Default: 5.

.PARAMETER StopOnFail
    Stop immediately if any run produces a FAILED result. INCONCLUSIVE
    results do not trigger a stop.

.PARAMETER SkipBuild
    Skip `pnpm build:test` before the first run. Use when dist-test/ is
    already up to date.

.EXAMPLE
    # Run 3 stability checks (default)
    .\scripts\run-live-chatgpt-stability.ps1

.EXAMPLE
    # Run 5 times, stop on first failure, skip the build step
    .\scripts\run-live-chatgpt-stability.ps1 -Runs 5 -StopOnFail -SkipBuild

.NOTES
    Results are written as individual .md reports to
    apps/browser-extension/test-results/live/.
    INCONCLUSIVE typically means ChatGPT's wait-state was not detected
    within the timeout — not that the extension failed.
#>

[CmdletBinding()]
param(
    [int]$Runs = 3,
    [int]$DelayBetweenRunsSeconds = 5,
    [switch]$StopOnFail,
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Continue"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step([string]$msg)    { Write-Host "[>>] $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)      { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg)    { Write-Host "[!!] $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg)     { Write-Host "[XX] $msg" -ForegroundColor Red }
function Write-Separator            { Write-Host ("-" * 60) -ForegroundColor DarkGray }

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot   = Split-Path -Parent $ScriptDir
$ReportDir  = Join-Path $RepoRoot "apps/browser-extension/test-results/live"

Write-Host ""
Write-Host "===== Live ChatGPT Stability Runner =====" -ForegroundColor Magenta
Write-Host "  Runs:                $Runs"
Write-Host "  Delay between runs:  ${DelayBetweenRunsSeconds}s"
Write-Host "  Stop on failure:     $($StopOnFail.IsPresent)"
Write-Host "  Report dir:          $ReportDir"
Write-Host ""

# ---------------------------------------------------------------------------
# Optional build step
# ---------------------------------------------------------------------------

if (-not $SkipBuild) {
    Write-Step "Building dist-test/ bundle..."
    Push-Location $RepoRoot
    try {
        pnpm --filter @ad-alt/browser-extension build:test
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Build failed. Aborting stability run."
            exit 1
        }
        Write-Ok "Build complete."
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# Stability loop
# ---------------------------------------------------------------------------

$results = @()       # array of "PASSED" | "FAILED" | "INCONCLUSIVE" | "ERROR"

for ($i = 1; $i -le $Runs; $i++) {
    Write-Separator
    Write-Step "Run $i / $Runs"

    # Snapshot existing reports so we can detect the new one.
    $before = @()
    if (Test-Path $ReportDir) {
        $before = (Get-ChildItem -Path $ReportDir -Filter "*.md" | Select-Object -ExpandProperty FullName)
    }

    # Run the smoke test.
    Push-Location $RepoRoot
    try {
        pnpm smoke:chatgpt:live 2>&1
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }

    # Find the new report (the one not present before the run).
    $after = @()
    if (Test-Path $ReportDir) {
        $after = (Get-ChildItem -Path $ReportDir -Filter "*.md" |
                  Sort-Object LastWriteTime -Descending |
                  Select-Object -ExpandProperty FullName)
    }

    $newReport = $after | Where-Object { $before -notcontains $_ } | Select-Object -First 1

    $runResult = "ERROR"

    if ($newReport) {
        $content = Get-Content -Path $newReport -Raw
        if ($content -match "##\s+Result[^#]*\*\*(PASSED)\*\*") {
            $runResult = "PASSED"
        } elseif ($content -match "##\s+Result[^#]*\*\*(FAILED)\*\*") {
            $runResult = "FAILED"
        } elseif ($content -match "##\s+Result[^#]*\*\*(INCONCLUSIVE)\*\*") {
            $runResult = "INCONCLUSIVE"
        } else {
            # Try to detect from heading line
            if ($content -match "\bPASSED\b") { $runResult = "PASSED" }
            elseif ($content -match "\bFAILED\b") { $runResult = "FAILED" }
            elseif ($content -match "\bINCONCLUSIVE\b") { $runResult = "INCONCLUSIVE" }
        }
    } elseif ($exitCode -eq 0) {
        $runResult = "PASSED"
    }

    $results += $runResult

    switch ($runResult) {
        "PASSED"       { Write-Ok   "Run $i: PASSED" }
        "FAILED"       { Write-Err  "Run $i: FAILED" }
        "INCONCLUSIVE" { Write-Warn "Run $i: INCONCLUSIVE" }
        "ERROR"        { Write-Err  "Run $i: ERROR (no report written; exit code $exitCode)" }
    }

    if ($StopOnFail -and $runResult -eq "FAILED") {
        Write-Err "Stopping on first failure (--StopOnFail)."
        break
    }

    if ($i -lt $Runs) {
        Write-Info "  Waiting ${DelayBetweenRunsSeconds}s before next run..."
        Start-Sleep -Seconds $DelayBetweenRunsSeconds
    }
}

# ---------------------------------------------------------------------------
# Aggregate summary
# ---------------------------------------------------------------------------

Write-Separator
Write-Host ""
Write-Host "===== Stability Summary =====" -ForegroundColor Magenta

$passed       = ($results | Where-Object { $_ -eq "PASSED" }).Count
$failed       = ($results | Where-Object { $_ -eq "FAILED" }).Count
$inconclusive = ($results | Where-Object { $_ -eq "INCONCLUSIVE" }).Count
$errors       = ($results | Where-Object { $_ -eq "ERROR" }).Count
$total        = $results.Count

Write-Host "  Total runs:    $total"
Write-Host "  PASSED:        $passed" -ForegroundColor $(if ($passed -gt 0) { "Green" } else { "White" })
Write-Host "  FAILED:        $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "White" })
Write-Host "  INCONCLUSIVE:  $inconclusive" -ForegroundColor $(if ($inconclusive -gt 0) { "Yellow" } else { "White" })
Write-Host "  ERROR:         $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "White" })
Write-Host ""

if ($failed -gt 0 -or $errors -gt 0) {
    Write-Err "Stability run DEGRADED — $failed failure(s), $errors error(s) in $total runs."
    exit 1
} elseif ($inconclusive -gt 0) {
    Write-Warn "Stability run INCONCLUSIVE — $inconclusive run(s) timed out without triggering a wait-state."
    Write-Host "  Note: INCONCLUSIVE means ChatGPT's response-generation did not start within the"
    Write-Host "  timeout window, not that the adapter failed. Re-run after manually prompting ChatGPT."
    exit 0
} else {
    Write-Ok "Stability run PASSED — $passed/$total runs passed."
    exit 0
}
