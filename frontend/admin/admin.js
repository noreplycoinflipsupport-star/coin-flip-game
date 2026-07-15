const API = '/api';
const token = localStorage.getItem('cf_token');

function showToast(msg, type = '') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${endpoint}`, opts);
  return res.json();
}

function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('cf_theme', isDark ? 'light' : 'dark');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function adminLogout() {
  localStorage.removeItem('cf_token');
  window.location.href = '/login.html';
}

async function checkAdmin() {
  if (!token) { window.location.href = '/login.html'; return; }
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { window.location.href = '/login.html'; return; }
    const data = await res.json();
    if (!data.success || data.user.role !== 'admin') { window.location.href = '/login.html'; return; }
    const nameEl = document.getElementById('admin-name');
    if (nameEl) nameEl.textContent = data.user.name;
  } catch (e) { console.error('checkAdmin failed:', e); window.location.href = '/login.html'; }
}

const savedTheme = localStorage.getItem('cf_theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
