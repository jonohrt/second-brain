---
phase: 2
slug: ask-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 |
| **Config file** | None (vitest uses package.json config) |
| **Quick run command** | `npx vitest run tests/server/ask.test.ts tests/services/ask-pipeline.test.ts tests/services/ollama-chat.test.ts tests/services/searxng.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/server/ask.test.ts tests/services/ask-pipeline.test.ts tests/services/ollama-chat.test.ts tests/services/searxng.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | ASK-03, ASK-06 | unit | `npx vitest run tests/services/ollama-chat.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 0 | ASK-04 | unit | `npx vitest run tests/services/searxng.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 0 | ASK-02, ASK-05 | unit | `npx vitest run tests/services/ask-pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 0 | ASK-01 | integration | `npx vitest run tests/server/ask.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/services/ollama-chat.test.ts` — stubs for ASK-03, ASK-06 (mock fetch, test classification + fallback)
- [ ] `tests/services/searxng.test.ts` — stubs for ASK-04 (mock fetch, test response parsing)
- [ ] `tests/services/ask-pipeline.test.ts` — stubs for ASK-02, ASK-05 (mock services, test orchestration + RAG threshold)
- [ ] `tests/server/ask.test.ts` — stubs for ASK-01 (integration test with mocked services)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end 15s latency | ASK-05 | Requires real Ollama + SearXNG running | Send /ask request with timer, verify < 15s response |
| Cloud model fallback | ASK-06 | Requires simulating cloud unavailability | Stop Ollama cloud proxy, send /ask, verify local model answers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
