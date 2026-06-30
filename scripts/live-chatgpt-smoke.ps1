<#
.SYNOPSIS
    Orchestrates the live ChatGPT smoke test for the PromptProfit browser extension.

.DESCRIPTION
    Runs the full live smoke test pipeline:
      1. Prerequisite checks (pnpm, Node.js, Docker / Chromium)
      2. Build the dist-test/ extension bundle
      3. Optionally start Docker services (Postgres, Redis, Maildev)
      4. Optionally start the local PromptProfit API
      5. Run Playwright (live ChatGPT spec or fixture-page spec)
      6. Write a Markdown smoke report

    PRIVACY: This script never reads ChatGPT page content, user prompts,
    AI responses, cookies, auth tokens, or any private data. It only
    orchestrates the local infrastructure and checks that extension-side
    ad events reach the local mock/real API.

.PARAMETER SkipBuild
    Skip 'pnpm build:test'. Use when dist-test/ is already up to date.

.PARAMETER SkipDocker
    Skip starting Docker services. Use when Postgres/Redis are already running.

.PARAMETER UseMockApi
    Run the fixture-page E2E suite (fully automated, no real ChatGPT needed)
    instead of the live ChatGPT test. Useful for CI/local regression.

.PARAMETER UseLocalApi
    Configure the extension to point to the local PromptProfit API
    (http://127.0.0.1:3001) instead of the embedded mock API.
    Requires Docker services to be running.

.PARAMETER Headed
    Force Playwright into headed mode (--headed flag) when running the
    fixture-page suite. The live ChatGPT test is always headed.

.PARAMETER KeepBrowserOpen
    Do not close the browser after the test completes. Allows manual inspection.

.PARAMETER NoReport
    Skip writing the Markdown summary report after the run.

.PARAMETER VerboseSafe
    Print extra progress information. Never prints secrets, API keys,
    page content, cookies, or any private data.

.EXAMPLE
    # Full automated run using fixture pages (no ChatGPT login required)
    .\scripts\live-chatgpt-smoke.ps1 -UseMockApi -Headed

.EXAMPLE
    # Full live run (requires manual ChatGPT login)
    .\scripts\live-chatgpt-smoke.ps1

.EXAMPLE
    # Live run, skip Docker (services already running), skip build
    .\scripts\live-chatgpt-smoke.ps1 -SkipBuild -SkipDocker

.NOTES
    Required: pnpm 9+, Node.js 20+, Docker (unless -SkipDocker / -UseMockApi)
    Chromium: automatically resolved via Playwright's managed binary.
              Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to override.
#>
[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$SkipDocker,
    [switch]$UseMockApi,
    [switch]$UseLocalApi,
    [switch]$Headed,
    [switch]$KeepBrowserOpen,
    [switch]$NoReport,
    [switch]$VerboseSafe
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step([string]$msg) {
    Write-Host ""
    Write-Host ">>> $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "    OK  $msg" -ForegroundColor Green
}

function Write-Warn([string]$msg) {
    Write-Host "    WARN $msg" -ForegroundColor Yellow
}

function Write-Fail([string]$msg) {
    Write-Host "    FAIL $msg" -ForegroundColor Red
}

function Write-Verbose-Safe([string]$msg) {
    if ($VerboseSafe) {
        Write-Host "    ... $msg" -ForegroundColor DarkGray
    }
}

function Invoke-Required([string]$cmd, [string[]]$args, [string]$workDir = $RepoRoot) {
    Write-Verbose-Safe "Running: $cmd $($args -join ' ')"
    $result = & $cmd @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Command failed: $cmd $($args -join ' ')"
        $result | ForEach-Object { Write-Host "    $_" }
        throw "Command exited with code $LASTEXITCODE"
    }
    return $result
}

# ---------------------------------------------------------------------------
# Resolve repository root
# ---------------------------------------------------------------------------

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot   = Split-Path -Parent $ScriptDir
$ExtDir     = Join-Path $RepoRoot "apps/browser-extension"
$ReportDir  = Join-Path $ExtDir   "test-results/live"
$Timestamp  = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host ""
Write-Host "PromptProfit  -  Live ChatGPT Smoke Test" -ForegroundColor White
Write-Host "=======================================" -ForegroundColor White
Write-Verbose-Safe "Repository root : $RepoRoot"
Write-Verbose-Safe "Extension dir   : $ExtDir"
Write-Verbose-Safe "Mode            : $(if ($UseMockApi) { 'Fixture/Mock' } else { 'Live ChatGPT' })"
Write-Verbose-Safe "API target      : $(if ($UseLocalApi) { 'local (127.0.0.1:3001)' } else { 'embedded mock' })"

# ---------------------------------------------------------------------------
# Step 1  -  Prerequisites
# ---------------------------------------------------------------------------

Write-Step "Checking prerequisites"

# pnpm
try {
    $pnpmVer = (& pnpm --version 2>&1).Trim()
    Write-Ok "pnpm $pnpmVer"
} catch {
    Write-Fail "pnpm not found. Install: https://pnpm.io/installation"
    exit 1
}

# Node.js
try {
    $nodeVer = (& node --version 2>&1).Trim()
    Write-Ok "Node.js $nodeVer"
} catch {
    Write-Fail "Node.js not found. Install: https://nodejs.org"
    exit 1
}

# Docker (only if not skipping)
if (-not $SkipDocker -and -not $UseMockApi) {
    try {
        $dockerVer = (& docker --version 2>&1).Trim()
        Write-Ok "Docker: $dockerVer"
        $dockerRunning = (& docker info 2>&1) | Select-String "Server Version"
        if (-not $dockerRunning) {
            Write-Fail "Docker daemon is not running. Start Docker Desktop or the Docker service."
            exit 1
        }
        Write-Ok "Docker daemon running"
    } catch {
        Write-Fail "Docker not found. Install: https://docs.docker.com/get-docker/"
        exit 1
    }
}

# Playwright / Chromium
$playwrightChromiumOverride = $env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
if ($playwrightChromiumOverride -and (Test-Path $playwrightChromiumOverride)) {
    Write-Ok "Chromium override: $playwrightChromiumOverride"
} else {
    # Let Playwright find its own managed binary  -  no explicit check needed.
    Write-Ok "Chromium: Playwright managed binary (or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)"
}

# ---------------------------------------------------------------------------
# Step 2  -  Build extension
# ---------------------------------------------------------------------------

if (-not $SkipBuild) {
    Write-Step "Building extension (dist-test/)"
    Push-Location $ExtDir
    try {
        Invoke-Required "pnpm" @("build:test")
        Write-Ok "dist-test/ built"
    } finally {
        Pop-Location
    }
} else {
    Write-Warn "Skipping build (-SkipBuild). Ensure dist-test/ is up to date."
}

# Verify dist-test/ exists
$DistTestDir = Join-Path $ExtDir "dist-test"
if (-not (Test-Path (Join-Path $DistTestDir "manifest.json"))) {
    Write-Fail "dist-test/manifest.json not found. Run without -SkipBuild."
    exit 1
}
Write-Verbose-Safe "dist-test/manifest.json present"

# ---------------------------------------------------------------------------
# Step 3  -  Start Docker services (if needed for live + real API mode)
# ---------------------------------------------------------------------------

if (-not $SkipDocker -and -not $UseMockApi -and $UseLocalApi) {
    Write-Step "Starting Docker services (Postgres, Redis, Maildev)"
    Push-Location $RepoRoot
    try {
        Invoke-Required "docker" @("compose", "up", "-d", "postgres", "redis", "maildev")
        Write-Ok "Docker services started"

        # Brief pause for Postgres to accept connections.
        Write-Verbose-Safe "Waiting 3s for Postgres to be ready..."
        Start-Sleep -Seconds 3
    } finally {
        Pop-Location
    }
} elseif ($SkipDocker) {
    Write-Warn "Skipping Docker (-SkipDocker)."
} else {
    Write-Verbose-Safe "Docker not needed for this run mode."
}

# ---------------------------------------------------------------------------
# Step 4  -  Local API health check (if -UseLocalApi)
# ---------------------------------------------------------------------------

if ($UseLocalApi) {
    Write-Step "Checking local API health (http://127.0.0.1:3001/health)"
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:3001/health" `
            -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Ok "Local API is healthy"
        } else {
            Write-Fail "Local API returned HTTP $($response.StatusCode)"
            exit 1
        }
    } catch {
        Write-Fail "Local API not reachable at http://127.0.0.1:3001/health"
        Write-Fail "Start the API with: pnpm --filter @ad-alt/api dev"
        exit 1
    }
    Write-Warn "NOTE: The local API requires a valid API key in the extension's apiBaseUrl."
    Write-Warn "      Without a seeded API key, POST /v1/events will return 401."
    Write-Warn "      For authenticated testing, seed a key or use the embedded mock (-UseMockApi)."
}

# ---------------------------------------------------------------------------
# Step 5  -  Run Playwright
# ---------------------------------------------------------------------------

$PlaywrightEnv = @{}
if ($UseLocalApi) {
    $PlaywrightEnv["LIVE_SMOKE_USE_LOCAL_API"] = "1"
}
if ($KeepBrowserOpen) {
    $PlaywrightEnv["LIVE_SMOKE_KEEP_BROWSER_OPEN"] = "1"
}

Push-Location $ExtDir
try {
    if ($UseMockApi) {
        # Fixture-page mode: run the standard E2E suite (fully automated).
        Write-Step "Running fixture E2E suite (no live ChatGPT required)"
        Write-Verbose-Safe "Command: pnpm exec playwright test$(if ($Headed) { ' --headed' })"

        $playwrightArgs = @("exec", "playwright", "test")
        if ($Headed) { $playwrightArgs += "--headed" }

        foreach ($key in $PlaywrightEnv.Keys) {
            $env:$key = $PlaywrightEnv[$key]
        }

        & pnpm @playwrightArgs
        $exitCode = $LASTEXITCODE
    } else {
        # Live mode: run the live ChatGPT spec.
        Write-Step "Running live ChatGPT smoke test"
        Write-Host ""
        Write-Host "  IMPORTANT: A Chromium window will open and navigate to chatgpt.com." -ForegroundColor Yellow
        Write-Host "  You must log in (if not already) and submit a prompt." -ForegroundColor Yellow
        Write-Host "  The test will detect the wait state automatically." -ForegroundColor Yellow
        Write-Host ""

        $playwrightArgs = @(
            "exec", "playwright", "test",
            "--config", "playwright.config.live.ts"
        )

        foreach ($key in $PlaywrightEnv.Keys) {
            $env:$key = $PlaywrightEnv[$key]
        }

        & pnpm @playwrightArgs
        $exitCode = $LASTEXITCODE
    }
} finally {
    Pop-Location
    # Clean up env vars set above.
    foreach ($key in $PlaywrightEnv.Keys) {
        Remove-Item Env:\$key -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Step 6  -  Report summary
# ---------------------------------------------------------------------------

$reportResult = "UNKNOWN"

if (-not $NoReport) {
    Write-Step "Report summary"

    if (Test-Path $ReportDir) {
        $reports = Get-ChildItem -Path $ReportDir -Filter "*.md" | Sort-Object LastWriteTime -Descending
        if ($reports.Count -gt 0) {
            $latest = $reports[0]
            $mdContent = Get-Content $latest.FullName -Raw

            # Detect result from the report heading (PASSED / FAILED / INCONCLUSIVE).
            if ($mdContent -match "# Live ChatGPT Smoke Test  -  (PASSED|FAILED|INCONCLUSIVE)") {
                $reportResult = $Matches[1]
            }

            Write-Ok "Latest report: $($latest.FullName)"
            Write-Host ""
            Write-Host $mdContent -ForegroundColor White
        } else {
            Write-Warn "No .md reports found in $ReportDir"
            Write-Warn "The report may not have been written  -  check for a Playwright timeout."
        }
    } else {
        if ($UseMockApi) {
            Write-Verbose-Safe "Fixture suite does not write to $ReportDir (see playwright-report/)."
        } else {
            Write-Warn "Report directory not found: $ReportDir"
            Write-Warn "The spec may have been killed before writing a report."
        }
    }
}

# ---------------------------------------------------------------------------
# Exit
# ---------------------------------------------------------------------------

Write-Host ""
switch ($reportResult) {
    "PASSED" {
        Write-Host "Smoke test PASSED" -ForegroundColor Green
    }
    "INCONCLUSIVE" {
        Write-Host "Smoke test INCONCLUSIVE" -ForegroundColor Yellow
        Write-Host "  The wait state was not detected  -  no prompt was submitted or the extension did not activate." -ForegroundColor Yellow
        Write-Host "  Re-run after confirming the extension loads and submitting a ChatGPT prompt within the window." -ForegroundColor Yellow
    }
    "FAILED" {
        Write-Host "Smoke test FAILED  -  banner or events did not appear as expected." -ForegroundColor Red
        Write-Host "  Check the report above for the specific failing check." -ForegroundColor Red
    }
    default {
        if ($exitCode -eq 0) {
            Write-Host "Smoke test completed (exit 0)" -ForegroundColor Green
        } else {
            Write-Host "Smoke test FAILED (exit code $exitCode)" -ForegroundColor Red
        }
    }
}
Write-Host ""
exit $exitCode
