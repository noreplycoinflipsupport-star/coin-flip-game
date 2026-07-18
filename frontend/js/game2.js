/* =============================================
   game2.js — Coin Flip Game Logic (Polished)
   ============================================= */

let gameMode = 'free';
let selectedSide = 'heads';
let isFlipping = false;
let pendingGameId = null;
let pendingPollTimer = null;

// Session stats per mode (in-memory, not persisted)
let sessionStats = {
  free: { wins: 0, losses: 0, streak: 0, streakType: null },
  real: { wins: 0, losses: 0, streak: 0, streakType: null }
};

// Flip history (max 10)
const MAX_HISTORY_BUBBLES = 10;
const flipHistory = []; // { result: 'heads'|'tails', outcome: 'win'|'loss' }

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  setMode('free');
  loadGameHistory();
  loadGameStats();
  checkPendingResult();
  applyThemeIcons();
});

/* ============================================================
   MODE
   ============================================================ */
function setMode(mode) {
  gameMode = mode;
  const freeBtn = document.getElementById('free-mode-btn');
  const realBtn = document.getElementById('real-mode-btn');
  const betSection = document.getElementById('bet-section');
  const balanceInfo = document.getElementById('balance-info');
  const flipBtn = document.getElementById('flip-btn');
  const flipBtnText = document.getElementById('flip-btn-text');

  freeBtn.classList.toggle('active', mode === 'free');
  freeBtn.setAttribute('aria-selected', mode === 'free');
  realBtn.classList.toggle('active', mode === 'real');
  realBtn.setAttribute('aria-selected', mode === 'real');

  if (mode === 'real') {
    if (!authToken) {
      showToast('Please sign in to play with real money', 'error');
      setMode('free');
      return;
    }
    betSection.style.display = 'flex';
    balanceInfo.style.display = 'flex';
    flipBtn.className = 'flip-btn real-mode-btn';
    flipBtnText.textContent = 'Place Bet & Flip';
  } else {
    betSection.style.display = 'none';
    balanceInfo.style.display = 'none';
    flipBtn.className = 'flip-btn free-mode-btn';
    flipBtnText.textContent = 'Flip Coin';
  }
  clearResult();
  loadGameStats();
  updateSessionDisplay();
}

/* ============================================================
   SIDE SELECTION
   ============================================================ */
function selectSide(side) {
  selectedSide = side;
  const headsBtn = document.getElementById('heads-btn');
  const tailsBtn = document.getElementById('tails-btn');
  headsBtn.classList.toggle('selected', side === 'heads');
  headsBtn.setAttribute('aria-pressed', side === 'heads');
  tailsBtn.classList.toggle('selected', side === 'tails');
  tailsBtn.setAttribute('aria-pressed', side === 'tails');
}

/* ============================================================
   BET HELPERS
   ============================================================ */
function setBet(amount) {
  document.getElementById('bet-amount').value = amount;
}

function setMaxBet() {
  if (currentUser) {
    const bal = currentUser.balance[currentCurrency] || 0;
    document.getElementById('bet-amount').value = Math.floor(bal);
  }
}

function halveAmount() {
  const inp = document.getElementById('bet-amount');
  const val = parseFloat(inp.value) || 100;
  inp.value = Math.max(50, Math.floor(val / 2));
}

function doubleAmount() {
  const inp = document.getElementById('bet-amount');
  const val = parseFloat(inp.value) || 50;
  inp.value = Math.min(
    currentUser?.balance[currentCurrency] || 99999,
    val * 2
  );
}

/* ============================================================
   COIN ANIMATIONS
   ============================================================ */
function coinSpin() {
  const coin = document.getElementById('coin');
  coin.className = 'coin spinning';
}

function coinResult(side) {
  return new Promise(resolve => {
    const coin = document.getElementById('coin');
    // Force reflow
    coin.className = 'coin';
    void coin.offsetWidth;
    coin.className = side === 'heads' ? 'coin result-heads' : 'coin result-tails';
    // Animation is ~1.8s — wait slightly after
    setTimeout(resolve, 1900);
  });
}

function coinStop() {
  const coin = document.getElementById('coin');
  coin.className = 'coin';
}

/* ============================================================
   FLIP — Main entry
   ============================================================ */
async function doFlip() {
  if (isFlipping) return;
  const flipBtn = document.getElementById('flip-btn');
  const flipBtnText = document.getElementById('flip-btn-text');

  if (gameMode === 'real' && !authToken) {
    showToast('Please sign in to play!', 'error');
    return;
  }

  const betAmount = parseFloat(document.getElementById('bet-amount')?.value) || 0;
  if (gameMode === 'real') {
    if (betAmount < 50) { showToast('Minimum bet is ₹50', 'error'); return; }
    if (betAmount > (currentUser?.balance[currentCurrency] || 0)) {
      showToast('Insufficient balance!', 'error');
      return;
    }
  }

  isFlipping = true;
  flipBtn.disabled = true;
  flipBtn.innerHTML = `<span class="flip-btn-inner"><span class="spinner"></span><span>Flipping…</span></span><span class="flip-btn-ripple"></span>`;
  clearResult();

  // Start spinning immediately for feedback
  coinSpin();

  try {
    if (gameMode === 'free') {
      await _flipFree();
    } else {
      await _flipReal(betAmount);
    }
  } catch (error) {
    console.error('doFlip error:', error);
    showToast('Connection error. Please try again.', 'error');
    coinStop();
    _resetFlipBtn();
  }
}

async function _flipFree() {
  let result, outcome;
  try {
    if (!authToken) {
      // Local flip — no API
      await _delay(600); // let coin spin briefly
      result = Math.random() < 0.5 ? 'heads' : 'tails';
      outcome = result === selectedSide ? 'win' : 'loss';
    } else {
      const data = await apiCall('/game/flip', 'POST', {
        selectedSide,
        mode: 'free',
        currency: currentCurrency
      });
      if (!data.success) {
        showToast(data.message || 'Error, please try again.', 'error');
        coinStop();
        _resetFlipBtn();
        return;
      }
      if (data.mode === 'manual_draw') {
        pendingGameId = data.gameId;
        coinSpin();
        startPendingPoll();
        return;
      }
      result = data.result;
      outcome = data.outcome;
    }
  } catch (e) {
    // Offline fallback
    await _delay(600);
    result = Math.random() < 0.5 ? 'heads' : 'tails';
    outcome = result === selectedSide ? 'win' : 'loss';
  }

  await coinResult(result);
  _onFlipComplete(result, outcome, 0, 0, 'free');
  if (authToken) loadGameStats();
}

async function _flipReal(betAmount) {
  const data = await apiCall('/game/flip', 'POST', {
    selectedSide,
    betAmount,
    currency: currentCurrency,
    mode: 'real'
  });
  if (!data.success) {
    showToast(data.message || 'Error, please try again.', 'error');
    coinStop();
    _resetFlipBtn();
    return;
  }
  pendingGameId = data.gameId;
  if (currentUser) {
    currentUser.balance[currentCurrency] = data.balance;
    updateBalanceDisplay();
  }
  coinSpin();
  startPendingPoll();
}

/* ============================================================
   PENDING POLL
   ============================================================ */
async function checkPendingResult() {
  if (!authToken) return;
  try {
    const data = await apiCall('/game/check-pending');
    if (!data.success || !data.hasPending || !data.game) return;
    const g = data.game;
    if (data.mode === 'pending') {
      pendingGameId = g._id;
      coinSpin();
      startPendingPoll();
    } else if (data.mode === 'recent') {
      await coinResult(g.result);
      _onFlipComplete(g.result, g.outcome, g.netPayout || 0, g.betAmount, g.mode);
      if (authToken) loadGameStats();
      if (currentUser && g.mode === 'real') {
        currentUser.balance[currentCurrency] = g.balanceAfter || currentUser.balance[currentCurrency];
        updateBalanceDisplay();
      }
    }
  } catch (e) { console.error('checkPendingResult:', e); }
}

function startPendingPoll() {
  if (pendingPollTimer) clearInterval(pendingPollTimer);
  pendingPollTimer = setInterval(async () => {
    if (!pendingGameId) return;
    try {
      const data = await apiCall(`/game/pending-status/${pendingGameId}`);
      if (data.success && data.game && data.game.status === 'completed') {
        clearInterval(pendingPollTimer);
        pendingPollTimer = null;
        const g = data.game;
        pendingGameId = null;

        await coinResult(g.result);
        _onFlipComplete(g.result, g.outcome, g.netPayout || 0, g.betAmount, g.mode);
        if (authToken) loadGameStats();
        if (currentUser && g.mode === 'real') {
          currentUser.balance[currentCurrency] = g.balanceAfter || currentUser.balance[currentCurrency];
          updateBalanceDisplay();
        }
      }
    } catch (e) { console.error('pendingStatus poll:', e); }
  }, 2000);
}

/* ============================================================
   ON FLIP COMPLETE — central handler
   ============================================================ */
function _onFlipComplete(result, outcome, winAmount, betAmount, mode) {
  isFlipping = false;
  _resetFlipBtn();

  // Update session stats per mode
  const s = sessionStats[gameMode];
  if (outcome === 'win') {
    s.wins++;
    s.streak = s.streakType === 'win' ? s.streak + 1 : 1;
    s.streakType = 'win';
  } else {
    s.losses++;
    s.streak = s.streakType === 'loss' ? s.streak + 1 : 1;
    s.streakType = 'loss';
  }

  // Show results
  showResult(result, outcome, winAmount, betAmount, mode);
  addHistoryRow(result, selectedSide, betAmount, outcome);
  addFlipBubble(result, outcome);
  updateSessionDisplay();
  updateProbabilityBar();

  // Win celebration
  if (outcome === 'win') {
    launchConfetti();
  }
}

/* ============================================================
   RESULT DISPLAY
   ============================================================ */
function showResult(result, outcome, winAmount, betAmount, mode) {
  const banner = document.getElementById('result-banner');
  const icon = document.getElementById('result-icon');
  const titleEl = document.getElementById('result-title');
  const subEl = document.getElementById('result-sub');
  const coin = document.getElementById('coin');
  const sym = CURRENCY_SYMBOLS[currentCurrency] || '₹';

  if (!mode) mode = gameMode;

  // Reset animation
  banner.style.animation = 'none';
  void banner.offsetWidth;

  const resultIcon = result === 'heads' ? '<img src=\"/images/crown.png\" alt=\"\" style=\"width:24px;height:24px;display:inline;vertical-align:middle\">' : '<img src=\"/images/lion.png\" alt=\"\" style=\"width:24px;height:24px;display:inline;vertical-align:middle\">';
  if (mode === 'free' || mode === 'free-mode') {
    const isWin = outcome === 'win';
    banner.className = `result-banner show ${isWin ? 'win' : 'loss'}`;
    icon.innerHTML = resultIcon;
    titleEl.textContent = isWin ? 'You picked right!' : 'Better luck next time!';
    subEl.textContent = result === 'heads' ? 'It\'s Heads!' : 'It\'s Tails!';
  } else {
    const isWin = outcome === 'win';
    banner.className = `result-banner show ${isWin ? 'win' : 'loss'}`;
    icon.innerHTML = resultIcon;
    if (isWin) {
      titleEl.textContent = `You Win ${sym}${winAmount.toFixed(2)}!`;
      subEl.textContent = '5% commission applied';
    } else {
      titleEl.textContent = `You Lost ${sym}${betAmount.toFixed(2)}`;
      subEl.textContent = 'Try again!';
    }
    coin.classList.add(isWin ? 'win-glow' : 'loss-glow');
  }
}

function clearResult() {
  const banner = document.getElementById('result-banner');
  const coin = document.getElementById('coin');
  if (banner) banner.className = 'result-banner';
  if (coin) coin.classList.remove('win-glow', 'loss-glow', 'result-heads', 'result-tails', 'spinning');
}

/* ============================================================
   HISTORY TABLE
   ============================================================ */
async function loadGameHistory() {
  if (!authToken) return;
  try {
    const data = await apiCall('/game/history?limit=10');
    if (data.success && data.history.length > 0) {
      const tbody = document.getElementById('history-tbody');
      const table = document.getElementById('history-table');
      const empty = document.getElementById('history-empty');
      if (!tbody) return;
      tbody.innerHTML = '';
      data.history.forEach(h => addHistoryRowFromData(h));
      table.style.display = 'table';
      if (empty) empty.style.display = 'none';
    }
  } catch (e) { console.error('loadGameHistory:', e); }
}

function addHistoryRow(result, side, bet, outcome) {
  const tbody = document.getElementById('history-tbody');
  const table = document.getElementById('history-table');
  const empty = document.getElementById('history-empty');
  if (!tbody) return;

  const sym = CURRENCY_SYMBOLS[currentCurrency] || '₹';
  const row = document.createElement('tr');
  const outcomeClass = outcome === 'win' ? 'badge-win' : 'badge-loss';
  const outcomeLabel = outcome === 'win' ? '✓ Win' : '✗ Loss';
  row.innerHTML = `
    <td>${result === 'heads' ? '<img src="/images/crown.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Heads' : '<img src="/images/lion.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Tails'}</td>
    <td>${side === 'heads' ? '<img src="/images/crown.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Heads' : '<img src="/images/lion.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Tails'}</td>
    <td>${bet > 0 ? `${sym}${bet}` : '<span style="color:var(--text-hint)">Free</span>'}</td>
    <td><span class="badge ${outcomeClass}">${outcomeLabel}</span></td>
    <td style="color:var(--text-hint)">Now</td>
  `;
  tbody.insertBefore(row, tbody.firstChild);
  if (table) table.style.display = 'table';
  if (empty) empty.style.display = 'none';
  // Keep max 10 rows
  while (tbody.children.length > 10) tbody.removeChild(tbody.lastChild);
}

function addHistoryRowFromData(h) {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  const sym = CURRENCY_SYMBOLS[h.currency] || '₹';
  const row = document.createElement('tr');
  const outcomeLabel = h.outcome === 'win' ? '✓ Win' : h.outcome === 'free' ? 'Free' : '✗ Loss';
  const outcomeBadge = h.outcome === 'win' ? 'badge-win' : h.outcome === 'free' ? 'badge-free' : 'badge-loss';
  row.innerHTML = `
    <td>${h.result === 'heads' ? '<img src="/images/crown.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Heads' : '<img src="/images/lion.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Tails'}</td>
    <td>${h.selectedSide === 'heads' ? '<img src="/images/crown.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Heads' : '<img src="/images/lion.png" alt="" style="width:16px;height:16px;display:inline;vertical-align:middle"> Tails'}</td>
    <td>${h.betAmount > 0 ? `${sym}${h.betAmount}` : '<span style="font-size:16px">🆓</span>'}</td>
    <td><span class="badge ${outcomeBadge}">${outcomeLabel}</span></td>
    <td style="color:var(--text-hint)">${new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
  `;
  tbody.appendChild(row);
}

/* ============================================================
   GAME STATS
   ============================================================ */
async function loadGameStats() {
  if (!authToken) return;
  try {
    const mode = gameMode;
    const data = await apiCall(`/game/stats?mode=${mode}`);
    if (data.success) {
      _setStatEl('stat-total', data.stats.totalGames);
      _setStatEl('stat-wins', data.stats.totalWins);
      _setStatEl('stat-losses', data.stats.totalLosses);
      _setStatEl('stat-winrate', `${data.stats.winRate}%`);
      const prefix = mode === 'free' ? 'Free' : 'Real';
      const tl = document.getElementById('stat-label-total');
      const wl = document.getElementById('stat-label-wins');
      const ll = document.getElementById('stat-label-losses');
      if (tl) tl.textContent = `${prefix} Flips`;
      if (wl) wl.textContent = `${prefix} Wins`;
      if (ll) ll.textContent = `${prefix} Losses`;
      document.getElementById('stats-row')?.style.removeProperty('display');
    }
  } catch (e) { console.error('loadGameStats:', e); }
}

function _setStatEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* ============================================================
   FLIP HISTORY BUBBLES
   ============================================================ */
function addFlipBubble(result, outcome) {
  // Add to array
  flipHistory.unshift({ result, outcome });
  if (flipHistory.length > MAX_HISTORY_BUBBLES) flipHistory.pop();

  // Re-render
  const row = document.getElementById('flip-history-row');
  if (!row) return;
  row.innerHTML = '';

  flipHistory.forEach(({ result: r, outcome: o }) => {
    const bubble = document.createElement('div');
    const isHeads = r === 'heads';
    const isWin = o === 'win';
    bubble.className = `flip-bubble ${isHeads ? (isWin ? 'h-win' : 'h-loss') : (isWin ? 't-win' : 't-loss')}`;
    bubble.textContent = isHeads ? 'H' : 'T';
    bubble.title = `${r === 'heads' ? 'Heads' : 'Tails'} — ${o === 'win' ? 'Win' : 'Loss'}`;
    row.appendChild(bubble);
  });
}

/* ============================================================
   SESSION DISPLAY
   ============================================================ */
function updateSessionDisplay() {
  const streakEl = document.getElementById('streak-display');
  const streakCount = document.getElementById('streak-count');
  const streakEmoji = document.getElementById('streak-emoji');
  const sessionInfo = document.getElementById('session-info');
  const winsEl = document.getElementById('session-wins');
  const lossesEl = document.getElementById('session-losses');

  const s = sessionStats[gameMode];

  const modeLabel = document.getElementById('streak-label');
  if (modeLabel) modeLabel.textContent = gameMode === 'free' ? 'Free Streak' : 'Real Streak';

  // Streak
  if (streakEl) {
    streakEl.style.visibility = 'visible';
    if (streakCount) streakCount.textContent = s.streak;
    if (streakEmoji) {
      if (s.streakType === 'win') {
        streakEmoji.textContent = s.streak >= 3 ? '🔥' : '⭐';
        streakEl.style.background = 'rgba(52,168,83,0.1)';
        if (streakCount) streakCount.style.color = 'var(--google-green)';
      } else {
        streakEmoji.textContent = s.streak >= 3 ? '❄️' : '💧';
        streakEl.style.background = 'rgba(234,67,53,0.1)';
        if (streakCount) streakCount.style.color = 'var(--google-red)';
      }
    }
  }

  // Session wins/losses
  if (sessionInfo) sessionInfo.style.visibility = 'visible';
  if (winsEl) winsEl.textContent = `${s.wins}W`;
  if (lossesEl) lossesEl.textContent = `${s.losses}L`;
}

/* ============================================================
   PROBABILITY BAR (based on session history)
   ============================================================ */
function updateProbabilityBar() {
  const total = flipHistory.length;
  if (total === 0) return;
  const headsCount = flipHistory.filter(f => f.result === 'heads').length;
  const headsPercent = Math.round((headsCount / total) * 100);
  const tailsPercent = 100 - headsPercent;

  const fillHeads = document.querySelector('.prob-fill.prob-heads');
  const fillTails = document.querySelector('.prob-fill.prob-tails');
  const labels = document.querySelectorAll('.prob-label');

  if (fillHeads) fillHeads.style.width = `${headsPercent}%`;
  if (fillTails) fillTails.style.width = `${tailsPercent}%`;
  if (labels.length >= 2) {
    labels[0].textContent = `${headsPercent}%`;
    labels[1].textContent = `${tailsPercent}%`;
  }
}

/* ============================================================
   CONFETTI
   ============================================================ */
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#ff6d00', '#ab47bc'];
  const pieces = [];
  const count = 80;

  for (let i = 0; i < count; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 200,
      w: 6 + Math.random() * 10,
      h: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: Math.random() * Math.PI * 2,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 5,
      va: (Math.random() - 0.5) * 0.2,
      opacity: 1
    });
  }

  let frame;
  const startTime = Date.now();
  const duration = 2800;

  function draw() {
    const elapsed = Date.now() - startTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const progress = elapsed / duration;
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.angle += p.va;
      p.opacity = Math.max(0, 1 - Math.max(0, progress - 0.6) / 0.4);

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (elapsed < duration) {
      frame = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frame);
    }
  }

  draw();
}

/* ============================================================
   HELPERS
   ============================================================ */
function _resetFlipBtn() {
  const flipBtn = document.getElementById('flip-btn');
  if (!flipBtn) return;
  isFlipping = false;
  flipBtn.disabled = false;

  const svg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8l4 4-4 4"/></svg>`;
  const label = gameMode === 'real' ? 'Place Bet &amp; Flip' : 'Flip Coin';
  flipBtn.innerHTML = `<span class="flip-btn-inner">${svg}<span id="flip-btn-text">${label}</span></span><span class="flip-btn-ripple"></span>`;
}

function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function applyThemeIcons() {}
