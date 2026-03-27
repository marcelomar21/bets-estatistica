---
name: 'bmad-ralph-loop'
description: 'Autonomous BMAD implementation pipeline via Ralph Loop. Implements ALL stories across all epics from the current release — create-story, dev-story, code-review — in a continuous loop.'
---

# Autonomous BMAD Pipeline — Ralph Loop

## Mission

Implement ALL non-"done" stories in the current release using the full BMAD workflow pipeline. Each story passes through create-story → dev-story → code-review automatically.

## State Detection

Read `_bmad-output/implementation-artifacts/sprint-status.yaml`.
Find the FIRST non-"done" story (top to bottom, starting from the first `backlog` epic).

## Cycle Per Story

Based on the story's current status:

1. **"backlog"** → Load `_bmad/bmm/workflows/4-implementation/create-story/workflow.yaml`
   and its `instructions.xml`. Auto-discover this story from sprint-status.
   Create the comprehensive story file. NO user interaction.

2. **"ready-for-dev"** or **"in-progress"** → Load
   `_bmad/bmm/workflows/4-implementation/dev-story/workflow.yaml` and its
   `instructions.xml`. Implement ALL tasks until complete. Run tests.
   Execute continuously — do NOT pause.

3. **"review"** → Load `_bmad/bmm/workflows/4-implementation/code-review/workflow.yaml`
   and its `instructions.xml`. Run adversarial review. Then IMMEDIATELY fix
   ALL findings (accept everything). After fixing, mark story "done" in
   sprint-status.yaml.

After completing a phase, check sprint-status again and continue with the
next phase or story in the SAME iteration. Maximize progress per iteration.

## Git Workflow

- Before starting Epic N (first story), create branch:
  `feature/epic-N-<short-description>`
- Commit after each story completes (conventional commits)
- NEVER commit to main/master
- NEVER merge — prepare PRs but do NOT create them yet

## Source Documents

- PRD: `_bmad-output/planning-artifacts/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture.md`
- Epics: `_bmad-output/planning-artifacts/epics.md`

## Validation (after each dev-story)

1. `cd admin-panel && npm test` — unit tests (Vitest)
2. `cd admin-panel && npm run build` — TypeScript strict build
3. **Playwright E2E** — open browser via Playwright MCP, test the affected flow on `localhost:3000`. Validate the FINAL result, not just intermediate actions.
4. Fix ALL failures before moving on — no skipping.

## Code Review (adversarial)

The adversarial review MUST be real:
- Load the code-review workflow instructions completely
- Review ALL changed files for the story
- Check architecture compliance, security, error handling, edge cases
- Findings are REAL — fix every single one
- After fixing, re-run validation (tests + build + Playwright)

## Critical Rules

- Follow BMAD workflow instructions EXACTLY
- Follow Architecture patterns from the project (createApiHandler, lib/logger.js, { success, data/error }, RLS, groupFilter)
- NEVER skip acceptance criteria
- NEVER lie about completion — verify with actual tests and Playwright
- Treat ALL code as production code — no shortcuts, no workarounds
- Investigate root causes, never apply band-aids

## Completion

When ALL stories in the current release are "done" in sprint-status.yaml:
Output: `<promise>ALL EPICS COMPLETE</promise>`
