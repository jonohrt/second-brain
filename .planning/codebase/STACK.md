# Technology Stack

**Analysis Date:** 2026-03-06

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code in `src/` and tests in `tests/`

**Secondary:**
- SQL (PL/pgSQL) - Database schema and functions in `supabase/schema.sql`
- YAML - Configuration files (`config.example.yml`, `~/.second-brain/config.yml`)

## Runtime

**Environment:**
- Node.js (ES2022 target, ESM modules via `"type": "module"` in `package.json`)
- No `.nvmrc` or `.node-version` present; no pinned Node version

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` ^1.27.1 - MCP server implementation (stdio transport)
- `commander` ^14.0.3 - CLI framework for the `second-brain` binary

**Testing:**
- `vitest` ^4.0.18 - Test runner (no separate config file; uses defaults)

**Build/Dev:**
- `typescript` ^5.9.3 - Compilation (`tsc`)
- `tsx` ^4.21.0 - Dev-time TypeScript execution without build step

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` ^2.98.0 - Database client for context storage and vector search (`src/services/supabase.ts`)
- `zod` ^4.3.6 - Schema validation for MCP tool input definitions (`src/mcp/tools/*.ts`)
- `chrono-node` ^2.9.0 - Natural language date parsing for voice memo reminders (`src/voice/processor.ts`)

**Infrastructure:**
- `simple-git` ^3.32.3 - Git operations (branch detection, repo identification) (`src/services/git.ts`)
- `gray-matter` ^4.0.3 - Markdown frontmatter parsing for Obsidian vault entries (`src/services/vault.ts`)
- `js-yaml` ^4.1.1 - YAML config file parsing (`src/config.ts`)

**Dev Dependencies:**
- `@types/node` ^25.3.3 - Node.js type definitions
- `@types/js-yaml` ^4.0.9 - js-yaml type definitions

## Configuration

**Application Config:**
- Location: `~/.second-brain/config.yml` (default path, overridable)
- Example: `config.example.yml` in project root
- Loaded by `src/config.ts` via `getConfig()` / `loadConfig()`
- Supports `${ENV_VAR}` interpolation and `~` tilde expansion
- Sections: `vault_path`, `context_dir`, `supabase`, `ollama`, `projects`, `voice` (optional)

**Environment Variables (referenced via config interpolation):**
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key

**TypeScript:**
- `tsconfig.json` - Main config (ES2022, Node16 module resolution, strict mode, sourceMap)
- `tsconfig.test.json` - Extends main, adds `tests/` to include paths, `noEmit: true`

**Build Output:**
- `dist/` - Compiled JS output (`outDir: "dist"`, `rootDir: "src"`)
- Generates declaration files (`declaration: true`)

## Scripts

```bash
npm run build        # tsc - compile TypeScript
npm run dev          # tsx src/index.ts - run MCP server in dev mode
npm run cli          # tsx src/cli.ts - run CLI in dev mode
npm test             # vitest run - run tests once
npm run test:watch   # vitest - run tests in watch mode
```

## Binaries

Defined in `package.json` `bin` field:
- `second-brain` -> `./dist/cli.js` - CLI tool
- `second-brain-mcp` -> `./dist/index.js` - MCP server

## Platform Requirements

**Development:**
- Node.js (ES2022+ compatible)
- npm
- Ollama running locally at `http://localhost:11434` (for embeddings)
- Supabase project (cloud or local) with pgvector extension

**Production / Voice Features (macOS-specific):**
- `whisper-cli` binary (whisper.cpp) for speech-to-text (`src/services/whisper.ts`)
- `afconvert` (macOS built-in) for m4a-to-wav conversion (`src/services/whisper.ts`)
- `osascript` (macOS built-in) for Apple Reminders integration (`src/services/reminders.ts`)
- launchd plist for voice-watch daemon (`resources/com.second-brain.voice-watch.plist`)

**Deployment:**
- Local CLI tool / MCP server (not a web service)
- Voice watcher runs as a macOS launchd service (KeepAlive)

---

*Stack analysis: 2026-03-06*
