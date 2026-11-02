#!/usr/bin/env bash
# Usage: changes.sh <build-number>
# Prints PRs merged after nightly build <N> (excluded) up to the latest nightly, grouped by type.
set -euo pipefail

owner=pingdotgg name=t3code repo=pingdotgg/t3code
from_build=${1:?usage: changes.sh <build-number>}

tags=$(gh api --paginate "repos/$repo/git/matching-refs/tags/v" --jq '.[].ref' |
  sed 's#refs/tags/##' | grep -E -- '-nightly\.[0-9]+\.[0-9]+$' | sort -t. -k5,5n)

from=$(grep -E "\.${from_build}\$" <<<"$tags" | tail -1 || true)
to=$(tail -1 <<<"$tags")
[[ -n $from ]] || { echo "no nightly tag for build $from_build" >&2; exit 1; }
[[ $from != "$to" ]] || { echo "$from is already the latest nightly"; exit 0; }

prs=$(gh api --paginate "repos/$repo/compare/$from...$to?per_page=100" \
  --jq '.commits[].commit.message | split("\n")[0]' |
  jq -Rn '[inputs | capture("^(?<title>(?<type>[a-z]+)[^:]*:.*) \\(#(?<pr>[0-9]+)\\)$")?]')

# Size + author via GraphQL, 100 PRs per query.
meta=$(jq -r '[.[].pr] as $n | range(0; $n | length; 100) | $n[.:.+100] | map("p\(.):pullRequest(number:\(.)){number additions deletions author{login}}") | join(" ")' <<<"$prs" |
  while read -r fields; do
    gh api graphql -f query="{repository(owner:\"$owner\",name:\"$name\"){$fields}}" --jq '.data.repository[]'
  done | jq -s 'map({key: (.number | tostring), value: .}) | from_entries')

jq -rn --argjson prs "$prs" --argjson meta "$meta" --arg from "$from" --arg to "$to" --arg repo "$repo" '
  def line: $meta[.pr] as $m
    | "- [\(.title)](https://github.com/\($repo)/pull/\(.pr)) — @\($m.author.login // "ghost"), +\($m.additions)/−\($m.deletions)";
  ($prs | group_by(.type) | map({key: .[0].type, value: .}) | from_entries) as $g
  | "# \($from) → \($to)\n\($prs | length) PRs\n",
    (("feat", "perf", "fix") as $t | ($g[$t] // []) | select(length > 0)
      | "\n## \($t) (\(length))", (.[] | line)),
    "\nOther: " + ([$g | to_entries[] | select(.key | IN("feat", "perf", "fix") | not)
      | "\(.key) \(.value | length)"] | join(", "))
'
