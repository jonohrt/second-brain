# Phase 1: Server Foundation - Research

**Researched:** 2026-03-06
**Domain:** Fastify HTTP server, bearer auth, SearXNG Docker, Ollama memory management
**Confidence:** HIGH

## Summary

This phase stands up a Fastify HTTP server that exposes /health and /capture endpoints, authenticates requests via static bearer token, deploys SearXNG in Docker for web search, and manages Ollama models within the 8GB RAM constraint. The existing codebase provides a clean service layer (VaultService, EmbeddingsService, SupabaseService) and a `captureEntry()` function that can be called directly from the /capture route -- the main work is wiring Fastify around these existing services.

The project already uses TypeScript with ES modules, vitest for testing, Zod for validation, and YAML config via js-yaml. Fastify v5 (latest 5.7.x) integrates cleanly with this stack. SearXNG runs as a standalone Docker container with JSON API enabled. Ollama model management is handled by setting `OLLAMA_MAX_LOADED_MODELS=1` and using `keep_alive: 0` to unload embedding models before loading chat models.

**Primary recommendation:** Keep the server as thin as possible -- Fastify with @fastify/bearer-auth for auth, one route file for /capture, reuse the existing `captureEntry()` function, and a simple docker-compose.yml for SearXNG.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Static bearer token stored in config.yml (new `api_token` field) -- simplest approach for single-user personal server
- iOS app stores the token once, no rotation mechanism needed
- Generic 401 response for unauthenticated requests -- no descriptive error messages
- /health endpoint is public (no auth required) -- useful for monitoring, no sensitive data
- All other endpoints require valid bearer token
- Listen on 0.0.0.0 (all interfaces) -- Tailscale handles network isolation, simplest config

### Claude's Discretion
- Capture endpoint design -- how /capture maps to existing captureEntry logic (VoiceProcessor is for audio; API receives text, so reuse the MCP-style captureEntry pattern)
- API response JSON structure and status codes
- Server lifecycle and process management (how it runs persistently)
- SearXNG Docker configuration details
- Ollama sequential model loading strategy
- Port number selection
- Error handling patterns

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Fastify HTTP server with /health endpoint | Fastify v5.7.x setup, route patterns, TypeScript integration documented below |
| INFRA-02 | Bearer token authentication on all API endpoints | @fastify/bearer-auth v10.x with scoped registration to exclude /health |
| INFRA-03 | SearXNG running via Docker with JSON API enabled | Docker compose config, settings.yml with json format, API query patterns |
| INFRA-04 | API server accessible remotely via Tailscale (already installed) | Listen on 0.0.0.0, Tailscale already installed per project context |
| INFRA-05 | Sequential Ollama model loading to fit 8GB RAM | OLLAMA_MAX_LOADED_MODELS=1, keep_alive:0 for immediate unload, stop command |
| CAP-01 | /capture endpoint accepts text and runs existing voice processor pipeline | Reuse captureEntry() from src/mcp/tools/capture.ts, accept text directly |
| CAP-02 | Returns confirmation with title and vault path | captureEntry() already returns title and vaultPath in its response string |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.7.4 | HTTP server framework | Official Fastify v5, low overhead, native TypeScript, plugin architecture |
| @fastify/bearer-auth | ^10.x | Bearer token authentication | Official Fastify plugin, constant-time key comparison, scoped registration |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 (existing) | Request body validation | Validate /capture request body |
| js-yaml | ^4.1.1 (existing) | Config file parsing | Load api_token from config.yml |
| searxng/searxng (Docker) | latest | Web search engine | SearXNG container for JSON search API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @fastify/bearer-auth | Manual onRequest hook | Plugin handles constant-time comparison, error responses, scoping -- not worth hand-rolling |
| Fastify | Express/Koa | Project needs are simple, but Fastify has better TypeScript support and is faster |

**Installation:**
```bash
npm install fastify @fastify/bearer-auth
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── server/
│   ├── index.ts          # Server entry point (create, configure, start)
│   ├── routes/
│   │   ├── health.ts     # GET /health (public)
│   │   └── capture.ts    # POST /capture (authenticated)
│   └── plugins/
│       └── auth.ts       # Bearer auth plugin registration
├── services/             # Existing -- vault, supabase, embeddings
├── mcp/                  # Existing -- MCP server
├── config.ts             # Existing -- extend Config type
└── types.ts              # Existing -- extend with server config
```

### Pattern 1: Scoped Auth via Fastify Plugin Registration
**What:** Register @fastify/bearer-auth only on authenticated route prefixes, leaving /health unprotected.
**When to use:** When some routes need auth and others do not.
**Example:**
```typescript
// Source: @fastify/bearer-auth docs
import Fastify from 'fastify';
import bearerAuth from '@fastify/bearer-auth';

const app = Fastify({ logger: true });

// Public routes
app.get('/health', async () => ({ status: 'ok' }));

// Authenticated routes
app.register(async function authedRoutes(instance) {
  await instance.register(bearerAuth, {
    keys: new Set([config.server.apiToken]),
    errorResponse: () => ({ error: 'Unauthorized' }),
  });

  instance.post('/capture', captureHandler);
}, { prefix: '/' });
```

### Pattern 2: Reuse captureEntry() from MCP Tools
**What:** Extract the `captureEntry()` function from `src/mcp/tools/capture.ts` into a shared location and call it from both the MCP tool and the Fastify route.
**When to use:** The /capture endpoint does exactly what the MCP capture tools do -- write to vault + sync to Supabase.
**Example:**
```typescript
// src/server/routes/capture.ts
import type { FastifyInstance } from 'fastify';
import { captureEntry } from '../../services/capture.js';  // extracted
import type { Services } from '../../mcp/server.js';
import { z } from 'zod';

const CaptureBody = z.object({
  text: z.string().min(1),
  title: z.string().optional(),
  type: z.enum(['decision', 'learned', 'task', 'session']).default('learned'),
  tags: z.array(z.string()).optional(),
});

export async function captureRoutes(app: FastifyInstance, services: Services) {
  app.post('/capture', async (request, reply) => {
    const parsed = CaptureBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { text, title, type, tags } = parsed.data;
    const now = new Date();
    const entry = {
      type,
      title: title ?? text.slice(0, 60),
      content: text,
      metadata: { tags: tags ?? [] },
      createdAt: now,
      updatedAt: now,
    };

    const result = await captureEntry(entry, services);
    return reply.status(201).send({
      success: true,
      title: entry.title,
      vaultPath: entry.vaultPath,
      message: result,
    });
  });
}
```

### Pattern 3: Service Instantiation (Follow MCP Pattern)
**What:** Instantiate services in the server entry point the same way the MCP server does.
**When to use:** Server startup.
**Example:**
```typescript
// src/server/index.ts
import Fastify from 'fastify';
import { getConfig } from '../config.js';
import { SupabaseService } from '../services/supabase.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { VaultService } from '../services/vault.js';

const config = getConfig();
const services = {
  supabase: new SupabaseService(config.supabase.url, config.supabase.key),
  embeddings: new EmbeddingsService(config.ollama.baseUrl, config.ollama.model),
  vault: new VaultService(config.vaultPath, config.contextDir),
  config,
};

const app = Fastify({ logger: true });
// ... register routes with services
await app.listen({ port: config.server?.port ?? 3000, host: '0.0.0.0' });
```

### Anti-Patterns to Avoid
- **Global middleware for auth:** Do not use a global onRequest hook for auth -- use scoped plugin registration so /health stays public.
- **Duplicating captureEntry logic:** Do not rewrite vault+supabase logic in the route handler -- extract and reuse the existing function.
- **Hardcoding the token:** Do not put the bearer token in source code -- read it from config.yml.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bearer token auth | Custom header parsing + comparison | @fastify/bearer-auth | Handles constant-time comparison, proper 401 responses, RFC 6750 compliance |
| Web search | Custom scraping or API wrappers | SearXNG Docker container | Meta-search engine with dozens of backends, JSON API, zero maintenance |
| Model memory management | Custom Ollama process management | OLLAMA_MAX_LOADED_MODELS=1 env var | Ollama natively handles sequential loading, queuing, and unloading |

**Key insight:** Every component in this phase either already exists (captureEntry, services) or has a turnkey solution (SearXNG Docker, @fastify/bearer-auth). The work is integration, not invention.

## Common Pitfalls

### Pitfall 1: SearXNG JSON Format Not Enabled
**What goes wrong:** SearXNG returns 403 Forbidden when requesting `?format=json`.
**Why it happens:** JSON format is disabled by default in SearXNG. The settings.yml must explicitly include `json` in `search.formats`.
**How to avoid:** Mount a custom settings.yml into the Docker container with:
```yaml
search:
  formats:
    - html
    - json
server:
  limiter: false
```
**Warning signs:** HTTP 403 on `/search?q=test&format=json`.

### Pitfall 2: Ollama Embedding Model Blocks Chat Model
**What goes wrong:** Embedding model stays loaded in memory, preventing the chat model from loading on 8GB RAM.
**Why it happens:** Ollama keeps models loaded for 5 minutes by default. With only 8GB RAM, two models cannot coexist.
**How to avoid:** Set `OLLAMA_MAX_LOADED_MODELS=1` as an environment variable for the Ollama process. For Phase 1, only the embedding model is needed (capture pipeline). In Phase 2, use `keep_alive: "0"` on embedding requests so the model unloads immediately after use, freeing RAM for chat models.
**Warning signs:** Ollama requests hanging or returning out-of-memory errors.

### Pitfall 3: Fastify Route Scope Confusion
**What goes wrong:** Auth hook applies to /health, or authenticated routes lack auth.
**Why it happens:** @fastify/bearer-auth uses Fastify's encapsulation model -- it only applies to routes registered within the same scope.
**How to avoid:** Register /health before or outside the authenticated scope. Register @fastify/bearer-auth inside a `register()` block that also contains the protected routes.
**Warning signs:** /health returning 401, or protected routes accessible without token.

### Pitfall 4: captureEntry Not Extracted as Shared Function
**What goes wrong:** Duplicated vault+embed+supabase logic in the route handler diverges from MCP tool behavior.
**Why it happens:** `captureEntry()` is currently a private function inside `src/mcp/tools/capture.ts`.
**How to avoid:** Extract it to `src/services/capture.ts` as a shared function. Both MCP tools and Fastify routes import from the same location.
**Warning signs:** Different behavior between MCP capture and API capture.

### Pitfall 5: Config Type Not Extended
**What goes wrong:** TypeScript errors when accessing `config.server.port` or `config.server.apiToken`.
**Why it happens:** The Config interface in types.ts does not have a `server` field.
**How to avoid:** Add `server?: { port: number; apiToken: string }` to the Config interface and update loadConfig() to parse it from config.yml.
**Warning signs:** TypeScript compilation errors.

## Code Examples

### Fastify Server Entry Point
```typescript
// src/server/index.ts
import Fastify from 'fastify';
import bearerAuth from '@fastify/bearer-auth';
import { getConfig } from '../config.js';
import { SupabaseService } from '../services/supabase.js';
import { EmbeddingsService } from '../services/embeddings.js';
import { VaultService } from '../services/vault.js';

export async function startServer() {
  const config = getConfig();
  const port = config.server?.port ?? 3000;
  const token = config.server?.apiToken;

  if (!token) {
    throw new Error('server.api_token must be set in config.yml');
  }

  const services = {
    supabase: new SupabaseService(config.supabase.url, config.supabase.key),
    embeddings: new EmbeddingsService(config.ollama.baseUrl, config.ollama.model),
    vault: new VaultService(config.vaultPath, config.contextDir),
    config,
  };

  const app = Fastify({ logger: true });

  // Public routes
  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Protected routes
  app.register(async (instance) => {
    await instance.register(bearerAuth, {
      keys: new Set([token]),
      errorResponse: () => ({ error: 'Unauthorized' }),
    });
    // register /capture and future routes here
  });

  await app.listen({ port, host: '0.0.0.0' });
  return app;
}
```

### SearXNG Docker Compose
```yaml
# docker/docker-compose.yml
services:
  searxng:
    image: searxng/searxng:latest
    container_name: searxng
    ports:
      - "8888:8080"
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro
    restart: unless-stopped
```

### SearXNG Settings
```yaml
# docker/searxng/settings.yml
use_default_settings: true
server:
  limiter: false
  secret_key: "generate-a-random-key-here"
search:
  formats:
    - html
    - json
```

### Querying SearXNG from Node.js
```typescript
// Example for Phase 2, but deployed in Phase 1
async function searchWeb(query: string): Promise<SearchResult[]> {
  const url = new URL('http://localhost:8888/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`SearXNG error: ${response.status}`);

  const data = await response.json();
  return data.results;  // array of { title, url, content, engine, ... }
}
```

### Config Extension
```yaml
# ~/.second-brain/config.yml additions
server:
  port: 3000
  api_token: "your-secret-token-here"
```

```typescript
// types.ts addition
export interface Config {
  // ... existing fields ...
  server?: {
    port: number;
    apiToken: string;
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fastify v4 | Fastify v5 | Late 2024 | Requires Node.js v20+, removed deprecated APIs |
| fastify-bearer-auth v9 | @fastify/bearer-auth v10 | With Fastify v5 | Scoped package name, Fastify 5 compatibility |
| Ollama manual model management | OLLAMA_MAX_LOADED_MODELS env var | 2024 | Built-in sequential loading support |

**Deprecated/outdated:**
- `fastify-bearer-auth` (unscoped): Use `@fastify/bearer-auth` instead
- Ollama `/api/generate` with `keep_alive` for unloading: Still works, but `OLLAMA_MAX_LOADED_MODELS=1` is simpler for global policy

## Open Questions

1. **Port number for the API server**
   - What we know: Any port works, needs to be accessible via Tailscale
   - What's unclear: Whether any port conflicts exist on the Mac Mini
   - Recommendation: Default to 3000 in config, document how to change

2. **Process management for persistent server**
   - What we know: Server needs to run persistently on the Mac Mini
   - What's unclear: Whether to use launchd, pm2, or just a tmux/screen session
   - Recommendation: Start with a simple npm script (`npm run server`); add launchd plist later if needed. Keep it simple per user preference.

3. **SearXNG port selection**
   - What we know: SearXNG defaults to 8080 in Docker
   - What's unclear: Whether 8080 conflicts with anything
   - Recommendation: Map to 8888 externally to avoid common conflicts

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.0.18 |
| Config file | None (uses package.json scripts) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | GET /health returns success JSON | integration | `npx vitest run tests/server/health.test.ts -t "health"` | No -- Wave 0 |
| INFRA-02 | Requests without valid bearer token return 401 | integration | `npx vitest run tests/server/auth.test.ts -t "auth"` | No -- Wave 0 |
| INFRA-03 | SearXNG returns JSON search results | smoke | `curl -s "http://localhost:8888/search?q=test&format=json" \| jq .results` | No -- manual verification |
| INFRA-04 | Server reachable via Tailscale | manual-only | Manual: curl from iPhone on Tailscale network | N/A (network test) |
| INFRA-05 | Ollama sequential model loading within 8GB | manual-only | Manual: check `OLLAMA_MAX_LOADED_MODELS=1` is set | N/A (env config) |
| CAP-01 | POST /capture with text returns success | integration | `npx vitest run tests/server/capture.test.ts -t "capture"` | No -- Wave 0 |
| CAP-02 | Response includes title and vault path | integration | `npx vitest run tests/server/capture.test.ts -t "response"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `tests/server/health.test.ts` -- covers INFRA-01
- [ ] `tests/server/auth.test.ts` -- covers INFRA-02
- [ ] `tests/server/capture.test.ts` -- covers CAP-01, CAP-02
- [ ] Test helper to create Fastify app instance with mock services

## Sources

### Primary (HIGH confidence)
- [npm: fastify 5.7.4](https://www.npmjs.com/package/fastify) -- current version confirmed
- [@fastify/bearer-auth README](https://github.com/fastify/fastify-bearer-auth/blob/main/Readme.md) -- scoped registration, keys Set, v10 for Fastify 5
- [SearXNG Search API docs](https://docs.searxng.org/dev/search_api.html) -- endpoints, parameters, JSON format
- [SearXNG Docker installation](https://docs.searxng.org/admin/installation-docker.html) -- container setup
- [Ollama FAQ](https://docs.ollama.com/faq) -- keep_alive, OLLAMA_MAX_LOADED_MODELS

### Secondary (MEDIUM confidence)
- [Ollama GitHub issue #7370](https://github.com/ollama/ollama/issues/7370) -- stop command for model unloading
- [SearXNG GitHub discussion #3542](https://github.com/searxng/searxng/discussions/3542) -- JSON format configuration details

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Fastify v5 and @fastify/bearer-auth are well-documented, verified via npm and official docs
- Architecture: HIGH -- follows established project patterns (service instantiation, config loading, TypeScript modules)
- Pitfalls: HIGH -- SearXNG JSON format issue is well-documented, Ollama memory management confirmed via official FAQ
- Validation: HIGH -- vitest already in use, test patterns established in existing test files

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, Fastify v5 is LTS)
