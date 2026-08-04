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

### Step 2 — Audit and update the docs

The detail that used to live in `.claude/CLAUDE.md` was split into `.claude/docs/` on 2026-08-04 (the root file had reached 272 KB and stopped loading reliably). **Open only the docs the shipped diff actually touches** — do not read all of them. Edit inline for anything stale; only change what is wrong or missing.

**Where each kind of change belongs:**

- **`docs/project-structure.md`** — new/deleted/moved routes, pages, components, hooks, lib modules. Match the tree format and inline comment style already there.
- **`docs/canvas-wizard.md`** — orchestrator stages, Zustand stores, canvas nodes/edges, synthesis, URL or naming macros.
- **`docs/campaign-config.md`** — feed providers, channel lifecycle, presets, Country Groups, articles.
- **`docs/dashboard-reporting.md`** — metric formulas, attribution SQL, sync cadence, the ROAS divisor, FX.
- **`docs/security.md`** — new API routes, authz/IDOR checks, user-scoped data paths, CSP, stored tokens.
- **`docs/snapchat-api.md`** / **`docs/meta-api.md`** — payload fields, enums, numeric scales, newly discovered constraints or error subcodes for that platform.
- **`docs/media-and-silo.md`** — Silo, upload/transcode, KV metadata store.
- **`.claude/CLAUDE.md` itself** — ONLY for: stack/dependency changes, the deploy workflow, agents, env vars, tests, or how to run the app. **Do not add detail here.** Keep it under ~30 KB; if a topic has no home, add a `docs/` file plus a row in its Reference Docs table.

If nothing in a doc is stale, leave it untouched.

`Edit` on `.claude/CLAUDE.md` and `.claude/docs/*.md` is pre-authorized — no permission prompt will appear.

### Step 3 — Commit and push the updated docs

After editing, run:
```
git add .claude
git commit -m "docs: update CLAUDE.md post-deploy"
git push
```

These git commands are pre-authorized in `settings.local.json` — no permission prompt will appear.

## What NOT to do

- Do not ask the user for permission before editing or committing.
- Do not skip this rule because "nothing obvious changed" — always audit.
- Do not rewrite sections that are still accurate.
- Do not add comments explaining why you changed something — the file is documentation, not a change log.
