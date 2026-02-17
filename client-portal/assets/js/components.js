/* ==========================================================================
   Meridian Wealth Advisors - Shared Components & Renderers
   ========================================================================== */

// ---- Formatters ----

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCurrencyDetailed(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value) {
  return (value >= 0 ? '+' : '') + Number(value).toFixed(2) + '%';
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

// ---- Renderers ----

export function renderGoalItem(goal) {
  const progressClass = goal.progress >= 100 ? ' complete' : '';
  return `
    <div class="goal-item">
      <div class="goal-header">
        <span class="goal-name">${escapeHtml(goal.name)}</span>
        <span class="goal-percent">${Math.round(goal.progress)}%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill${progressClass}" style="width: ${Math.min(goal.progress, 100)}%"></div>
      </div>
    </div>`;
}

export function renderActivityItem(item) {
  return `
    <li class="activity-item">
      <span class="activity-date">${formatDate(item.date)}</span>
      <span class="activity-text">${escapeHtml(item.description || item.type)}</span>
    </li>`;
}

export function renderActionItem(item, index) {
  const checked = item.completed ? ' checked' : '';
  return `
    <div class="action-item">
      <input type="checkbox" id="action-${index}"${checked}>
      <label for="action-${index}">${escapeHtml(item.title)}</label>
      <span class="action-due">${item.dueDate ? 'Due: ' + formatDate(item.dueDate) : ''}</span>
    </div>`;
}

// ---- Sidebar ----

export function initSidebar(activePage) {
  const links = document.querySelectorAll('.sidebar-link');
  links.forEach((link) => {
    link.classList.remove('active');
    if (link.getAttribute('href')?.includes(activePage)) {
      link.classList.add('active');
    }
  });
}

// ---- Utilities ----

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function showLoading(container) {
  if (typeof container === 'string') container = document.getElementById(container);
  if (container) container.innerHTML = '<p style="color:var(--color-slate);text-align:center;padding:var(--space-6)">Loading...</p>';
}

export function showError(container, message) {
  if (typeof container === 'string') container = document.getElementById(container);
  if (container) container.innerHTML = `<p style="color:var(--color-error);text-align:center;padding:var(--space-6)">${escapeHtml(message)}</p>`;
}
