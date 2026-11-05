---
name: verify-findings
description: Verify review findings one per subagent, read-only. Trigger when the user says 'verify findings', 'verify each finding', or asks to fact-check review results with subagents.
---

# Verify findings

Fact-check a list of review findings against the code. Read-only: nobody
edits files, commits, pushes, or comments on GitHub.

## Setup

- Findings: the latest review results in this conversation, unless the user
  names others. Number them. Put all nits in one finding.
- Models: `models.md` in this skill's directory, unless the user names
  others. If one is unavailable, report it and stop. Do not substitute.
- Tools: T3 `orchestrator_capabilities` once, then `delegate_task`;
  elsewhere the harness's subagent tools.
- Start one coordinator subagent (async), end your turn, and wait for its
  completion notification without polling.
- Then relay its report. Re-check only UNVERIFIABLE verdicts or ones that
  contradict what you checked earlier, and say so.

## Coordinator brief (give verbatim)

> You are the coordinator. Read-only. Do not start another coordinator.
> 0. Call `orchestrator_capabilities` once, then use `delegate_task` with the
>    verifier target below. If it is unavailable, report it and stop.
> 1. Start one verifier per finding (async), at most N running at once (the
>    verifier limit below). Start the first N; each time one completes, start
>    the next queued finding. Never exceed N.
> 2. Do not verify any finding yourself.
> 3. Wait for each verifier's completion notification. Do not poll. If a
>    verifier fails, is interrupted, or returns no verdict, mark that finding
>    UNVERIFIABLE with the reason. Do not retry it.
> 4. Return the merged report in the Output format below.

Then add: the Output section, the verifier target and limit from `models.md`, the
context block, the verifier instructions, and every finding verbatim with its
number. The coordinator has no conversation history.

## Context block (give to every verifier)

PR URL and title, checkout path and head SHA, base branch, diff command
(`git -C <path> diff origin/<base>...HEAD -- <dirs>`), related repos and what
was already reviewed elsewhere, files the sandbox hides (unreadable, do not
guess), and a one-paragraph summary of the change.

## Verifier instructions (give verbatim, plus one finding)

> READ-ONLY. Do not edit files, commit, push, or comment on GitHub.
> Confirm or refute this finding by reading the actual code. Try hard to
> refute it: check the cited lines exist and say what is claimed, trace the
> real call paths, and look for guards the reviewer missed. Do not run the
> full test suite; one targeted test is ok.
> Output: verdict (CONFIRMED / PARTIALLY CONFIRMED / REFUTED /
> UNVERIFIABLE), severity you think fits, evidence with file:line, and what
> you could not check.

## Output

Table: finding #, verdict, severity, 1-3 lines of evidence with file:line.
Then a short list of where verifiers disagree with the original finding.
Last line: `Verified: N confirmed, N partial, N refuted, N unverifiable`.
