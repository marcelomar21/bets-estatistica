# Archive Epics - Epic Lifecycle Management

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/_bmad/bmm/workflows/4-implementation/archive-epics/workflow.yaml</critical>
<critical>Modes: A (Archive Epics), S (Status), T (Archive Tech-Specs)</critical>

<workflow>

<step n="0" goal="Mode selection">
  <output>
## Archive Epics - Epic Lifecycle Management

This workflow helps keep your workspace lean by archiving completed epics and tech-specs.

**Select mode:**
- **A** - Archive Epics: Move completed epics to epics-completed.md
- **S** - Status: View which epics are complete vs active
- **T** - Archive Tech-Specs: Move tech-spec files to archive/tech-specs/
  </output>
  <ask>Select mode (A/S/T):</ask>

  <check if="mode == A or mode == a">
    <action>Jump to Step 10</action>
  </check>

  <check if="mode == S or mode == s">
    <action>Jump to Step 20</action>
  </check>

  <check if="mode == T or mode == t">
    <action>Jump to Step 30</action>
  </check>

  <output>Invalid selection. Please choose A, S, or T.</output>
  <action>Repeat Step 0</action>
</step>

<!-- ========================= -->
<!-- ARCHIVE MODE (A) -->
<!-- ========================= -->

<step n="10" goal="Load and analyze epics file">
  <action>Read the FULL file: {epics_file}</action>

  <check if="file not found">
    <output>
**Error:** epics.md not found at {epics_file}

Run `/bmad:bmm:workflows:create-epics-and-stories` to create it first.
    </output>
    <action>Exit workflow</action>
  </check>

  <action>Parse the epics file structure:</action>
  - Extract frontmatter (YAML between ---)
  - Identify all epics by finding "## Epic N:" headers
  - For each epic, determine status:
    - **Completed**: All stories marked as done, OR epic explicitly marked complete in sprint-status.yaml
    - **Active**: Has stories in progress, ready-for-dev, or backlog
    - **Pending**: Not started yet

  <action>Count epics by status</action>
  <action>Continue to Step 11</action>
</step>

<step n="11" goal="Show analysis and confirm">
  <output>
## Epic Analysis

**File:** {epics_file}
**Total Epics:** {{total_epics}}

### Status Breakdown:
{{#each epics}}
- **Epic {{number}}:** {{title}} - {{status}}
{{/each}}

### Summary:
- Completed: {{completed_count}}
- Active: {{active_count}}
- Pending: {{pending_count}}

{{#if completed_count == 0}}
**No completed epics to archive.**
{{else}}
**Epics to archive:** {{completed_epics_list}}
{{/if}}
  </output>

  <check if="completed_count == 0">
    <output>Nothing to archive. All epics are still active or pending.</output>
    <action>Exit workflow</action>
  </check>

  <ask>
Proceed with archiving {{completed_count}} epic(s)?
- **Y** - Yes, archive completed epics
- **N** - No, cancel
- **C** - Custom: Select specific epics to archive

Choice:</ask>

  <check if="choice == N or choice == n">
    <output>Archive cancelled.</output>
    <action>Exit workflow</action>
  </check>

  <check if="choice == C or choice == c">
    <action>Jump to Step 12</action>
  </check>

  <check if="choice == Y or choice == y">
    <action>Set epics_to_archive = all completed epics</action>
    <action>Jump to Step 13</action>
  </check>
</step>

<step n="12" goal="Custom epic selection">
  <output>
**Select epics to archive:**
{{#each completed_epics}}
{{@index}}. Epic {{number}}: {{title}}
{{/each}}
  </output>
  <ask>Enter epic numbers to archive (comma-separated, e.g., "1,2,5"):</ask>
  <action>Parse selection and set epics_to_archive</action>
  <action>Continue to Step 13</action>
</step>

<step n="13" goal="Execute archive operation">
  <action>Ensure {archive_folder} exists (create if not)</action>
  <action>Check if {epics_completed_file} exists</action>

  <check if="epics_completed_file does not exist">
    <action>Create new epics-completed.md in {archive_folder} with:</action>
    - Frontmatter with status: archived, archivedAt: today
    - Overview section explaining this is the archive
    - Copy Requirements Inventory section from epics.md (keep reference)
    - Epic List section (summary only)
  </check>

  <action>For each epic in epics_to_archive:</action>
  1. Extract the full epic content (from ## Epic N: to next ## Epic or end)
  2. Append to epics-completed.md
  3. Remove from epics.md

  <action>Update epics.md frontmatter:</action>
  - Update epicCount to reflect remaining epics
  - Add completedEpicsFile: archive/epics-completed.md
  - Update activeEpics array

  <action>Update epics-completed.md frontmatter:</action>
  - Update epicCount to reflect total archived
  - Update archivedAt timestamp

  <action>Continue to Step 14</action>
</step>

<step n="14" goal="Report epics.md archive results">
  <output>
## Epic Archive Complete

**Archived {{archived_count}} epic(s) from epics.md:**
{{#each archived_epics}}
- Epic {{number}}: {{title}}
{{/each}}

**Files updated:**
- `{epics_file}` - Now contains {{remaining_count}} active epic(s)
- `{epics_completed_file}` - Now contains {{total_archived}} archived epic(s)

**File size reduction:**
- Before: {{lines_before}} lines
- After: {{lines_after}} lines
- Reduction: {{reduction_percent}}%
  </output>
  <action>Continue to Step 15</action>
</step>

<!-- ========================= -->
<!-- ARTIFACT ARCHIVING -->
<!-- ========================= -->

<step n="15" goal="Identify story files for archived epics">
  <output>
## Archiving Implementation Artifacts

Now let's archive the story files and clean up sprint-status.yaml.
  </output>

  <action>For each archived epic, scan {implementation_artifacts} for matching files:</action>
  - Story files: Pattern `{epic_number}-*.md` (e.g., `16-1-xxx.md`, `16-2-xxx.md`)
  - Retrospective files: Pattern `epic-{epic_number}-retro*.md` or `epic-{epic_number}-retrospective*.md`
  - Validation reports: Pattern `validation-report-{epic_number}-*.md`

  <action>Build list of files to move per epic</action>

  <output>
### Files to Archive

{{#each archived_epics}}
**Epic {{number}}:**
{{#each files}}
- {{filename}}
{{/each}}
{{#if no_files}}
- (no story files found)
{{/if}}
{{/each}}

**Total files to move:** {{total_files}}
  </output>

  <ask>
Proceed with moving files to archive folder?
- **Y** - Yes, move files to archive/epic-X/
- **N** - No, skip artifact archiving

Choice:</ask>

  <check if="choice == N or choice == n">
    <output>Artifact archiving skipped. Epic content archived in epics-completed.md only.</output>
    <action>Jump to Step 18</action>
  </check>

  <action>Continue to Step 16</action>
</step>

<step n="16" goal="Create archive folders and move files">
  <action>For each archived epic:</action>

  1. Create folder: `{output_folder}/archive/epic-{{epic_number}}/`
  2. Move all identified files from `{implementation_artifacts}/` to the archive folder
  3. Preserve file names (no renaming needed)

  <output>
### Moving Files...

{{#each archived_epics}}
📁 Created: `archive/epic-{{number}}/`
{{#each moved_files}}
  ✓ Moved: {{filename}}
{{/each}}
{{/each}}
  </output>

  <action>Continue to Step 17</action>
</step>

<step n="17" goal="Clean sprint-status.yaml">
  <action>Read {sprint_status_file}</action>
  <action>For each archived epic:</action>

  1. Find the epic section block (from `# Epic {number}:` comment to next `# Epic` or end)
  2. Remove the entire block including:
     - Epic status line: `epic-{number}: done`
     - All story status lines: `{number}-X-story-name: done`
     - Retrospective line: `epic-{number}-retrospective: done`
     - Section comments

  <action>Write updated sprint-status.yaml</action>

  <output>
### Sprint Status Cleaned

**Removed entries for:**
{{#each archived_epics}}
- Epic {{number}} ({{story_count}} stories + retrospective)
{{/each}}

**sprint-status.yaml:**
- Before: {{lines_before}} lines
- After: {{lines_after}} lines
- Removed: {{lines_removed}} lines
  </output>

  <action>Continue to Step 18</action>
</step>

<step n="18" goal="Final report">
  <output>
## Archive Complete ✅

### Summary

**Epics Archived:** {{archived_count}}
{{#each archived_epics}}
- Epic {{number}}: {{title}}
{{/each}}

**Files Updated:**
| File | Action |
|------|--------|
| `epics.md` | Removed {{archived_count}} epic(s) |
| `archive/epics-completed.md` | Added {{archived_count}} epic(s) |
| `sprint-status.yaml` | Removed {{total_entries_removed}} entries |

**Artifacts Moved:**
| Destination | Files |
|-------------|-------|
{{#each archived_epics}}
| `archive/epic-{{number}}/` | {{file_count}} files |
{{/each}}

**Context Reduction:**
- epics.md: {{epics_reduction}}% smaller
- sprint-status.yaml: {{sprint_reduction}}% smaller
- implementation-artifacts/: {{artifacts_reduction}}% fewer files

**Tip:** Archived content is preserved in `{output_folder}/archive/epic-X/` for reference.
  </output>
  <action>Exit workflow</action>
</step>

<!-- ========================= -->
<!-- STATUS MODE (S) -->
<!-- ========================= -->

<step n="20" goal="Load files for status">
  <action>Read {epics_file}</action>

  <check if="epics_file not found">
    <output>
**Error:** epics.md not found at {epics_file}

Run `/bmad:bmm:workflows:create-epics-and-stories` to create it first.
    </output>
    <action>Exit workflow</action>
  </check>

  <action>Try to read {epics_completed_file}</action>
  <action>Parse both files to extract epic information</action>
  <action>Continue to Step 21</action>
</step>

<step n="21" goal="Display status report">
  <output>
## Epic Status Report

### Active Epics (in epics.md)
{{#if active_epics}}
| Epic | Title | Stories | Status |
|------|-------|---------|--------|
{{#each active_epics}}
| {{number}} | {{title}} | {{story_count}} | {{status}} |
{{/each}}
{{else}}
No active epics found.
{{/if}}

### Archived Epics (in archive/epics-completed.md)
{{#if archived_epics}}
| Epic | Title | Stories | Archived |
|------|-------|---------|----------|
{{#each archived_epics}}
| {{number}} | {{title}} | {{story_count}} | {{archived_date}} |
{{/each}}
{{else}}
No archived epics yet.
{{/if}}

### Summary
- **Active file:** {{active_lines}} lines ({{active_count}} epics)
- **Archive file:** {{archived_lines}} lines ({{archived_count}} epics)
- **Total epics:** {{total_count}}

{{#if has_completable_epics}}
**Tip:** {{completable_count}} epic(s) appear complete and could be archived.
Run this workflow with mode **A** to archive them.
{{/if}}
  </output>

  <ask>
Options:
- **A** - Switch to Archive mode
- **R** - Refresh status
- **X** - Exit

Choice:</ask>

  <check if="choice == A or choice == a">
    <action>Jump to Step 10</action>
  </check>

  <check if="choice == R or choice == r">
    <action>Jump to Step 20</action>
  </check>

  <action>Exit workflow</action>
</step>

<!-- ========================= -->
<!-- TECH-SPEC ARCHIVE MODE (T) -->
<!-- ========================= -->

<step n="30" goal="Scan for tech-spec files">
  <action>Scan {implementation_artifacts} for tech-spec files:</action>
  - Pattern: `tech-spec-*.md`

  <check if="no tech-spec files found">
    <output>
**No tech-spec files found in implementation-artifacts.**

All tech-specs are already archived or none exist.
    </output>
    <action>Exit workflow</action>
  </check>

  <output>
## Tech-Spec Files Found

**Location:** {implementation_artifacts}

**Files:**
{{#each tech_spec_files}}
- {{filename}}
{{/each}}

**Total:** {{tech_spec_count}} file(s)
  </output>

  <ask>
Move these files to archive/tech-specs/?
- **Y** - Yes, archive tech-specs
- **N** - No, cancel

Choice:</ask>

  <check if="choice == N or choice == n">
    <output>Tech-spec archiving cancelled.</output>
    <action>Exit workflow</action>
  </check>

  <action>Continue to Step 31</action>
</step>

<step n="31" goal="Archive tech-spec files">
  <action>Create folder: `{output_folder}/archive/tech-specs/` (if not exists)</action>
  <action>Move all tech-spec-*.md files to archive/tech-specs/</action>

  <output>
### Moving Tech-Spec Files...

📁 Created: `archive/tech-specs/`
{{#each moved_files}}
  ✓ Moved: {{filename}}
{{/each}}
  </output>

  <action>Continue to Step 32</action>
</step>

<step n="32" goal="Report tech-spec archive results">
  <output>
## Tech-Spec Archive Complete ✅

**Archived {{tech_spec_count}} tech-spec file(s):**
{{#each tech_spec_files}}
- {{filename}}
{{/each}}

**Destination:** `{output_folder}/archive/tech-specs/`

**Tip:** Tech-specs are preserved for reference. They can be consulted when implementing related features.
  </output>
  <action>Exit workflow</action>
</step>

</workflow>
