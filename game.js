'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

function roundRectPath(context, x, y, w, h, r) {
  if (context.roundRect) {
    context.beginPath();
    context.roundRect(x, y, w, h, r);
    return;
  }
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// ---- Skins / temas visuales ----
// Cada skin define su paleta (índice 1..8), fondo de tablero opcional, color de
// rejilla opcional y una función de dibujado de bloque.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#b0bec5'],
    board: null,
    grid: null,
    draw(context, x, y, color, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    label: 'Neon',
    colors: [null, '#00e5ff', '#ffe600', '#e040fb', '#00e676', '#ff1744', '#2979ff', '#ff9100', '#cfd8dc'],
    board: '#000000',
    grid: 'rgba(0,229,255,0.10)',
    draw(context, x, y, color, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      context.shadowColor = color;
      context.shadowBlur = 12;
      context.fillStyle = color;
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      context.shadowBlur = 0;
      context.fillStyle = 'rgba(0,0,0,0.55)';
      context.fillRect(x * size + 6, y * size + 6, size - 12, size - 12);
      context.globalAlpha = 1;
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6e0', '#fff0b3', '#e6c9f0', '#c8e6c9', '#f5c6c6', '#c5d8f5', '#ffe0b3', '#dfe4e8'],
    board: null,
    grid: null,
    draw(context, x, y, color, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      context.fillStyle = color;
      roundRectPath(context, px, py, s, s, 6);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.35)';
      roundRectPath(context, px, py, s, s * 0.4, 6);
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: [null, '#3ec6d6', '#f5c93a', '#a94fc0', '#5fb865', '#d95c5c', '#4a90d9', '#e59a3c', '#9aa7ad'],
    board: null,
    grid: null,
    draw(context, x, y, color, size, alpha) {
      context.globalAlpha = alpha ?? 1;
      const px = x * size + 1;
      const py = y * size + 1;
      const s = size - 2;
      const u = s / 6;
      context.fillStyle = color;
      context.fillRect(px, py, s, s);
      context.fillStyle = 'rgba(255,255,255,0.28)';
      context.fillRect(px, py, s, u);
      context.fillRect(px, py, u, s);
      context.fillStyle = 'rgba(0,0,0,0.30)';
      context.fillRect(px, py + s - u, s, u);
      context.fillRect(px + s - u, py, u, s);
      context.fillStyle = 'rgba(0,0,0,0.16)';
      for (let i = 0; i < 3; i++) {
        context.fillRect(px + ((i * 2 + 1) % 5) * u, py + ((i * 3 + 2) % 5) * u, u, u);
      }
      context.globalAlpha = 1;
    },
  },
};

const SKIN_KEY = 'tetris-skin';
let currentSkin = SKINS.retro;

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca) - centro hueco
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_COLORS = { dark: '#22222e', light: '#d8d8e2' };
const THEME_KEY = 'tetris-theme';
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const resumeBtn = document.getElementById('resume-btn');
const gameoverRestartBtn = document.getElementById('gameover-restart-btn');
const pauseMenu = document.getElementById('pause-menu');
const controlsBtn = document.getElementById('controls-btn');
const controlsList = document.getElementById('controls-list');
const startLevelSelect = document.getElementById('start-level');
const themeSwitch = document.getElementById('theme-switch');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const startRecordsEl = document.getElementById('start-records');
const gameoverRecordsEl = document.getElementById('gameover-records');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const skinSelect = document.getElementById('skin-select');

const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;
let startLevel = 1;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo;
let pendingScoreSaved;

/* ---- Tabla de records ---- */
function loadRecords() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch (e) { /* ignore */ }
  if (!data || typeof data !== 'object') data = {};
  return {
    list: Array.isArray(data.list) ? data.list.slice(0, MAX_RECORDS) : [],
    bestCombo: data.bestCombo || 0,
    bestLines: data.bestLines || 0,
  };
}

function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (e) { /* ignore */ }
}

function qualifiesForTop(records, points) {
  if (points <= 0) return false;
  if (records.list.length < MAX_RECORDS) return true;
  return points > records.list[records.list.length - 1].score;
}

function renderRecords(container, records, highlightIndex) {
  const rows = records.list.map((r, i) => `
    <tr class="${i === highlightIndex ? 'records__row--hl' : ''}">
      <td>${i + 1}</td>
      <td class="records__name">${escapeHtml(r.name)}</td>
      <td>${r.score.toLocaleString()}</td>
      <td>${r.lines ?? 0}</td>
    </tr>`).join('');
  const body = records.list.length
    ? rows
    : `<tr><td colspan="4" class="records__empty">Sin records todavía</td></tr>`;
  container.innerHTML = `
    <p class="records__title">MEJORES PUNTUACIONES</p>
    <table class="records__table">
      <thead><tr><th>#</th><th>Nombre</th><th>Score</th><th>Líneas</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="records__stats">
      Mejor combo: <strong>${records.bestCombo}</strong> &nbsp;·&nbsp;
      Líneas máximas: <strong>${records.bestLines}</strong>
    </p>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function refreshStartRecords() {
  renderRecords(startRecordsEl, loadRecords(), -1);
}

function dropIntervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    if (combo > 1) score += 50 * (combo - 1) * level;
    level = Math.floor(lines / 10) + startLevel;
    dropInterval = dropIntervalForLevel(level);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  currentSkin.draw(context, x, y, currentSkin.colors[colorIndex], size, alpha);
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function drawGrid() {
  ctx.strokeStyle = currentSkin.grid || GRID_COLORS[getTheme()];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  overlay.classList.remove('overlay--paused');
  overlay.classList.add('overlay--gameover');
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}  ·  Combo máx: ${maxCombo}`;
  pauseMenu.classList.add('hidden');
  gameoverRestartBtn.classList.remove('hidden');

  const records = loadRecords();
  if (maxCombo > records.bestCombo) records.bestCombo = maxCombo;
  if (lines > records.bestLines) records.bestLines = lines;
  saveRecords(records);

  pendingScoreSaved = false;
  if (qualifiesForTop(records, score)) {
    nameEntry.classList.remove('hidden');
    renderRecords(gameoverRecordsEl, records, -1);
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  } else {
    nameEntry.classList.add('hidden');
    renderRecords(gameoverRecordsEl, records, -1);
  }

  overlay.classList.remove('hidden');
}

function saveCurrentScore() {
  if (pendingScoreSaved) return;
  pendingScoreSaved = true;
  const records = loadRecords();
  const name = (nameInput.value || '').trim().slice(0, 12) || 'Jugador';
  records.list.push({ name, score, lines, combo: maxCombo });
  records.list.sort((a, b) => b.score - a.score);
  records.list = records.list.slice(0, MAX_RECORDS);
  if (maxCombo > records.bestCombo) records.bestCombo = maxCombo;
  if (lines > records.bestLines) records.bestLines = lines;
  saveRecords(records);
  const hl = records.list.findIndex(r => r.name === name && r.score === score && r.lines === lines);
  nameEntry.classList.add('hidden');
  renderRecords(gameoverRecordsEl, records, hl);
}

function showStartScreen() {
  cancelAnimationFrame(animId);
  gameOver = true;
  paused = false;
  overlay.classList.add('hidden');
  refreshStartRecords();
  startOverlay.classList.remove('hidden');
}

function isMenuOpen() {
  return paused && !gameOver;
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    collapseControls();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlay.classList.remove('overlay--gameover');
    overlay.classList.add('overlay--paused');
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    gameoverRestartBtn.classList.add('hidden');
    pauseMenu.classList.remove('hidden');
    overlay.classList.remove('hidden');
    resumeBtn.focus();
  }
}

function collapseControls() {
  controlsList.classList.add('hidden');
  controlsBtn.setAttribute('aria-expanded', 'false');
}

function populateStartLevelSelect() {
  startLevelSelect.innerHTML = '';
  for (let i = 1; i <= MAX_START_LEVEL; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = String(i);
    startLevelSelect.appendChild(opt);
  }
  startLevelSelect.value = String(startLevel);
}

function loop(ts) {
  if (gameOver || paused) { draw(); return; }
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  dropInterval = dropIntervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  startOverlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlay.classList.add('hidden');
  overlay.classList.remove('overlay--paused', 'overlay--gameover');
  pauseMenu.classList.add('hidden');
  gameoverRestartBtn.classList.add('hidden');
  collapseControls();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => { paused = false; init(); });
gameoverRestartBtn.addEventListener('click', showStartScreen);
resumeBtn.addEventListener('click', togglePause);
startBtn.addEventListener('click', init);
saveScoreBtn.addEventListener('click', saveCurrentScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); saveCurrentScore(); }
});
resetRecordsBtn.addEventListener('click', () => {
  saveRecords({ list: [], bestCombo: 0, bestLines: 0 });
  refreshStartRecords();
});

controlsBtn.addEventListener('click', () => {
  const open = controlsList.classList.toggle('hidden');
  controlsBtn.setAttribute('aria-expanded', String(!open));
});

startLevelSelect.addEventListener('change', () => {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, parseInt(startLevelSelect.value, 10) || 1));
  localStorage.setItem(START_LEVEL_KEY, String(startLevel));
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSwitch.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

function applySkin(name) {
  currentSkin = SKINS[name] || SKINS.retro;
  const bg = currentSkin.board || '';
  canvas.style.background = bg;
  nextCanvas.style.background = bg;
  if (skinSelect) skinSelect.value = SKINS[name] ? name : 'retro';
  if (board) draw();
  if (next) drawNext();
}

function initSkin() {
  const saved = localStorage.getItem(SKIN_KEY);
  applySkin(SKINS[saved] ? saved : 'retro');
}

skinSelect.addEventListener('change', () => {
  localStorage.setItem(SKIN_KEY, skinSelect.value);
  applySkin(skinSelect.value);
});

const savedStartLevel = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
if (savedStartLevel >= 1 && savedStartLevel <= MAX_START_LEVEL) startLevel = savedStartLevel;
populateStartLevelSelect();

initTheme();
board = createBoard();
showStartScreen();
draw();
initSkin();
