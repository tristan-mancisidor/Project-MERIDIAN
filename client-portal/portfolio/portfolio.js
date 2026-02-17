/* ==========================================================================
   Meridian Wealth Advisors - Portfolio Page
   ========================================================================== */

import { requireAuth, logout } from '../assets/js/auth.js';
import { apiGet } from '../assets/js/api-client.js';
import {
  formatCurrency,
  formatCurrencyDetailed,
  formatPercent,
  formatDate,
  formatNumber,
  escapeHtml,
  showError,
} from '../assets/js/components.js';

const user = requireAuth();
if (!user) throw new Error('Not authenticated');

// Logout
document.querySelector('.sidebar-footer a')?.addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

// Allocation colors mapping
const ALLOC_COLORS = {
  equity: { bg: '#2563eb', label: 'Equities' },
  fixed_income: { bg: '#059669', label: 'Fixed Income' },
  alternatives: { bg: '#d97706', label: 'Alternatives' },
  cash: { bg: '#6b7280', label: 'Cash' },
  other: { bg: '#8b5cf6', label: 'Other' },
};

let portfolioData = null;
let accountsData = [];

async function loadPortfolio() {
  try {
    const [summary, accounts] = await Promise.all([
      apiGet(`/investments/portfolio-summary/${user.id}`),
      apiGet(`/investments/accounts`),
    ]);

    portfolioData = summary;
    accountsData = accounts;

    renderSummary(summary);
    renderAllocation(summary.assetAllocation);
    renderAccountCards(summary.accounts);

    // Auto-select first account
    if (accounts.length > 0) {
      renderAccountDetail(accounts[0]);
    }
  } catch (err) {
    console.error('Failed to load portfolio:', err);
    showError('account-cards', 'Failed to load portfolio data.');
  }
}

function renderSummary(data) {
  document.getElementById('total-value').textContent = formatCurrency(data.totalValue);
  document.getElementById('total-gain').textContent = formatCurrency(data.totalGainLoss);
  const gainEl = document.getElementById('total-gain');
  gainEl.classList.toggle('positive', data.totalGainLoss >= 0);
  gainEl.classList.toggle('negative', data.totalGainLoss < 0);
  document.getElementById('gain-pct').textContent = formatPercent(data.gainLossPct);
  document.getElementById('account-count').textContent = data.accountCount;
  document.getElementById('holdings-count').textContent = data.holdingsCount;
}

function renderAllocation(allocation) {
  const bar = document.getElementById('allocation-bar');
  const legend = document.getElementById('allocation-legend');
  if (!bar || !legend) return;

  bar.innerHTML = '';
  legend.innerHTML = '';

  const entries = Object.entries(allocation).sort((a, b) => b[1] - a[1]);

  entries.forEach(([cls, pct]) => {
    const color = ALLOC_COLORS[cls] || ALLOC_COLORS.other;

    // Bar segment
    const seg = document.createElement('div');
    seg.className = 'allocation-segment';
    seg.style.width = pct + '%';
    seg.style.backgroundColor = color.bg;
    seg.title = `${color.label}: ${pct}%`;
    bar.appendChild(seg);

    // Legend item
    legend.innerHTML += `
      <div class="legend-item">
        <span class="legend-dot" style="background-color:${color.bg}"></span>
        <span class="legend-label">${color.label}</span>
        <span class="legend-value">${pct}%</span>
      </div>`;
  });
}

function renderAccountCards(accounts) {
  const container = document.getElementById('account-cards');
  if (!container) return;

  container.innerHTML = accounts.map((acct, i) => `
    <div class="account-card${i === 0 ? ' active' : ''}" data-account-id="${acct.id}">
      <div class="account-card-header">
        <span class="account-name">${escapeHtml(acct.name)}</span>
        <span class="account-type">${acct.type.replace(/_/g, ' ')}</span>
      </div>
      <div class="account-value">${formatCurrency(acct.value)}</div>
      <div class="account-return ${acct.ytdReturn >= 0 ? 'positive' : 'negative'}">
        YTD: ${formatPercent(acct.ytdReturn * 100)}
      </div>
    </div>
  `).join('');

  // Click handlers
  container.querySelectorAll('.account-card').forEach((card) => {
    card.addEventListener('click', async () => {
      container.querySelectorAll('.account-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const id = card.dataset.accountId;
      const fullAccount = accountsData.find((a) => a.id === id);
      if (fullAccount) renderAccountDetail(fullAccount);
    });
  });
}

function renderAccountDetail(account) {
  // Holdings table
  const tbody = document.getElementById('holdings-body');
  if (tbody && account.holdings) {
    tbody.innerHTML = account.holdings.map((h) => `
      <tr>
        <td>
          <div class="holding-symbol">${escapeHtml(h.symbol || '--')}</div>
          <div class="holding-name">${escapeHtml(h.name)}</div>
        </td>
        <td>${formatNumber(h.quantity, 2)}</td>
        <td>${formatCurrencyDetailed(h.currentPrice)}</td>
        <td>${formatCurrency(h.marketValue)}</td>
        <td>${formatCurrency(h.costBasis)}</td>
        <td class="${h.gainLoss >= 0 ? 'positive' : 'negative'}">${formatCurrency(h.gainLoss)} (${formatPercent(h.gainLossPct * 100)})</td>
        <td>${Number(h.weight).toFixed(1)}%</td>
      </tr>
    `).join('');
  }

  // Transactions
  const txList = document.getElementById('transactions-list');
  if (txList && account.transactions) {
    if (account.transactions.length === 0) {
      txList.innerHTML = '<li class="transaction-item"><span class="transaction-desc">No recent transactions</span></li>';
    } else {
      txList.innerHTML = account.transactions.map((t) => `
        <li class="transaction-item">
          <div class="transaction-info">
            <div class="transaction-desc">${escapeHtml(t.description || t.type)}</div>
            <div class="transaction-date">${formatDate(t.executedAt)}</div>
          </div>
          <div class="transaction-amount">${formatCurrencyDetailed(t.amount)}</div>
        </li>
      `).join('');
    }
  }

  // Update detail title
  const detailTitle = document.getElementById('detail-title');
  if (detailTitle) detailTitle.textContent = account.accountName || 'Account Details';
}

loadPortfolio();
