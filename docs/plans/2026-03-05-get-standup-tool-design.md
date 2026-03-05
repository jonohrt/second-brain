# get_standup MCP Tool Design

## Purpose

New MCP tool that provides a concise standup summary by querying the GitHub Events API for the `optijon` account. Auto-detects the last active day and returns merged PRs and commits pushed to PR branches.

## Parameters

None required. Auto-detects the last day with GitHub activity.

## Logic

1. Shell out to `gh api users/optijon/events` via `execFile`
2. Filter to `PullRequestEvent` (action: closed + merged) and `PushEvent`
3. Find the most recent event date — that's the "last active day"
4. Filter all events to that calendar day
5. For PushEvents, check if the ref has an associated PR
6. Group by repo, then by PR
7. Return concise formatted output

## Output Format

```
## Activity for Thursday, March 5

**core-ui**
- Merged PR #42: Fix auth token refresh
- PR #55 (open): Dashboard redesign — 3 commits pushed

**tesla-site**
- PR #88 (open): Update landing page copy — 2 commits pushed
```

## Implementation

- New file: `src/mcp/tools/standup.ts`
- New function `registerStandupTools()` registered in `server.ts`
- Uses `child_process.execFile` to call `gh` CLI
- No second brain enrichment for v1 — just GitHub data

## Out of Scope

- Date range parameters
- Multi-account support
- Second brain cross-referencing
- Caching
