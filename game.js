const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const restartButton = document.getElementById("restartButton");
const pauseButton = document.getElementById("pauseButton");
const backgroundVideo = document.getElementById("gameBackground");
const controlButtons = Array.from(document.querySelectorAll(".control-btn"));

const keys = { left: false, right: false };
let gameOver = false;
let paused = false;
let lastTime = 0;
let cameraY = 0;
let nextPlatformY = canvas.height - 120;
let currentHeight = 0;
let bestHeight = 0;
let audioContext = null;

const iconicCries = ["Hee-hee !", "Aoow !", "Ow !", "Ch'ki-ta !", "Hoo !", "Aah !", "Yah !"];
const zombieTypes = ["dancing", "climbing", "dancing-elite", "climbing-elite", "dancing-fast"];

const playerSpriteContact = new Image();
playerSpriteContact.src = "./Custom/Visuels/Player-1.png";
const playerSpriteJump = new Image();
playerSpriteJump.src = "./Custom/Visuels/Player-2.png";

const zombieSprites = {
  dancing: {
    gauche: new Image(),
    droite: new Image(),
  },
  climbing: {
    gauche: new Image(),
    droite: new Image(),
  },
};
zombieSprites.dancing.gauche.src = "./Custom/Visuels/Dancing-zombie-gauche.png";
zombieSprites.dancing.droite.src = "./Custom/Visuels/Dancing-zombie-droite.png";
zombieSprites.climbing.gauche.src = "./Custom/Visuels/Climbing-zombie-gauche.png";
zombieSprites.climbing.droite.src = "./Custom/Visuels/Climbing-zombie-droite.png";

try {
  bestHeight = Number(localStorage.getItem("verticalMoonWalkBestHeight")) || 0;
} catch (error) {
  bestHeight = 0;
}

const player = {
  x: 0,
  y: 0,
  width: 32,
  height: 48,
  vx: 0,
  vy: 0,
  invincibleTimer: 0,
  slowTimer: 0,
  speedTimer: 0,
  jetpackTimer: 0,
  trampolineTimer: 0,
};

const platforms = [];
const enemies = [];
const particles = [];
let messageText = "";
let messageTimer = 0;
let screenFlash = 0;

let jumpSound = null;
let gameOverSound = null;
let ambientSound = null;
let animationSoundPool = [];

function setControlState(control, isPressed) {
  if (control === "left") keys.left = isPressed;
  if (control === "right") keys.right = isPressed;
}

function bindMobileControls() {
  controlButtons.forEach((button) => {
    const control = button.dataset.control;
    const press = (event) => {
      event.preventDefault();
      ensureAudio();
      setControlState(control, true);
      button.classList.add("active");
    };
    const release = (event) => {
      if (event) event.preventDefault();
      setControlState(control, false);
      button.classList.remove("active");
    };

    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("touchstart", press, { passive: false });
    button.addEventListener("touchend", release);
    button.addEventListener("touchcancel", release);
  });
}

function resizeCanvas() {
  const baseWidth = 480;
  const baseHeight = 720;
  const maxWidth = Math.min(window.innerWidth - 24, baseWidth);
  const maxHeight = Math.min(window.innerHeight - 180, baseHeight);
  const scale = Math.min(maxWidth / baseWidth, maxHeight / baseHeight, 1);
  const width = Math.max(320, Math.round(baseWidth * scale));
  const height = Math.round(baseHeight * scale);

  if (canvas.width === width && canvas.height === height) return;

  const previousWidth = canvas.width || baseWidth;
  const previousHeight = canvas.height || baseHeight;
  const scaleX = width / previousWidth;
  const scaleY = height / previousHeight;

  canvas.width = width;
  canvas.height = height;

  if (platforms.length) {
    platforms.forEach((platform) => {
      platform.x *= scaleX;
      platform.baseX *= scaleX;
      platform.y *= scaleY;
      platform.width *= scaleX;
      platform.height *= scaleY;
      platform.amplitude *= scaleX;
    });

    enemies.forEach((enemy) => {
      enemy.x *= scaleX;
      enemy.y *= scaleY;
      enemy.width *= scaleX;
      enemy.height *= scaleY;
      enemy.relX *= scaleX;
      enemy.range *= scaleX;
      enemy.speed *= scaleX;
      enemy.platform = platforms.find((platform) => platform.y === enemy.platform.y && platform.x === enemy.platform.x) || enemy.platform;
    });

    player.x *= scaleX;
    player.y *= scaleY;
    player.width *= scaleX;
    player.height *= scaleY;
    cameraY *= scaleY;
    nextPlatformY = Math.max(120, nextPlatformY * scaleY);
  }
}

function spawnBurst(x, y, color, count = 10, speed = 140) {
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const velocity = speed * (0.6 + Math.random() * 0.4);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - 40,
      life: 0.55 + Math.random() * 0.25,
      size: 2 + Math.random() * 2.5,
      color,
    });
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vy += 220 * delta;
    particle.vx *= 0.96;
    if (particle.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  ctx.save();
  for (const particle of particles) {
    const alpha = Math.max(0, particle.life / 0.8);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFlash() {
  if (screenFlash <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.22, screenFlash * 0.35);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function togglePause() {
  paused = !paused;
  pauseButton.textContent = paused ? "Jouer" : "Pause";
  if (!paused) {
    lastTime = performance.now();
  }
}

function playJumpSound() {
  if (jumpSound && jumpSound.currentSrc) {
    jumpSound.currentTime = 0;
    jumpSound.play().catch(() => {});
    return;
  }

  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(620, audioContext.currentTime);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.02, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.14);
}

function playGameOverSound() {
  if (gameOverSound && gameOverSound.currentSrc) {
    gameOverSound.currentTime = 0;
    gameOverSound.play().catch(() => {});
    return;
  }

  if (!audioContext) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(260, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, audioContext.currentTime + 0.4);
  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.04, audioContext.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.5);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.5);
}

function playAnimationSound() {
  if (animationSoundPool.length === 0) return;
  const sound = animationSoundPool[Math.floor(Math.random() * animationSoundPool.length)];
  if (sound && sound.currentSrc) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

function ensureAudio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext = new AudioCtx();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  if (jumpSound) return;

  const createSound = (src) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.load();
    return audio;
  };

  jumpSound = createSound("./Custom/Sons/MJ-Jump.mp3");
  gameOverSound = createSound("./Custom/Sons/MJ-Fall.mp3");
  ambientSound = createSound("./Custom/Sons/ambient-thriller_v2.mp3");
  ambientSound.loop = true;
  ambientSound.volume = 0.35;
  animationSoundPool = [
    createSound("./Custom/Sons/MJ-Aww.mp3"),
    createSound("./Custom/Sons/MJ-Aww2.mp3"),
    createSound("./Custom/Sons/MJ-Aww3.mp3"),
    createSound("./Custom/Sons/MJ-HeeHee.mp3"),
    createSound("./Custom/Sons/MJ-Hoo.mp3"),
    createSound("./Custom/Sons/MJ-Hoo2.mp3"),
    createSound("./Custom/Sons/MJ-HooHoo.mp3"),
  ];
  animationSoundPool.forEach((sound) => {
    sound.volume = 0.85;
  });

  try {
    ambientSound.play().catch(() => {});
  } catch (error) {
    // Ignore autoplay restrictions.
  }
}

function playIconicCry() {
  playAnimationSound();
}

function resetGame() {
  gameOver = false;
  paused = false;
  pauseButton.textContent = "Pause";
  screenFlash = 0;
  particles.length = 0;
  lastTime = 0;
  cameraY = 0;
  nextPlatformY = canvas.height - 120;
  currentHeight = 0;
  player.vx = 0;
  player.vy = 0;
  player.invincibleTimer = 0;
  player.slowTimer = 0;
  player.speedTimer = 0;
  player.jetpackTimer = 0;
  player.trampolineTimer = 0;
  platforms.length = 0;
  enemies.length = 0;
  messageText = "";
  messageTimer = 0;
  createInitialPlatforms();

  const startPlatform = platforms[0];
  player.x = startPlatform.x + startPlatform.width / 2 - player.width / 2;
  player.y = startPlatform.y - player.height;
}

function createInitialPlatforms() {
  for (let i = 0; i < 16; i += 1) {
    const y = canvas.height - 120 - i * 95;
    spawnPlatformAt(y, true, i);
  }
}

function pickBonusType() {
  const bonusPool = ["jetpack", "trampoline", "invincible", "slow", "fakeSpeed"];
  return bonusPool[Math.floor(Math.random() * bonusPool.length)];
}

function pickZombieType() {
  return zombieTypes[Math.floor(Math.random() * zombieTypes.length)];
}

function spawnPlatformAt(y, forceX = false, index = platforms.length) {
  const width = 78 + Math.floor(Math.random() * 24);
  const minGap = 70;
  const previousPlatform = platforms[platforms.length - 1];
  let x = forceX
    ? canvas.width / 2 - width / 2
    : Math.random() * (canvas.width - width - 20) + 10;

  if (!forceX && previousPlatform) {
    const preferredX = x;
    const minX = previousPlatform.x - minGap;
    const maxX = previousPlatform.x + previousPlatform.width + minGap;
    const clampedX = Math.max(10, Math.min(canvas.width - width - 10, preferredX));
    const safeX = Math.min(Math.max(clampedX, minX), maxX);
    const jitter = (Math.random() - 0.5) * 40;
    x = Math.max(10, Math.min(canvas.width - width - 10, safeX + jitter));
  }

  const isMoving = Math.random() < 0.3;
  const platform = {
    x,
    baseX: x,
    y,
    width,
    height: 14,
    isMoving,
    amplitude: 28 + Math.random() * 40,
    offset: Math.random() * Math.PI * 2,
    bonusType: null,
    bonusCollected: false,
    enemy: null,
  };

  if (index > 10 && Math.random() < 0.2) {
    createEnemyForPlatform(platform);
    platform.enemy = true;
  }

  if (index > 10 && platform.enemy === null && Math.random() < 0.22) {
    platform.bonusType = pickBonusType();
  } else if (index <= 10) {
    platform.bonusType = null;
  } else if (Math.random() < 0.22) {
    platform.bonusType = pickBonusType();
  }

  platforms.push(platform);
}

function createEnemyForPlatform(platform) {
  const variant = pickZombieType();
  const isClimbing = variant.startsWith("climbing");
  const enemyWidth = isClimbing ? 18 : 54;
  const enemyHeight = isClimbing ? 24 : 30;
  const enemy = {
    platform,
    x: platform.x + platform.width / 2 - enemyWidth / 2,
    y: platform.y - enemyHeight,
    width: enemyWidth,
    height: enemyHeight,
    relX: platform.width / 2 - enemyWidth / 2,
    range: Math.max(18, platform.width - enemyWidth - 12),
    speed: 30 + Math.random() * 40,
    direction: Math.random() < 0.5 ? -1 : 1,
    dead: false,
    collided: false,
    variant,
  };
  enemies.push(enemy);
  return enemy;
}

function ensurePlatforms() {
  while (nextPlatformY > player.y - canvas.height * 0.8) {
    spawnPlatformAt(nextPlatformY);
    nextPlatformY -= 85 + Math.random() * 35;
  }
}

function activateBonus(type) {
  switch (type) {
    case "jetpack":
      player.jetpackTimer = 2.4;
      messageText = "Jetpack !";
      break;
    case "trampoline":
      player.trampolineTimer = 0.7;
      messageText = "Trampoline !";
      break;
    case "invincible":
      player.invincibleTimer = 3.2;
      messageText = "Invincible !";
      break;
    case "slow":
      player.slowTimer = 3.4;
      messageText = "Ralentissement";
      break;
    case "fakeSpeed":
      player.speedTimer = 2.6;
      messageText = "Faux boost";
      break;
    default:
      break;
  }
  messageTimer = 1.4;
}

function update(delta) {
  if (gameOver) return;

  if (paused) return;

  screenFlash = Math.max(0, screenFlash - delta);
  player.invincibleTimer = Math.max(0, player.invincibleTimer - delta);
  player.slowTimer = Math.max(0, player.slowTimer - delta);
  player.speedTimer = Math.max(0, player.speedTimer - delta);
  player.jetpackTimer = Math.max(0, player.jetpackTimer - delta);
  player.trampolineTimer = Math.max(0, player.trampolineTimer - delta);
  messageTimer = Math.max(0, messageTimer - delta);

  const moveSpeed = 240 + (player.speedTimer > 0 ? 120 : 0) - (player.slowTimer > 0 ? 90 : 0);
  const gravity = 1200 + (player.jetpackTimer > 0 ? -140 : 0) + (player.slowTimer > 0 ? 120 : 0);
  const jumpStrength = 560 + (player.speedTimer > 0 ? 25 : 0);

  player.vx = 0;
  if (keys.left) player.vx -= moveSpeed;
  if (keys.right) player.vx += moveSpeed;

  player.x += player.vx * delta;
  if (player.x + player.width < 0) {
    player.x = canvas.width;
  } else if (player.x > canvas.width) {
    player.x = -player.width;
  }

  const prevY = player.y;
  player.vy += gravity * delta;
  if (player.jetpackTimer > 0) {
    player.vy -= 220 * delta;
  }
  player.y += player.vy * delta;

  for (const platform of platforms) {
    const playerBottom = player.y + player.height;
    const prevBottom = prevY + player.height;
    const platformTop = platform.y;
    const platformBottom = platform.y + platform.height;

    if (platform.isMoving) {
      const oscillation = Math.sin(performance.now() / 450 + platform.offset) * platform.amplitude;
      platform.x = platform.baseX + oscillation;
    }

    if (
      player.vy >= 0 &&
      prevBottom <= platformTop &&
      playerBottom >= platformTop &&
      player.x + player.width > platform.x &&
      player.x < platform.x + platform.width &&
      player.y < platformBottom
    ) {
      if (platform.bonusType && !platform.bonusCollected) {
        platform.bonusCollected = true;
        const bonusColor = {
          jetpack: "#7ef7ff",
          trampoline: "#ffcf5c",
          invincible: "#ffe082",
          slow: "#8eff6f",
          fakeSpeed: "#ff7bbd",
        }[platform.bonusType] || "#ff8f3f";
        spawnBurst(platform.x + platform.width / 2, platform.y - 10, bonusColor, 12, 180);
        screenFlash = Math.max(screenFlash, 0.08);
        playAnimationSound();
        playIconicCry();
        activateBonus(platform.bonusType);
      }

      player.y = platformTop - player.height;
      let bounceMultiplier = 1;
      if (player.trampolineTimer > 0) {
        bounceMultiplier = 1.4;
        player.trampolineTimer = 0;
      }
      playJumpSound();
      spawnBurst(player.x + player.width / 2, player.y + player.height, "#ffe082", 8, 120);
      player.vy = -jumpStrength * bounceMultiplier;
      break;
    }
  }

  for (const enemy of enemies) {
    const enemyTop = enemy.y;
    const enemyBottom = enemy.y + enemy.height;
    const enemyLeft = enemy.x;
    const enemyRight = enemy.x + enemy.width;
    const playerTop = player.y;
    const playerBottom = player.y + player.height;
    const playerLeft = player.x;
    const playerRight = player.x + player.width;

    enemy.relX += enemy.speed * delta * enemy.direction;
    if (enemy.relX <= 0 || enemy.relX >= enemy.range) {
      enemy.direction *= -1;
    }
    enemy.x = enemy.platform.x + enemy.relX;
    enemy.y = enemy.platform.y - enemy.height;

    const overlapX = playerRight > enemyLeft && playerLeft < enemyRight;
    const overlapY = playerBottom > enemyTop && playerTop < enemyBottom;

    if (overlapX && overlapY) {
      if (!enemy.collided) {
        playIconicCry();
        enemy.collided = true;
      }

      const fromTop = prevY + player.height <= enemyTop + 4;
      if (fromTop && player.vy >= 0) {
        enemy.dead = true;
        spawnBurst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#fff5a8", 16, 170);
        screenFlash = Math.max(screenFlash, 0.12);
        playAnimationSound();
        playJumpSound();
        player.vy = -jumpStrength * 0.85;
      } else if (player.invincibleTimer <= 0) {
        gameOver = true;
        playGameOverSound();
      }
    } else {
      enemy.collided = false;
    }
  }

  enemies.splice(0, enemies.length, ...enemies.filter((enemy) => !enemy.dead));

  currentHeight = Math.max(0, Math.floor((canvas.height - 92 - player.y) / 10));
  if (currentHeight > bestHeight) {
    bestHeight = currentHeight;
    try {
      localStorage.setItem("verticalMoonWalkBestHeight", String(bestHeight));
    } catch (error) {
      // ignore storage errors
    }
  }

  cameraY = Math.min(cameraY, player.y - canvas.height * 0.62);

  if (player.y - cameraY > canvas.height + 80) {
    gameOver = true;
    playGameOverSound();
  }

  updateParticles(delta);
  ensurePlatforms();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "rgba(7, 8, 20, 0.15)");
  gradient.addColorStop(0.5, "rgba(8, 10, 18, 0.45)");
  gradient.addColorStop(1, "rgba(3, 4, 10, 0.8)");

  if (backgroundVideo && backgroundVideo.readyState >= 2) {
    ctx.save();
    ctx.drawImage(backgroundVideo, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 22; i += 1) {
    const x = ((i * 59 + cameraY * 0.03) % (canvas.width + 40)) - 20;
    const y = ((i * 113 + cameraY * 0.01) % (canvas.height + 40)) - 20;
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + (i % 3) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlatforms() {
  for (const platform of platforms) {
    const screenY = platform.y - cameraY;
    if (screenY > canvas.height + 20 || screenY < -40) continue;

    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = platform.isMoving ? "#ffcf5c" : "#6cf8ff";
    ctx.fillStyle = platform.isMoving ? "#ffcf5c" : "#69e0ff";
    ctx.fillRect(platform.x, screenY, platform.width, platform.height);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fillRect(platform.x, screenY, platform.width, 4);
    ctx.restore();

    if (platform.bonusType && !platform.bonusCollected) {
      ctx.save();
      ctx.translate(platform.x + platform.width / 2, screenY - 14);
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#ff8f3f";

      const bonusColor = {
        jetpack: "#7ef7ff",
        trampoline: "#ffcf5c",
        invincible: "#ffe082",
        slow: "#8eff6f",
        fakeSpeed: "#ff7bbd",
      }[platform.bonusType] || "#ff8f3f";

      ctx.fillStyle = bonusColor;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 1.4;

      switch (platform.bonusType) {
        case "jetpack":
          ctx.beginPath();
          ctx.moveTo(-6, 6);
          ctx.lineTo(0, -8);
          ctx.lineTo(6, 6);
          ctx.lineTo(2, 6);
          ctx.lineTo(2, 10);
          ctx.lineTo(-2, 10);
          ctx.lineTo(-2, 6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        case "trampoline":
          ctx.fillRect(-6, -2, 12, 6);
          ctx.fillRect(-4, -8, 8, 6);
          ctx.strokeRect(-6, -2, 12, 6);
          ctx.strokeRect(-4, -8, 8, 6);
          break;
        case "invincible":
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(2.4, -2.6);
          ctx.lineTo(8, -2.2);
          ctx.lineTo(3.6, 1.4);
          ctx.lineTo(5.2, 7.4);
          ctx.lineTo(0, 3.8);
          ctx.lineTo(-5.2, 7.4);
          ctx.lineTo(-3.6, 1.4);
          ctx.lineTo(-8, -2.2);
          ctx.lineTo(-2.4, -2.6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        case "slow":
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.lineTo(0, -3.2);
          ctx.moveTo(0, 3.2);
          ctx.lineTo(0, 7);
          ctx.moveTo(-7, 0);
          ctx.lineTo(-3.2, 0);
          ctx.moveTo(3.2, 0);
          ctx.lineTo(7, 0);
          ctx.stroke();
          break;
        case "fakeSpeed":
          ctx.beginPath();
          ctx.moveTo(-5, 0);
          ctx.lineTo(0, -6);
          ctx.lineTo(-1, -1);
          ctx.lineTo(5, 0);
          ctx.lineTo(0, 6);
          ctx.lineTo(1, 1);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          break;
        default:
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
      ctx.restore();
    }
  }
}

function drawEnemies() {
  for (const enemy of enemies) {
    const screenY = enemy.y - cameraY;
    if (screenY > canvas.height + 20 || screenY < -40) continue;

    const family = enemy.variant.startsWith("climbing") ? "climbing" : "dancing";
    const sprite = zombieSprites[family][enemy.direction < 0 ? "gauche" : "droite"];
    if (sprite && sprite.complete) {
      ctx.save();
      ctx.shadowBlur = 16;
      ctx.shadowColor = "#74ff7e";
      ctx.drawImage(sprite, enemy.x - 4, screenY - 4, enemy.width + 8, enemy.height + 8);
      ctx.restore();
      continue;
    }

    const palette = {
      crawler: { body: "#3d8f3d", accent: "#8eff6f" },
      limper: { body: "#5b8f4a", accent: "#d4ff88" },
      shambler: { body: "#4f7c3d", accent: "#9ee8b2" },
      runner: { body: "#60a24d", accent: "#d0ff74" },
      jumper: { body: "#3c7c42", accent: "#a3ffa0" },
    }[enemy.variant];

    ctx.save();
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#74ff7e";
    ctx.fillStyle = palette.body;
    ctx.fillRect(enemy.x, screenY + 2, enemy.width, enemy.height - 2);
    ctx.fillStyle = "#1d211b";
    ctx.fillRect(enemy.x + 6, screenY + 2, 12, 8);
    ctx.fillRect(enemy.x + 6, screenY + 12, 12, 4);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(enemy.x + 2, screenY + 8, 6, 4);
    ctx.fillRect(enemy.x + 16, screenY + 8, 6, 4);
    ctx.fillRect(enemy.x + 6, screenY + 16, 4, 6);
    ctx.fillRect(enemy.x + 14, screenY + 16, 4, 6);
    ctx.restore();
  }
}

function drawPlayer() {
  const screenY = player.y - cameraY;
  const sprite = player.vy < 0 ? playerSpriteJump : playerSpriteContact;
  if (sprite && sprite.complete) {
    ctx.save();
    ctx.shadowBlur = 24;
    ctx.shadowColor = player.invincibleTimer > 0 ? "#8af6ff" : "#ff4bd8";
    ctx.drawImage(sprite, player.x - 8, screenY - 8, player.width + 16, player.height + 16);
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.shadowBlur = 24;
  ctx.shadowColor = player.invincibleTimer > 0 ? "#8af6ff" : "#ff4bd8";

  ctx.fillStyle = "#111111";
  ctx.fillRect(player.x + 5, screenY + 2, 22, 10);
  ctx.fillRect(player.x + 8, screenY + 12, 16, 16);
  ctx.fillRect(player.x + 10, screenY + 28, 12, 12);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(player.x + 7, screenY + 4, 8, 4);
  ctx.fillRect(player.x + 17, screenY + 4, 8, 4);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x + 8, screenY + 8, 16, 4);
  ctx.fillStyle = "#111111";
  ctx.fillRect(player.x + 10, screenY + 20, 12, 8);

  ctx.fillStyle = "#e6e6e6";
  ctx.fillRect(player.x + 4, screenY + 20, 6, 8);
  ctx.fillRect(player.x + 22, screenY + 20, 6, 8);

  ctx.fillStyle = "#000000";
  ctx.fillRect(player.x + 8, screenY + 38, 16, 6);
  ctx.fillStyle = "#ffd166";
  ctx.fillRect(player.x + 6, screenY - 2, 20, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(player.x + 8, screenY - 8, 8, 8);
  ctx.restore();
}

function drawScore() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`Hauteur : ${currentHeight}`, canvas.width / 2, 34);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(`Meilleur : ${bestHeight}`, canvas.width / 2, 56);
  if (messageTimer > 0 && messageText) {
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ffe082";
    ctx.fillText(messageText, canvas.width / 2, 82);
  }
  ctx.restore();
}

function drawOverlay() {
  if (gameOver) {
    ctx.fillStyle = "rgba(0,0,0,0.56)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Game Over", canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "16px sans-serif";
    ctx.fillText("Appuie sur Recommencer", canvas.width / 2, canvas.height / 2 + 22);
    return;
  }

  if (!paused) return;
  ctx.fillStyle = "rgba(0,0,0,0.54)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Pause", canvas.width / 2, canvas.height / 2 - 8);
  ctx.font = "16px sans-serif";
  ctx.fillText("Appuie sur Pause pour reprendre", canvas.width / 2, canvas.height / 2 + 22);
}

function loop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = Math.min((timestamp - lastTime) / 1000, 0.033);
  lastTime = timestamp;

  update(delta);
  drawBackground();
  drawPlatforms();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawScore();
  drawFlash();
  drawOverlay();

  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  ensureAudio();
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") keys.left = true;
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") keys.right = true;
  if (event.key === "p" || event.key === "P") {
    event.preventDefault();
    togglePause();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") keys.left = false;
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") keys.right = false;
});

canvas.addEventListener("pointerdown", ensureAudio);
window.addEventListener("pointerdown", ensureAudio, { once: true });
window.addEventListener("keydown", ensureAudio, { once: true });
restartButton.addEventListener("click", () => {
  ensureAudio();
  resetGame();
});
pauseButton.addEventListener("click", () => {
  ensureAudio();
  togglePause();
});

bindMobileControls();
resizeCanvas();
backgroundVideo?.play().catch(() => {});
resetGame();
requestAnimationFrame(loop);
window.addEventListener("resize", resizeCanvas);
