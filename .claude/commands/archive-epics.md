---
description: 'Full epic archiving: moves completed epics to epics-completed.md, relocates story files to archive/epic-X/, tech-specs to archive/tech-specs/, and cleans sprint-status.yaml. Keeps workspace lean and context-efficient for AI agents.'
---

# Archive Epics - Epic Lifecycle Management

This is a standalone workflow (preserved outside `_bmad/` to survive bmad updates).

## Configuration

- **epics_file**: `docs/epics.md` (or wherever your epics.md lives)
- **epics_completed_file**: `docs/archive/epics-completed.md`
- **implementation_artifacts**: `docs/implementation-artifacts/`
- **sprint_status_file**: `docs/implementation-artifacts/sprint-status.yaml`
- **archive_folder**: `docs/archive/`

> If paths differ in your project, check `_bmad/bmm/config.yaml` for `output_folder` and `planning_artifacts`.

## Mode Selection

Ask the user which mode to run:

- **A** - Archive Epics: Move completed epics to epics-completed.md
- **S** - Status: View which epics are complete vs active
- **T** - Archive Tech-Specs: Move tech-spec files to archive/tech-specs/

---

## Mode A — Archive Epics

### Step 1: Load and analyze epics file

1. Read the FULL epics file
2. Parse the structure — extract frontmatter and all `## Epic N:` headers
3. For each epic, determine status:
   - **Completed**: All stories marked done, OR epic explicitly marked complete in sprint-status.yaml
   - **Active**: Has stories in progress, ready-for-dev, or backlog
   - **Pending**: Not started yet
4. Count epics by status

### Step 2: Show analysis and confirm

Display a table with all epics and their status. Show how many are completed, active, pending.

Ask the user:
- **Y** — Yes, archive all completed epics
- **N** — Cancel
- **C** — Custom: select specific epics to archive

### Step 3: Execute archive

1. Ensure archive folder exists
2. If `epics-completed.md` doesn't exist, create it with frontmatter and overview
3. For each epic to archive:
   - Extract the full epic content (from `## Epic N:` to next `## Epic` or end)
   - Append to `epics-completed.md`
   - Remove from `epics.md`
4. Update frontmatter in both files (epicCount, activeEpics, archivedAt)

### Step 4: Archive implementation artifacts

1. For each archived epic, scan implementation-artifacts for matching files:
   - Story files: pattern `{epic_number}-*.md`
   - Retrospective files: pattern `epic-{epic_number}-retro*.md`
   - Validation reports: pattern `validation-report-{epic_number}-*.md`
2. Show the list and ask for confirmation
3. Create `archive/epic-{number}/` folders and move files
4. Clean sprint-status.yaml — remove all entries for archived epics

### Step 5: Final report

Show summary: epics archived, files moved, context reduction percentages.

---

## Mode S — Status Report

1. Read both `epics.md` and `archive/epics-completed.md`
2. Display table of active epics (with story count and status)
3. Display table of archived epics (with archived date)
4. Show summary with line counts and totals
5. If any epics appear complete, suggest running mode A

---

## Mode T — Archive Tech-Specs

1. Scan implementation-artifacts for `tech-spec-*.md` files
2. Show the list and ask for confirmation
3. Create `archive/tech-specs/` if needed
4. Move all tech-spec files there
5. Report results
