'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // Nut - metal
];

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
const themeSwitch = document.getElementById('theme-switch');
const startOverlay = document.getElementById('start-overlay');
const startBtn = document.getElementById('start-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const startRecordsEl = document.getElementById('start-records');
const gameoverRecordsEl = document.getElementById('gameover-records');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');

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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function drawGrid() {
  ctx.strokeStyle = GRID_COLORS[getTheme()];
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
  resumeBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');

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

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlay.classList.remove('overlay--gameover');
    overlay.classList.add('overlay--paused');
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    resumeBtn.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
    overlay.classList.remove('hidden');
  }
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
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxCombo = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  startOverlay.classList.add('hidden');
  nameEntry.classList.add('hidden');
  overlay.classList.add('hidden');
  overlay.classList.remove('overlay--paused', 'overlay--gameover');
  resumeBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
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

restartBtn.addEventListener('click', () => {
  if (gameOver) showStartScreen();
  else init();
});
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

initTheme();
board = createBoard();
showStartScreen();
draw();
