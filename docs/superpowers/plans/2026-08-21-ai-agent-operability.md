# AI Agent Operability Implementation Plan

> **For agentic workers:** Execute this plan inline as a single worker task. Do not spawn helpers or coordinate. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a clean-context AI an exact, connector-neutral onboarding and handoff contract that is enforced by a deterministic repository test.

**Architecture:** Keep the contract in root `AGENTS.md` and the durable workflow in `docs/AI_AGENT_WORKFLOW.md`. A Node test reads those documents and asserts required sections, commands, evidence boundaries, safety gates, and retirement rules; no production or generated code changes are needed.

**Tech Stack:** Node.js 22, npm 10, Node built-in test runner, Markdown, `node:fs/promises`.

**Spec:** The worker request in the task prompt; repository `README.md`, existing skill contracts, and `package.json` command definitions.

## Global Constraints

- Use Node.js `22.x` and npm `10.x` only.
- Keep the contract connector-neutral while naming SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, and approvals.
- Label local, provider/tenant, hosted, and UAT evidence separately.
- Never place credentials, tenant identifiers, personal data, real mailbox addresses, or real approval recipients in repository artifacts.
- MFA, password, consent, and interactive login remain user-controlled; an AI must pause for them.
- Do not modify production code, generated files, or live Power Automate/Dataverse state.

### Task 1: Add the deterministic operability contract test

**Files:**
- Create: `tests/ai-agent-operability.test.ts`

- [ ] Write assertions for both required documents, exact portable commands, connector inventory, RED/GREEN/TDD gates, evidence labels, privacy/MFA/no-real-email boundaries, safe Git/GitHub workflow, worker retirement, and explicit stop conditions.
- [ ] Run the focused test before the documents exist and record the expected file-not-found RED.

### Task 2: Add clean-context onboarding and workflow documentation

**Files:**
- Create: `AGENTS.md`
- Create: `docs/AI_AGENT_WORKFLOW.md`

- [ ] Add concise onboarding, repository map, Node/npm commands, TDD workflow, evidence model, tenant/privacy boundaries, safe Git/GitHub rules, worker handoff/retirement contract, and stop conditions.
- [ ] Keep all examples synthetic and connector-neutral.

### Task 3: Verify GREEN and repository acceptance

**Files:**
- Create: `.superpowers/sdd/2026-08-21-ai-agent-operability/task-1-report.md`

- [ ] Run the focused contract test and record GREEN.
- [ ] Run `npm run build`, `npm test`, `npm run check`, and `git diff --check`.
- [ ] Record exact commands, results, changed files, evidence limits, and retirement status in the worker report.
