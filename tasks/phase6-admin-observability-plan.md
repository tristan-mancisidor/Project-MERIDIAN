# Phase 6: Admin Observability Dashboard — Implementation Plan

## Objective

Give staff (ADMIN, ADVISOR, COMPLIANCE) full visibility into the Phase 5 multi-agent orchestration layer. A dedicated `/admin/sessions` UI will surface AgentSession records, handoff chains, escalation status, and aggregate metrics — enabling human oversight required by SEC compliance.

---

## Architecture Overview

```
Frontend (vanilla HTML/JS)          Backend (Express API)
─────────────────────────           ─────────────────────
/admin/sessions/                    GET /api/ai/sessions          (already exists — Phase 5)
  sessions.html                     GET /api/ai/sessions/:id      (already exists — Phase 5)
  sessions.js                       GET /api/ai/sessions/stats    (NEW — aggregate metrics)
  sessions.css
```

The Phase 5 backend already exposes paginated session list and session detail endpoints. Phase 6 adds **one new backend endpoint** for aggregate stats and builds the **full frontend UI**.

---

## STEP 1 — Backend: Session Stats Endpoint

**File:** `backend/src/routes/ai-agent.ts` (edit)

Add `GET /api/ai/sessions/stats` (staff only, `requireUser` middleware):

```
Response: {
  totalToday: number,
  totalAllTime: number,
  avgConfidence: number,          // average confidenceScore across all sessions
  escalationRate: number,         // % of sessions with escalationLevel = ESCALATED
  flaggedRate: number,            // % of sessions with escalationLevel = FLAGGED
  avgLatencyMs: number,           // average latencyMs
  totalTokensToday: number,
  agentUsage: {                   // count of sessions each agent participated in
    [agentType: string]: number
  },
  statusBreakdown: {              // count per SessionStatus
    ACTIVE: number,
    COMPLETED: number,
    FAILED: number,
    ESCALATED: number
  }
}
```

**Implementation:**
- Use Prisma `groupBy` and `aggregate` queries
- "Today" = sessions where `createdAt >= start of current UTC day`
- Agent usage: count occurrences in the `participatingAgents` array across sessions (iterate in JS since Prisma can't aggregate array fields)
- Filter params: `days` (default 7) to scope the stats window

**Route placement:** Must be registered BEFORE `/sessions/:id` to avoid `:id` capturing "stats" as a param.

---

## STEP 2 — Frontend: Admin Sessions Directory + HTML

**Create:** `admin/sessions/` directory

**File:** `admin/sessions/sessions.html`

Structure:
```
<!DOCTYPE html>
<html>
<head>
  <title>Session Monitor — Meridian Admin</title>
  <link rel="stylesheet" href="/website/assets/css/variables.css">
  <link rel="stylesheet" href="/client-portal/assets/css/portal.css">
  <link rel="stylesheet" href="sessions.css">
</head>
<body>
  <!-- Top nav bar (reuse portal pattern) -->
  <nav class="admin-nav">
    <div class="nav-brand">Meridian Admin</div>
    <div class="nav-user" id="nav-user"></div>
  </nav>

  <main class="admin-container">
    <!-- Stats Summary Bar -->
    <section id="stats-bar" class="stats-bar">
      <div class="stat-card" id="stat-total">...</div>
      <div class="stat-card" id="stat-confidence">...</div>
      <div class="stat-card" id="stat-escalation">...</div>
      <div class="stat-card" id="stat-flagged">...</div>
      <div class="stat-card" id="stat-latency">...</div>
      <div class="stat-card" id="stat-tokens">...</div>
    </section>

    <!-- Filters -->
    <section class="filters-bar">
      <select id="filter-status">
        <option value="">All Statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="COMPLETED">Completed</option>
        <option value="FAILED">Failed</option>
        <option value="ESCALATED">Escalated</option>
      </select>
      <select id="filter-escalation">
        <option value="">All Escalation Levels</option>
        <option value="NONE">None</option>
        <option value="FLAGGED">Flagged</option>
        <option value="ESCALATED">Escalated</option>
      </select>
      <input type="date" id="filter-date-start" placeholder="From">
      <input type="date" id="filter-date-end" placeholder="To">
      <input type="text" id="filter-client" placeholder="Client ID (optional)">
      <button id="btn-apply-filters" class="btn btn-primary">Apply</button>
      <button id="btn-clear-filters" class="btn btn-secondary">Clear</button>
    </section>

    <!-- Sessions Table -->
    <section class="sessions-table-container">
      <table class="sessions-table" id="sessions-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Query</th>
            <th>Status</th>
            <th>Escalation</th>
            <th>Agents</th>
            <th>Confidence</th>
            <th>Latency</th>
            <th>Tokens</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="sessions-tbody"></tbody>
      </table>
    </section>

    <!-- Pagination -->
    <div class="pagination" id="pagination"></div>

    <!-- Session Detail Modal/Panel -->
    <aside id="session-detail" class="detail-panel hidden">
      <div class="detail-header">
        <h2>Session Detail</h2>
        <button id="detail-close" class="btn-close">&times;</button>
      </div>
      <div id="detail-content"></div>
    </aside>
  </main>

  <script type="module" src="sessions.js"></script>
</body>
</html>
```

---

## STEP 3 — Frontend: Sessions JavaScript Module

**File:** `admin/sessions/sessions.js`

### Module Structure

```javascript
import { apiGet } from '/client-portal/assets/js/api-client.js';
import { requireAuth } from '/client-portal/assets/js/auth.js';

// ---- Auth guard ----
const user = requireAuth();
if (!user || (user.role !== 'ADMIN' && user.role !== 'ADVISOR' && user.role !== 'COMPLIANCE')) {
  window.location.href = '/client-portal/login/login.html';
}

// ---- State ----
let currentPage = 1;
const pageSize = 20;
let filters = { status: '', escalation: '', dateStart: '', dateEnd: '', clientId: '' };

// ---- Init ----
loadStats();
loadSessions();
bindEvents();
```

### Functions to implement:

**`loadStats()`**
- Calls `GET /api/ai/sessions/stats`
- Populates the 6 stat cards:
  - Total sessions today
  - Avg confidence (formatted as percentage, e.g. "82%")
  - Escalation rate (red text if > 5%)
  - Flagged rate (yellow text if > 15%)
  - Avg latency (formatted as "245ms")
  - Total tokens today (formatted with commas)

**`loadSessions()`**
- Calls `GET /api/ai/sessions?page=&limit=&status=&clientId=`
- Builds table rows with:
  - Time: relative format ("2m ago", "1h ago") using helper
  - Query: truncated to 80 chars with ellipsis
  - Status: badge with color (ACTIVE=blue, COMPLETED=green, FAILED=red, ESCALATED=red)
  - Escalation: color-coded indicator
    - `ESCALATED` → red dot + "Escalated" label
    - `FLAGGED` → yellow dot + "Flagged" label
    - `NONE` → green dot + "Clear" label
  - Agents: pill badges for each participating agent (e.g. `[tax] [invest]`)
  - Confidence: progress bar 0–100% with color gradient (red < 40%, yellow < 70%, green >= 70%)
  - Latency: formatted ms
  - Tokens: formatted number
  - View button → opens detail panel

**`loadSessionDetail(sessionId)`**
- Calls `GET /api/ai/sessions/:id`
- Opens the side panel with:
  - Session metadata (ID, timestamp, client name, status, escalation level)
  - Original query (full text)
  - Final response (full text, scrollable)
  - Confidence score (large gauge/bar)
  - Handoff chain: vertical timeline of AgentHandoff records, each showing:
    - Agent name (from → to, or just "to" if first)
    - Handoff depth indicator
    - Status badge
    - Confidence score bar
    - Tokens used
    - Latency
    - Prompt sent (collapsible)
    - Response received (collapsible)

**`renderPagination(total, page, limit)`**
- Prev/Next buttons + page number display
- Disables Prev on page 1, Next on last page

**`bindEvents()`**
- Filter apply/clear buttons
- Table row click → detail panel
- Detail panel close button
- Pagination buttons
- Auto-refresh toggle (optional: poll every 30s)

---

## STEP 4 — Frontend: Styles

**File:** `admin/sessions/sessions.css`

### Design tokens (using existing CSS variables):
```css
/* Map to existing navy/gold theme */
--admin-bg: var(--color-gray-50);
--admin-card-bg: #ffffff;
--admin-border: var(--color-gray-200);
--escalation-red: #dc2626;
--escalation-yellow: #d97706;
--escalation-green: #16a34a;
--confidence-low: #dc2626;
--confidence-mid: #d97706;
--confidence-high: #16a34a;
```

### Key style rules:

**Stats bar:** Horizontal flex row of 6 cards, each with:
- Large number (32px, bold)
- Label below (12px, gray)
- Subtle left border accent color
- Box shadow for elevation

**Filters bar:** Horizontal flex row with gap, inputs use existing portal form styles

**Sessions table:**
- Sticky header row
- Alternating row backgrounds (--color-gray-50 / white)
- Hover highlight
- Fixed column widths for status/escalation/confidence
- Responsive: horizontal scroll on narrow viewports

**Escalation indicators:**
- Inline dot (8px circle) + text label
- `.escalation-escalated { color: var(--escalation-red); }`
- `.escalation-flagged { color: var(--escalation-yellow); }`
- `.escalation-none { color: var(--escalation-green); }`

**Confidence bar:** Inline progress bar (100px wide, 8px tall), color set by JS based on value

**Agent pills:** Small rounded badges, navy background, white text, 10px font

**Detail panel:**
- Slides in from the right (CSS transform transition)
- 480px width, full viewport height
- Overlay backdrop (semi-transparent)
- Scrollable content area
- Handoff timeline: vertical line with connected nodes, each node is a card

**Status badges:**
```css
.badge-active { background: var(--color-navy); color: white; }
.badge-completed { background: var(--escalation-green); color: white; }
.badge-failed { background: var(--escalation-red); color: white; }
.badge-escalated { background: var(--escalation-red); color: white; }
```

---

## STEP 5 — Backend: Escalation-Level Query Filter

**File:** `backend/src/middleware/validation.ts` (edit)

Update `sessionListSchema` to add:
```typescript
escalationLevel: z.enum(['NONE', 'FLAGGED', 'ESCALATED']).optional(),
dateStart: z.string().datetime().optional(),
dateEnd: z.string().datetime().optional(),
```

**File:** `backend/src/routes/ai-agent.ts` (edit)

Update `GET /api/ai/sessions` handler to apply the new filters:
- `escalationLevel` → `where.escalationLevel = params.escalationLevel`
- `dateStart` → `where.createdAt = { gte: new Date(params.dateStart) }`
- `dateEnd` → `where.createdAt = { ...where.createdAt, lte: new Date(params.dateEnd) }`

---

## STEP 6 — Integration + Static Serving

**File:** `backend/src/index.ts` (edit, if needed)

Ensure the Express static file serving includes the `/admin/` directory. If the current setup serves `client-portal/` as static, add:
```typescript
app.use('/admin', express.static(path.join(__dirname, '../../admin')));
```

Or if there's a top-level static mount, verify `/admin/sessions/sessions.html` is reachable at the expected URL.

---

## STEP 7 — Verify

1. Start the server (`npm run dev`)
2. Log in as an ADMIN or ADVISOR user (staff token)
3. Navigate to `/admin/sessions/sessions.html`
4. Verify stats bar loads with correct numbers
5. Verify sessions table populates with data from Phase 5 test runs
6. Test filter controls (status, escalation, date range)
7. Click a session row → verify detail panel opens with full handoff chain
8. Verify escalation color coding: create a low-confidence session to trigger ESCALATED (red)
9. Test pagination with > 20 sessions
10. Verify non-admin users are redirected (role guard)
11. Verify all API calls include auth token (check Network tab)

---

## Files to Create
| File | Purpose |
|------|---------|
| `admin/sessions/sessions.html` | Sessions monitor page |
| `admin/sessions/sessions.js` | Page logic + data fetching |
| `admin/sessions/sessions.css` | Page styles |

## Files to Modify
| File | Change |
|------|--------|
| `backend/src/routes/ai-agent.ts` | Add `GET /sessions/stats`, expand session filters |
| `backend/src/middleware/validation.ts` | Add escalation/date filters to sessionListSchema |
| `backend/src/index.ts` | Static serving for `/admin/` (if not already covered) |

## Dependencies
- No new npm packages required
- Uses existing `api-client.js` and `auth.js` from client-portal
- All data comes from Phase 5 AgentSession/AgentHandoff tables

## SEC Compliance Notes
- Session monitor is staff-only (role-gated on both frontend and backend)
- All session data is read-only — no mutations from this UI
- Escalation visibility ensures human oversight gate is surfaced to advisors
- Handoff audit trail provides full chain-of-custody for any AI response
