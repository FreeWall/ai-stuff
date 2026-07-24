Execute the multi model code review workflow below. Treat any text the user typed after `/multi-review` as args to that workflow (scope, etc.). Do not invent a different review process. Do not ask which models to use. Do not edit files or apply fixes unless the user explicitly asks.

---

Adversarial multi-model code review: independent reviewers on different models, plus Bugbot, then a synthesized verdict. You MUST run those reviewers **in parallel**: issue every Task subagent launch in the same assistant turn (multiple Task tool calls together), not one after another.

## 1) Models (fixed defaults — do not ask)

Always launch these 2 in parallel:

-   `composer-2.5`
-   `cursor-grok-4.5-high`

Also launch this 1 only if the user explicitly asks for it (e.g. "opus", "claude-opus", "with opus", "deep"):

-   `claude-opus-4-8-thinking-high`

Do not present a model picker. Do not recommend or swap models. If a slug is rejected at execution time, prefer the closest valid slug suggested by the Task/Subagent tool feedback.

## 1b) Bugbot (always, parallel with §1)

Also always launch `/review-bugbot` in the same parallel batch as the model reviewers. Follow the `review-bugbot` skill.

Use `Diff: uncommitted changes` only if the user asked to review only uncommitted/local dirty changes. Include `Base Branch` / `Custom Instructions` only when the skill says to. Do not fix Bugbot findings or rerun it unless the user asks.

## 2) Scope and intent

1. Determine what to review: user-specified paths or diff, else `git diff main...HEAD` (or the repo default base vs HEAD), else local unstaged + staged diffs, else files and symbols from the conversation.
2. State one clear paragraph of **intent** — what the change is trying to accomplish (from messages, commits, or the code).
3. Collect the material to pass to model reviewers: full diff or key file excerpts. (Bugbot does not need this — see §1b.)

## 3) Launch one subagent per model + Bugbot (parallel only)

For **each** model slug from §1, launch the Task tool with `subagent_type`: `generalPurpose`, `readonly`: true, and `model` set to that slug. In the **same** batch, also launch the Bugbot Task from §1b. **Parallelism is mandatory:** fire all of these Task calls in one batch in a single response (concurrent tool use), never sequentially. Each model subagent gets the same reviewer prompt; diversity comes from the models, not from different personas.

Each model subagent prompt must include:

-   The stated intent paragraph.
-   The code/diff under review.
-   Review the relevant code with a code review mindset. Prioritize bugs, behavioral regressions, security issues, and missing tests. Findings must be the primary focus, ordered by severity. Do not make code changes unless the user explicitly asks for them.
-   Ask for structured findings with severity (critical | warning | nit), concrete locations, evidence, optional suggestion; say "no findings" if nothing is wrong.

## 4) Synthesize (you, the parent agent)

Merge the model-reviewer and Bugbot findings: **consensus** (2+ reviewers), **lone-reviewer** findings, deduplicate overlapping issues, note disagreements. Categorize for the user: act on / consider / noted / dismissed, with brief rationale. Do not auto-apply changes.
