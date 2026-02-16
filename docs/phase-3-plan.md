# Phase 3: Client Portal + AI Agent Integration

## Context

Meridian Wealth Advisors has a complete marketing website (8 static HTML pages) and a fully-built backend API (Express/Prisma/PostgreSQL with 68+ endpoints, JWT auth, 5 AI agents). The client portal exists as a stub — one dashboard page with hardcoded data, empty directories for other pages, and zero API integration. Phase 3 connects the portal to the live backend and builds out all client-facing features.

## Architecture Decision: Vanilla JS with ES Modules

Continue with vanilla HTML/CSS/JS using ES modules (`<script type="module">`). No React or build toolchain needed — the portal has ~7 pages and the existing design system (variables.css, portal.css) is solid. We add a shared API client, auth module, and reusable component functions. This keeps zero build dependencies and builds directly on existing code.

---

## Implementation Plan

### Sub-Phase 3.1: Authentication Flow (Foundation)
*Everything depends on this — build first.*

**New files:**
- `client-portal/login/login.html` — Login page (standalone layout, no sidebar)
- `client-portal/login/login.css` — Login page styles
- `client-portal/login/login.js` — Form handler, calls auth module
- `client-portal/assets/js/api-client.js` — **Core module**: fetch wrapper with Bearer token injection, 401 interceptor with auto-refresh, redirect to login on auth failure
- `client-portal/assets/js/auth.js` — Login/logout, token storage (access in memory, refresh in localStorage), `requireAuth()` guard, `getCurrentUser()`

**Modify:**
- `client-portal/dashboard/dashboard.html` — Add `<script type="module">`, import auth guard
- `client-portal/assets/js/portal.js` — Convert to ES module, remove IIFE wrapper
- `backend/.env` — Verify CORS_ORIGIN includes frontend serve port

**API endpoints used:** `POST /api/auth/login`, `POST /api/auth/refresh`, `GET /api/auth/me`

**Test:** Login as `michael.thompson@email.com` / `Client2024!` → redirects to dashboard with user name displayed

---

### Sub-Phase 3.2: Live Dashboard
*Replace all hardcoded data with API calls.*

**New files:**
- `client-portal/assets/js/components.js` — Shared renderers: `renderGoalItem()`, `renderActivityItem()`, `renderActionItem()`, `formatCurrency()`, `formatPercent()`, `formatDate()`, sidebar rendering with logout wiring
- `client-portal/dashboard/dashboard-app.js` — Dashboard orchestrator: fetches `/api/clients/:id/dashboard`, populates metrics/goals/activity/action items

**Modify:**
- `client-portal/dashboard/dashboard.html` — Remove hardcoded goal/activity/action HTML, keep container elements with IDs, link to dashboard-app.js module

**API endpoints used:** `GET /api/clients/:id/dashboard` (returns metrics, goals, recentActivity, actionItems)

**Test:** Login → dashboard shows real seed data (Michael Thompson: $1.77M net worth, 3 goals, recent transactions)

---

### Sub-Phase 3.3: Portfolio Page
*Accounts, holdings, allocation, transactions.*

**New files:**
- `client-portal/portfolio/portfolio.html` — Account cards, allocation bars (CSS-only), holdings table, transactions table
- `client-portal/portfolio/portfolio.js` — Fetches portfolio summary, account details, holdings, paginated transactions
- `client-portal/portfolio/portfolio.css` — Holdings table, allocation bars, account cards

**API endpoints used:** `GET /api/investments/portfolio-summary/:clientId`, `GET /api/investments/accounts`, `GET /api/investments/holdings/:accountId`, `GET /api/investments/transactions`

**Test:** Portfolio page shows Thompson's 3 accounts, 8+ holdings (AAPL, MSFT, VTI, etc.), allocation breakdown

---

### Sub-Phase 3.4: Document Vault
*Browse, upload, and download documents.*

**New files:**
- `client-portal/documents/documents.html` — Category filter tabs, document list, upload modal
- `client-portal/documents/documents.js` — Fetch documents with filters, FormData upload, download links
- `client-portal/documents/documents.css` — Document grid, upload modal, file type indicators

**API endpoints used:** `GET /api/documents`, `POST /api/documents` (multipart), `GET /api/documents/:id`

**Test:** See seed documents (9 docs), upload a PDF, verify it appears in list and downloads correctly

---

### Sub-Phase 3.5: Messaging System
*Client-advisor secure messaging.*

**New files:**
- `client-portal/communication/messages.html` — Two-panel layout: conversation list (left) + message thread (right)
- `client-portal/communication/messages.js` — Load conversations, display threads, send messages, poll for new messages every 10s
- `client-portal/communication/messages.css` — Chat bubbles (client right-aligned, advisor left-aligned), conversation list

**API endpoints used:** `GET /api/messages/conversations`, `GET /api/messages/conversations/:id`, `POST /api/messages`, `POST /api/messages/conversations`, `GET /api/messages/unread-count`

**Test:** View existing seed conversations, send a new message, verify it appears in thread

---

### Sub-Phase 3.6: Financial Plan & Goal Tracking

**New files:**
- `client-portal/financial-plan/plan.html` — Active plan summary, retirement score, projections, recommendations, goals list
- `client-portal/financial-plan/plan.js` — Fetch plans, display assumptions/projections/recommendations, list goals
- `client-portal/financial-plan/plan.css` — Score badge, projection cards, recommendation list

**API endpoints used:** `GET /api/financial-plans`, `GET /api/financial-plans/:id`, `GET /api/financial-plans/goals/:clientId`

**Test:** View Thompson's comprehensive plan (82 retirement score, projections, 3 recommendations)

---

### Sub-Phase 3.7: AI Advisor Chat Widget
*Floating chat widget available on all portal pages.*

**New files:**
- `client-portal/assets/js/ai-chat.js` — Floating chat button (bottom-right), expandable panel, agent selector (Financial Planning / Investment / Client Support), typing indicator, conversation history in memory
- `client-portal/assets/css/ai-chat.css` — Chat widget positioning, bubbles, typing animation, agent selector pills

**Modify:**
- All portal HTML pages — Include ai-chat.js and ai-chat.css

**API endpoints used:** `POST /api/ai/invoke` (sends `{ agentType, prompt }`), `GET /api/ai/agents`

**Test:** Open chat on any page, select agent, ask a question, see response with compliance disclaimer. If no API key configured, gets simulated response.

---

### Sub-Phase 3.8: Settings Page

**New files:**
- `client-portal/settings/settings.html` — Profile info, password change, communication preferences
- `client-portal/settings/settings.js` — Load profile, update password, update preferences
- `client-portal/settings/settings.css` — Form layouts, section dividers

**API endpoints used:** `GET /api/auth/me`, `PUT /api/auth/password`, `PUT /api/clients/:id`, `PUT /api/clients/:id/profile`

---

### Backend Enhancement: Notifications Route

**New file:**
- `backend/src/routes/notifications.ts` — `GET /api/notifications` (client's notifications), `PUT /api/notifications/:id/read`, `PUT /api/notifications/read-all`

**Modify:**
- `backend/src/index.ts` — Register notifications route

---

## File Summary

| Sub-Phase | New Files | Modified Files |
|-----------|-----------|----------------|
| 3.1 Auth | 5 | 3 |
| 3.2 Dashboard | 2 | 1 |
| 3.3 Portfolio | 3 | 0 |
| 3.4 Documents | 3 | 0 |
| 3.5 Messages | 3 | 0 |
| 3.6 Financial Plan | 3 | 0 |
| 3.7 AI Chat | 2 | ~7 (all pages) |
| 3.8 Settings | 3 | 0 |
| Backend | 1 | 1 |
| **Total** | **~25 new** | **~12 modified** |

## Verification

After each sub-phase:
1. Start backend: `cd backend && docker-compose up -d && npm run dev`
2. Serve frontend: Open portal HTML files via local server (e.g., VS Code Live Server)
3. Login with seed credentials: `michael.thompson@email.com` / `Client2024!`
4. Verify the feature works with real data from the seeded database
5. Test with browser DevTools Network tab — confirm API calls succeed with 200 status

## Execution Order

**Start with Sub-Phase 3.1 (Auth)** → then 3.2 (Dashboard). After that, 3.3-3.6 can be built in any order. 3.7 (AI Chat) goes last since it modifies all pages. Settings (3.8) is lowest priority.
