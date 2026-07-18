// ===== GLOBAL APP STATE =====
const API = '/api';
let currentUser = null;
let currentCurrency = 'INR';
let authToken = localStorage.getItem('cf_token');

let CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
let CURRENCY_RATES = { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0095 };

async function loadSettings() {
  try {
    const res = await fetch('/api/settings-public');
    if (res.ok) {
      const data = await res.json();
      if (data.exchangeRates) CURRENCY_RATES = data.exchangeRates;
    }
  } catch (e) { /* use defaults */ }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  await loadSettings();
  if (authToken) await loadUser();
  checkAnnouncement();
});

// ===== AUTH =====
async function loadUser() {
  try {
    const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } });
    if (res.status === 401) { clearAuth(); return; }
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      currentCurrency = data.user.preferredCurrency || 'INR';
      updateUI();
    }
  } catch (e) { console.error('loadUser failed:', e); }
}

function updateUI() {
  if (currentUser) {
    document.getElementById('auth-buttons')?.classList.add('hidden');
    document.getElementById('user-menu')?.style.removeProperty('display');
    document.getElementById('balance-chip')?.style.removeProperty('display');
    document.getElementById('currency-selector-wrap')?.style.removeProperty('display');
    document.getElementById('stats-row')?.style.removeProperty('display');
    updateBalanceDisplay();

    // Update header profile avatar
    const profileBtn = document.getElementById('profile-btn-header');
    if (profileBtn) {
      const saved = localStorage.getItem('cf_avatar');
      if (saved) {
        profileBtn.style.backgroundImage = `url('${saved}')`;
        profileBtn.style.backgroundSize = 'cover';
        profileBtn.style.backgroundPosition = 'center';
        profileBtn.textContent = '';
      } else {
        profileBtn.style.backgroundImage = '';
        const init = (currentUser.name || 'U')[0].toUpperCase();
        profileBtn.textContent = init;
        profileBtn.style.background = 'var(--google-blue)';
      }
    }

    // Update nav profile link
    const navProfile = document.getElementById('nav-profile');
    if (navProfile) { navProfile.innerHTML = '<span>👤</span><span>Profile</span>'; }

    // Load referral
    const refContent = document.getElementById('referral-content');
    const refLoggedOut = document.getElementById('referral-logged-out');
    if (refContent) { refContent.style.display = 'block'; refLoggedOut?.classList.add('hidden'); }
    loadReferralStats();
  }
}

function updateBalanceDisplay() {
  if (!currentUser) return;
  const bal = currentUser.balance[currentCurrency] || 0;
  const symbol = CURRENCY_SYMBOLS[currentCurrency];
  const el = document.getElementById('header-balance');
  const sym = document.getElementById('header-currency-symbol');
  const gameBalEl = document.getElementById('game-balance');
  const betLabel = document.getElementById('bet-currency-label');
  if (el) el.textContent = bal.toFixed(2);
  if (sym) sym.textContent = symbol;
  if (gameBalEl) gameBalEl.textContent = `${symbol}${bal.toFixed(2)}`;
  if (betLabel) betLabel.textContent = symbol;
  const selCur = document.getElementById('selected-currency');
  if (selCur) selCur.textContent = currentCurrency;
  // Update quick bet labels
  const qbs = document.querySelectorAll('.quick-bet-btn');
  const amounts = [50, 100, 250, 500, 1000];
  qbs.forEach((btn, i) => {
    if (i < amounts.length) {
      const conv = currentCurrency === 'INR' ? amounts[i] : (amounts[i] * CURRENCY_RATES[currentCurrency]).toFixed(1);
      btn.textContent = `${symbol}${conv}`;
    }
  });
}

function clearAuth() {
  localStorage.removeItem('cf_token');
  authToken = null;
  currentUser = null;
  window.location.href = '/login.html';
}

function logout() {
  localStorage.removeItem('cf_token');
  authToken = null;
  currentUser = null;
  showToast('Signed out successfully');
  setTimeout(() => window.location.href = '/login.html', 800);
}

// ===== CURRENCY =====
function toggleCurrencyDropdown() {
  document.getElementById('currency-dropdown').classList.toggle('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.currency-selector')) {
    document.getElementById('currency-dropdown')?.classList.remove('open');
  }
});

async function setCurrency(currency) {
  currentCurrency = currency;
  document.querySelectorAll('.currency-option').forEach(o => {
    o.classList.toggle('active', o.textContent.includes(currency));
  });
  document.getElementById('currency-dropdown')?.classList.remove('open');
  updateBalanceDisplay();

  if (authToken) {
    try {
      await fetch(`${API}/auth/currency`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ currency })
      });
    } catch (e) { console.error('setCurrency update failed:', e); }
  }

  // Reload user data
  if (authToken) await loadUser();
}

// ===== THEME =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('cf_theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-btn').textContent = isDark ? '🌙' : '☀️';
}

function applyTheme() {
  const saved = localStorage.getItem('cf_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('theme-btn').textContent = saved === 'dark' ? '☀️' : '🌙';
}

// ===== TABS =====
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById('tab-content-history').style.display = tab === 'history' ? 'block' : 'none';
  document.getElementById('tab-content-referral').style.display = tab === 'referral' ? 'block' : 'none';
}

// ===== TOAST =====
function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== REFERRAL =====
async function loadReferralStats() {
  if (!authToken) return;
  try {
    const res = await fetch(`${API}/referral/stats`, { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json();
    if (data.success) {
      const sym = CURRENCY_SYMBOLS[currentCurrency];
      document.getElementById('referral-code-display').textContent = data.referralCode;
      document.getElementById('ref-total').textContent = data.totalReferred;
      document.getElementById('ref-earnings').textContent = `${sym}${(data.totalEarnings || 0).toFixed(2)}`;
    }
  } catch (e) { console.error('loadReferralStats failed:', e); }
}

function copyReferralCode() {
  const code = document.getElementById('referral-code-display')?.textContent;
  if (code) {
    navigator.clipboard.writeText(code).then(() => showToast('Referral code copied!', 'success'));
  }
}

function shareReferral() {
  const code = document.getElementById('referral-code-display')?.textContent;
  const link = `${window.location.origin}/register.html?ref=${code}`;
  if (navigator.share) {
    navigator.share({ title: 'Join CoinFlip!', text: `Use my code ${code} to join and get bonuses!`, url: link });
  } else {
    navigator.clipboard.writeText(link).then(() => showToast('Referral link copied!', 'success'));
  }
}

// ===== ANNOUNCEMENT =====
async function checkAnnouncement() {
  try {
    const bar = document.getElementById('announcement-bar');
    const textEl = document.getElementById('announcement-text');
    if (!bar || !textEl) return;

    const res = await fetch('/api/settings-public');
    if (!res.ok) return;
    const data = await res.json();

    if (data.announcementEnabled && data.announcement) {
      textEl.textContent = data.announcement;
      bar.classList.remove('hidden');
    }
  } catch (e) {
    // Silent fail — announcement is non-critical
  }
}

// ===== PASSWORD TOGGLE =====
function togglePassword(btn) {
  const input = btn.parentElement.querySelector('input');
  const type = input.getAttribute('type');
  input.setAttribute('type', type === 'password' ? 'text' : 'password');
  btn.textContent = type === 'password' ? '🙈' : '👁️';
}

// ===== API HELPER =====
async function apiCall(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${endpoint}`, opts);
  return res.json();
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
