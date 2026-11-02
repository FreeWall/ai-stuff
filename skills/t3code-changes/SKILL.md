---
name: t3code-changes
description: List t3code (pingdotgg/t3code) changes from a given nightly build number (excluded) to the latest nightly, grouped into features, performance and fixes. Use when the user gives a t3code build number like "3710" and wants what changed since, or invokes /t3code-changes.
argument-hint: <build-number>
---

Run (needs network, `gh` authed):

```bash
bash ~/.claude/skills/t3code-changes/changes.sh $ARGUMENTS
```

Print the script output to the user verbatim. Covers every PR merged in the window (via the GitHub compare API), including ones only in unpublished/preview tags. If no build number was given, ask for it.
