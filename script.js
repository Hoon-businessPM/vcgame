const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const stageTextEl = document.getElementById('stageText');
const finalScoreEl = document.getElementById('finalScore');
const finalBestScoreEl = document.getElementById('finalBestScore');
const startPanel = document.getElementById('startPanel');
const gameOverPanel = document.getElementById('gameOverPanel');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const soundButton = document.getElementById('soundButton');
const rankingForm = document.getElementById('rankingForm');
const nicknameInput = document.getElementById('nicknameInput');
const saveRankingButton = document.getElementById('saveRankingButton');
const rankingMessage = document.getElementById('rankingMessage');
const rankingList = document.getElementById('rankingList');
const clearRankingButton = document.getElementById('clearRankingButton');

const keys = new Set();
let animationId = null;
let gameState = 'ready';
let score = 0;
let bestScore = Number(localStorage.getItem('missileDodgeBestScore')) || 0;
let soundEnabled = localStorage.getItem('missileDodgeSound') !== 'off';
let lastTime = 0;
let missileSpawnTimer = 0;
let itemSpawnTimer = 0;
let moveSoundTimer = 0;
let nextScoreSound = 50;
let lastFinalScore = 0;
let hasSavedCurrentRun = false;
let currentStage = 1;
let lastFinalStage = 1;
const STAGE_CONFIG = [
  { stage: 1, minScore: 0, missileSpeedBonus: 0, turnBonus: 0, spawnBase: 2.35, spawnMin: 0.95, maxMissiles: 5, scoreMultiplier: 1 },
  { stage: 2, minScore: 100, missileSpeedBonus: 28, turnBonus: 0.35, spawnBase: 1.95, spawnMin: 0.78, maxMissiles: 7, scoreMultiplier: 1.15 },
  { stage: 3, minScore: 220, missileSpeedBonus: 58, turnBonus: 0.75, spawnBase: 1.55, spawnMin: 0.6, maxMissiles: 9, scoreMultiplier: 1.35 },
];

const ITEM_CONFIG = {
  spawnInterval: 7.5,
  lifeTime: 6,
  radius: 14,
  shieldDuration: 4.5,
  boostDuration: 3.5,
  boostMultiplier: 1.32,
};
const RANKING_STORAGE_KEY = 'missileDodgeRanking';

bestScoreEl.textContent = bestScore;

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 15,
  speed: 285,
};

let missiles = [];
let particles = [];
let items = [];
let activeEffects = {
  shield: 0,
  boost: 0,
};
let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  return audioContext;
}

function playTone({ frequency = 440, type = 'sine', duration = 0.08, volume = 0.08, slideTo = null }) {
  if (!soundEnabled) return;

  const audio = getAudioContext();
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(audio.destination);

  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playNoise({ duration = 0.16, volume = 0.08 } = {}) {
  if (!soundEnabled) return;

  const audio = getAudioContext();
  const now = audio.currentTime;
  const bufferSize = audio.sampleRate * duration;
  const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i += 1) {
    output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const noise = audio.createBufferSource();
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(120, now + duration);

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  noise.start(now);
  noise.stop(now + duration);
}

const sound = {
  start() {
    playTone({ frequency: 420, type: 'triangle', duration: 0.08, volume: 0.08, slideTo: 620 });
    setTimeout(() => playTone({ frequency: 720, type: 'triangle', duration: 0.1, volume: 0.08 }), 70);
  },
  move() {
    playTone({ frequency: 180, type: 'sine', duration: 0.035, volume: 0.025, slideTo: 230 });
  },
  missile() {
    playTone({ frequency: 160, type: 'sawtooth', duration: 0.12, volume: 0.045, slideTo: 95 });
  },
  score() {
    playTone({ frequency: 660, type: 'square', duration: 0.06, volume: 0.045 });
    setTimeout(() => playTone({ frequency: 880, type: 'square', duration: 0.06, volume: 0.035 }), 45);
  },
  explosion() {
    playNoise({ duration: 0.28, volume: 0.16 });
    playTone({ frequency: 90, type: 'sawtooth', duration: 0.24, volume: 0.11, slideTo: 45 });
  },
  item() {
    playTone({ frequency: 784, type: 'triangle', duration: 0.07, volume: 0.065 });
    setTimeout(() => playTone({ frequency: 1174.66, type: 'sine', duration: 0.1, volume: 0.06 }), 70);
  },
  shieldHit() {
    playTone({ frequency: 260, type: 'square', duration: 0.08, volume: 0.07, slideTo: 520 });
    setTimeout(() => playTone({ frequency: 620, type: 'triangle', duration: 0.12, volume: 0.055 }), 70);
  },
  defeat() {
    playNoise({ duration: 0.22, volume: 0.12 });
    playTone({ frequency: 220, type: 'sawtooth', duration: 0.16, volume: 0.08, slideTo: 120 });
    setTimeout(() => playTone({ frequency: 130, type: 'sawtooth', duration: 0.22, volume: 0.075, slideTo: 55 }), 120);
  },
  newRecord() {
    playTone({ frequency: 523.25, type: 'triangle', duration: 0.1, volume: 0.08 });
    setTimeout(() => playTone({ frequency: 659.25, type: 'triangle', duration: 0.1, volume: 0.08 }), 90);
    setTimeout(() => playTone({ frequency: 783.99, type: 'triangle', duration: 0.12, volume: 0.09 }), 180);
    setTimeout(() => playTone({ frequency: 1046.5, type: 'sine', duration: 0.2, volume: 0.075 }), 290);
  },
  stageUp() {
    playTone({ frequency: 392, type: 'triangle', duration: 0.08, volume: 0.07 });
    setTimeout(() => playTone({ frequency: 587.33, type: 'triangle', duration: 0.08, volume: 0.075 }), 80);
    setTimeout(() => playTone({ frequency: 880, type: 'triangle', duration: 0.13, volume: 0.08 }), 160);
  },
  toggle() {
    playTone({ frequency: 520, type: 'sine', duration: 0.06, volume: 0.05, slideTo: 700 });
  },
};


function loadRanking() {
  try {
    const savedRanking = JSON.parse(localStorage.getItem(RANKING_STORAGE_KEY)) || [];
    return Array.isArray(savedRanking) ? savedRanking : [];
  } catch (error) {
    return [];
  }
}

function saveRanking(ranking) {
  localStorage.setItem(RANKING_STORAGE_KEY, JSON.stringify(ranking));
}

function sanitizeNickname(name) {
  return name.trim().replace(/[<>]/g, '').slice(0, 10) || '익명 파일럿';
}

function renderRanking() {
  const ranking = loadRanking();
  rankingList.innerHTML = '';

  if (ranking.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty-ranking';
    emptyItem.textContent = '아직 등록된 플레이 로그가 없습니다.';
    rankingList.appendChild(emptyItem);
    return;
  }

  ranking.forEach((record) => {
    const item = document.createElement('li');
    const row = document.createElement('div');
    const name = document.createElement('span');
    const scoreText = document.createElement('span');

    row.className = 'ranking-item';
    name.className = 'ranking-name';
    scoreText.className = 'ranking-score';

    name.textContent = record.name;
    scoreText.textContent = `${record.score}점 · ${record.stage || 1}단계`;

    row.append(name, scoreText);
    item.appendChild(row);
    rankingList.appendChild(item);
  });
}

function addRankingRecord(name, scoreValue, stageValue) {
  const ranking = loadRanking();
  const newRecord = {
    name: sanitizeNickname(name),
    score: scoreValue,
    stage: stageValue,
    createdAt: new Date().toISOString(),
  };

  ranking.push(newRecord);
  ranking.sort((a, b) => b.score - a.score || new Date(a.createdAt) - new Date(b.createdAt));
  saveRanking(ranking.slice(0, 10));
  renderRanking();
}

function resetRankingForm() {
  hasSavedCurrentRun = false;
  nicknameInput.value = '';
  nicknameInput.disabled = false;
  saveRankingButton.disabled = false;
  rankingMessage.textContent = '';
}

function updateSoundButton() {
  soundButton.textContent = soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF';
  soundButton.classList.toggle('off', !soundEnabled);
}

function resetGame() {
  score = 0;
  currentStage = 1;
  lastFinalStage = 1;
  lastTime = 0;
  missileSpawnTimer = 0;
  itemSpawnTimer = 0;
  moveSoundTimer = 0;
  nextScoreSound = 50;
  missiles = [];
  particles = [];
  items = [];
  activeEffects = { shield: 0, boost: 0 };

  player.x = canvas.width / 2;
  player.y = canvas.height / 2;

  spawnMissile(false);
  spawnMissile(false);

  scoreEl.textContent = '0';
  stageTextEl.textContent = '1';
  resetRankingForm();
}


function startGame() {
  getAudioContext();
  resetGame();
  sound.start();
  gameState = 'playing';
  startPanel.classList.add('hidden');
  gameOverPanel.classList.add('hidden');
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  if (gameState !== 'playing') return;

  gameState = 'over';
  cancelAnimationFrame(animationId);

  const finalScore = Math.floor(score);
  lastFinalScore = finalScore;
  lastFinalStage = currentStage;
  const isNewRecord = finalScore > bestScore;

  if (isNewRecord) {
    sound.newRecord();
  } else {
    sound.defeat();
  }

  bestScore = Math.max(bestScore, finalScore);
  localStorage.setItem('missileDodgeBestScore', bestScore);

  scoreEl.textContent = finalScore;
  bestScoreEl.textContent = bestScore;
  finalScoreEl.textContent = finalScore;
  finalBestScoreEl.textContent = bestScore;
  renderRanking();
  gameOverPanel.classList.remove('hidden');
  setTimeout(() => nicknameInput.focus(), 50);
}

function spawnMissile(playSound = true) {
  const side = Math.floor(Math.random() * 4);
  let x;
  let y;

  if (side === 0) {
    x = Math.random() * canvas.width;
    y = -20;
  } else if (side === 1) {
    x = canvas.width + 20;
    y = Math.random() * canvas.height;
  } else if (side === 2) {
    x = Math.random() * canvas.width;
    y = canvas.height + 20;
  } else {
    x = -20;
    y = Math.random() * canvas.height;
  }

  const stageConfig = getStageConfig();
  const difficultyBonus = Math.min(score * 0.34, 65) + stageConfig.missileSpeedBonus;

  missiles.push({
    x,
    y,
    radius: 10,
    speed: 118 + difficultyBonus + Math.random() * 28,
    turnRate: 2.85 + Math.min(score * 0.006, 1.25) + stageConfig.turnBonus,
    angle: Math.atan2(player.y - y, player.x - x),
    trailTimer: 0,
  });

  if (playSound) sound.missile();
}

function updatePlayer(delta) {
  let moveX = 0;
  let moveY = 0;

  if (keys.has('arrowleft') || keys.has('a')) moveX -= 1;
  if (keys.has('arrowright') || keys.has('d')) moveX += 1;
  if (keys.has('arrowup') || keys.has('w')) moveY -= 1;
  if (keys.has('arrowdown') || keys.has('s')) moveY += 1;

  const isMoving = moveX !== 0 || moveY !== 0;

  if (isMoving) {
    const length = Math.hypot(moveX, moveY);
    moveX /= length;
    moveY /= length;

    moveSoundTimer += delta;
    if (moveSoundTimer >= 0.16) {
      moveSoundTimer = 0;
      sound.move();
    }
  } else {
    moveSoundTimer = 0.16;
  }

  const speedMultiplier = activeEffects.boost > 0 ? ITEM_CONFIG.boostMultiplier : 1;
  player.x += moveX * player.speed * speedMultiplier * delta;
  player.y += moveY * player.speed * speedMultiplier * delta;

  player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
  player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function updateMissiles(delta) {
  for (const missile of missiles) {
    const targetAngle = Math.atan2(player.y - missile.y, player.x - missile.x);
    const angleDiff = normalizeAngle(targetAngle - missile.angle);
    const maxTurn = missile.turnRate * delta;

    missile.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
    missile.x += Math.cos(missile.angle) * missile.speed * delta;
    missile.y += Math.sin(missile.angle) * missile.speed * delta;

    missile.trailTimer += delta;
    if (missile.trailTimer > 0.025) {
      missile.trailTimer = 0;
      particles.push({
        x: missile.x - Math.cos(missile.angle) * 13,
        y: missile.y - Math.sin(missile.angle) * 13,
        radius: 5,
        life: 0.45,
      });
    }

    const distance = Math.hypot(player.x - missile.x, player.y - missile.y);
    if (distance < player.radius + missile.radius) {
      if (activeEffects.shield > 0) {
        createBurst(missile.x, missile.y, '#67e8f9', 14);
        sound.shieldHit();
        missiles = missiles.filter((target) => target !== missile);
        continue;
      }

      endGame();
      return;
    }
  }
}


function createBurst(x, y, color = '#fb923c', count = 10) {
  for (let i = 0; i < count; i += 1) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 140,
      vy: (Math.random() - 0.5) * 140,
      radius: 3 + Math.random() * 4,
      life: 0.45 + Math.random() * 0.25,
      color,
    });
  }
}

function spawnItem() {
  if (items.length >= 2) return;

  const type = Math.random() < 0.62 ? 'shield' : 'boost';
  items.push({
    type,
    x: 50 + Math.random() * (canvas.width - 100),
    y: 50 + Math.random() * (canvas.height - 100),
    radius: ITEM_CONFIG.radius,
    life: ITEM_CONFIG.lifeTime,
    pulse: 0,
  });
}

function collectItem(item) {
  if (item.type === 'shield') {
    activeEffects.shield = ITEM_CONFIG.shieldDuration;
  } else if (item.type === 'boost') {
    activeEffects.boost = ITEM_CONFIG.boostDuration;
  }

  createBurst(item.x, item.y, item.type === 'shield' ? '#67e8f9' : '#a7f3d0', 16);
  sound.item();
}

function updateItems(delta) {
  itemSpawnTimer += delta;
  const stageConfig = getStageConfig();
  const itemInterval = Math.max(4.5, ITEM_CONFIG.spawnInterval - (stageConfig.stage - 1) * 0.9);

  if (itemSpawnTimer >= itemInterval) {
    itemSpawnTimer = 0;
    spawnItem();
  }

  activeEffects.shield = Math.max(0, activeEffects.shield - delta);
  activeEffects.boost = Math.max(0, activeEffects.boost - delta);

  items = items.filter((item) => {
    item.life -= delta;
    item.pulse += delta * 5;

    const distance = Math.hypot(player.x - item.x, player.y - item.y);
    if (distance < player.radius + item.radius) {
      collectItem(item);
      return false;
    }

    return item.life > 0;
  });
}

function updateParticles(delta) {
  particles = particles
    .map((particle) => ({
      ...particle,
      x: particle.x + (particle.vx || 0) * delta,
      y: particle.y + (particle.vy || 0) * delta,
      life: particle.life - delta,
      radius: particle.radius + delta * 8,
    }))
    .filter((particle) => particle.life > 0);
}

function getStageConfig() {
  let selectedConfig = STAGE_CONFIG[0];

  for (const config of STAGE_CONFIG) {
    if (score >= config.minScore) {
      selectedConfig = config;
    }
  }

  return selectedConfig;
}

function updateStage() {
  const nextStage = getStageConfig().stage;

  if (nextStage !== currentStage) {
    currentStage = nextStage;
    stageTextEl.textContent = currentStage;
    sound.stageUp();

    if (currentStage === 2) spawnMissile();
    if (currentStage === 3) {
      spawnMissile();
      spawnMissile();
    }
  }
}

function update(delta) {
  const stageConfig = getStageConfig();
  score += delta * 10 * stageConfig.scoreMultiplier;
  updateStage();
  scoreEl.textContent = Math.floor(score);

  if (score >= nextScoreSound) {
    nextScoreSound += 50;
    sound.score();
  }

  missileSpawnTimer += delta;
  const updatedStageConfig = getStageConfig();
  const spawnInterval = Math.max(updatedStageConfig.spawnMin, updatedStageConfig.spawnBase - score * 0.012);

  if (missileSpawnTimer >= spawnInterval && missiles.length < updatedStageConfig.maxMissiles) {
    missileSpawnTimer = 0;
    spawnMissile();
  }

  updatePlayer(delta);
  updateItems(delta);
  updateMissiles(delta);
  updateParticles(delta);
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;

  for (let x = 0; x < canvas.width; x += 45) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);

  ctx.fillStyle = '#67e8f9';
  ctx.beginPath();
  ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-5, -4, 3, 0, Math.PI * 2);
  ctx.arc(5, -4, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMissiles() {
  for (const missile of missiles) {
    ctx.save();
    ctx.translate(missile.x, missile.y);
    ctx.rotate(missile.angle);

    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-10, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-22, -5);
    ctx.lineTo(-18, 0);
    ctx.lineTo(-22, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(particle.life / 0.45, 0);
    ctx.fillStyle = particle.color || '#fb923c';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}


function drawItems() {
  for (const item of items) {
    const pulse = Math.sin(item.pulse) * 3;

    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.globalAlpha = Math.min(1, item.life / 0.8);

    ctx.fillStyle = item.type === 'shield' ? 'rgba(103, 232, 249, 0.18)' : 'rgba(167, 243, 208, 0.18)';
    ctx.beginPath();
    ctx.arc(0, 0, item.radius + 8 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = item.type === 'shield' ? '#67e8f9' : '#a7f3d0';
    ctx.beginPath();
    ctx.arc(0, 0, item.radius + pulse * 0.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.type === 'shield' ? '🛡' : '⚡', 0, 1);
    ctx.restore();
  }
}

function drawActiveEffects() {
  if (activeEffects.shield > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.8)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius + 10 + Math.sin(Date.now() / 90) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const effects = [];
  if (activeEffects.shield > 0) effects.push(`🛡 ${activeEffects.shield.toFixed(1)}s`);
  if (activeEffects.boost > 0) effects.push(`⚡ ${activeEffects.boost.toFixed(1)}s`);

  if (effects.length > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(22, 68, 170, 34);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '700 15px Arial';
    ctx.fillText(effects.join('  '), 34, 90);
    ctx.restore();
  }
}

function drawStageBadge() {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(22, 22, 118, 38);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '700 18px Arial';
  ctx.fillText(`${currentStage}단계`, 42, 47);
  ctx.restore();
}

function draw() {
  drawBackground();
  drawParticles();
  drawItems();
  drawMissiles();
  drawPlayer();
  drawActiveEffects();
  drawStageBadge();
}

function gameLoop(timestamp) {
  if (gameState !== 'playing') return;

  if (!lastTime) lastTime = timestamp;
  const delta = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;

  update(delta);
  draw();

  if (gameState === 'playing') {
    animationId = requestAnimationFrame(gameLoop);
  }
}

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
    event.preventDefault();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
});

soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('missileDodgeSound', soundEnabled ? 'on' : 'off');
  updateSoundButton();
  sound.toggle();
});

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);

rankingForm.addEventListener('submit', (event) => {
  event.preventDefault();

  if (gameState !== 'over' || hasSavedCurrentRun) return;

  addRankingRecord(nicknameInput.value, lastFinalScore, lastFinalStage);
  hasSavedCurrentRun = true;
  nicknameInput.disabled = true;
  saveRankingButton.disabled = true;
  rankingMessage.textContent = '랭킹에 등록되었습니다!';
  sound.score();
});

clearRankingButton.addEventListener('click', () => {
  localStorage.removeItem(RANKING_STORAGE_KEY);
  renderRanking();
  rankingMessage.textContent = '랭킹이 초기화되었습니다.';
});

updateSoundButton();
renderRanking();
draw();
