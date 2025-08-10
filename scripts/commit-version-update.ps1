#!/usr/bin/env pwsh
# Script to stage and commit version update changes

Write-Host "Staging all changes for version update..." -ForegroundColor Green

# Stage all changes
git add -A

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to stage changes"
    exit 1
}

Write-Host "Changes staged successfully" -ForegroundColor Green
Write-Host "Creating commit for version update..." -ForegroundColor Green

# Create commit with simple message first, then add detailed description
git commit -m "feat: Update version from v1.0.0-beta.3 to v1.0.0" -m "Update package.json version field" -m "Update src/shared/version.ts VERSION constant" -m "Update all fallback version references in code" -m "Update MCP client version fields" -m "Update test files with new version" -m "Update package-lock.json" -m "This marks the transition from beta to stable release v1.0.0"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create commit"
    exit 1
}

Write-Host "Version update committed successfully!" -ForegroundColor Green
Write-Host "Version v1.0.0 is now ready" -ForegroundColor Cyan
