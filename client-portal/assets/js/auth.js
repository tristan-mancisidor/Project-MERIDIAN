/* ==========================================================================
   Meridian Wealth Advisors - Auth Module
   Login/logout, token storage, requireAuth() guard
   ========================================================================== */

import { apiPost, setTokens, clearTokens, apiGet } from './api-client.js';

/** Get stored user object */
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

/** Login with email/password, stores tokens + user */
async function login(email, password) {
  const data = await apiPost('/auth/login', { email, password });
  setTokens(data.accessToken, data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  return data.user;
}

/** Logout: clear storage, redirect to login */
function logout() {
  clearTokens();
  window.location.href = '/client-portal/login/login.html';
}

/** Auth guard — call at top of every protected page module.
 *  Redirects to login if no valid token. Returns user object. */
function requireAuth() {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    window.location.href = '/client-portal/login/login.html';
    return null;
  }
  return getUser();
}

/** Fetch fresh profile from /auth/me */
async function fetchProfile() {
  return apiGet('/auth/me');
}

export { login, logout, requireAuth, getUser, fetchProfile };
