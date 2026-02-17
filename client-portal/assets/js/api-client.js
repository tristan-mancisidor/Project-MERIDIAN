/* ==========================================================================
   Meridian Wealth Advisors - API Client
   Fetch wrapper with Bearer token, 401 interceptor, auto-refresh
   ========================================================================== */

const API_BASE = 'http://localhost:3000/api';

function getAccessToken() {
  return localStorage.getItem('accessToken');
}

function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

function setTokens(access, refresh) {
  localStorage.setItem('accessToken', access);
  if (refresh) localStorage.setItem('refreshToken', refresh);
}

function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

let isRefreshing = false;
let refreshQueue = [];

function processQueue(error, token) {
  refreshQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  refreshQueue = [];
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token');

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) throw new Error('Token refresh failed');

  const data = await res.json();
  setTokens(data.accessToken);
  return data.accessToken;
}

async function apiFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  const headers = { ...options.headers };

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // 401 → attempt token refresh once
  if (res.status === 401 && getRefreshToken()) {
    if (isRefreshing) {
      // Queue this request while refresh is in flight
      const newToken = await new Promise((resolve, reject) => {
        refreshQueue.push({ resolve, reject });
      });
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...options, headers });
    } else {
      isRefreshing = true;
      try {
        const newToken = await refreshAccessToken();
        isRefreshing = false;
        processQueue(null, newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(url, { ...options, headers });
      } catch (err) {
        isRefreshing = false;
        processQueue(err, null);
        clearTokens();
        window.location.href = '/client-portal/login/login.html';
        throw err;
      }
    }
  }

  // Still 401 after refresh → redirect to login
  if (res.status === 401) {
    clearTokens();
    window.location.href = '/client-portal/login/login.html';
    throw new Error('Unauthorized');
  }

  return res;
}

// Convenience methods
async function apiGet(endpoint) {
  const res = await apiFetch(endpoint);
  if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
  return res.json();
}

async function apiPost(endpoint, body) {
  const options = { method: 'POST' };
  if (body instanceof FormData) {
    options.body = body;
  } else {
    options.body = JSON.stringify(body);
  }
  const res = await apiFetch(endpoint, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `POST ${endpoint} failed: ${res.status}`);
  }
  return res.json();
}

async function apiPut(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `PUT ${endpoint} failed: ${res.status}`);
  }
  return res.json();
}

async function apiDelete(endpoint) {
  const res = await apiFetch(endpoint, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${endpoint} failed: ${res.status}`);
  return res.json();
}

export { API_BASE, apiFetch, apiGet, apiPost, apiPut, apiDelete, getAccessToken, setTokens, clearTokens };
