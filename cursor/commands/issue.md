# Plan GitHub Issue Fix

## Plan mode required

If the session is **not** in Plan mode: Call **SwitchMode** with `target_mode_id: plan`.
Only when already in Plan mode, run the steps below, then build the implementation plan from the issue + codebase (no code changes until the user approves the plan).

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
