# Meridian Wealth Advisors

An AI-powered Registered Investment Advisor (RIA) platform built as a fiduciary-first organization. Meridian combines luxury-tier financial advisory services with AI agent orchestration, compliance automation, and a full-featured client portal.

## Project Overview

Meridian Wealth Advisors is a full-stack financial advisory platform featuring:

- **Marketing Website** — 8-page responsive site covering services, pricing, resources, and regulatory disclosures
- **Client Portal** — Authenticated dashboard with portfolio tracking, financial planning, document management, and secure messaging
- **Backend API** — RESTful API with 68+ endpoints, JWT authentication, role-based access control, and comprehensive audit logging
- **AI Agent System** — 5 specialized AI agents (Financial Planning, Investment Management, Compliance Review, Client Support, Marketing) with built-in compliance gates
- **Compliance Engine** — SEC/FINRA-aligned content scanning, suitability checks, and automated audit trails

## Architecture

```
meridian-wealth-advisors/
├── website/              # Marketing site (HTML/CSS/JS)
│   ├── pages/            # Home, About, Services, Pricing, How It Works, Resources, Contact, Disclosures
│   └── assets/           # Design system (variables.css), styles, scripts
├── client-portal/        # Authenticated client portal (HTML/CSS/JS)
│   ├── login/            # Authentication pages
│   ├── dashboard/        # Portfolio overview, goals, activity feed
│   ├── portfolio/        # Accounts, holdings, allocation, transactions
│   ├── financial-plan/   # Plans, projections, goal tracking
│   ├── documents/        # Document vault with upload/download
│   ├── communication/    # Secure client-advisor messaging
│   ├── settings/         # Profile and preferences
│   └── assets/           # Shared modules (API client, auth, components)
├── backend/              # Express/TypeScript API server
│   ├── src/
│   │   ├── routes/       # Auth, Clients, Investments, Documents, Messages, Tasks, Admin, AI
│   │   ├── services/     # AI agent orchestration, compliance checking
│   │   ├── middleware/    # JWT auth, rate limiting, validation, error handling
│   │   └── config/       # Environment, database connection
│   └── prisma/           # Schema (18 models), migrations, seed data
├── agent-prompts/        # AI agent system prompts and personas
├── compliance-docs/      # Regulatory templates (Form ADV, Form CRS, Privacy Policy)
├── integrations/         # Custodian integrations (Schwab, Fidelity, Orion)
└── config/               # Project configuration
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3 (custom properties), Vanilla JavaScript (ES Modules) |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 16 with Prisma ORM |
| AI | Anthropic Claude API (claude-sonnet-4-5-20250929) |
| Auth | JWT (access + refresh tokens), bcrypt |
| File Storage | Multer (local disk, 25MB limit) |
| Security | Helmet, CORS, rate limiting, Zod validation |
| Infrastructure | Docker Compose (PostgreSQL + pgAdmin + API) |
| Logging | Winston |

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- npm

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/tristan-mancisidor/meridian-wealth-advisors.git
   cd meridian-wealth-advisors
   ```

2. **Start the database**
   ```bash
   cd backend
   docker-compose up -d postgres pgadmin
   ```

3. **Install dependencies and set up the database**
   ```bash
   npm install
   npx prisma generate
   npx prisma migrate dev
   ```

4. **Seed test data**
   ```bash
   npm run db:seed
   ```

5. **Start the API server**
   ```bash
   npm run dev
   ```
   The API runs at `http://localhost:3001`.

6. **Serve the frontend**

   Open the website or client portal HTML files with any local server (e.g., VS Code Live Server).

### Test Accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@meridianwealth.com | Admin2024! |
| Advisor | james.chen@meridianwealth.com | Advisor2024! |
| Client (Premier) | michael.thompson@email.com | Client2024! |
| Client (Elite) | sarah.kim@email.com | Client2024! |
| Client (Essential) | robert.martinez@email.com | Client2024! |

## API Endpoints

| Module | Base Path | Description |
|--------|-----------|-------------|
| Auth | `/api/auth` | Login, register, refresh tokens, change password |
| Clients | `/api/clients` | Client profiles, financial data, dashboard |
| Investments | `/api/investments` | Accounts, holdings, transactions, portfolio analysis |
| Financial Plans | `/api/financial-plans` | Plans, projections, goals |
| Documents | `/api/documents` | Upload, download, metadata management |
| Messages | `/api/messages` | Conversations, messaging, unread counts |
| Tasks | `/api/tasks` | Action items, meetings, notifications |
| Admin | `/api/admin` | Dashboard, user management, audit logs, compliance |
| AI | `/api/ai` | AI agent invocation, agent listing |
| Health | `/api/health` | Server health check |

## AI Agents

Five specialized AI agents with compliance gates:

1. **Financial Planning Assistant** — Retirement analysis, asset allocation, plan creation
2. **Investment Management Assistant** — Portfolio analysis, rebalancing, tax-loss harvesting
3. **Compliance Review Assistant** — SEC/FINRA compliance checking, suitability verification
4. **Client Support Assistant** — Account questions, financial education, portal guidance
5. **Marketing Content Assistant** — Educational content, newsletters, client communications

All AI responses pass through pre- and post-response compliance checks that scan for prohibited language, suitability issues, and sensitive data exposure.

## Database Schema

18 Prisma models covering the full RIA domain:

**Core:** User, Client, ClientProfile
**Investments:** Account, Holding, Transaction, FeeSchedule
**Planning:** FinancialPlan, Goal
**Communication:** Conversation, Message, Notification
**Operations:** Task, Meeting, Document
**Compliance:** AuditLog, ComplianceCheck, AIInteraction

## Service Tiers

| Tier | AUM Fee | Minimum |
|------|---------|---------|
| Essential | 0.75% | $250K |
| Premier | 0.60% | $500K |
| Elite | 0.45% | $1M |
| Planning Only | Flat fee | N/A |

## Development Phases

- **Phase 1** (Complete) — Marketing website with 8 pages, design system, responsive layout
- **Phase 2** (Complete) — Backend API, database schema, authentication, AI agents, Docker infrastructure
- **Phase 3** (In Progress) — Client portal integration, live dashboard, AI chat widget, document vault, messaging

## License

Proprietary. All rights reserved.
