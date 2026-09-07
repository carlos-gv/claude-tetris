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

const HIGHSCORES_KEY = 'tetris-highscores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const MAX_LINES_KEY = 'tetris-max-lines';
const MAX_SCORES = 5;

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
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const nameConfirmBtn = document.getElementById('name-confirm-btn');
const highscoresEl = document.getElementById('highscores');
const playBtn = document.getElementById('play-btn');
const resetScoresBtn = document.getElementById('reset-scores-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo, started = false;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function loadHighScores() {
  try {
    const raw = localStorage.getItem(HIGHSCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e && typeof e.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SCORES);
  } catch (e) {
    return [];
  }
}

function saveHighScores(scores) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(scores));
  } catch (e) { /* storage unavailable */ }
}

function loadStat(key) {
  try {
    const v = parseInt(localStorage.getItem(key), 10);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch (e) {
    return 0;
  }
}

function saveStat(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) { /* storage unavailable */ }
}

function resetRecords() {
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
    localStorage.removeItem(BEST_COMBO_KEY);
    localStorage.removeItem(MAX_LINES_KEY);
  } catch (e) { /* storage unavailable */ }
}

function qualifiesForTop(sc) {
  if (sc <= 0) return false;
  const scores = loadHighScores();
  return scores.length < MAX_SCORES || sc > scores[scores.length - 1].score;
}

function addHighScore(entry) {
  const scores = loadHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const top = scores.slice(0, MAX_SCORES);
  saveHighScores(top);
  return top;
}

function renderHighScores(containerEl, highlightEntry) {
  const scores = loadHighScores();
  const bestCombo = loadStat(BEST_COMBO_KEY);
  const maxLines = loadStat(MAX_LINES_KEY);
  let html = '<h3 class="highscores__title">Récords</h3>';
  if (scores.length === 0) {
    html += '<p class="highscores__empty">Sin récords todavía</p>';
  } else {
    html += '<ol class="highscores__list">';
    scores.forEach(entry => {
      const hl = highlightEntry && entry === highlightEntry ? ' highscores__row--hl' : '';
      html += `<li class="highscores__row${hl}">` +
        `<span class="highscores__name">${escapeHtml(entry.name)}</span>` +
        `<span class="highscores__score">${entry.score.toLocaleString()}</span>` +
        '</li>';
    });
    html += '</ol>';
  }
  html += '<div class="highscores__stats">' +
    `<span>Mejor combo: <strong>${bestCombo}</strong></span>` +
    `<span>Líneas máximas: <strong>${maxLines}</strong></span>` +
    '</div>';
  containerEl.innerHTML = html;
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
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
  saveStat(BEST_COMBO_KEY, Math.max(loadStat(BEST_COMBO_KEY), maxCombo));
  saveStat(MAX_LINES_KEY, Math.max(loadStat(MAX_LINES_KEY), lines));
  overlay.classList.remove('overlay--paused', 'overlay--start');
  overlay.classList.add('overlay--gameover');
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  resumeBtn.classList.add('hidden');
  playBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  resetScoresBtn.classList.remove('hidden');
  if (qualifiesForTop(score)) {
    nameInput.value = '';
    nameEntry.classList.remove('hidden');
    setTimeout(() => nameInput.focus(), 0);
  } else {
    nameEntry.classList.add('hidden');
  }
  renderHighScores(highscoresEl, null);
  highscoresEl.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function confirmHighScore() {
  if (!gameOver || nameEntry.classList.contains('hidden')) return;
  if (!qualifiesForTop(score)) {
    nameEntry.classList.add('hidden');
    return;
  }
  const name = (nameInput.value.trim() || 'Anónimo').slice(0, 12);
  const entry = { name, score, lines, combo: maxCombo, date: new Date().toISOString() };
  const top = addHighScore(entry);
  nameEntry.classList.add('hidden');
  renderHighScores(highscoresEl, top.indexOf(entry) !== -1 ? entry : null);
}

function showStartScreen() {
  started = false;
  gameOver = false;
  paused = false;
  overlay.classList.remove('overlay--paused', 'overlay--gameover', 'hidden');
  overlay.classList.add('overlay--start');
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  nameEntry.classList.add('hidden');
  renderHighScores(highscoresEl, null);
  highscoresEl.classList.remove('hidden');
  playBtn.classList.remove('hidden');
  resetScoresBtn.classList.remove('hidden');
  resumeBtn.classList.add('hidden');
  restartBtn.classList.add('hidden');
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    overlay.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlay.classList.remove('overlay--gameover', 'overlay--start');
    overlay.classList.add('overlay--paused');
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    nameEntry.classList.add('hidden');
    highscoresEl.classList.add('hidden');
    playBtn.classList.add('hidden');
    resetScoresBtn.classList.add('hidden');
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
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  started = true;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  overlay.classList.remove('overlay--paused', 'overlay--gameover', 'overlay--start');
  nameEntry.classList.add('hidden');
  highscoresEl.classList.add('hidden');
  playBtn.classList.add('hidden');
  resetScoresBtn.classList.add('hidden');
  resumeBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (!started || paused || gameOver) return;
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

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);
playBtn.addEventListener('click', init);
nameConfirmBtn.addEventListener('click', confirmHighScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); confirmHighScore(); }
});
resetScoresBtn.addEventListener('click', () => {
  resetRecords();
  renderHighScores(highscoresEl, null);
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
showStartScreen();
