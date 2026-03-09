# Project MERIDIAN

A full-stack SEC-registered RIA (Registered Investment Advisor) platform that pairs luxury-tier wealth management with AI agent orchestration — five specialized agents working under compliance gates, persistent memory, and proactive client outreach, all built to fiduciary standards.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16, Prisma ORM (22 models) |
| AI | Anthropic Claude API, multi-agent orchestration |
| Auth | JWT (access + refresh tokens), bcrypt |
| Frontend | HTML5, CSS3 (custom properties), Vanilla JS (ES Modules) |
| Infrastructure | Docker Compose (PostgreSQL + pgAdmin + API) |
| Security | Helmet, CORS, rate limiting, Zod validation |
| Logging | Winston |

## Key Features

- **Multi-agent orchestration** — Five AI agents (Financial Planning, Investment Management, Compliance Review, Client Support, Marketing) coordinated through a central orchestrator with pre- and post-response compliance gates
- **Agent memory layer** — Persistent context across client interactions, with memory extraction via Claude Haiku and token-budgeted context building
- **Proactive client outreach** — Scheduled trigger detection (portfolio drift, goal off-track, milestones, review due, life events, market events) with AI-drafted messages and advisor approval workflow
- **68+ API endpoints** — RESTful backend covering auth, clients, investments, financial plans, documents, messaging, tasks, admin, AI, and outreach
- **Client portal** — Authenticated dashboard with portfolio tracking, financial planning, document vault, and secure advisor messaging
- **Marketing website** — 8-page responsive site with luxury navy/gold design system
- **Compliance engine** — SEC/FINRA-aligned content scanning, suitability checks, automated audit trails, and human oversight gates on all client-facing AI actions
- **Custodian integration stubs** — Schwab, Fidelity, and Orion integration scaffolding

## Architecture Overview

The platform is organized into three main surfaces: a marketing website, an authenticated client portal, and an Express/TypeScript backend API. The backend sits on PostgreSQL (via Prisma) with 22 models spanning the full RIA domain — clients, investments, financial plans, documents, messaging, compliance, and outreach. Five specialized AI agents handle distinct advisory functions and are coordinated through a central orchestrator that enforces compliance checks before and after every AI response. An agent memory system gives each agent persistent context across interactions, while a proactive outreach system runs on a scheduler to detect triggers (portfolio drift, life events, approaching goals) and draft personalized messages that enter a pending-review queue for advisor approval. The entire system is containerized with Docker Compose.

## Status

**Retired / Archived** (February 2026)

Development through Phases 1–4.2 is complete and the codebase is well-documented and versioned. Retired after concluding that solo development of an SEC-compliant RIA is impractical as a hobbyist. The project could be revived with a team or capital.

## Background

I built Meridian to explore what a fiduciary-first, AI-native wealth management firm could look like — from regulatory compliance and multi-agent orchestration down to the client portal experience. It grew across five development phases into a comprehensive platform, and while it's no longer actively developed, it represents the most ambitious full-stack system I've built solo.
