/* ==========================================================================
   Meridian Wealth Advisors - Client Portal JavaScript (ES Module)
   ========================================================================== */

import { requireAuth, logout } from './auth.js';

// ---- Auth guard ----
const user = requireAuth();

// ---- Greeting based on time of day ----
function setGreeting(firstName) {
  const hour = new Date().getHours();
  const greetingEl = document.querySelector('.portal-greeting');
  if (!greetingEl) return;

  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  const nameEl = document.getElementById('client-name');
  if (nameEl) nameEl.textContent = firstName || 'Client';
  greetingEl.innerHTML = `${greeting}, <span id="client-name">${firstName || 'Client'}</span>`;
}

// ---- Format currency ----
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ---- Format percentage ----
function formatPercent(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

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

// ---- Mobile sidebar toggle ----
const sidebar = document.querySelector('.sidebar');
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && sidebar) {
    sidebar.classList.remove('open');
  }
});

// ---- Logout handler ----
const logoutLink = document.querySelector('.sidebar-footer a');
if (logoutLink) {
  logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });
}

// ---- Init ----
if (user) {
  setGreeting(user.email ? user.email.split('@')[0].split('.')[0] : 'Client');
}

export { formatCurrency, formatPercent, setText, setChangeText, setGreeting };
