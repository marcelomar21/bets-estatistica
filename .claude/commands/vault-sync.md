Check the last 24 hours of git commits in this repository and update the Obsidian vault (Basic Memory MCP, project "guru") accordingly.

## Steps

1. Run `git log --since="24 hours ago" --oneline --all` to see recent commits
2. For each meaningful change (skip merge commits, CI-only changes):
   - If there are **new migrations** in `sql/migrations/`: update `Database/Schema.md` or create a migration note in `Database/Migrations/`
   - If there are **new features or bug fixes**: create or update a changelog entry in `Changelog/` with the date and PR summary
   - If there are **architecture changes** (new API routes, new services, new patterns): update `Project/Architecture.md` or `Project/Codebase Patterns.md`
   - If there are **new RLS policies or security changes**: update `Project/RLS Audit 2026-03-16.md` or create a new one
   - If there are **infrastructure changes** (Render, Vercel, Supabase config): update `Project/Infrastructure.md` or relevant `Runbooks/`
3. If nothing meaningful changed, just say "Vault up to date, no changes needed"
4. Use `write_note` or `edit_note` from basic-memory MCP to make updates

Keep entries concise. Don't duplicate information already in git — focus on high-level "what changed and why" context that helps understand the project state.
