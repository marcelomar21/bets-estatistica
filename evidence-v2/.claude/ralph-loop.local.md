---
active: true
iteration: 1
session_id: 
max_iterations: 30
completion_promise: "ALL AUDIT FIXES COMPLETE"
started_at: "2026-03-12T18:58:35Z"
---

Fix all findings from evidence-v2/audit-findings.yaml one by one. Track progress in evidence-v2/fix-tracker.md. For each finding: 1. Read the finding details from the YAML, 2. Investigate the relevant code, 3. Implement the fix, 4. Test via Playwright MCP by logging in as group_admin with email icarocr30@gmail.com password XNvsVZAzn5$ at localhost:3000, 5. Take a screenshot as evidence, 6. Update fix-tracker.md marking the item DONE, 7. Update evidence-v2/audit-report.html adding a green FIXED badge next to the finding. Work in priority order: CRASH-001 first then AUTH then SEC then others. Skip items marked SKIP in the tracker. Create a feature branch fix/audit-v2-findings before starting. Run npm test and npm run build in admin-panel before finishing. When ALL items are DONE or SKIP, write ALL AUDIT FIXES COMPLETE
