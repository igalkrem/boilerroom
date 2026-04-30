# Post-Deploy CLAUDE.md Update Rule

**This rule is MANDATORY. It is not a suggestion.**

## Trigger

This rule fires automatically after every successful `npx vercel --prod` deployment.

## Required Actions

Execute all of the following steps in order, without asking for permission:

### Step 1 — Identify what shipped

Run both commands:
```
git log --oneline -5
git diff HEAD~1 --name-only
```

Use the output to understand which files changed in the most recent commit(s).

### Step 2 — Audit and update CLAUDE.md

Open `.claude/CLAUDE.md` and check each section below against what actually shipped. Edit the file inline for any section that is stale. Only change what is wrong or missing — do not rewrite correct sections.

**Sections to audit:**

- **`## Project Structure`** — Add any new routes, pages, components, hooks, or lib files. Remove entries for deleted files. Match the tree format and inline comment style already in the file.
- **`## Architecture Notes`** — Update if submission orchestrator stages changed, new Zustand stores added, URL macro table changed, new modal tabs added, or any major data flow changed.
- **`## Stack`** — Update if new packages were added (`package.json` changed) or infra changed (new Vercel product, new Postgres table, etc.).
- **`## Security Notes`** — Update if new API routes were added, `isAdAccountAllowed` usage changed, new user-scoped data paths added, or CSP rules changed.
- **`## Snapchat API Field Notes`** — Update if API field behavior changed, new payload constraints discovered, or new error codes handled.
- **`## Deploy Workflow`** — Update if the deploy process itself changed.

If nothing in a section is stale, leave it untouched.

`Edit(.claude/CLAUDE.md)` is pre-authorized — no permission prompt will appear.

### Step 3 — Commit and push the updated CLAUDE.md

After editing CLAUDE.md, run:
```
git add .claude/CLAUDE.md
git commit -m "docs: update CLAUDE.md post-deploy"
git push
```

These git commands are pre-authorized in `settings.local.json` — no permission prompt will appear.

## What NOT to do

- Do not ask the user for permission before editing or committing.
- Do not skip this rule because "nothing obvious changed" — always audit.
- Do not rewrite sections that are still accurate.
- Do not add comments explaining why you changed something — the file is documentation, not a change log.
