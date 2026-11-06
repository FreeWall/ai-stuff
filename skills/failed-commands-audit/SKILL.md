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

T3 Code stores every thread (all providers: claudeAgent, opencode, cursor, codex; incl. subagent/delegated threads) in `~/.t3/userdata/statev2.sqlite`, table `orchestration_v2_projection_turn_items`. Tool calls have real `output` + `exitCode`, so no inference needed.

1. Bulk extract with the bundled script (read-only, Node 24 `node:sqlite`):
   ```
   node ~/.claude/skills/failed-commands-audit/extract.mjs [--since 2026-10-01] > "$TMPDIR/failures.jsonl"
   ```
   One JSONL row per failed `command_execution` / `dynamic_tool` / `file_change` / `file_search` item (status `failed`, nonzero `exitCode`, or `Error: Exit code N` output), with `driver`, `project`, `threadId`, `input`, `output` tail, `nextAssistant` and `nextCommand` (recovery evidence).
2. Cluster with `jq` (e.g. by first word of `input`, by error substrings like `command not found`, `No such file`, `Operation not permitted`, `Failed to exec`). Split by `driver` — failures are often provider-specific.
3. Drill into ambiguous clusters with `t3_thread_read` (`threadId` from the row, `view: "activity"`, small `limit`/`maxCharsPerItem`). Don't use T3 thread tools for the bulk scan: no failure filter, `t3_thread_search` skips subagent threads, and paging every thread is thousands of calls.
4. Cursor-only history from before the T3 migration, if wanted: `~/.cursor/projects/*/agent-transcripts/**/*.jsonl` (results often missing — infer from the next assistant turn).

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

If a finding belongs in `~/.claude/CLAUDE.md`, a project CLAUDE.md/AGENTS.md, or is provider-specific (e.g. a cursor/opencode quirk), say so — don't write files unless asked.
