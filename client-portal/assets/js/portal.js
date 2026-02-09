/* ==========================================================================
   Meridian Wealth Advisors - Client Portal JavaScript
   ========================================================================== */

(function () {
  'use strict';

  // ---- Greeting based on time of day ----
  function setGreeting() {
    const hour = new Date().getHours();
    const greetingEl = document.querySelector('.portal-greeting');
    if (!greetingEl) return;

    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';

    const nameEl = document.getElementById('client-name');
    const name = nameEl ? nameEl.textContent : 'Client';
    greetingEl.innerHTML = greeting + ', <span id="client-name">' + name + '</span>';
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

  // ---- Populate dashboard with sample data ----
  // In production, this would fetch from the API
  function loadDashboardData() {
    var data = {
      netWorth: 1250000,
      netWorthChange: 3.2,
      portfolioValue: 1150000,
      portfolioChange: 2.8,
      ytdReturn: 4.15,
      benchmarkReturn: 3.90,
      retirementScore: 82,
    };

    setText('net-worth', formatCurrency(data.netWorth));
    setChangeText('net-worth-change', data.netWorthChange);
    setText('portfolio-value', formatCurrency(data.portfolioValue));
    setChangeText('portfolio-change', data.portfolioChange);
    setText('ytd-return', formatPercent(data.ytdReturn));
    setText('benchmark-return', formatPercent(data.benchmarkReturn));
    setText('retirement-score', data.retirementScore + '/100');
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setChangeText(id, pct) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = formatPercent(pct) + ' this month';
    el.classList.toggle('positive', pct >= 0);
    el.classList.toggle('negative', pct < 0);
  }

  // ---- Mobile sidebar toggle ----
  var sidebar = document.querySelector('.sidebar');
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sidebar) {
      sidebar.classList.remove('open');
    }
  });

  // ---- Init ----
  setGreeting();
  loadDashboardData();
})();
