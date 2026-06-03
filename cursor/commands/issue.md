# Plan GitHub Issue Fix

## Plan mode required

If the session is **not** in Plan mode:

1. Call **SwitchMode** with `target_mode_id: plan` (brief reason: planning a GitHub issue fix).
2. **Stop.** Do not fetch the issue, create a branch, explore the codebase, or write a plan.
3. Tell the user to continue the same request after Plan mode is active.

Only when already in Plan mode, run the steps below, then build the implementation plan from the issue + codebase (no code changes until the user approves the plan). **Save the final plan to `<workspace>/.cursor/plans/` using Write** (see below — not CreatePlan).

Extract issue number `N` from `TTA-N`, `#N`, or `.../issues/N`. If missing, ask once.

## Fetch issue (gh CLI)

From repo root (`gh` must be authenticated):

```bash
gh issue view N --json number,title,body,labels,state,url,assignees,comments
```

Fallback:

```bash
gh issue view N
```

Do not paraphrase the issue from memory — use this output as the source of truth.

## Infer branch naming and create a branch

Discover how this project names branches:

```bash
git --no-pager branch -a
git --no-pager log --oneline -30
```

Look for recurring prefixes (`fix/`, `feat/`, `issue/`, `bug/`, ticket IDs, etc.) and slug style (kebab-case, issue number placement).

**If a clear convention exists**, follow it.

**If there is no pattern** (few or only `main`/`master` branches), use:

`issue/<number>-<short-kebab-slug>`

where `<short-kebab-slug>` is derived from the issue title (~4–6 words max, no special chars).

Before creating a branch:

- Ensure the working tree is clean, or ask the user whether to stash/commit first.
- Check out the default integration branch (`main` or `master`) and pull if tracking `origin`:

```bash
git --no-pager status
git --no-pager checkout <default-branch>
git pull --ff-only   # only if upstream exists and user has not forbidden it
git checkout -b <new-branch-name>
```

## grill-me

While building the plan, use **/grill-me** (read and follow the **grill-me** skill) when requirements are unclear, several designs are viable, or the change touches security, money, or provider contracts.
Skip grill-me for straightforward, fully specified bugs.

## Save the plan to workspace

**Mandatory.** The plan file must live in the **project workspace**, not in user-level Cursor storage.

- **Do not** use the `CreatePlan` tool — it saves under `~/.cursor/plans/`, which is wrong for this workflow.
- **Do** use the **Write** tool (create `.cursor/plans/` first if missing) at:

  `<workspace-root>/.cursor/plans/TTA-<N>-<short-slug>.plan.md`

  Example: `.cursor/plans/TTA-631-trace-header.plan.md`

- Include YAML frontmatter with `name`, `overview`, and `todos` (same structure as a normal plan).
- After writing, tell the user the workspace path (e.g. `.cursor/plans/TTA-631-trace-header.plan.md`) so they can open it in the repo.
- You may still present a summary in chat, but the **Write** step is required — do not finish `/issue` without it.
