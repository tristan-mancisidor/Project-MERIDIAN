/* ==========================================================================
   Meridian Wealth Advisors - Financial Plan & Goals Page
   ========================================================================== */

import { requireAuth, logout } from '../assets/js/auth.js';
import { apiGet } from '../assets/js/api-client.js';
import { formatCurrency, formatDateLong, escapeHtml, showError } from '../assets/js/components.js';

const user = requireAuth();
if (!user) throw new Error('Not authenticated');

document.querySelector('.sidebar-footer a')?.addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

// SVG ring circumference (radius=60, C=2*pi*60 ≈ 377)
const CIRCUMFERENCE = 2 * Math.PI * 60;

async function loadPlan() {
  try {
    const [plansRes, goals] = await Promise.all([
      apiGet('/financial-plans?limit=1'),
      apiGet(`/financial-plans/goals/${user.id}`),
    ]);

    const plan = plansRes.data?.[0];
    if (plan) {
      renderPlanSummary(plan);
      renderRetirementScore(plan.retirementScore || 0);
      renderProjections(plan.projections);
      renderAssumptions(plan.assumptions);
      renderRecommendations(plan.recommendations);
    } else {
      showError('plan-content', 'No financial plan found. Contact your advisor to create one.');
    }

    renderGoals(goals);
  } catch (err) {
    console.error('Failed to load financial plan:', err);
    showError('plan-content', 'Failed to load financial plan data.');
  }
}

function renderPlanSummary(plan) {
  const el = document.getElementById('plan-name');
  if (el) el.textContent = plan.name;

  const statusEl = document.getElementById('plan-status');
  if (statusEl) {
    statusEl.textContent = plan.status;
    statusEl.className = `rec-status ${plan.status?.toLowerCase()}`;
  }

  const summaryEl = document.getElementById('plan-summary-text');
  if (summaryEl) summaryEl.textContent = plan.summary || '';

  const reviewEl = document.getElementById('plan-review-date');
  if (reviewEl) reviewEl.textContent = plan.nextReviewAt ? `Next review: ${formatDateLong(plan.nextReviewAt)}` : '';
}

function renderRetirementScore(score) {
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  const fill = document.getElementById('score-fill');
  if (fill) {
    fill.style.strokeDasharray = CIRCUMFERENCE;
    fill.style.strokeDashoffset = offset;
    fill.classList.remove('excellent', 'good', 'needs-work');
    if (score >= 85) fill.classList.add('excellent');
    else if (score >= 60) fill.classList.add('good');
    else fill.classList.add('needs-work');
  }

  const numberEl = document.getElementById('score-number');
  if (numberEl) numberEl.textContent = score;

  const labelEl = document.getElementById('score-label');
  if (labelEl) {
    if (score >= 85) labelEl.textContent = 'Excellent';
    else if (score >= 70) labelEl.textContent = 'Good';
    else if (score >= 50) labelEl.textContent = 'Fair';
    else labelEl.textContent = 'Needs Attention';
  }
}

function renderProjections(projections) {
  const container = document.getElementById('projections');
  if (!container || !projections) return;

  const items = [
    { label: 'Retirement Age', value: projections.retirementAge },
    { label: 'Projected Assets', value: formatCurrency(projections.projectedRetirementAssets) },
    { label: 'Required Assets', value: formatCurrency(projections.requiredRetirementAssets) },
    { label: 'Monthly Income', value: formatCurrency(projections.monthlyRetirementIncome) },
    { label: 'Social Security', value: formatCurrency(projections.socialSecurityBenefit) + '/mo' },
  ];

  container.innerHTML = items.map((item) => `
    <div class="projection-item">
      <div class="projection-label">${item.label}</div>
      <div class="projection-value">${item.value}</div>
    </div>
  `).join('');
}

function renderAssumptions(assumptions) {
  const container = document.getElementById('assumptions');
  if (!container || !assumptions) return;

  const items = [
    { label: 'Inflation Rate', value: (assumptions.inflationRate * 100).toFixed(1) + '%' },
    { label: 'Expected Return', value: (assumptions.expectedReturn * 100).toFixed(1) + '%' },
    { label: 'Retirement Age', value: assumptions.retirementAge },
    { label: 'Life Expectancy', value: assumptions.lifeExpectancy },
    { label: 'SS Start Age', value: assumptions.socialSecurityAge },
  ];

  container.innerHTML = items.map((item) => `
    <div class="assumption-item">
      <span class="assumption-label">${item.label}</span>
      <span class="assumption-value">${item.value}</span>
    </div>
  `).join('');
}

function renderRecommendations(recommendations) {
  const container = document.getElementById('recommendations');
  if (!container || !recommendations?.length) return;

  container.innerHTML = recommendations.map((rec) => `
    <li class="recommendation-item">
      <span class="rec-priority ${rec.priority}">${rec.priority}</span>
      <span class="rec-action">${escapeHtml(rec.action)}</span>
      <span class="rec-status ${rec.status}">${rec.status.replace(/_/g, ' ')}</span>
    </li>
  `).join('');
}

function renderGoals(goals) {
  const container = document.getElementById('goals-grid');
  if (!container) return;

  if (!goals?.length) {
    container.innerHTML = '<p style="color:var(--color-slate);padding:var(--space-4)">No goals set. Work with your advisor to establish financial goals.</p>';
    return;
  }

  container.innerHTML = goals.map((goal) => {
    const progressClass = goal.progress >= 100 ? ' complete' : '';
    const trackClass = goal.isOnTrack ? 'on-track' : 'off-track';
    const trackText = goal.isOnTrack ? 'On Track' : 'Off Track';

    return `
      <div class="goal-card">
        <div class="goal-card-header">
          <span class="goal-card-name">${escapeHtml(goal.name)}</span>
          <span class="goal-card-type">${goal.type?.replace(/_/g, ' ')}</span>
        </div>
        <div class="goal-card-amounts">
          <span class="goal-current">${formatCurrency(goal.currentAmount)}</span>
          <span class="goal-target">of ${formatCurrency(goal.targetAmount)}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill${progressClass}" style="width: ${Math.min(goal.progress, 100)}%"></div>
        </div>
        <div class="goal-card-footer">
          <span class="goal-track-status ${trackClass}">${trackText}</span>
          <span>Target: ${formatDateLong(goal.targetDate)}</span>
        </div>
      </div>`;
  }).join('');
}

loadPlan();
