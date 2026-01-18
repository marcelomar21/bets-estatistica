# Archive Epics - Epic Lifecycle Management

<critical>The workflow execution engine is governed by: {project-root}/_bmad/core/tasks/workflow.xml</critical>
<critical>You MUST have already loaded and processed: {project-root}/_bmad/bmm/workflows/4-implementation/archive-epics/workflow.yaml</critical>
<critical>Modes: A (Archive), S (Status)</critical>

<workflow>

<step n="0" goal="Mode selection">
  <output>
## Archive Epics - Epic Lifecycle Management

This workflow helps keep your epics.md file lean by archiving completed epics to a separate file.

**Select mode:**
- **A** - Archive: Move completed epics to epics-completed.md
- **S** - Status: View which epics are complete vs active
  </output>
  <ask>Select mode (A/S):</ask>

  <check if="mode == A or mode == a">
    <action>Jump to Step 10</action>
  </check>

  <check if="mode == S or mode == s">
    <action>Jump to Step 20</action>
  </check>

  <output>Invalid selection. Please choose A or S.</output>
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
  <action>Check if {epics_completed_file} exists</action>

  <check if="epics_completed_file does not exist">
    <action>Create new epics-completed.md with:</action>
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
  - Add completedEpicsFile: epics-completed.md
  - Update activeEpics array

  <action>Update epics-completed.md frontmatter:</action>
  - Update epicCount to reflect total archived
  - Update archivedAt timestamp

  <action>Continue to Step 14</action>
</step>

<step n="14" goal="Report results">
  <output>
## Archive Complete

**Archived {{archived_count}} epic(s):**
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

**Tip:** The Requirements Inventory is preserved in both files for reference.
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

### Archived Epics (in epics-completed.md)
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

</workflow>
