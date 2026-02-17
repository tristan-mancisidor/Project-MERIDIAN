/* ==========================================================================
   Meridian Wealth Advisors - Login Page
   ========================================================================== */

import { login } from '../assets/js/auth.js';

// If already logged in, redirect to dashboard
if (localStorage.getItem('accessToken')) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  window.location.href = '../dashboard/dashboard.html';
}

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorEl = document.getElementById('login-error');
const btn = document.getElementById('login-btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.classList.remove('visible');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    errorEl.textContent = 'Please enter your email and password.';
    errorEl.classList.add('visible');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Signing in...';

  try {
    await login(email, password);
    window.location.href = '../dashboard/dashboard.html';
  } catch (err) {
    errorEl.textContent = 'Invalid email or password. Please try again.';
    errorEl.classList.add('visible');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});
