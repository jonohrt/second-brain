# iOS Enhancements — Design Document

**Date:** 2026-03-07
**Status:** Approved
**Scope:** Conversation history, task capture/update, clear input, TTS stop, cancel requests

## Problem

The iOS app is stateless — each question is independent with no conversation memory. Tasks can only be captured through MCP tools in Claude Code, not through the iOS interface. There's no way to update existing tasks or reminders via voice/text. The text input has no quick-clear option, and TTS can't be stopped mid-speech without toggling it off entirely. There's also no way to cancel an in-flight request.

## Solution

Six enhancements to the iOS app and server:

1. **Server-side conversation history** stored in Supabase with a chat-bubble UI
2. **LLM-powered intent router** replacing regex-based detection for task capture, updates, and reminders
3. **Task capture** via natural language through the iOS interface
4. **Task/reminder updates** via natural language with fuzzy matching
5. **Clear input button** and **cancel request** control
6. **TTS stop** that halts speech without disabling TTS

## Architecture

### Intent Router

Replace the current regex-based intent detection in `POST /ask` with an LLM-powered intent router. A single LLM call classifies the user's message and extracts structured data.

**Intents:**

| Intent | Description | Extracted Fields |
|--------|-------------|-----------------|
| `ask` | Question/conversation (default) | — |
| `reminder` | Create a reminder | title, reminder_time |
| `capture_task` | Capture a new task | title, project, tags |
| `update_task` | Update existing task | update_query (fuzzy match), new_description |
| `update_reminder` | Update existing reminder | update_query, new_title, new_time |
| `capture_note` | Save a note/learning | title, tags |

**Router LLM call returns JSON:**

```json
{
  "intent": "capture_task",
  "title": "Fix the login bug",
  "content": "The login page crashes when entering special characters",
  "project": "tesla",
  "tags": ["bug", "auth"],
  "update_query": null,
  "new_description": null,
  "reminder_time": null
}
```

The router uses a small/fast LLM call with a structured system prompt. For `update_task` and `update_reminder`, `update_query` contains the string to fuzzy-match against existing items.

**Conversation context:** The router receives the last few messages as context so it can understand references like "capture that as a task" (referring to something discussed earlier).

### Conversation History

**Supabase schema:**

```sql
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
```

**Message metadata stores:** route, model, sources, intent (for non-ask messages).

**API changes:**

- `POST /ask` — Gains optional `conversation_id` field. If omitted, creates a new conversation. Response includes `conversation_id`.
- `GET /conversations` — List conversations, sorted by `updated_at` DESC, with pagination.
- `GET /conversations/:id/messages` — Get messages for a conversation.
- `DELETE /conversations/:id` — Delete a conversation and its messages.

**LLM context window:** Server includes the last 20 messages from the conversation in the LLM system prompt, providing multi-turn context.

**Conversation title:** Auto-generated from the first user message (truncated to ~60 chars).

### iOS UI Changes

**Main screen becomes chat-bubble view:**

- User messages: right-aligned, blue background
- Assistant messages: left-aligned, gray background
- Source attribution appears below assistant bubbles that have vault sources
- Auto-scrolls to bottom on new messages
- Typing indicator while loading

**Header:**

- Left: Back button (to conversation list) or conversation title
- Right: TTS toggle button + New Conversation (+) button

**Input area:**

- Text editor with **X clear button** overlay (appears when text is non-empty)
- **Send button** transforms to **Stop button** while a request is in-flight
- Stop button cancels the Swift Task and URLSession request
- Record button unchanged

**Conversation list screen:**

- List of conversations showing title and relative date ("2 hours ago")
- Swipe-to-delete
- Pull-to-refresh
- "New Conversation" button or + in navigation bar
- Empty state: "No conversations yet"

### Task Capture Flow

1. User says: "Capture a task to fix the login bug on the tesla project"
2. Intent router classifies as `capture_task`, extracts: title="Fix the login bug", project="tesla"
3. Server creates task entry via existing `captureEntry()` with type `task`, metadata `{ status: "open" }`
4. Server stores user message and assistant confirmation in conversation
5. Response: "Captured task: 'Fix the login bug' under project tesla"

If the LLM can't determine the project, it defaults to "inbox" or asks in the conversation.

### Task Update Flow

1. User says: "Update the login bug task to mention it also affects signup"
2. Intent router classifies as `update_task`, extracts: update_query="login bug", new_description="Fix the login bug — also affects the signup page"
3. Server calls `findTaskByTitle("login bug")`
4. Single match: updates content, re-embeds, syncs to Supabase, re-writes vault file
5. Multiple matches: returns list in conversation asking user to be more specific
6. No match: "No open task matching 'login bug'"

### Reminder Update Flow

1. User says: "Change my dentist reminder to next Thursday at 3pm"
2. Intent router classifies as `update_reminder`, extracts: update_query="dentist", new_time="next Thursday 3pm"
3. Server finds the reminder in Apple Reminders via osascript (search by title)
4. Updates the Apple Reminder title and/or due date via osascript
5. If there's a corresponding vault entry, updates that too
6. Response: "Updated reminder: 'Dentist appointment' — Thu Mar 12 at 3:00 PM"

### TTS Stop Behavior

Current bug: tapping the speaker button while speech is playing toggles TTS off as a side effect.

**New behavior:**

```
if speech is playing:
    stop speech immediately
    keep isTTSEnabled = true
else:
    toggle isTTSEnabled
    if just enabled and answer exists:
        speak the answer
```

The speaker button icon reflects three states:
- TTS off: `speaker.slash.fill` (gray)
- TTS on, not speaking: `speaker.wave.2.fill` (blue)
- TTS on, speaking: `speaker.wave.2.fill` (blue, with animation or different icon like `stop.fill`)

### Cancel In-Flight Request

- While `isLoading` is true, the Send button becomes a Stop button (red, square icon)
- Tapping Stop cancels the current Swift `Task` which cancels the URLSession data request
- The server request may complete on the backend but the client discards the response
- UI resets: `isLoading = false`, no error shown

Implementation: Store the current request `Task` in the ViewModel and call `.cancel()` on it.

## Data Flow

### Ask (with conversation)

```
User sends message
  -> iOS: store user message locally, show in chat
  -> POST /ask { text, conversation_id? }
  -> Server: create/load conversation
  -> Server: store user message in messages table
  -> Intent Router LLM call (with last 20 messages as context)
  -> Route to handler (ask/capture_task/update_task/reminder/etc)
  -> Store assistant response in messages table
  -> Update conversation.updated_at
  -> Return { answer, sources, route, model, conversation_id }
  -> iOS: show assistant bubble, optionally speak
```

### Task Capture (from iOS)

```
User: "Capture a task to review the PR"
  -> Intent router: { intent: "capture_task", title: "Review the PR", project: "inbox" }
  -> captureEntry({ type: "task", title, project, metadata: { status: "open" } })
  -> Vault write + Supabase embed
  -> Return confirmation in conversation
```

## Error Handling

- Intent router LLM failure: fall back to `ask` intent (treat as a question)
- Conversation not found: create a new one, return new ID
- Task fuzzy match fails: return helpful message in conversation
- Apple Reminder update fails: return error message but don't fail the whole request
- Request cancelled by user: no error shown, clean state reset

## Security

- All new endpoints protected by existing Bearer token auth
- Conversation IDs are UUIDs — not guessable
- No change to network security (Tailscale)

## New Dependencies

- None. Uses existing Supabase, Ollama, and osascript infrastructure.

## Acceptance Criteria

1. Send a question, receive answer with conversation context from prior messages
2. Start a new conversation from the conversation list
3. Recall an old conversation and continue it
4. Say "capture a task to X" and see it appear in vault and Supabase
5. Say "update the X task to Y" and see the task updated
6. Say "change my X reminder to Y" and see the Apple Reminder updated
7. Tap X button to clear text input instantly
8. Tap Stop while "Thinking..." to cancel the request
9. Tap speaker while TTS is reading to stop speech (TTS stays enabled)
10. TTS reads the next response automatically (still enabled after stop)
