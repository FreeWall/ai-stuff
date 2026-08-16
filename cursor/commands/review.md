Execute the multi-model code review below. Text after `/review` = args (scope, etc.). Do not invent a different process, ask which models to use, or edit/fix unless the user explicitly asks.

## 1) Launch (one parallel batch)

In a single assistant turn, fire all Task calls together (never sequential):

Always launch these 2 in parallel:

-   `composer-2.5-fast`
-   `cursor-grok-4.6-high`

Also launch this 1 only if the user explicitly asks for it (e.g. "opus", "claude-opus", "with opus", "deep"):

-   `claude-opus-4-8-thinking-high`


Also always launch `review-bugbot` skill in the same parallel batch as the model reviewers. Use `Diff: uncommitted changes` only if user asked for uncommitted/local dirty changes. Include `Base Branch` / `Custom Instructions` only when that skill says to.

Do not relaunch or retry Bugbot if it was stopped, interrupted, or cancelled. The user typically stops it on purpose because they do not want it to run. Continue with model reviewers only; treat the stop as a skip, not a failure.

No model picker or swaps. If a slug is rejected, use the closest valid slug from Task feedback.

## 1b) Main thread after launch

Do **not** run another independent review in the parent/main thread. The parent does not explore the diff, re-read files, or form its own findings while subagents run (or after they finish).

Parent job after launch: wait for subagents, then **synthesize their results** (section 4). If Bugbot was skipped, synthesize from model reviewers only.

If reviewers are still running: end the turn. Do not fill the wait with parallel analysis.

## 2) Scope

1. Target: user paths/diff → else `git diff main...HEAD` (or repo default base vs HEAD) → else staged+unstaged → else conversation files/symbols
2. One intent paragraph (what the change tries to do)
3. Collect full diff or key excerpts for model reviewers (Bugbot needs none)

## 3) Model reviewer prompt (identical for each model)

Include intent + code/diff. Review the relevant code with a code review mindset. Prioritize bugs, behavioral regressions, security issues, and missing tests. Findings must be the primary focus, ordered by severity. Do not make code changes unless the user explicitly asks for them. Ask for structured findings with severity (high | medium | low), concrete locations, evidence, optional suggestion; say "no findings" if nothing is wrong.

## 4) Synthesize

Merge **only** model + Bugbot findings (no parent-thread findings): consensus (2+), lone-reviewer, dedupe overlaps, note disagreements. Categorize: act on / consider / noted / dismissed, with brief rationale. Do not auto-apply.
