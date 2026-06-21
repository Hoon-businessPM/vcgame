const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const finalScoreEl = document.getElementById('finalScore');
const finalBestScoreEl = document.getElementById('finalBestScore');
const startPanel = document.getElementById('startPanel');
const gameOverPanel = document.getElementById('gameOverPanel');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const soundButton = document.getElementById('soundButton');

const keys = new Set();
let animationId = null;
let gameState = 'ready';
let score = 0;
let bestScore = Number(localStorage.getItem('missileDodgeBestScore')) || 0;
let soundEnabled = localStorage.getItem('missileDodgeSound') !== 'off';
let lastTime = 0;
let missileSpawnTimer = 0;
let moveSoundTimer = 0;
let nextScoreSound = 50;

bestScoreEl.textContent = bestScore;

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 15,
  speed: 285,
};

let missiles = [];
let particles = [];
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
  toggle() {
    playTone({ frequency: 520, type: 'sine', duration: 0.06, volume: 0.05, slideTo: 700 });
  },
};

function updateSoundButton() {
  soundButton.textContent = soundEnabled ? '🔊 SOUND ON' : '🔇 SOUND OFF';
  soundButton.classList.toggle('off', !soundEnabled);
}

function resetGame() {
  score = 0;
  lastTime = 0;
  missileSpawnTimer = 0;
  moveSoundTimer = 0;
  nextScoreSound = 50;
  missiles = [];
  particles = [];

  player.x = canvas.width / 2;
  player.y = canvas.height / 2;

  spawnMissile(false);
  spawnMissile(false);

  scoreEl.textContent = '0';
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
  sound.explosion();

  bestScore = Math.max(bestScore, Math.floor(score));
  localStorage.setItem('missileDodgeBestScore', bestScore);

  scoreEl.textContent = Math.floor(score);
  bestScoreEl.textContent = bestScore;
  finalScoreEl.textContent = Math.floor(score);
  finalBestScoreEl.textContent = bestScore;
  gameOverPanel.classList.remove('hidden');
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

  const difficultyBonus = Math.min(score * 0.9, 140);

  missiles.push({
    x,
    y,
    radius: 10,
    speed: 125 + difficultyBonus + Math.random() * 45,
    turnRate: 3.2 + Math.min(score * 0.015, 2.4),
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

  player.x += moveX * player.speed * delta;
  player.y += moveY * player.speed * delta;

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
      endGame();
      return;
    }
  }
}

function updateParticles(delta) {
  particles = particles
    .map((particle) => ({
      ...particle,
      life: particle.life - delta,
      radius: particle.radius + delta * 8,
    }))
    .filter((particle) => particle.life > 0);
}

function update(delta) {
  score += delta * 10;
  scoreEl.textContent = Math.floor(score);

  if (score >= nextScoreSound) {
    nextScoreSound += 50;
    sound.score();
  }

  missileSpawnTimer += delta;
  const spawnInterval = Math.max(0.65, 2.1 - score * 0.018);

  if (missileSpawnTimer >= spawnInterval) {
    missileSpawnTimer = 0;
    spawnMissile();
  }

  updatePlayer(delta);
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
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function draw() {
  drawBackground();
  drawParticles();
  drawMissiles();
  drawPlayer();
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

updateSoundButton();
draw();
