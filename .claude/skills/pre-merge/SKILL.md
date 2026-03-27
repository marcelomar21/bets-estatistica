# Pre-Merge Validation

Run the full validation pipeline before creating a PR.

## Steps

### 1. Unit Tests
```bash
cd admin-panel && npm test
```
All tests must pass. If any fail, fix them before proceeding.

### 2. TypeScript Build
```bash
cd admin-panel && npm run build
```
Must compile with zero errors (strict mode).

### 3. E2E Validation (Playwright MCP)

1. Ensure dev server is running (`npm run dev` in admin-panel)
2. Navigate to the affected page via Playwright MCP
3. Execute the complete flow that the change affects
4. Validate the **final result**, not just intermediate steps
5. If the flow touches Telegram, verify the message arrived correctly

### 4. Report

After all steps pass, output:

```
## Pre-Merge Report
- Unit tests: PASS (X tests)
- Build: PASS
- E2E: PASS (describe what was tested)
- Ready for PR: YES/NO
```

If any step fails, stop and report the failure with details.
