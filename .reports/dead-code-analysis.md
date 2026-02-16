# Dead Code Analysis Report

**Date**: 2025-02-06
**Project**: OpenCode
**Analysis Tools**: depcheck, ts-prune, manual inspection

---

## Executive Summary

After thorough analysis, minimal dead code was found. Most dependencies flagged by depcheck are **actively used** by the project.

**Key Finding**: Only 1-2 files can be safely removed immediately.

---

## 1. Dependency Verification Results

| Package | depcheck Status | Actual Usage | Verdict |
|---------|-----------------|--------------|---------|
| `@aws-sdk/client-s3` | Unused | **IN USE** - SDK functionality | KEEP |
| `@e2b/code-interpreter` | Unused | **IN USE** - E2B sandbox, VNC adapter | KEEP |
| `@opencode-ai/plugin` | Unused | **IN USE** - Plugin system | KEEP |
| `@opencode-ai/sdk` | Unused | **IN USE** - SDK package | KEEP |
| `cron-parser` | Unused | **IN USE** - scheduler/cron.ts, scheduler/service.ts | KEEP |
| `quansync` | Unused | **NOT FOUND** - Can be removed | REMOVE |
| `typescript` | Unused | **IN USE** - Dev dependency for type checking | KEEP |

### Dev Dependencies

| Package | Status | Verdict |
|---------|--------|---------|
| `@actions/artifact` | Likely unused | Can investigate |
| `@types/dockerode` | Required | KEEP |
| `glob` | Superseded by bun | Can remove |
| `prettier` | Required | KEEP |
| `sst` | Unknown | Investigate |

---

## 2. Files Safe to Remove

### HIGH CONFIDENCE - IMMEDIATE DELETION

| File/Directory | Size | Reason |
|----------------|------|--------|
| `nul` | 64 bytes | Invalid Windows filename, contains garbage/error output |
| `.backup/old-browser-tools/` | ~18KB | Backup directory from 2025-02-05, not referenced in code |

### MEDIUM CONFIDENCE - VERIFY FIRST

| File/Directory | Issue | Action |
|----------------|-------|--------|
| `packages/opencode/test/keybind.test.ts` | Imports non-existent module | **Fix or Delete** |

---

## 3. Unused Exports Summary

**ts-prune analysis**: 95KB+ output, mostly false positives:
- Vite config exports (intentionally unused)
- Test utilities
- Type-only exports
- Plugin hook interfaces

**No action recommended** - manual review required per export.

---

## 4. Test Suite Status

⚠️ **Tests are NOT passing** - prevents automated verification of dead code removal.

| Test File | Issue | Impact |
|-----------|-------|--------|
| `packages/opencode/tools.test.ts` | Wrong test API (`test.beforeAll`) | Tests don't run |
| `packages/opencode/test/keybind.test.ts` | Missing import target | Can't verify removal |
| `packages/app/src/addons/serialize.test.ts` | No DOM environment | Tests fail |

**Recommendation**: Fix tests before aggressive cleanup.

---

## 5. Safe Removal Commands

### Step 1: Remove Invalid File

```bash
rm nul
```

### Step 2: Remove Backup Directory (After Manual Review)

```bash
# First verify contents are truly obsolete
ls -la .backup/old-browser-tools/

# If confirmed, remove:
rm -rf .backup/
```

### Step 3: Potentially Remove Unused Dependency

```bash
# After verifying quansync is not needed:
bun remove quansync
```

---

## 6. Dependency Usage Evidence

### E2B Code Interpreter (ACTIVE - KEEP)
```
packages/opencode/src/container/e2b-lifecycle.ts
packages/opencode/src/sandbox/backend/e2b.ts
packages/opencode/src/server/vnc-adapter.ts
+ 5 test files
```

### Cron Parser (ACTIVE - KEEP)
```
packages/opencode/src/scheduler/cron.ts
packages/opencode/src/scheduler/service.ts
```

### Quansync (NOT FOUND - CAN REMOVE)
```
No usage found in packages/
```

---

## 7. Action Plan

### Immediate (Safe)
1. ✅ Delete `nul` file
2. ✅ Review and delete `.backup/` directory
3. ✅ Remove `quansync` dependency

### Short Term (After Test Fixes)
1. Fix `tools.test.ts` test API
2. Decide on `keybind.test.ts` (fix or delete)
3. Re-run analysis with passing tests

### Long Term (Optional)
1. Configure knip for ongoing dead code detection
2. Set up pre-commit hooks for dependency checking
3. Review `@actions/artifact` and `sst` usage

---

## 8. Prevention

Add to `.gitignore`:
```
# Invalid Windows filenames
nul
CON
PRN
AUX
CLOCK$
NUL
COM*
LPT*

# Backup directories
.backup/
*.backup.*
```

---

## Conclusion

**Dead code found**: Minimal (~18KB in backup files + 1 invalid file)

**Recommendation**:
1. Delete `nul` and `.backup/` immediately
2. Remove `quansync` dependency
3. Fix test suite before further cleanup
4. Set up automated dead code detection (knip) for prevention

**Risk Level**: LOW - Identified files are safe to remove.
