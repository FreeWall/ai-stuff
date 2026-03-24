---
description: Code review of the latest changes bagr
---

### Do a code review with following

- If I have uncommitted changes and I don't mention the "commit" or "commits" string in the chat, follow the variant A, as described below.
- If I have no uncommitted changes or I mention the "commit" or "commits" string in chat, follow the variant B, as described below.

---

Variant A:

1. Extract the diff of uncomitted changes

```bash
  git status && git diff && git diff --cached
```

2. Follow common steps

Variant B:

1. Ask me which commits you should review, list last 10 commits.
```bash
  git log -n 10 --oneline
```
2. Extract the diff of specified commits
3. Follow common steps

---

Common steps:

1. Compile a formatted code review report in Markdown, leveraging alerts (NOTE, WARNING, TIP, IMPORTANT) for clear call-outs, do not print it in chat.
2. Document the findings in a `code_review_report.md` artifact.
