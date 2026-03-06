# Coding Conventions

**Analysis Date:** 2026-03-06

## Naming Patterns

**Files:**
- Use kebab-case for all source files: `processed-tracker.ts`, `session-start.ts`, `pr-event.ts`
- Single-word filenames where possible: `vault.ts`, `git.ts`, `search.ts`, `capture.ts`
- No file suffixes for type (no `.service.ts`, `.controller.ts`) -- just the noun

**Functions:**
- Use camelCase: `loadConfig`, `getGitContext`, `resolveProjectFromPath`, `extractTitle`
- Prefix getters with `get`: `getConfig`, `getEntryPath`, `getByBranch`, `getByProject`
- Prefix boolean checks with `is`: `isProcessed`, `isAvailable`
- Prefix registration functions with `register`: `registerSearchTools`, `registerBranchTools`
- Prefix creation functions with `create`: `createServer`, `createAppleReminder`
- Prefix event handlers with `handle`: `handlePostCommit`, `handlePrEvent`, `handleSessionStart`

**Variables:**
- Use camelCase: `vaultPath`, `contextDir`, `watchDir`
- Use descriptive names, no abbreviations except common ones (`ctx` for context, `opts` for options)

**Types/Interfaces:**
- Use PascalCase: `ContextEntry`, `Config`, `GitContext`, `ProjectConfig`
- Prefix interface-only types with descriptive nouns, no `I` prefix
- Use `type` keyword for union types: `type ContextType = 'branch_context' | 'pr_context' | ...`

**Classes:**
- Use PascalCase with service suffix: `VaultService`, `SupabaseService`, `EmbeddingsService`, `WhisperService`
- Exception: domain classes use domain name: `ProcessedTracker`, `VoiceProcessor`, `VoiceWatcher`

**Constants:**
- Use SCREAMING_SNAKE_CASE for module-level constants: `DEFAULT_CONFIG_PATH`, `REMINDER_PATTERN`

## Code Style

**Formatting:**
- No dedicated formatter config (no `.prettierrc`, no `biome.json`)
- Consistent 2-space indentation throughout
- Single quotes for strings
- Semicolons at end of statements
- Trailing commas in multi-line parameter lists

**Linting:**
- No ESLint config in project root
- TypeScript strict mode is enabled in `tsconfig.json`
- Rely on `tsc --strict` for type checking

**Line Length:**
- No enforced limit, but lines generally stay under 120 characters
- Long Supabase query chains are broken across lines with method chaining

## Import Organization

**Order:**
1. Node.js built-ins: `import { readFileSync } from 'fs'` or `import { execFile } from 'node:child_process'`
2. External packages: `import { z } from 'zod'`, `import { simpleGit } from 'simple-git'`
3. Internal absolute imports: `import { getConfig } from '../config.js'`
4. Type-only imports use `import type`: `import type { Config } from '../types.js'`

**Path conventions:**
- All internal imports use `.js` extension (required by Node16 module resolution)
- No path aliases -- use relative paths throughout
- Type imports always use `import type` syntax

**Example from `src/hooks/post-commit.ts`:**
```typescript
import { getConfig } from '../config.js';
import { getGitContext } from '../services/git.js';
import { VaultService } from '../services/vault.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { SupabaseService } from '../services/supabase.js';
import type { ContextEntry } from '../types.js';
```

## Error Handling

**Patterns:**

1. **Throw with descriptive message for critical failures:**
   ```typescript
   if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
   ```

2. **Silent catch for non-critical failures (vault writes succeed, DB sync can fail):**
   ```typescript
   try {
     if (await embeddings.isAvailable()) {
       const embedding = await embeddings.embed(entry.content);
       await supabase.upsertEntry(entry, embedding);
     }
   } catch {
     // Vault is primary, DB sync later
   }
   ```

3. **Graceful degradation with warning message:**
   ```typescript
   } catch (error) {
     console.error(`Warning: sync failed for ${audioPath}:`, error);
   }
   ```

4. **MCP tools return error text instead of throwing:**
   ```typescript
   } catch (error) {
     const message = error instanceof Error ? error.message : String(error);
     return {
       content: [{ type: 'text' as const, text: `Error searching context: ${message}` }],
       isError: true,
     };
   }
   ```

5. **Error message extraction pattern -- use consistently:**
   ```typescript
   const message = error instanceof Error ? error.message : String(error);
   ```

6. **Empty catch blocks for filesystem operations that may not exist:**
   ```typescript
   try { unlinkSync(wavPath); } catch {}
   ```

**When to use which:**
- MCP tool handlers: return `{ isError: true }` response, never throw
- Services: throw errors, let callers decide how to handle
- Hooks: catch at top level, log warning, continue
- Filesystem reads that may not exist: empty catch returning default value

## Logging

**Framework:** `console` (no logging library)

**Patterns:**
- `console.log` for success/info: `console.log(\`Captured: "${result.title}" -> ${result.vaultPath}\`)`
- `console.error` for warnings and errors: `console.error(\`Warning: sync failed...\`)`
- Use template literals for all log messages
- Prefix warnings with `Warning:` string

## Comments

**When to Comment:**
- Inline comments explain "why" not "what": `// Vault write is the priority -- DB sync can happen later`
- Comments explain non-obvious behavior: `// Debounce: fs.watch fires multiple events per file`
- Comments mark workarounds: `// Permanent guard -- once handled, never again`
- No JSDoc/TSDoc used anywhere

**Style:**
- Single-line `//` comments only
- No multi-line `/* */` blocks
- No documentation comments on exported functions or classes

## Function Design

**Size:** Functions are small, typically under 30 lines. Largest functions are MCP tool handlers.

**Parameters:**
- Use options objects for 3+ optional params: `opts?: { project?: string; repo?: string; type?: ContextType; limit?: number }`
- Use positional params for 1-2 required params: `getByBranch(branch: string, repo?: string, project?: string)`
- Use nullish coalescing for defaults: `opts?.limit ?? 10`

**Return Values:**
- Return `null` or `undefined` for "not found" cases, never throw
- Async functions return `Promise<T>` -- no callbacks
- MCP tools return `{ content: [{ type: 'text', text: string }] }` format

## Module Design

**Exports:**
- One class or one primary function per file
- Named exports only -- no default exports anywhere
- Helper functions are module-private (not exported)

**Barrel Files:**
- No barrel files (`index.ts` re-exports) in any directory
- Each consumer imports directly from the source file

## Class Design

**Pattern:** Constructor injection for dependencies.

```typescript
export class VoiceProcessor {
  constructor(
    private whisper: WhisperService,
    private vault: VaultService,
    private embeddings: EmbeddingsService,
    private supabase: SupabaseService,
    private tracker: ProcessedTracker,
  ) {}
}
```

**Private members:** Use TypeScript `private` keyword, not `#` private fields.

**No inheritance:** All classes are standalone, no class hierarchy.

## MCP Tool Registration Pattern

All MCP tools follow this pattern in `src/mcp/tools/*.ts`:

```typescript
export function registerXxxTools(server: McpServer, services: Services): void {
  server.registerTool(
    'tool_name',
    {
      description: 'Tool description.',
      inputSchema: {
        param: z.string().describe('Param description'),
      },
    },
    async ({ param }) => {
      // implementation
      return { content: [{ type: 'text' as const, text: result }] };
    }
  );
}
```

Use Zod for input validation schemas. Each tool file registers one or more tools and exports a single `register*Tools` function.

## Type Assertion Patterns

- Use `as const` for MCP response type literals: `type: 'text' as const`
- Use `as any` sparingly in tests for mock objects (see TESTING.md)
- Use `as Record<string, unknown>` for parsed YAML data
- Avoid type assertions in production code except for YAML/JSON parsing boundaries

---

*Convention analysis: 2026-03-06*
