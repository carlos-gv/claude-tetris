'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

function drawRetro(context, x, y, colorIndex, size, alpha, colors) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = colors[colorIndex];
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawNeon(context, x, y, colorIndex, size, alpha, colors) {
  const color = colors[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.shadowBlur = 12;
  context.shadowColor = color;
  context.fillStyle = color;
  context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  context.globalAlpha = 1;
}

function drawPastel(context, x, y, colorIndex, size, alpha, colors) {
  const color = colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  const r = Math.max(3, Math.floor(size / 6));
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  if (typeof context.roundRect === 'function') {
    context.beginPath();
    context.roundRect(px, py, s, s, r);
    context.fill();
  } else {
    context.fillRect(px + r, py, s - 2 * r, s);
    context.fillRect(px, py + r, s, s - 2 * r);
    context.fillRect(px + r, py + r, s - 2 * r, s - 2 * r);
  }
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.fillRect(px + r, py + 2, s - 2 * r, 3);
  context.globalAlpha = 1;
}

function drawPixel(context, x, y, colorIndex, size, alpha, colors) {
  const color = colors[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const s = size - 2;
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const u = s / 4;
  context.fillStyle = 'rgba(0,0,0,0.22)';
  const dark = [[0, 0], [2, 1], [1, 2], [3, 3], [3, 0]];
  for (const [cx, cy] of dark) {
    context.fillRect(px + cx * u, py + cy * u, u, u);
  }
  context.fillStyle = 'rgba(255,255,255,0.18)';
  const light = [[1, 0], [0, 1], [2, 3]];
  for (const [cx, cy] of light) {
    context.fillRect(px + cx * u, py + cy * u, u, u);
  }
  context.globalAlpha = 1;
}

const SKINS = {
  retro: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#b0bec5'],
    background: '#1a1a25',
    grid: '#22222e',
    draw(context, x, y, colorIndex, size, alpha) { drawRetro(context, x, y, colorIndex, size, alpha, this.colors); },
  },
  neon: {
    colors: [null, '#00e5ff', '#ffea00', '#e040fb', '#00e676', '#ff1744', '#2979ff', '#ff9100', '#eeeeee'],
    background: '#05050a',
    grid: '#141422',
    draw(context, x, y, colorIndex, size, alpha) { drawNeon(context, x, y, colorIndex, size, alpha, this.colors); },
  },
  pastel: {
    colors: [null, '#a0e7e5', '#fbe7a2', '#d5b8e8', '#b8e0c8', '#f5b6b6', '#b6cdf0', '#f7cba6', '#d5d9de'],
    background: '#2b2b38',
    grid: '#3a3a48',
    draw(context, x, y, colorIndex, size, alpha) { drawPastel(context, x, y, colorIndex, size, alpha, this.colors); },
  },
  pixel: {
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64b5f6', '#ffb74d', '#b0bec5'],
    background: '#12121c',
    grid: '#26263a',
    draw(context, x, y, colorIndex, size, alpha) { drawPixel(context, x, y, colorIndex, size, alpha, this.colors); },
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

const THEME_KEY = 'tetris-theme';

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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
    updateHUD();
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
  currentSkin.draw(context, x, y, colorIndex, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = currentSkin.grid;
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
  ctx.fillStyle = currentSkin.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
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
  nextCtx.fillStyle = currentSkin.background;
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
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
  overlay.classList.remove('hidden');
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
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
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

function applySkin(name) {
  currentSkin = SKINS[name] || SKINS.retro;
  if (skinSelect) skinSelect.value = SKINS[name] ? name : 'retro';
}

function initSkin() {
  let saved = null;
  try {
    saved = localStorage.getItem(SKIN_KEY);
  } catch (e) {
    saved = null;
  }
  applySkin(saved);
}

if (skinSelect) {
  skinSelect.addEventListener('change', () => {
    const name = skinSelect.value;
    applySkin(name);
    try {
      localStorage.setItem(SKIN_KEY, name);
    } catch (e) {
      /* ignore storage failures */
    }
    draw();
    drawNext();
  });
}

initTheme();
initSkin();
init();
