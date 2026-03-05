# Hook Fixes & Learning Categories Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix CLI hook crashes on missing stdin and add tag-based category guidance/filtering for learned entries.

**Architecture:** Guard stdin reads with try/catch in CLI commands. Update `capture_learned` description to suggest category tags. Add `tag` filter param to `search_context` that filters on `metadata->>tags`.

**Tech Stack:** TypeScript, Zod, Supabase (jsonb containment operator `@>`), Commander CLI

---

### Task 1: Fix CLI stdin guard for capture-hook

**Files:**
- Modify: `src/cli.ts:19-25` (capture-hook action)

**Step 1: Update capture-hook to guard stdin**

Replace the raw stdin read + JSON.parse with a guarded version:

```typescript
.action(async (opts) => {
    let input: Record<string, unknown>;
    try {
      const chunks: Buffer[] = [];
      process.stdin.resume();
      process.stdin.setTimeout?.(100);
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString().trim();
      if (!raw) {
        console.error('second-brain: no stdin provided, skipping capture-hook');
        return;
      }
      input = JSON.parse(raw);
    } catch {
      console.error('second-brain: invalid or missing stdin for capture-hook, skipping');
      return;
    }

    switch (opts.event) {
      case 'post-commit':
        await handlePostCommit(input);
        break;
      case 'pr-event':
        await handlePrEvent(input);
        break;
      default:
        console.error(`Unknown event: ${opts.event}`);
        process.exit(1);
    }
  });
```

**Step 2: Verify manually**

Run: `echo '' | npx tsx src/cli.ts capture-hook --event post-commit`
Expected: Prints warning to stderr, exits 0 (no crash)

Run: `echo '{}' | npx tsx src/cli.ts capture-hook --event post-commit`
Expected: Runs without crash (may fail on git context, that's fine)

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "fix: guard capture-hook stdin against empty/invalid JSON"
```

---

### Task 2: Fix CLI stdin guard for session-context

**Files:**
- Modify: `src/cli.ts:43-48` (session-context action)

**Step 1: Update session-context to guard stdin**

Replace the raw stdin read + JSON.parse with a guarded version:

```typescript
.action(async () => {
    let input: Record<string, unknown>;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks).toString().trim();
      if (!raw) {
        console.error('second-brain: no stdin provided, skipping session-context');
        return;
      }
      input = JSON.parse(raw);
    } catch {
      console.error('second-brain: invalid or missing stdin for session-context, skipping');
      return;
    }

    const context = await handleSessionStart(input);
    if (context) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        },
      }));
    }
  });
```

**Step 2: Verify manually**

Run: `echo '' | npx tsx src/cli.ts session-context`
Expected: Prints warning to stderr, exits 0

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "fix: guard session-context stdin against empty/invalid JSON"
```

---

### Task 3: Update capture_learned description with category tags

**Files:**
- Modify: `src/mcp/tools/capture.ts:59-68` (capture_learned registration)

**Step 1: Update description and tags param**

Change the `capture_learned` tool registration:

```typescript
server.registerTool(
    'capture_learned',
    {
      description:
        'Capture something learned — a technique, gotcha, pattern, or insight worth remembering. Use tags to categorize: technique, gotcha, personal, pattern, insight, idea.',
      inputSchema: {
        title: z.string().describe('Title of what was learned'),
        content: z.string().describe('What was learned, including context and examples'),
        project: z.string().optional().describe('Project name'),
        tags: z.array(z.string()).optional().describe('Tags for categorization. Suggested categories: technique, gotcha, personal, pattern, insight, idea'),
      },
    },
    // ... handler unchanged
```

**Step 2: Verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/mcp/tools/capture.ts
git commit -m "feat: add suggested category tags to capture_learned description"
```

---

### Task 4: Add tag filter to search_context

**Files:**
- Modify: `src/mcp/tools/search.ts:33-46` (search_context inputSchema)
- Modify: `src/mcp/tools/search.ts:48-56` (search_context handler)

**Step 1: Add tag param to inputSchema**

Add after the `limit` field:

```typescript
tag: z.string().optional().describe('Filter by tag (e.g. "personal", "gotcha", "technique")'),
```

**Step 2: Pass tag to search call**

Update the handler to pass the tag filter:

```typescript
async ({ query, project, repo, type, limit, tag }) => {
      try {
        const embedding = await services.embeddings.embed(query);
        const results = await services.supabase.searchByEmbedding(embedding, {
          project,
          repo,
          type,
          tag,
          limit: limit ?? 10,
        });
```

**Step 3: Commit**

```bash
git add src/mcp/tools/search.ts
git commit -m "feat: add tag filter param to search_context tool"
```

---

### Task 5: Add tag filtering to Supabase searchByEmbedding

**Files:**
- Modify: `src/services/supabase.ts:51-64` (searchByEmbedding method)

**Step 1: Add tag to opts type and filter logic**

Update the method signature and add post-RPC filtering (since the RPC doesn't support jsonb containment):

```typescript
async searchByEmbedding(
    embedding: number[],
    opts?: { project?: string; repo?: string; type?: ContextType; tag?: string; limit?: number }
  ): Promise<ContextEntry[]> {
    const { data, error } = await this.client.rpc('match_context_entries', {
      query_embedding: embedding,
      match_count: opts?.tag ? (opts?.limit ?? 10) * 3 : (opts?.limit ?? 10),
      filter_project: opts?.project ?? null,
      filter_repo: opts?.repo ?? null,
      filter_type: opts?.type ?? null,
    });

    if (error) throw new Error(`Supabase search failed: ${error.message}`);
    let results = (data ?? []).map(this.toContextEntry);

    if (opts?.tag) {
      results = results.filter((entry) => {
        const tags = entry.metadata?.tags;
        return Array.isArray(tags) && tags.includes(opts.tag);
      });
      results = results.slice(0, opts?.limit ?? 10);
    }

    return results;
  }
```

Note: We over-fetch by 3x when filtering by tag, then filter in JS and trim to the requested limit. This avoids modifying the Supabase RPC function. If tag filtering becomes performance-critical later, the RPC can be updated to accept a `filter_tag` param with `@>` jsonb containment.

**Step 2: Build and verify**

Run: `npm run build`
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/services/supabase.ts
git commit -m "feat: add tag filtering to searchByEmbedding"
```

---

### Task 6: End-to-end verification

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean compile

**Step 2: Test hook stdin guards**

Run: `echo '' | npx tsx src/cli.ts capture-hook --event post-commit`
Expected: Warning to stderr, exit 0

Run: `echo '' | npx tsx src/cli.ts session-context`
Expected: Warning to stderr, exit 0

**Step 3: Test via MCP (manual)**

Restart Claude Code, then:
1. `capture_learned(title: "Test category", content: "Testing tag filtering", tags: ["personal", "test"])`
2. `search_context(query: "test category", tag: "personal")` — should return the entry
3. `search_context(query: "test category", tag: "gotcha")` — should NOT return it

**Step 4: Final commit if any fixes needed**
