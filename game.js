'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Paletas por skin: índice 0 = tipo 1 (I) ... índice 7 = tipo 8 (Nut)
const SKIN_PALETTES = {
  retro:  ['#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#b0bec5'],
  neon:   ['#18e0ff', '#fff35e', '#ff5ef7', '#5eff8f', '#ff5e5e', '#5e9dff', '#ffae42', '#d7f6ff'],
  pastel: ['#a7dde3', '#f7e4a1', '#d9b8e8', '#b8e0c2', '#f0b8b8', '#b8cdf0', '#f5d4a8', '#d4dce0'],
  pixel:  ['#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#b0bec5'],
};

const PIXEL_TEXTURE = [
  [0, 1, 0, 0],
  [0, 0, 0, 2],
  [2, 0, 0, 0],
  [0, 0, 1, 0],
];

const SKIN_KEY = 'tetris-skin';
let currentSkin = 'retro';

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
const skinSelect = document.getElementById('skin-select');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const overlayRecords = document.getElementById('overlay-records');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, comboMax, maxLinesInClear, pendingRank;

/* ---- Tabla de records ---- */
function defaultRecords() {
  return { top: [], bestCombo: 0, bestLines: 0 };
}

function loadRecords() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!raw || typeof raw !== 'object') return defaultRecords();
    return {
      top: Array.isArray(raw.top) ? raw.top.slice(0, MAX_RECORDS) : [],
      bestCombo: Number(raw.bestCombo) || 0,
      bestLines: Number(raw.bestLines) || 0,
    };
  } catch {
    return defaultRecords();
  }
}

function saveRecords(data) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(data));
  } catch { /* almacenamiento no disponible */ }
}

let records = loadRecords();

// Devuelve la posición (0-based) que ocuparía `sc` en el top, o -1 si no entra.
function rankFor(sc) {
  if (sc <= 0) return -1;
  const list = records.top;
  if (list.length < MAX_RECORDS) return list.length === 0 ? 0 : list.filter(r => r.score >= sc).length;
  return sc > list[list.length - 1].score ? list.filter(r => r.score >= sc).length : -1;
}

function renderRecordRows(listEl, highlightIndex) {
  listEl.innerHTML = '';
  if (records.top.length === 0) {
    const li = document.createElement('li');
    li.className = 'rec-empty';
    li.textContent = 'Sin récords todavía';
    listEl.appendChild(li);
    return;
  }
  records.top.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.className = 'is-current';
    const name = document.createElement('span');
    name.className = 'rec-name';
    name.textContent = r.name;
    li.appendChild(name);
    li.appendChild(document.createTextNode(' ' + Number(r.score).toLocaleString()));
    listEl.appendChild(li);
  });
}

function renderRecords(highlightIndex = -1) {
  renderRecordRows(document.getElementById('records-list'), highlightIndex);
  renderRecordRows(document.getElementById('overlay-records-list'), highlightIndex);
  document.getElementById('best-combo').textContent = records.bestCombo;
  document.getElementById('best-lines').textContent = records.bestLines;
  document.getElementById('overlay-best-combo').textContent = records.bestCombo;
  document.getElementById('overlay-best-lines').textContent = records.bestLines;
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
    combo++;
    if (combo > comboMax) comboMax = combo;
    if (cleared > maxLinesInClear) maxLinesInClear = cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    if (combo > 0) score += 50 * combo * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = -1;
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

function roundRectPath(context, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = SKIN_PALETTES[currentSkin][colorIndex - 1];
  const px = x * size;
  const py = y * size;
  context.globalAlpha = alpha ?? 1;

  if (currentSkin === 'neon') {
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.fillRect(px + 2, py + 2, size - 4, size - 4);
    context.shadowBlur = 0;
    context.fillStyle = 'rgba(8,8,14,0.62)';
    context.fillRect(px + 5, py + 5, size - 10, size - 10);
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.strokeRect(px + 2.5, py + 2.5, size - 5, size - 5);
  } else if (currentSkin === 'pastel') {
    context.fillStyle = color;
    roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, 8);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.4)';
    roundRectPath(context, px + 3.5, py + 3.5, size - 7, (size - 7) / 2.2, 6);
    context.fill();
  } else if (currentSkin === 'pixel') {
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    const u = (size - 2) / 4;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const t = PIXEL_TEXTURE[r][c];
        if (!t) continue;
        context.fillStyle = t === 1 ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)';
        context.fillRect(px + 1 + c * u, py + 1 + r * u, u, u);
      }
    }
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(px + 1, py + size - 3, size - 2, 2);
    context.fillRect(px + size - 3, py + 1, 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(px + 1, py + 1, size - 2, 2);
    context.fillRect(px + 1, py + 1, 2, size - 2);
  } else {
    context.fillStyle = color;
    context.fillRect(px + 1, py + 1, size - 2, size - 2);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px + 1, py + 1, size - 2, 4);
  }

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
  ctx.shadowBlur = 0;
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
  nextCtx.shadowBlur = 0;
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
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  resumeBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');

  if (comboMax > records.bestCombo) records.bestCombo = comboMax;
  if (maxLinesInClear > records.bestLines) records.bestLines = maxLinesInClear;

  pendingRank = rankFor(score);
  if (pendingRank !== -1) {
    nameForm.classList.remove('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  } else {
    nameForm.classList.add('hidden');
    saveRecords(records);
  }
  renderRecords(-1);
  overlayRecords.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function commitRecord(name) {
  const entry = { name: (name || 'Jugador').trim().slice(0, 12) || 'Jugador', score, lines, level };
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top = records.top.slice(0, MAX_RECORDS);
  saveRecords(records);
  const idx = records.top.indexOf(entry);
  pendingRank = -1;
  nameForm.classList.add('hidden');
  renderRecords(idx);
}

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (pendingRank === -1) return;
  commitRecord(nameInput.value);
});

resetRecordsBtn.addEventListener('click', () => {
  records = defaultRecords();
  saveRecords(records);
  renderRecords(-1);
});

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
    nameForm.classList.add('hidden');
    overlayRecords.classList.add('hidden');
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
  combo = -1;
  comboMax = 0;
  maxLinesInClear = 0;
  pendingRank = -1;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  overlay.classList.remove('overlay--paused', 'overlay--gameover');
  resumeBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  nameForm.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  renderRecords(-1);
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

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', togglePause);

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

function applySkin(skin) {
  currentSkin = SKIN_PALETTES[skin] ? skin : 'retro';
  document.documentElement.setAttribute('data-skin', currentSkin);
  skinSelect.value = currentSkin;
  if (board) {
    draw();
    drawNext();
  }
}

function initSkin() {
  applySkin(localStorage.getItem(SKIN_KEY) || 'retro');
}

skinSelect.addEventListener('change', () => {
  localStorage.setItem(SKIN_KEY, skinSelect.value);
  applySkin(skinSelect.value);
});

initTheme();
initSkin();
init();
