#!/usr/bin/env pwsh
<#
.SYNOPSIS
Emergency cleanup script for Git tags and GitHub releases

.DESCRIPTION
This script helps clean up problematic tags and releases that might cause
GitHub Actions workflows to fail. Use this when you have conflicting
branch/tag names or corrupted releases.

.PARAMETER Version
The version tag to clean up (e.g., v1.0.0)

.PARAMETER Force
Skip confirmation prompts

.PARAMETER DryRun
Show what would be done without actually doing it

.EXAMPLE
.\scripts\cleanup-release.ps1 -Version "v1.0.0"

.EXAMPLE
.\scripts\cleanup-release.ps1 -Version "v1.0.0" -Force

.EXAMPLE
.\scripts\cleanup-release.ps1 -Version "v1.0.0" -DryRun
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    
    [switch]$Force,
    
    [switch]$DryRun
)

# Validate version format
if (-not ($Version -match '^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$')) {
    Write-Error "Invalid version format. Expected: v1.0.0 or v1.0.0-beta.1"
    exit 1
}

Write-Host "🧹 Emergency Release Cleanup Tool" -ForegroundColor Cyan
Write-Host "Target Version: $Version" -ForegroundColor Yellow

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Magenta
}

# Function to run git commands with proper error handling
function Invoke-GitCommand {
    param([string]$Command, [string]$Description)
    
    if ($DryRun) {
        Write-Host "DRY RUN: Would execute: $Command" -ForegroundColor Gray
        return $true
    }
    
    Write-Host "Executing: $Description" -ForegroundColor Green
    Invoke-Expression $Command
    return $LASTEXITCODE -eq 0
}

# Function to run gh CLI commands
function Invoke-GHCommand {
    param([string]$Command, [string]$Description)
    
    if ($DryRun) {
        Write-Host "DRY RUN: Would execute: $Command" -ForegroundColor Gray
        return $true
    }
    
    Write-Host "Executing: $Description" -ForegroundColor Green
    Invoke-Expression $Command
    return $LASTEXITCODE -eq 0
}

# Check if we're in a git repository
if (-not (Test-Path ".git")) {
    Write-Error "Not in a Git repository. Please run this script from the repository root."
    exit 1
}

# Check if gh CLI is available
try {
    gh --version | Out-Null
} catch {
    Write-Error "GitHub CLI (gh) is not installed or not in PATH. Please install it from https://cli.github.com/"
    exit 1
}

if (-not $Force -and -not $DryRun) {
    Write-Host ""
    Write-Host "⚠️  WARNING: This will perform the following actions:" -ForegroundColor Yellow
    Write-Host "   • Delete local tag: $Version" -ForegroundColor Yellow
    Write-Host "   • Delete remote tag: $Version" -ForegroundColor Yellow
    Write-Host "   • Delete GitHub release: $Version" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Are you sure you want to continue? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Operation cancelled." -ForegroundColor Gray
        exit 0
    }
}

Write-Host ""
Write-Host "🔍 Checking current state..." -ForegroundColor Cyan

# Check if local tag exists
$localTagExists = git rev-parse "refs/tags/$Version" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Local tag $Version exists" -ForegroundColor Yellow
} else {
    Write-Host "ℹ Local tag $Version does not exist" -ForegroundColor Gray
}

# Check if remote tag exists
$remoteTagExists = git ls-remote --tags origin | Select-String "refs/tags/$Version"
if ($remoteTagExists) {
    Write-Host "✓ Remote tag $Version exists" -ForegroundColor Yellow
} else {
    Write-Host "ℹ Remote tag $Version does not exist" -ForegroundColor Gray
}

# Check if GitHub release exists
if (-not $DryRun) {
    $releaseExists = gh release view $Version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ GitHub release $Version exists" -ForegroundColor Yellow
    } else {
        Write-Host "ℹ GitHub release $Version does not exist" -ForegroundColor Gray
    }
} else {
    Write-Host "DRY RUN: Would check for GitHub release $Version" -ForegroundColor Gray
}

# Check if there's a branch with the same name
$branchExists = git rev-parse "refs/heads/$Version" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "⚠️  WARNING: Branch $Version exists - this might cause conflicts!" -ForegroundColor Red
    if (-not $Force -and -not $DryRun) {
        Write-Host ""
        Write-Host "Consider renaming or deleting the branch first:" -ForegroundColor Yellow
        Write-Host "  git branch -m $Version ${Version}-branch" -ForegroundColor Gray
        Write-Host "  # or" -ForegroundColor Gray
        Write-Host "  git branch -D $Version" -ForegroundColor Gray
        Write-Host ""
        $confirm = Read-Host "Continue anyway? (y/N)"
        if ($confirm -ne 'y' -and $confirm -ne 'Y') {
            Write-Host "Operation cancelled." -ForegroundColor Gray
            exit 0
        }
    }
} else {
    Write-Host "✓ No conflicting branch found" -ForegroundColor Green
}

Write-Host ""
Write-Host "🧹 Starting cleanup..." -ForegroundColor Cyan

# 1. Delete GitHub release first (this also cleans up the tag)
Write-Host "Step 1: Deleting GitHub release (if exists)..."
if (-not (Invoke-GHCommand "gh release delete `"$Version`" --yes --cleanup-tag" "Delete GitHub release $Version")) {
    Write-Host "Note: Release may not have existed or failed to delete" -ForegroundColor Gray
}

# 2. Delete local tag
Write-Host "Step 2: Deleting local tag (if exists)..."
if (-not (Invoke-GitCommand "git tag -d `"$Version`"" "Delete local tag $Version")) {
    Write-Host "Note: Local tag may not have existed" -ForegroundColor Gray
}

# 3. Delete remote tag
Write-Host "Step 3: Deleting remote tag (if exists)..."
if (-not (Invoke-GitCommand "git push origin :refs/tags/$Version" "Delete remote tag $Version")) {
    Write-Host "Note: Remote tag may not have existed" -ForegroundColor Gray
}

# 4. Verify cleanup
Write-Host ""
Write-Host "🔍 Verifying cleanup..." -ForegroundColor Cyan

if (-not $DryRun) {
    # Check local tag
    git rev-parse "refs/tags/$Version" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✅ Local tag $Version successfully removed" -ForegroundColor Green
    } else {
        Write-Host "❌ Local tag $Version still exists" -ForegroundColor Red
    }

    # Check remote tag
    $remoteTagCheck = git ls-remote --tags origin | Select-String "refs/tags/$Version"
    if (-not $remoteTagCheck) {
        Write-Host "✅ Remote tag $Version successfully removed" -ForegroundColor Green
    } else {
        Write-Host "❌ Remote tag $Version still exists" -ForegroundColor Red
    }

    # Check GitHub release
    gh release view $Version 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✅ GitHub release $Version successfully removed" -ForegroundColor Green
    } else {
        Write-Host "❌ GitHub release $Version still exists" -ForegroundColor Red
    }
} else {
    Write-Host "DRY RUN: Would verify that all cleanup operations succeeded" -ForegroundColor Gray
}

Write-Host ""
if ($DryRun) {
    Write-Host "🔍 DRY RUN COMPLETE - No actual changes were made" -ForegroundColor Magenta
    Write-Host "To execute these changes, run again without -DryRun" -ForegroundColor Gray
} else {
    Write-Host "🎉 Cleanup complete!" -ForegroundColor Green
    Write-Host "You can now safely create a new release for $Version" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "💡 Next steps:" -ForegroundColor Cyan
Write-Host "   1. Ensure you're on the correct branch/commit" -ForegroundColor Gray
Write-Host "   2. Use GitHub Actions to create the release" -ForegroundColor Gray
Write-Host "   3. Or manually create tag: git tag $Version && git push origin refs/tags/$Version" -ForegroundColor Gray
