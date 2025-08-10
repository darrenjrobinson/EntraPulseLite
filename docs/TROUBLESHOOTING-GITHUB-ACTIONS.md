# GitHub Actions Troubleshooting Guide

## Common Issues and Solutions

### 1. "src refspec matches more than one" Error

**Problem**: Git error when pushing tags that conflict with branch names.

**Error Message**:
```
error: src refspec v1.0.0 matches more than one
error: failed to push some refs to 'https://github.com/...'
```

**Root Cause**: When both a branch and a tag have the same name (e.g., `v1.0.0`), Git commands become ambiguous.

**Solution**: Use explicit ref specifications in all Git operations:

```bash
# ❌ Ambiguous - could match branch or tag
git push origin v1.0.0

# ✅ Explicit - only matches tag
git push origin refs/tags/v1.0.0

# ❌ Ambiguous - could match branch or tag
git rev-parse v1.0.0

# ✅ Explicit - only checks tag
git rev-parse refs/tags/v1.0.0
```

**Workflow Fixes Applied**:
- All `git push origin $VERSION` changed to `git push origin refs/tags/$VERSION`
- All `git rev-parse $VERSION` changed to `git rev-parse refs/tags/$VERSION`
- All checkout `ref: $VERSION` changed to `ref: refs/tags/$VERSION`

### 2. Tag Already Exists Error

**Problem**: Attempting to create a tag that already exists.

**Error Message**:
```
error: tag 'v1.0.0' not found.
release not found
```

**Solution**: The workflows now include proper cleanup:

```bash
# Check if tag exists specifically (not branch)
if git rev-parse "refs/tags/$VERSION" >/dev/null 2>&1; then
  echo "Tag $VERSION already exists. Deleting and recreating..."
  git tag -d "$VERSION" || true
  git push origin :refs/tags/$VERSION || true
fi

# Delete existing GitHub release if it exists
gh release delete "$VERSION" --yes --cleanup-tag || true
```

### 3. Checkout Reference Issues

**Problem**: GitHub Actions checkout step fails to find the correct reference.

**Solution**: Use explicit tag references in all checkout steps:

```yaml
# ❌ Ambiguous
- uses: actions/checkout@v4
  with:
    ref: ${{ github.event.inputs.version }}

# ✅ Explicit
- uses: actions/checkout@v4
  with:
    ref: refs/tags/${{ github.event.inputs.version }}
```

### 4. Release Creation Failures

**Problem**: GitHub release creation fails due to existing releases or missing artifacts.

**Prevention**:
1. Always delete existing releases before creating new ones
2. Use `--cleanup-tag` option to clean up associated tags
3. Verify tag push before proceeding with builds

```bash
# Delete existing release (if any)
gh release delete "$VERSION" --yes --cleanup-tag || true

# Verify tag was pushed successfully
if git ls-remote --tags origin | grep -q "refs/tags/$VERSION"; then
  echo "✅ Tag $VERSION successfully pushed to remote"
else
  echo "❌ Tag $VERSION not found on remote"
  exit 1
fi
```

## Workflow-Specific Troubleshooting

### Multi-Platform Signed Release

**File**: `.github/workflows/release-multiplatform-signed.yml`

**Common Issues**:
- Windows code signing certificate issues
- macOS/Linux build failures
- Release finalization problems

**Debug Steps**:
1. Check the "create-release" job for tag creation issues
2. Verify each platform job completes successfully
3. Check artifact upload logs
4. Ensure release finalization completes

### Manual Release

**File**: `.github/workflows/manual-release.yml`

**Common Issues**:
- Input validation failures
- Build environment issues
- Artifact upload problems

**Debug Steps**:
1. Verify version format matches regex: `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$`
2. Check Windows build environment setup
3. Verify code signing secrets are available

### Beta Release Workflows

**Files**: 
- `.github/workflows/beta-release-signed.yml`
- `.github/workflows/beta-release-unsigned.yml`

**Common Issues**:
- Branch naming conventions
- Version numbering conflicts
- Pre-release flag issues

**Debug Steps**:
1. Ensure branch follows naming pattern (for push-triggered workflows)
2. Use unique version numbers for each beta
3. Verify pre-release settings

## Best Practices

### Version Numbering

1. **Use Semantic Versioning**: `v1.0.0`, `v1.0.1`, `v1.1.0`
2. **Beta Versions**: `v1.0.0-beta.1`, `v1.0.0-beta.2`
3. **Avoid Conflicts**: Don't create branches with the same name as tags

### Git Operations

1. **Always Use Full Refs**: `refs/tags/v1.0.0` instead of `v1.0.0`
2. **Clean Up Before Creating**: Delete existing tags/releases before creating new ones
3. **Verify Operations**: Check that tags are pushed successfully before proceeding

### Workflow Design

1. **Separate Concerns**: Use separate jobs for tag creation and building
2. **Add Verification**: Verify each step completes successfully
3. **Use Dependencies**: Ensure proper job dependencies with `needs:`

## Emergency Recovery

### If a Workflow is Stuck

1. **Cancel the Workflow**: Go to Actions tab and cancel the running workflow
2. **Clean Up Manually**: Delete problematic tags and releases manually
3. **Check Repository State**: Ensure no conflicting branches/tags exist
4. **Retry with Fixes**: Re-run the workflow with corrected inputs

### If Tags/Releases are Corrupted

```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Delete GitHub release (using gh CLI)
gh release delete v1.0.0 --yes --cleanup-tag

# Recreate properly
git tag v1.0.0
git push origin refs/tags/v1.0.0
```

## Getting Help

1. **Check Logs**: Always check the full workflow logs in the Actions tab
2. **Repository State**: Verify the state of tags and branches
3. **GitHub Status**: Check [GitHub Status](https://www.githubstatus.com/) for service issues
4. **Documentation**: Refer to [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Prevention

1. **Test Workflows**: Test on feature branches before using on main
2. **Use Dry Run**: Implement dry-run options where possible
3. **Monitor Regularly**: Check workflow success rates and common failures
4. **Keep Updated**: Update workflow dependencies and actions regularly
