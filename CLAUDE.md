# CLAUDE.md — Meridian Wealth Advisors

## Project Overview

Meridian Wealth Advisors is an SEC-registered RIA (Registered Investment Advisor) platform featuring autonomous AI agents, luxury navy/gold branding, and a compliance-first architecture. The platform combines wealth management workflows with AI-driven client engagement while maintaining full regulatory compliance.

## Tech Stack

- **Runtime:** Node.js with TypeScript throughout
- **Database:** PostgreSQL 16 (Docker container)
- **ORM:** Prisma
- **API Server:** Express 4
- **Auth:** JWT + bcrypt
- **AI:** Claude SDK (Anthropic)
- **Containerization:** Docker / Docker Compose

## Completed Phases

- **Phase 1** — Frontend (luxury navy/gold UI)
- **Phase 2** — Backend (Express API, Prisma, PostgreSQL, auth)
- **Phase 3** — Client Portal (portal UI, AI chat, document management, notifications)
- **Phase 4.1** — Agent Memory Layer (AgentMemory model, client login)
- **Phase 4.2** — Proactive Outreach (automated client engagement)

## Workflow Orchestration

- Enter plan mode for any non-trivial task (3+ steps)
- STOP and re-plan if something goes sideways — do not push through broken state
- Never mark a task complete without proving it works (tests pass, server starts, feature functions)
- Use task lists for multi-step work to track progress

## SEC Compliance Rules

- Every AI action requires an audit trail — log what the agent did, when, and why
- All outreach enters `PENDING_REVIEW` status — nothing goes to clients without human approval
- No API keys hardcoded — use environment variables exclusively
- Human oversight gates are required before any client-facing AI action
- Maintain records suitable for SEC examination

## Core Principles

- **Simplicity first** — prefer the simplest solution that works
- **Minimal code impact** — change only what needs to change
- **No temporary fixes** — solve problems correctly the first time
- **Branch-based development** — work on feature branches, PRs to main

## Task Management

- Write plans to `tasks/todo.md` before starting multi-step work
- Track progress in the todo file as tasks are completed
- Capture lessons in `tasks/lessons.md` after corrections or unexpected issues
