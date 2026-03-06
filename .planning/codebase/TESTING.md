# Testing Patterns

**Analysis Date:** 2026-03-06

## Test Framework

**Runner:**
- Vitest 4.x
- Config: No `vitest.config.ts` -- uses defaults with `tsconfig.test.json` via `package.json` type: "module"
- TypeScript config for tests: `tsconfig.test.json` (extends base, adds `tests/**/*` to include, sets `noEmit: true`)

**Assertion Library:**
- Vitest built-in `expect` (Chai-compatible API)

**Run Commands:**
```bash
npm test                # Run all tests once (vitest run)
npm run test:watch      # Watch mode (vitest)
```

## Test File Organization

**Location:** Separate `tests/` directory mirroring `src/` structure.

**Naming:** `{module-name}.test.ts`

**Structure:**
```
tests/
  config.test.ts                    # Tests for src/config.ts
  services/
    vault.test.ts                   # Tests for src/services/vault.ts
    git.test.ts                     # Tests for src/services/git.ts
    supabase.test.ts                # Tests for src/services/supabase.ts
    embeddings.test.ts              # Tests for src/services/embeddings.ts
    processed-tracker.test.ts       # Tests for src/services/processed-tracker.ts
    whisper.test.ts                 # Tests for src/services/whisper.ts
  voice/
    processor.test.ts               # Tests for src/voice/processor.ts
```

**Not tested (no test files):**
- `src/mcp/server.ts` -- MCP server creation
- `src/mcp/tools/*.ts` -- All 6 MCP tool registration modules
- `src/hooks/*.ts` -- All 3 hook handlers (post-commit, pr-event, session-start)
- `src/voice/watcher.ts` -- File system watcher
- `src/services/reminders.ts` -- Apple Reminders integration
- `src/cli.ts` -- CLI entry point
- `src/index.ts` -- MCP entry point

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('ClassName or functionName', () => {
  // Setup/teardown at suite level
  let service: ServiceClass;

  beforeEach(() => {
    // Fresh instance per test
    service = new ServiceClass(args);
  });

  afterEach(() => {
    // Cleanup (temp dirs, etc.)
  });

  it('describes specific behavior in plain english', () => {
    // Arrange, Act, Assert (no comments separating them)
  });

  describe('methodName', () => {
    it('describes what the method does in this case', async () => {
      // ...
    });
  });
});
```

**Patterns:**
- Use `describe` blocks to group by class/function, nested `describe` for methods
- Test names start with a verb: "loads and parses...", "throws on...", "returns false for..."
- No `test()` alias -- always use `it()`
- Import test utilities explicitly: `import { describe, it, expect, vi, beforeEach } from 'vitest'`

## Mocking

**Framework:** Vitest built-in `vi.mock()`, `vi.fn()`, `vi.stubGlobal()`

**Pattern 1: Module mocking with `vi.mock()` (hoisted)**
Used for external packages like `@supabase/supabase-js`:
```typescript
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

// Import AFTER mock setup
import { SupabaseService } from '../../src/services/supabase.js';
```

**Pattern 2: Global stubbing with `vi.stubGlobal()`**
Used for `fetch`:
```typescript
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
```

**Pattern 3: Manual mock objects with `as any`**
Used for dependency injection in classes like `VoiceProcessor`:
```typescript
const mockWhisper = { transcribe: vi.fn().mockResolvedValue('transcript text') };
const mockVault = { writeEntry: vi.fn().mockReturnValue('/vault/path.md') };
const mockEmbeddings = { isAvailable: vi.fn().mockResolvedValue(true), embed: vi.fn().mockResolvedValue([0.1]) };
const mockSupabase = { upsertEntry: vi.fn().mockResolvedValue(undefined) };
const mockTracker = { isProcessed: vi.fn().mockReturnValue(false), markProcessed: vi.fn() };

const processor = new VoiceProcessor(
  mockWhisper as any,
  mockVault as any,
  mockEmbeddings as any,
  mockSupabase as any,
  mockTracker as any,
);
```

**Pattern 4: Chainable query mock (Supabase-specific)**
Found in `tests/services/supabase.test.ts` -- a `createQueryMock` helper that uses Proxy to support chained method calls:
```typescript
function createQueryMock(resolvedValue: { data: unknown; error: unknown }) {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {};
  const chain = () =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve(resolvedValue);
          }
          if (!mock[prop]) {
            mock[prop] = vi.fn().mockReturnValue(chain());
          }
          return mock[prop];
        },
      },
    );
  return { chain: chain(), mocks: mock };
}
```

**What to Mock:**
- External HTTP APIs (fetch, Supabase client, Ollama)
- Child process execution (`node:child_process`)
- File system operations (only in `whisper.test.ts` for `unlinkSync`)

**What NOT to Mock:**
- File system for integration-style tests -- use real temp directories (`tmpdir()`)
- The module under test itself
- Simple data transformations

## Fixtures and Factories

**Test Data:** Inline object literals, no shared fixtures or factory functions.

```typescript
const entry: ContextEntry = {
  type: 'branch_context',
  project: 'tesla',
  repo: 'core-ui',
  branch: 'feature-auth',
  title: 'Branch: feature-auth',
  content: '## Status\nIn progress.',
  metadata: { tags: ['auth'] },
  createdAt: new Date('2026-03-04T15:00:00Z'),
  updatedAt: new Date('2026-03-04T15:00:00Z'),
};
```

**Temp directories for filesystem tests:**
```typescript
const tmpDir = join(tmpdir(), 'second-brain-test-vault');

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});
```

**Location:** No dedicated fixtures directory. All test data is co-located inline in test files.

## Coverage

**Requirements:** None enforced. No coverage thresholds configured.

**View Coverage:**
```bash
npx vitest run --coverage     # Not configured but would work with @vitest/coverage-v8
```

## Test Types

**Unit Tests:**
- All tests are unit tests
- Services are tested in isolation with mocked dependencies
- `VaultService` and `ProcessedTracker` use real filesystem (temp dirs) -- effectively integration tests
- `getGitContext` test uses the real git repo (hardcoded path `/Users/johrt/Code/second-brain`)

**Integration Tests:**
- No dedicated integration test suite
- Filesystem-based tests in `vault.test.ts` and `processed-tracker.test.ts` serve as lightweight integration tests

**E2E Tests:**
- Not used

## Common Patterns

**Async Testing:**
```typescript
it('calls Ollama API and returns embedding vector', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ embedding: fakeEmbedding }),
  });

  const result = await service.embed('test text');
  expect(result).toEqual(fakeEmbedding);
});
```

**Error Testing:**
```typescript
it('throws on missing config file', () => {
  expect(() => loadConfig('/nonexistent/config.yml')).toThrow();
});

it('throws for a non-git directory', async () => {
  await expect(getGitContext('/tmp')).rejects.toThrow();
});

it('throws on upsert error', async () => {
  mockUpsert.mockResolvedValue({ error: { message: 'duplicate key' } });
  await expect(service.upsertEntry(entry)).rejects.toThrow('Supabase upsert failed: duplicate key');
});
```

**Assertion Patterns:**
- `expect(x).toBe(y)` for primitives
- `expect(x).toEqual(y)` for objects/arrays
- `expect(x).toContain(y)` for string/array inclusion
- `expect(x).toBeNull()` / `toBeUndefined()` / `toBeTruthy()`
- `expect(x).toBeInstanceOf(Class)` for type checks
- `expect(fn).toHaveBeenCalledWith(...)` for mock verification
- `expect.objectContaining({...})` for partial object matching

**Reset Pattern:**
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  service = new SupabaseService('https://example.supabase.co', 'test-key');
});
```

## Known Test Issues

**Hardcoded path in `tests/services/git.test.ts`:**
- Line 6 uses `/Users/johrt/Code/second-brain` which fails on other machines
- This test currently fails (1 of 51 tests) because the path does not exist on the current system

## Adding New Tests

**For a new service in `src/services/foo.ts`:**
1. Create `tests/services/foo.test.ts`
2. Import from `vitest`: `describe`, `it`, `expect`, plus `vi`/`beforeEach` if mocking
3. Mock external dependencies with `vi.mock()` or `vi.stubGlobal()`
4. Use real temp directories for filesystem tests
5. Follow `describe('ClassName') > describe('methodName') > it('behavior')` nesting

**For a new MCP tool:**
- No existing pattern -- MCP tools have no tests currently
- Would need to mock the `Services` object and call the tool handler directly

---

*Testing analysis: 2026-03-06*
