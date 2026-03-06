---
phase: 1
slug: server-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 |
| **Config file** | None (uses package.json scripts) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | INFRA-01 | integration | `npx vitest run tests/server/health.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | INFRA-02 | integration | `npx vitest run tests/server/auth.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | CAP-01 | integration | `npx vitest run tests/server/capture.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | CAP-02 | integration | `npx vitest run tests/server/capture.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | INFRA-03 | smoke | `curl -s "http://localhost:8888/search?q=test&format=json"` | N/A | ⬜ pending |
| 01-02-02 | 02 | 1 | INFRA-04 | manual-only | Manual: curl from iPhone on Tailscale | N/A | ⬜ pending |
| 01-02-03 | 02 | 1 | INFRA-05 | manual-only | Manual: verify OLLAMA_MAX_LOADED_MODELS=1 | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/server/health.test.ts` — stubs for INFRA-01
- [ ] `tests/server/auth.test.ts` — stubs for INFRA-02
- [ ] `tests/server/capture.test.ts` — stubs for CAP-01, CAP-02
- [ ] Test helper to create Fastify app instance with mock services

*Existing vitest infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Server reachable via Tailscale | INFRA-04 | Requires physical iPhone on Tailscale network | curl http://<tailscale-ip>:3000/health from iPhone |
| Ollama memory management | INFRA-05 | Requires checking system memory with Ollama running | Set OLLAMA_MAX_LOADED_MODELS=1, run embedding, check Activity Monitor |
| SearXNG returns JSON results | INFRA-03 | Requires running Docker container | curl http://localhost:8888/search?q=test&format=json |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
