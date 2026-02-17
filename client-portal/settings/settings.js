/* ==========================================================================
   Meridian Wealth Advisors - Settings Page
   ========================================================================== */

import { requireAuth, logout, fetchProfile } from '../assets/js/auth.js';
import { apiGet, apiPut } from '../assets/js/api-client.js';
import { formatDateLong, escapeHtml, showError } from '../assets/js/components.js';

const user = requireAuth();
if (!user) throw new Error('Not authenticated');

document.querySelector('.sidebar-footer a')?.addEventListener('click', (e) => {
  e.preventDefault();
  logout();
});

// ---- Load profile ----
async function loadSettings() {
  try {
    const profile = await fetchProfile();
    renderProfile(profile);
    await loadNotifications();
  } catch (err) {
    console.error('Failed to load settings:', err);
    showError('profile-info', 'Failed to load profile.');
  }
}

function renderProfile(profile) {
  const container = document.getElementById('profile-info');
  if (!container) return;

  container.innerHTML = `
    <div class="settings-grid">
      <span class="settings-label">Name</span>
      <span class="settings-value">${escapeHtml(profile.firstName)} ${escapeHtml(profile.lastName)}</span>
    </div>
    <div class="settings-grid">
      <span class="settings-label">Email</span>
      <span class="settings-value">${escapeHtml(profile.email)}</span>
    </div>
    <div class="settings-grid">
      <span class="settings-label">Phone</span>
      <span class="settings-value">${escapeHtml(profile.phone || 'Not set')}</span>
    </div>
    <div class="settings-grid">
      <span class="settings-label">Service Tier</span>
      <span class="settings-value">${profile.serviceTier?.replace(/_/g, ' ') || '--'}</span>
    </div>
    <div class="settings-grid">
      <span class="settings-label">Advisor</span>
      <span class="settings-value">${profile.advisor ? escapeHtml(profile.advisor.firstName + ' ' + profile.advisor.lastName) : 'Not assigned'}</span>
    </div>
    <div class="settings-grid">
      <span class="settings-label">Member Since</span>
      <span class="settings-value">${formatDateLong(profile.createdAt)}</span>
    </div>
  `;
}

// ---- Password change ----
const passwordForm = document.getElementById('password-form');
const passwordMsg = document.getElementById('password-msg');

passwordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  passwordMsg.textContent = '';
  passwordMsg.className = '';

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword.length < 8) {
    passwordMsg.textContent = 'Password must be at least 8 characters.';
    passwordMsg.className = 'form-error visible';
    return;
  }

  if (newPassword !== confirmPassword) {
    passwordMsg.textContent = 'Passwords do not match.';
    passwordMsg.className = 'form-error visible';
    return;
  }

  try {
    await apiPut('/auth/password', { currentPassword, newPassword });
    passwordMsg.textContent = 'Password updated successfully.';
    passwordMsg.style.color = 'var(--color-success)';
    passwordMsg.className = 'form-error visible';
    passwordForm.reset();
  } catch (err) {
    passwordMsg.textContent = err.message || 'Failed to update password.';
    passwordMsg.className = 'form-error visible';
  }
});

// ---- Notifications ----
async function loadNotifications() {
  try {
    const res = await apiGet('/notifications');
    const notifications = res.data || res || [];
    renderNotifications(Array.isArray(notifications) ? notifications : []);
  } catch {
    // Notifications endpoint may not exist yet — silently handle
    renderNotifications([]);
  }
}

function renderNotifications(notifications) {
  const list = document.getElementById('notifications-list');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<li style="padding:var(--space-4);color:var(--color-slate);font-size:var(--text-sm)">No notifications</li>';
    return;
  }

  list.innerHTML = notifications.map((n) => `
    <li class="notification-item${n.isRead ? '' : ' unread'}">
      <div class="notification-dot"></div>
      <div class="notification-content">
        <div class="notification-title">${escapeHtml(n.title)}</div>
        <div class="notification-message">${escapeHtml(n.message)}</div>
        <div class="notification-time">${formatDateLong(n.createdAt)}</div>
      </div>
    </li>
  `).join('');
}

// ---- Mark all read ----
document.getElementById('mark-all-read')?.addEventListener('click', async () => {
  try {
    await apiPut('/notifications/read-all', {});
    await loadNotifications();
  } catch {
    // Silently fail
  }
});

loadSettings();
