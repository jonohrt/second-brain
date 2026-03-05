# Hook Fixes & Learning Categories — Design Document

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Bug fixes for CLI hooks + learning/idea category tags

## Problem

1. The `capture-hook` and `session-context` CLI commands crash when stdin is empty or not valid JSON (e.g., when run outside Claude Code hook context).
2. `capture_learned` entries are flat — no guidance on categorization, making retrieval by category impossible.

## Solution

### 1. Hook stdin fix

Wrap stdin reading + `JSON.parse` in both `capture-hook` and `session-context` commands with try/catch. On empty or invalid JSON, log a warning to stderr and exit 0 (hooks should not break the user's workflow).

**File:** `src/cli.ts`

### 2. Learning categories via tag guidance + search filtering

**Approach:** Lean on the existing `tags` array in metadata. Guide Claude to use consistent category tags via the tool description; add tag-based filtering to search.

**`capture_learned` changes:**
- Update tool description to list suggested category tags: `technique`, `gotcha`, `personal`, `pattern`, `insight`, `idea`
- Update `tags` param description to mention these as suggested categories

**`search_context` changes:**
- Add optional `tag` string param
- Filter Supabase query where `metadata->tags` contains the given value

**Files:** `src/mcp/tools/capture.ts`, `src/mcp/tools/search.ts`, `src/services/supabase.ts`

## What does NOT change

- No DB schema changes (tags already in `metadata` jsonb)
- No new MCP tools
- No type changes in `types.ts`

## Acceptance Verification

1. Run `second-brain capture-hook --event post-commit` with no stdin — should exit 0 with a warning, not crash
2. Run `second-brain session-context` with no stdin — same behavior
3. Capture a learned entry with `tag: "personal"` via MCP tool
4. `search_context(query: "...", tag: "personal")` returns only entries tagged `personal`
5. All existing unit tests pass
