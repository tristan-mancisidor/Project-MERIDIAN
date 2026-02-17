/* ==========================================================================
   Meridian Wealth Advisors - Dashboard Orchestrator
   Fetches /api/clients/:id/dashboard and renders live data
   ========================================================================== */

import { requireAuth, logout, getUser } from '../assets/js/auth.js';
import { apiGet } from '../assets/js/api-client.js';
import {
  formatCurrency,
  formatPercent,
  renderGoalItem,
  renderActivityItem,
  renderActionItem,
  showLoading,
  showError,
} from '../assets/js/components.js';

// ---- Auth guard ----
const user = requireAuth();
if (!user) throw new Error('Not authenticated');

// ---- Greeting ----
function setGreeting(firstName) {
  const hour = new Date().getHours();
  const greetingEl = document.querySelector('.portal-greeting');
  if (!greetingEl) return;

  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  greetingEl.innerHTML = `${greeting}, <span id="client-name">${firstName || 'Client'}</span>`;
}

// ---- DOM helpers ----
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setChangeText(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = formatPercent(pct) + ' this month';
  el.classList.toggle('positive', pct >= 0);
  el.classList.toggle('negative', pct < 0);
}

// ---- Logout ----
const logoutLink = document.querySelector('.sidebar-footer a');
if (logoutLink) {
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
}

// ---- Mobile sidebar ----
const sidebar = document.querySelector('.sidebar');
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar) sidebar.classList.remove('open');
});

// ---- Load dashboard ----
async function loadDashboard() {
  try {
    const data = await apiGet(`/clients/${user.id}/dashboard`);

    // Greeting
    setGreeting(data.client?.firstName || 'Client');

    // Metrics
    setText('net-worth', formatCurrency(data.metrics.netWorth));
    setChangeText('net-worth-change', data.metrics.netWorthChange);
    setText('portfolio-value', formatCurrency(data.metrics.portfolioValue));
    setChangeText('portfolio-change', data.metrics.portfolioChange);
    setText('ytd-return', formatPercent(data.metrics.ytdReturn));
    setText('benchmark-return', formatPercent(data.metrics.benchmarkReturn));
    setText('retirement-score', (data.metrics.retirementScore || 0) + '/100');

    // Goals
    const goalsContainer = document.getElementById('goals-container');
    if (goalsContainer && data.goals?.length) {
      goalsContainer.innerHTML = data.goals.map(renderGoalItem).join('');
    }

    // Recent Activity
    const activityFeed = document.getElementById('activity-feed');
    if (activityFeed && data.recentActivity?.length) {
      activityFeed.innerHTML = data.recentActivity.map(renderActivityItem).join('');
    } else if (activityFeed) {
      activityFeed.innerHTML = '<li class="activity-item"><span class="activity-text">No recent activity</span></li>';
    }

    // Action Items
    const actionItems = document.getElementById('action-items');
    if (actionItems && data.actionItems?.length) {
      actionItems.innerHTML = data.actionItems.map((item, i) => renderActionItem(item, i)).join('');
    } else if (actionItems) {
      actionItems.innerHTML = '<div class="action-item"><label>No pending action items</label></div>';
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
    showError('goals-container', 'Failed to load dashboard data. Please try refreshing.');
  }
}

loadDashboard();
