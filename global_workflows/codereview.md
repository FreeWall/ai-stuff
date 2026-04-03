---
description: Code review
---

### Do a code review

- If I have uncommitted changes and I don't mention the "commit" or "commits" string in the chat, follow the variant A, as described below.
- If I have no uncommitted changes or I mention the "commit" or "commits" string in chat, follow the variant B, as described below.

---

Variant A:

1. Extract the diff of uncomitted changes

```bash
  git --no-pager status && git --no-pager diff && git --no-pager diff --cached
```

2. Follow common steps

Variant B:

1. Ask me which commits you should review, list last 10 commits.
```bash
  git --no-pager log -n 10 --oneline
```
2. Extract the diff of specified commits
3. Follow common steps

---

Common steps:

1. Compile a formatted code review report in Markdown (do not print it in chat).
    - Use [!WARNING] for issues/suggestions that should be fixed.
    - Use [!CAUTION] for critical issues/risks that must be fixed.
    - Do not use any other alerts (e.g. [!NOTE], [!TIP], [!IMPORTANT], etc.)!
    - Use dynamic links to the files and line numbers if possible.
2. Document the findings in a `code_review_report.md` artifact.

Example of code review report:
```markdown
# Review of "Title"

## Summary

Summary of the changes

<br>

> [!CAUTION]
> ## Issue title
>
> Issue description

---
<br>

> [!WARNING]
> ## Issue title
>
> Issue description

---
<br>

> [!WARNING]
> ## Issue title
>
> Issue description
```