## Concise Rule

Be extremely concise. Sacrifice grammar for the sake of concision.

## Prefer jq

Prefer `jq` for filtering/transforming JSON in shell pipelines (curl, gh api, files).

## Coding preferences - general

- Keep things simple. Channel "yagni" energy unless told otherwise.
- Typesafety is useful, take advantage of it.
- Tests are good! Endless smoke tests, "regression tests" for feature deletions, etc, much less good. Tests should be focused, not slop.

## Coding preferences - (TypeScript focused)

- `any` is the enemy. Inferred types are our friend. Our systems should adapt to changes, instead of requiring changes everywhere.
- Avoid one-line functions that are just casting wrappers.
- Write TypeScript in ways that Matt Pocock would be proud of.
- If not already specified in project, I generally like to use the following tech: yarn, React, Tailwind, Zustand, React Query

## Git remote ops

Run `git fetch`, `git pull` and `git push` with `dangerouslyDisableSandbox: true`. The sandbox blocks `~/.ssh`, so SSH remotes fail inside it.

## Killing processes

Never `pkill -f "<pattern>"` with a plain pattern: it matches the bash running the command and kills it (exit 143/144). Use the bracket trick (`pkill -f "[r]emote-debugging-port=9333"`), or kill a saved PID (`kill $PID`). Put the kill in its own command, not chained with other work.

## Waiting on background jobs

Never use a bare `wait` in Bash. Sandbox shells contain long-lived `socat` proxy jobs, so a bare `wait` hangs until timeout. Save PIDs and use `wait $p1 $p2`, or just run the commands one after another.

Never `sleep` to wait, and never chain `sleep N; ...`: the harness blocks it. Use `run_in_background` for a command you started, or `Monitor` with an until-loop for a condition.
