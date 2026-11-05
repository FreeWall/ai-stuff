---
name: failed-commands-audit
description: >
  Audit this machine's agent chat history for Shell/CLI commands that failed, and
  produce a ranked list of what not to retry and what to use instead. Use when the
  user asks which commands fail on this machine, attaches this skill, or wants to
  stop agents from repeatedly trying broken approaches.
disable-model-invocation: true
---

Look through my chat history on this machine and analyze which commands failed, so the agent doesn't have to always try another approach.

## Goal

Find machine-specific CLI failures (missing binaries, bad paths, sandbox/PATH quirks, auth, permissions) and turn them into durable "don't retry X — do Y" guidance.

## Where to look

1. Agent transcripts under `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` (all projects on this machine, not just the current repo).
2. Prefer assistant turns after `Shell` tool calls: narration of errors, retries, fallbacks ("not found", "permission denied", "trying X instead", sandbox/PATH issues).
3. Note: tool *results* are often absent from transcripts — infer failures from the assistant's next message + the prior `Shell` command when needed.
4. Optionally skim recent `terminals/*.txt` for nonzero `exit_code` / `last_exit_code`.

Prefer `node` for any one-off parsing scripts (not `python3`).

## What to extract

For each failure cluster:
- **Command / binary** that failed (normalize: `python3`, `gh`, `docker`, etc.)
- **Error class** (not installed, wrong PATH/sandbox, auth, permission, wrong cwd/path)
- **How often** it showed up
- **What eventually worked** (if the agent recovered)
- **Concrete rule** for future agents on this machine

Ignore one-off task failures (tests failing, compile errors in the user's code). Focus on environment/tooling the agent should stop rediscovering.

## Output

Break down the most common failed commands and how often they occur.

Then give a short **agent cheat sheet** — ranked, copy-pasteable bullets:

```
- Don't: …  Do: …  (why / evidence count)
```

If a finding belongs in a Cursor rule or AGENTS.md, say so — don't write files unless asked.
