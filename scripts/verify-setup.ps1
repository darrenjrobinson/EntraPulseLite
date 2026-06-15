#!/usr/bin/env pwsh
# Quick verification script for GitHub Actions setup

Write-Host "=== EntraPulse Lite GitHub Actions Setup Verification ===" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Run this script from the project root directory" -ForegroundColor Red
    exit 1
}

# Check package.json for required scripts
Write-Host "📦 Checking package.json scripts..." -ForegroundColor Yellow
$packageJson = Get-Content "package.json" | ConvertFrom-Json
$requiredScripts = @("build", "make", "test:ci")

foreach ($script in $requiredScripts) {
    if ($packageJson.scripts.PSObject.Properties.Name -contains $script) {
        Write-Host "✅ Script '$script' found" -ForegroundColor Green
    } else {
        Write-Host "❌ Script '$script' missing" -ForegroundColor Red
    }
}

# Check workflow files
Write-Host ""
Write-Host "🔄 Checking workflow files..." -ForegroundColor Yellow
$workflowFiles = @(
    ".github/workflows/manual-release.yml",
    ".github/workflows/beta-release-signed.yml", 
    ".github/workflows/beta-release-unsigned.yml",
    ".github/workflows/release-multiplatform-signed.yml"
)

foreach ($file in $workflowFiles) {
    if (Test-Path $file) {
        Write-Host "✅ Workflow file '$file' exists" -ForegroundColor Green
    } else {
        Write-Host "❌ Workflow file '$file' missing" -ForegroundColor Red
    }
}

# Check for old/removed workflow files
Write-Host ""
Write-Host "🗑️  Checking for removed workflow files..." -ForegroundColor Yellow
$removedFiles = @(
    ".github/workflows/beta-release-linux.yml",
    ".github/workflows/beta-release-macos.yml",
    ".github/workflows/beta-release-multiplatform.yml",
    ".github/workflows/beta-release-no-signing.yml",
    ".github/workflows/beta-release.yml"
)

foreach ($file in $removedFiles) {
    if (Test-Path $file) {
        Write-Host "⚠️  Old workflow file '$file' still exists (should be removed)" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Old workflow file '$file' properly removed" -ForegroundColor Green
    }
}

# Check certificate files (should be removed for security)
Write-Host ""
Write-Host "🔒 Checking certificate files..." -ForegroundColor Yellow
$certFiles = @(
    "DarrenJRobinson-CodeSigning.pfx",
    "DarrenJRobinson-CodeSigning-base64.txt"
)

foreach ($file in $certFiles) {
    if (Test-Path $file) {
        Write-Host "⚠️  Certificate file '$file' found - should be removed after setting up GitHub Secrets" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Certificate file '$file' not found (good for security)" -ForegroundColor Green
    }
}

# Check essential files
Write-Host ""
Write-Host "📁 Checking essential files..." -ForegroundColor Yellow
$essentialFiles = @(
    "copy-assets.js",
    "forge.config.js",
    "electron-builder-unsigned.json",
    "src/main/main.ts",
    "src/auth/AuthService.ts"
)

foreach ($file in $essentialFiles) {
    if (Test-Path $file) {
        Write-Host "✅ Essential file '$file' exists" -ForegroundColor Green
    } else {
        Write-Host "❌ Essential file '$file' missing" -ForegroundColor Red
    }
}

# Test local build
Write-Host ""
Write-Host "🔨 Testing local build..." -ForegroundColor Yellow
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Local build successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Local build failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Local build failed with error: $($_.Exception.Message)" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "✅ Setup verification complete" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Set up GitHub Secrets (WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD)" -ForegroundColor White
Write-Host "2. Test manual release workflow in GitHub Actions" -ForegroundColor White
Write-Host "3. Create beta branches to test automated workflows" -ForegroundColor White
Write-Host "4. Remove certificate files after GitHub Secrets are set" -ForegroundColor White
Write-Host ""
Write-Host "For detailed instructions, see docs/WORKFLOWS.md" -ForegroundColor Cyan
