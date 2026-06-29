# PromptProfit — ChatGPT Browser Extension Smoke Test Script
# Platform: Windows PowerShell 5.1+
# Usage: .\scripts\manual-chatgpt-browser-smoke.ps1
#
# This script builds the extension and opens Chrome to the unpacked-load URL.
# It does NOT automate the ChatGPT interaction (that must be done manually per
# the CHATGPT_BROWSER_LOCAL_SMOKE_TEST.md checklist).

param(
    [string]$ApiBaseUrl = "http://localhost:3000",
    [string]$ChromePath = "",
    [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---- Locate repo root -------------------------------------------------------
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ExtDir   = Join-Path $RepoRoot "apps\browser-extension"
$DistDir  = Join-Path $ExtDir "dist"

Write-Host ""
Write-Host "==================================================="
Write-Host " PromptProfit ChatGPT Browser Smoke Test"
Write-Host "==================================================="
Write-Host ""

# ---- Step 1: Build ----------------------------------------------------------
if (-not $SkipBuild) {
    Write-Host "[1/4] Building browser extension..."
    Push-Location $RepoRoot
    try {
        & pnpm --filter "@ad-alt/browser-extension" build
        if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }
    Write-Host "      Build OK."
} else {
    Write-Host "[1/4] Skipping build (-SkipBuild)."
}

# ---- Step 2: Copy manifest --------------------------------------------------
Write-Host "[2/4] Ensuring manifest.json is in dist/..."
$Manifest = Join-Path $ExtDir "manifest.json"
if (-not (Test-Path $Manifest)) {
    Write-Warning "manifest.json not found at $Manifest — extension may fail to load."
} else {
    Copy-Item $Manifest (Join-Path $DistDir "manifest.json") -Force
    Write-Host "      manifest.json copied."
}

# Ensure icons directory is present if it exists in the source
$IconsSrc = Join-Path $ExtDir "icons"
if (Test-Path $IconsSrc) {
    $IconsDst = Join-Path $DistDir "icons"
    Copy-Item $IconsSrc $IconsDst -Recurse -Force
    Write-Host "      icons/ copied."
}

# ---- Step 3: Locate Chrome --------------------------------------------------
Write-Host "[3/4] Locating Chrome..."
$CandidatePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Chromium\Application\chrome.exe"
)
if ($ChromePath -eq "" ) {
    foreach ($p in $CandidatePaths) {
        if (Test-Path $p) { $ChromePath = $p; break }
    }
}
if ($ChromePath -eq "" -or -not (Test-Path $ChromePath)) {
    Write-Host ""
    Write-Host "Chrome not found. Please load the extension manually:"
    Write-Host "  1. Open chrome://extensions"
    Write-Host "  2. Enable Developer mode"
    Write-Host "  3. Load unpacked -> $DistDir"
    Write-Host ""
} else {
    Write-Host "      Chrome found: $ChromePath"
}

# ---- Step 4: Print manual steps ---------------------------------------------
Write-Host ""
Write-Host "[4/4] Manual steps required:"
Write-Host ""
Write-Host "  A. Open Chrome and navigate to: chrome://extensions"
Write-Host "  B. Enable Developer mode (top-right toggle)"
Write-Host "  C. Click 'Load unpacked' and select:"
Write-Host "       $DistDir"
Write-Host ""
Write-Host "  D. Open the extension's service-worker console and run:"
Write-Host "       chrome.storage.local.set({ apiBaseUrl: '$ApiBaseUrl' })"
Write-Host ""
Write-Host "  E. Navigate to: https://chatgpt.com"
Write-Host "  F. Send a message and observe:"
Write-Host "       - No console errors on page load"
Write-Host "       - GET_AD_DECISION message in service-worker console"
Write-Host "       - Sponsored banner appears (bottom-right) while AI generates"
Write-Host "       - Banner has 'PromptProfit · Sponsored' label and close button"
Write-Host "       - Banner does not cover prompt input or AI response"
Write-Host "       - Close button dismisses the banner"
Write-Host "       - Banner disappears when AI finishes generating"
Write-Host ""
Write-Host "  G. Kill-switch test:"
Write-Host "       chrome.storage.local.set({ featureFlags: { killSwitchEnabled: true, disabledAdapters: [], flags: {} } })"
Write-Host "       Reload tab -> no banner should appear"
Write-Host ""
Write-Host "  H. Record results in docs\CHATGPT_BROWSER_LOCAL_SMOKE_TEST.md"
Write-Host ""
Write-Host "Full instructions: docs\CHATGPT_BROWSER_LOCAL_SMOKE_TEST.md"
Write-Host ""

# Optionally launch Chrome (non-blocking)
if ($ChromePath -ne "" -and (Test-Path $ChromePath)) {
    $Launch = Read-Host "Launch Chrome now? [y/N]"
    if ($Launch -eq "y" -or $Launch -eq "Y") {
        Start-Process $ChromePath "chrome://extensions"
        Write-Host "Chrome launched. Follow steps A-H above."
    }
}

Write-Host "Done."
