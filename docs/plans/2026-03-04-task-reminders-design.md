# Task Reminders via Apple Reminders

**Date:** 2026-03-04
**Status:** Approved
**Scope:** Add `remind_at` parameter to `capture_task` MCP tool

## Problem

Tasks captured via `capture_task` have no notification mechanism. Users must manually remember to check tasks or separately create Apple Reminders.

## Solution

Add an optional `remind_at` parameter (ISO 8601 datetime) to `capture_task`. When provided, shell out to `osascript` to create an Apple Reminder with the task title and remind date.

## Implementation

- Add `remind_at` (ISO 8601 string, optional) to `capture_task` input schema
- Add `createAppleReminder(title: string, remindAt: Date)` helper using `child_process.execFile` to run `osascript`
- Store `remind_at` in task metadata for vault/Supabase record
- If reminder creation fails, task still captures — append warning to response
- Single file change: `src/mcp/tools/capture.ts`

## osascript Command

```applescript
tell application "Reminders"
  tell list "Reminders"
    make new reminder with properties {name:"<title>", remind me date:date "<date string>"}
  end tell
end tell
```

Date string formatted as AppleScript expects (e.g., "Thursday, March 5, 2026 at 7:00:00 AM").

## Acceptance Verification

1. `capture_task` with `remind_at` creates a reminder visible in Apple Reminders app
2. `capture_task` without `remind_at` works exactly as before
3. Failed reminder creation doesn't block task capture
4. `remind_at` value stored in task metadata
