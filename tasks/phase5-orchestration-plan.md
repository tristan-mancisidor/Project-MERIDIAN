# Phase 5: Multi-Agent Orchestration — Implementation Plan

## Context

The platform currently routes each AI query to a single, caller-specified agent via `POST /api/ai/invoke`. Phase 5 adds an orchestration layer that automatically classifies queries, routes to one or more specialist agents (in parallel when possible), manages inter-agent handoffs, scores confidence, and escalates to human advisors when needed. Two new Prisma models provide full audit trails per SEC requirements.

---

## Step 1: Prisma Schema + Migration

**File:** `backend/prisma/schema.prisma`

Add 3 enums and 2 models:

```
SessionStatus:  ACTIVE | COMPLETED | FAILED | ESCALATED
HandoffStatus:  PENDING | IN_PROGRESS | COMPLETED | FAILED
EscalationLevel: NONE | FLAGGED | ESCALATED
```

**AgentSession** — tracks a full orchestrated request:
- id, clientId, userId, originalQuery, classifiedIntents (Json), status
- participatingAgents (String[]), totalTokens, confidenceScore (Decimal 0.00-1.00)
- escalationLevel, finalResponse, errorMessage, latencyMs, timestamps
- Relations: Client?, User?, AgentHandoff[]

**AgentHandoff** — tracks each agent invocation within a session:
- id, sessionId, fromAgent?, toAgent, handoffDepth (max 3), status
- inputContext, prompt, response, confidenceScore, tokensUsed, latencyMs
- interactionId (FK to AIInteraction for audit), timestamps
- Relation: AgentSession (cascade delete)

Add `agentSessions AgentSession[]` relation to both `Client` and `User` models.

Run: `npx prisma migrate dev --name phase_5_agent_orchestration`

---

## Step 2: Type Definitions

**File:** `backend/src/types/index.ts`

- Extend `AgentType` to include `'tax_planning'`
- Add interfaces: `OrchestratedRequest`, `OrchestratedResponse`, `ClassificationResult`, `AgentResult`, `HandoffSummary`

---

## Step 3: Tax Planning Agent

**File:** `backend/src/services/ai-agent.ts`
- Add `tax_planning` system prompt to `AGENT_SYSTEM_PROMPTS` (tax-loss harvesting, Roth conversions, capital gains, asset location)
- Add simulated response in `getSimulatedResponse()`
- Add optional `triggerType` param to `invokeAgent()` so orchestrator can pass `AGENT_CHAIN`

**File:** `backend/src/services/compliance.ts`
- Add `tax_planning` disclaimer to the disclaimer map

---

## Step 4: Validation Schemas

**File:** `backend/src/middleware/validation.ts`

- Update `aiAgentRequestSchema`: add `tax_planning` to enum, make `agentType` optional
- Add `orchestratedRequestSchema` (prompt, clientId?, context?, forceAgentType?)
- Add `sessionListSchema` (page, limit, clientId?, status?)

---

## Step 5: AgentOrchestrator Service (core new file)

**File:** `backend/src/services/agent-orchestrator.ts`

Functions:

| Function | Purpose |
|---|---|
| `orchestrate()` | Main entry point — creates session, classifies, routes, aggregates, scores |
| `classifyQuery()` | Haiku call to classify intent → required agents (keyword fallback if no API key) |
| `executeAgent()` | Creates AgentHandoff record, delegates to existing `invokeAgent()`, parses confidence |
| `executeParallelAgents()` | `Promise.allSettled()` over multiple `executeAgent()` calls |
| `synthesizeResponse()` | Haiku call to merge multi-agent outputs into cohesive response |
| `assessConfidence()` | Haiku call to score response confidence 0.0-1.0 |
| `computeEscalation()` | Pure function: <0.4 → ESCALATED, <0.7 → FLAGGED, else NONE |

**Key design decisions:**
- Delegates to existing `invokeAgent()` — preserves compliance gates, memory extraction, audit logging
- Uses Haiku for classification/confidence (cheap, fast) — same pattern as `agent-memory.ts`
- ESCALATED responses are blocked and replaced with advisor-referral message + urgent Task created
- FLAGGED responses are returned but marked for review
- Max handoff depth of 3 prevents infinite loops
- `forceAgentType` param preserves backward compatibility with existing frontend

---

## Step 6: Route Changes

**File:** `backend/src/routes/ai-agent.ts`

- **Modify** `POST /api/ai/invoke` → call `orchestrate()` instead of `invokeAgent()` directly. If caller sends `agentType`, map to `forceAgentType` (backward compat)
- **Add** `GET /api/ai/sessions` → paginated list of sessions (staff only via `requireUser`)
- **Add** `GET /api/ai/sessions/:id` → session detail with handoff history
- **Update** `GET /api/ai/agents` → add `tax_planning` to agent list

---

## Step 7: Verify

- Start the server (`npm run dev` in Docker)
- Test single-agent path with `forceAgentType` — confirm existing behavior unchanged
- Test orchestrated path (omit `agentType`) — confirm classification + routing works
- Test multi-agent query (e.g. "What are the tax implications of rebalancing my portfolio?")
- Test escalation: verify low-confidence responses create Task records
- Test session endpoints: `GET /sessions` and `GET /sessions/:id`
- Confirm all AgentSession and AgentHandoff records are created correctly

---

## Files Modified/Created

| File | Action |
|---|---|
| `backend/prisma/schema.prisma` | Edit — add enums, AgentSession, AgentHandoff, relations |
| `backend/src/types/index.ts` | Edit — extend AgentType, add orchestration interfaces |
| `backend/src/services/ai-agent.ts` | Edit — add tax_planning prompt, triggerType param |
| `backend/src/services/compliance.ts` | Edit — add tax_planning disclaimer |
| `backend/src/middleware/validation.ts` | Edit — update/add Zod schemas |
| `backend/src/services/agent-orchestrator.ts` | **Create** — core orchestration service |
| `backend/src/routes/ai-agent.ts` | Edit — rewire invoke, add session endpoints |
