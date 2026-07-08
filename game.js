const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";
ctx.lineCap = "round";
ctx.lineJoin = "round";
const restartButton = document.getElementById("restartButton");
const pauseButton = document.getElementById("pauseButton");
const pauseButtonImg = pauseButton?.querySelector("img");
const soundButton = document.getElementById("soundButton");
const soundSettingsPanel = document.getElementById("soundSettingsPanel");
const pauseQuickAudio = document.getElementById("pauseQuickAudio");
const closeSoundSettingsButton = document.getElementById("closeSoundSettings");
const effectsToggle = document.getElementById("effectsToggle");
const musicToggle = document.getElementById("musicToggle");
const ambianceSelect = document.getElementById("ambianceSelect");
const pauseAmbianceSelect = document.getElementById("pauseAmbianceSelect");
const backgroundVideo = document.getElementById("gameBackground");
const swipeArea = document.getElementById("swipeArea");
const isMobileDevice =
  window.matchMedia("(pointer: coarse)").matches ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
const performanceMode = isMobileDevice ? "lite" : "full";

let isDragging = false;
let dragStartX = 0;
let playerStartX = 0;

const keys = { left: false, right: false };
let gameOver = false;
let paused = false;
let lastTime = 0;
let cameraY = 0;
let nextPlatformY = canvas.height - 120;
let currentHeight = 0;
let bestHeight = 0;
let elapsedTime = 0;
let bestTime = 0;
let audioContext = null;
let audioStarted = false;
let lastDirection = 1; // 1 = right, -1 = left
let playerSpriteContactMirror = null;
let playerSpriteJumpMirror = null;
const SAFE_PLATFORM_COUNT = 10;
const TRAPPED_PLATFORM_CHANCE = 1 / 15;
const TRAMPOLINE_BOUND_EFFECT_DURATION = 0.42;
const soundSettings = {
  effects: true,
  music: true,
  ambiance: "you_rock_my_world",
};

const iconicCries = ["Hee-hee !", "Aoow !", "Ow !", "Ch'ki-ta !", "Hoo !", "Aah !", "Yah !"];
const zombieTypes = ["dancing", "climbing", "dancing-elite", "climbing-elite", "dancing-fast"];

const playerSpriteContact = new Image();
playerSpriteContact.src = "./Custom/Visuels/Player-1.png";
const playerSpriteJump = new Image();
playerSpriteJump.src = "./Custom/Visuels/Player-2.png";

function createMirroredImage(source) {
  const canvas = document.createElement("canvas");
  const width = source.naturalWidth || source.width || 64;
  const height = source.naturalHeight || source.height || 64;
  canvas.width = width;
  canvas.height = height;
  const drawingContext = canvas.getContext("2d");
  drawingContext.translate(width, 0);
  drawingContext.scale(-1, 1);
  drawingContext.drawImage(source, 0, 0, width, height);
  const mirroredImage = new Image();
  mirroredImage.src = canvas.toDataURL("image/png");
  return mirroredImage;
}

function createImageAsset(src) {
  const image = new Image();
  image.src = src;
  return image;
}

function createVideoAsset(src) {
  const video = document.createElement("video");
  video.src = src;
  video.preload = "auto";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.load();
  return video;
}

function ensureMirroredSprites() {
  if (!playerSpriteContactMirror && playerSpriteContact.complete) {
    playerSpriteContactMirror = createMirroredImage(playerSpriteContact);
  }
  if (!playerSpriteJumpMirror && playerSpriteJump.complete) {
    playerSpriteJumpMirror = createMirroredImage(playerSpriteJump);
  }
}

playerSpriteContact.addEventListener("load", ensureMirroredSprites);
playerSpriteJump.addEventListener("load", ensureMirroredSprites);
ensureMirroredSprites();

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
  bestTime = Number(localStorage.getItem("verticalMoonWalkBestTime")) || 0;
} catch (error) {
  bestHeight = 0;
  bestTime = 0;
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
let currentAmbiance = "";
let animationSoundPool = [];
let jumpSoundPool = [];
let gameOverSoundPool = [];
let fxMediaPrimed = false;
const temporaryEffects = [];

function preloadAmbientSound() {
  const selectedTrack = ambientTracks[soundSettings.ambiance] || ambientTracks.thriller;
  if (!ambientSound || currentAmbiance !== soundSettings.ambiance) {
    if (ambientSound) {
      ambientSound.pause();
      ambientSound.currentTime = 0;
    }
    ambientSound = new Audio(selectedTrack);
    ambientSound.preload = "auto";
    ambientSound.loop = true;
    ambientSound.volume = 0.35;
    ambientSound.load();
    currentAmbiance = soundSettings.ambiance;
    audioStarted = false;
  }
}

function primeFxVideos() {
  if (fxMediaPrimed) return;
  if (performanceMode === "lite") {
    fxMediaPrimed = true;
    return;
  }
  Object.values(bonusFxVideos).forEach((media) => {
    if (!media) return;
    if (typeof media.play === "function") {
      if (media.paused || media.ended) {
        media.play().catch(() => {});
      }
      return;
    }
    if (typeof media.decode === "function") {
      media.decode().catch(() => {});
    }
  });
  fxMediaPrimed = true;
}

function isRenderableMedia(media) {
  if (!media) return false;
  if (typeof media.readyState === "number") return media.readyState >= 2;
  return Boolean(media.complete && media.naturalWidth > 0);
}

function getSpeedEffectMultiplier() {
  return (player.speedTimer > 0 ? 2 : 1) * (player.slowTimer > 0 ? 0.5 : 1);
}

function rectsOverlap(a, b, padding = 0) {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

function getPlatformSprite(platform) {
  if (platform.type === "trapped") return platformSprites.trapped;
  if (platform.type === "moving") return platformSprites.moving;
  return platformSprites.fixed;
}

function getBonusVideo(bonusType) {
  switch (bonusType) {
    case "accelerated":
      return bonusFxVideos.accelerated;
    case "invincible":
      return bonusFxVideos.invincible;
    case "jetpack":
      return bonusFxVideos.jetpack;
    case "slow":
      return bonusFxVideos.slow;
    case "trampoline":
      return bonusFxVideos.trampolineLoop;
    default:
      return null;
  }
}

function spawnTemporaryEffect(type, x, y, width, height, duration = TRAMPOLINE_BOUND_EFFECT_DURATION) {
  temporaryEffects.push({
    type,
    x,
    y,
    width,
    height,
    life: duration,
  });
}

function updateTemporaryEffects(delta) {
  for (let i = temporaryEffects.length - 1; i >= 0; i -= 1) {
    const effect = temporaryEffects[i];
    effect.life -= delta;
    if (effect.life <= 0) {
      temporaryEffects.splice(i, 1);
    }
  }
}

function drawTemporaryEffects() {
  if (performanceMode === "lite") return;
  for (const effect of temporaryEffects) {
    const media = bonusFxVideos[effect.type];
    if (!isRenderableMedia(media)) continue;
    drawRenderableMedia(
      media,
      effect.x,
      effect.y,
      effect.width,
      effect.height,
      effect.life / TRAMPOLINE_BOUND_EFFECT_DURATION
    );
  }
}

function drawRenderableMedia(media, x, y, width, height, alpha = 1) {
  if (!isRenderableMedia(media)) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(media, x, y, width, height);
  ctx.restore();
}

function drawBonusFallback(type, x, y) {
  const color = {
    accelerated: "#ff7bbd",
    jetpack: "#7ef7ff",
    trampoline: "#ffcf5c",
    invincible: "#ffe082",
    slow: "#8eff6f",
  }[type] || "#ff8f3f";

  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlatformSpritePreserveAspect(sprite, x, y, width, height) {
  const sourceWidth = sprite.naturalWidth || sprite.width || width;
  const sourceHeight = sprite.naturalHeight || sprite.height || height;
  const ratio = sourceHeight / Math.max(1, sourceWidth);
  const drawHeight = Math.max(height, width * ratio);
  const drawY = y - (drawHeight - height) * 0.5;
  ctx.drawImage(sprite, x, drawY, width, drawHeight);
}

const ambientTracks = {
  thriller: "./Custom/Sons/AMBIENT-THRILLER.mp3",
  beat_it: "./Custom/Sons/AMBIENT-BEAT_IT.mp3",
  smooth_criminal: "./Custom/Sons/AMBIENT-SMOOTH_CRIMINAL.mp3",
  remember_the_time: "./Custom/Sons/AMBIENT-REMEMBER_THE_TIME.mp3",
  you_rock_my_world: "./Custom/Sons/AMBIENT-YOU_ROCK_MY_WORLD.mp3",
};

const platformSprites = {
  fixed: createImageAsset("./Custom/Visuels/PLATEFORME-FIXE.png"),
  moving: createImageAsset("./Custom/Visuels/PLATEFORME-MOBILE.png"),
  trapped: createImageAsset("./Custom/Visuels/PLATEFORME-PIEGEE.png"),
};

const bonusFxVideos = {
  accelerated: createVideoAsset("./Custom/Visuels/FX-ACCELERATED.webm"),
  invincible: createVideoAsset("./Custom/Visuels/FX-INVINCIBLE.webm"),
  jetpack: createVideoAsset("./Custom/Visuels/FX-JET_PACK.webm"),
  slow: createVideoAsset("./Custom/Visuels/FX-RALENTI.webm"),
  trampolineLoop: createVideoAsset("./Custom/Visuels/FX-TRAMPOLINE-LOOP.webm"),
  trampolineBound: createVideoAsset("./Custom/Visuels/FX-TRAMPOLINE-BOUND.webm"),
};

function setControlState(control, isPressed) {
  if (control === "left") keys.left = isPressed;
  if (control === "right") keys.right = isPressed;
  if (isPressed) {
    if (control === "left") lastDirection = -1;
    if (control === "right") lastDirection = 1;
  }
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
  const margin = window.innerWidth <= 600 ? 80 : 180;
  const maxHeight = Math.min(window.innerHeight - margin, baseHeight);
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
  const effectiveCount = performanceMode === "lite" ? Math.max(4, Math.floor(count * 0.55)) : count;
  for (let i = 0; i < count; i += 1) {
    if (i >= effectiveCount) break;
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

function updatePauseButtonLabel() {
  const label = paused ? "Jouer" : "Pause";
  pauseButton.setAttribute("aria-label", label);
  pauseButton.setAttribute("title", label);
  if (pauseButtonImg) {
    pauseButtonImg.src = paused ? "./Custom/Visuels/Button-Play.png" : "./Custom/Visuels/Button-Pause.png";
    pauseButtonImg.alt = label;
  }
}

function updatePauseQuickAudioVisibility() {
  if (!pauseQuickAudio) return;
  pauseQuickAudio.hidden = !(paused && !gameOver);
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function commitBestTime() {
  if (elapsedTime <= bestTime) return;
  bestTime = elapsedTime;
  try {
    localStorage.setItem("verticalMoonWalkBestTime", String(bestTime));
  } catch (error) {
    // ignore storage errors
  }
}

function setAmbiance(ambiance) {
  soundSettings.ambiance = ambiance;
  preloadAmbientSound();
  updateSoundUI();
  if (soundSettings.music) {
    startAmbientSound();
  }
}

function togglePause() {
  paused = !paused;
  updatePauseButtonLabel();
  updatePauseQuickAudioVisibility();
  if (!paused) {
    startAmbientSound();
    lastTime = performance.now();
  }
}

function stopAllEffectSounds() {
  [...jumpSoundPool, ...gameOverSoundPool, ...animationSoundPool].forEach((sound) => {
    if (sound && sound.currentSrc) {
      sound.pause();
      sound.currentTime = 0;
    }
  });
}

function playFromPool(pool, restartIfBusy = false) {
  if (!pool || pool.length === 0) return false;
  const idleSound = pool.find((sound) => sound && (sound.paused || sound.ended));
  const soundToPlay = idleSound || (restartIfBusy ? pool[0] : null);
  if (!soundToPlay || !soundToPlay.currentSrc) return false;
  if (!(soundToPlay.paused || soundToPlay.ended)) {
    soundToPlay.currentTime = 0;
  }
  soundToPlay.play().catch(() => {});
  return true;
}

function playJumpSound() {
  if (!soundSettings.effects) return;
  if (playFromPool(jumpSoundPool, true)) {
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
  if (!soundSettings.effects) return;
  if (playFromPool(gameOverSoundPool, true)) {
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
  if (!soundSettings.effects) return;
  if (animationSoundPool.length === 0) return;
  const randomOffset = Math.floor(Math.random() * animationSoundPool.length);
  const shuffledPool = animationSoundPool.slice(randomOffset).concat(animationSoundPool.slice(0, randomOffset));
  playFromPool(shuffledPool, false);
}

function startAmbientSound() {
  preloadAmbientSound();
  if (!soundSettings.music) {
    if (ambientSound) {
      ambientSound.pause();
    }
    return;
  }

  if (!ambientSound) return;
  if (audioStarted && !ambientSound.paused && !ambientSound.ended) return;

  try {
    ambientSound.play().then(() => {
      audioStarted = true;
    }).catch(() => {
      window.setTimeout(() => {
        if (ambientSound && (ambientSound.paused || ambientSound.ended)) {
          ambientSound.play().catch(() => {});
        }
      }, 200);
    });
  } catch (error) {
    // Ignore autoplay restrictions.
  }
}

function updateSoundUI() {
  if (effectsToggle) effectsToggle.checked = soundSettings.effects;
  if (musicToggle) musicToggle.checked = soundSettings.music;
  if (ambianceSelect) ambianceSelect.value = soundSettings.ambiance;
  if (pauseAmbianceSelect) pauseAmbianceSelect.value = soundSettings.ambiance;
}

function openSoundSettings() {
  ensureAudio();
  updateSoundUI();
  if (soundSettingsPanel) {
    soundSettingsPanel.hidden = false;
  }
}

function closeSoundSettings() {
  if (soundSettingsPanel) {
    soundSettingsPanel.hidden = true;
  }
}

function ensureAudio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    audioContext = new AudioCtx();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().then(() => {
      startAmbientSound();
    }).catch(() => {});
  }

  if (jumpSound) {
    primeFxVideos();
    startAmbientSound();
    return;
  }

  const createSound = (src) => {
    const audio = new Audio(src);
    audio.preload = "auto";
    audio.load();
    return audio;
  };

  jumpSound = createSound("./Custom/Sons/MJ-Jump.mp3");
  gameOverSound = createSound("./Custom/Sons/MJ-Fall.mp3");
  jumpSoundPool = [jumpSound, createSound("./Custom/Sons/MJ-Jump.mp3"), createSound("./Custom/Sons/MJ-Jump.mp3")];
  gameOverSoundPool = [gameOverSound, createSound("./Custom/Sons/MJ-Fall.mp3")];
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
  jumpSoundPool.forEach((sound) => {
    sound.volume = 0.85;
  });
  gameOverSoundPool.forEach((sound) => {
    sound.volume = 0.9;
  });

  primeFxVideos();

  startAmbientSound();
}

function playIconicCry() {
  playAnimationSound();
}

function applyAudioSettingChange() {
  if (!soundSettings.music) {
    if (ambientSound) ambientSound.pause();
  } else {
    startAmbientSound();
  }
  if (!soundSettings.effects) {
    stopAllEffectSounds();
  }
}

function resetGame(startPaused = false) {
  gameOver = false;
  paused = startPaused;
  updatePauseButtonLabel();
  updatePauseQuickAudioVisibility();
  screenFlash = 0;
  particles.length = 0;
  temporaryEffects.length = 0;
  lastTime = 0;
  cameraY = 0;
  nextPlatformY = canvas.height - 120;
  currentHeight = 0;
  elapsedTime = 0;
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
  preloadAmbientSound();
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
  const bonusPool = ["accelerated", "trampoline", "invincible", "slow", "jetpack"];
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

  const platformBounds = {
    x,
    y,
    width,
    height: 14,
  };

  let retryCount = 0;
  while (retryCount < 12) {
    const overlapsExisting = platforms.some((existing) => {
      if (Math.abs(existing.y - y) > 110) return false;
      return rectsOverlap(
        platformBounds,
        {
          x: existing.x,
          y: existing.y,
          width: existing.width,
          height: existing.height,
        },
        10
      );
    });

    if (!overlapsExisting) break;

    x = Math.max(10, Math.min(canvas.width - width - 10, Math.random() * (canvas.width - width - 20) + 10));
    platformBounds.x = x;
    retryCount += 1;
  }

  const canBeTrapped = index >= SAFE_PLATFORM_COUNT;
  const isTrapped = canBeTrapped && Math.random() < TRAPPED_PLATFORM_CHANCE;
  const isMoving = !isTrapped && Math.random() < 0.3;
  const platform = {
    x,
    baseX: x,
    y,
    width,
    height: 14,
    isMoving,
    type: isTrapped ? "trapped" : isMoving ? "moving" : "fixed",
    amplitude: 28 + Math.random() * 40,
    offset: Math.random() * Math.PI * 2,
    bonusType: null,
    bonusCollected: false,
    enemy: null,
    broken: false,
    breakTimer: 0,
    collidable: true,
  };

  if (index >= SAFE_PLATFORM_COUNT && !isTrapped && Math.random() < 0.2) {
    createEnemyForPlatform(platform);
    platform.enemy = true;
  }

  if (index >= SAFE_PLATFORM_COUNT && !isTrapped && platform.enemy === null && Math.random() < 0.22) {
    platform.bonusType = pickBonusType();
  } else if (index < SAFE_PLATFORM_COUNT) {
    platform.bonusType = null;
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
      player.jetpackTimer = 5;
      player.speedTimer = 0;
      player.slowTimer = 0;
      messageText = "Fusée !";
      break;
    case "trampoline":
      player.trampolineTimer = 0.7;
      messageText = "Trampoline !";
      break;
    case "invincible":
      player.invincibleTimer = 5;
      messageText = "Invincible !";
      break;
    case "slow":
      player.slowTimer = 5;
      player.speedTimer = 0;
      messageText = "Ralentissement";
      break;
    case "accelerated":
      player.speedTimer = 5;
      player.slowTimer = 0;
      messageText = "Accélération !";
      break;
    default:
      break;
  }
  messageTimer = 1.4;
}

function update(delta) {
  if (gameOver) return;

  if (paused) return;

  elapsedTime += delta;

  screenFlash = Math.max(0, screenFlash - delta);
  player.invincibleTimer = Math.max(0, player.invincibleTimer - delta);
  player.slowTimer = Math.max(0, player.slowTimer - delta);
  player.speedTimer = Math.max(0, player.speedTimer - delta);
  player.jetpackTimer = Math.max(0, player.jetpackTimer - delta);
  player.trampolineTimer = Math.max(0, player.trampolineTimer - delta);
  messageTimer = Math.max(0, messageTimer - delta);
  updateTemporaryEffects(delta);

  const moveSpeed = 240 * getSpeedEffectMultiplier();
  const gravity = 1200 + (player.jetpackTimer > 0 ? -140 : 0) + (player.slowTimer > 0 ? 120 : 0);
  const jumpStrength = 560;

  player.vx = 0;
  if (keys.left) player.vx -= moveSpeed;
  if (keys.right) player.vx += moveSpeed;

  player.x += player.vx * delta;
  const playerCenterX = player.x + player.width / 2;
  if (playerCenterX < 0) {
    player.x = canvas.width - player.width / 2;
  } else if (playerCenterX > canvas.width) {
    player.x = -player.width / 2;
  }

  const prevY = player.y;
  player.vy += gravity * delta;
  if (player.jetpackTimer > 0) {
    player.vy -= 340 * delta;
  }
  player.y += player.vy * delta;

  // Update facing direction from velocity when not dragging
  if (!isDragging) {
    if (player.vx < -8) lastDirection = -1;
    else if (player.vx > 8) lastDirection = 1;
  }

  for (const platform of platforms) {
    if (platform.broken) continue;

    const playerBottom = player.y + player.height;
    const prevBottom = prevY + player.height;
    const platformTop = platform.y;
    const platformBottom = platform.y + platform.height;

    if (platform.type === "moving") {
      const oscillation = Math.sin(performance.now() / 450 + platform.offset) * platform.amplitude;
      platform.x = platform.baseX + oscillation;
    }

    if (
      platform.collidable &&
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
          accelerated: "#ff7bbd",
          jetpack: "#7ef7ff",
          trampoline: "#ffcf5c",
          invincible: "#ffe082",
          slow: "#8eff6f",
        }[platform.bonusType] || "#ff8f3f";
        spawnBurst(platform.x + platform.width / 2, platform.y - 10, bonusColor, 12, 180);
        screenFlash = Math.max(screenFlash, 0.08);
        playIconicCry();
        activateBonus(platform.bonusType);
      }

      player.y = platformTop - player.height;
      let bounceMultiplier = 1;
      if (player.jetpackTimer > 0) {
        bounceMultiplier = 1.5;
      } else if (player.trampolineTimer > 0) {
        bounceMultiplier = 1.4;
        player.trampolineTimer = 0;
        spawnTemporaryEffect(
          "trampolineBound",
          player.x + player.width / 2 - 34,
          player.y + player.height - 42,
          68,
          68,
          TRAMPOLINE_BOUND_EFFECT_DURATION
        );
      }
      playJumpSound();
      spawnBurst(player.x + player.width / 2, player.y + player.height, "#ffe082", 8, 120);
      player.vy = -jumpStrength * bounceMultiplier;

      if (platform.type === "trapped") {
        platform.broken = true;
        platform.breakTimer = 0.22;
        platform.collidable = false;
      }
      break;
    }
  }

  for (let i = platforms.length - 1; i >= 0; i -= 1) {
    const platform = platforms[i];
    if (platform.breakTimer > 0) {
      platform.breakTimer -= delta;
      if (platform.breakTimer <= 0) {
        platforms.splice(i, 1);
      }
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
      const fromBottom = prevY >= enemyBottom - 4 && player.vy < 0;
      if (fromTop && player.vy >= 0) {
        enemy.dead = true;
        spawnBurst(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#fff5a8", 16, 170);
        screenFlash = Math.max(screenFlash, 0.12);
        playAnimationSound();
        playJumpSound();
        player.vy = -jumpStrength * 0.85;
      } else if (fromBottom) {
        // Ignore collisions from below to avoid unfair instant deaths.
      } else if (player.invincibleTimer <= 0) {
        gameOver = true;
        updatePauseQuickAudioVisibility();
        commitBestTime();
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
    updatePauseQuickAudioVisibility();
    commitBestTime();
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

  if (performanceMode === "full" && backgroundVideo && backgroundVideo.readyState >= 2) {
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
  const dotCount = performanceMode === "lite" ? 10 : 22;
  for (let i = 0; i < dotCount; i += 1) {
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
    ctx.globalAlpha = platform.broken ? Math.max(0, platform.breakTimer / 0.22) : 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const sprite = getPlatformSprite(platform);
    if (sprite && sprite.complete) {
      drawPlatformSpritePreserveAspect(sprite, platform.x, screenY, platform.width, platform.height);
    } else {
      ctx.shadowBlur = performanceMode === "lite" ? 0 : 20;
      ctx.shadowColor = platform.type === "moving" ? "#ffcf5c" : platform.type === "trapped" ? "#ff6f91" : "#6cf8ff";
      ctx.fillStyle = platform.type === "moving" ? "#ffcf5c" : platform.type === "trapped" ? "#ff6f91" : "#69e0ff";
      ctx.fillRect(platform.x, screenY, platform.width, platform.height);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillRect(platform.x, screenY, platform.width, 4);
    }
    ctx.restore();

    if (platform.bonusType && !platform.bonusCollected) {
      ctx.save();
      if (performanceMode === "lite") {
        drawBonusFallback(platform.bonusType, platform.x + platform.width / 2, screenY - 22);
      } else {
        const bonusMedia = getBonusVideo(platform.bonusType);
        if (isRenderableMedia(bonusMedia)) {
          drawRenderableMedia(bonusMedia, platform.x + platform.width / 2 - 20, screenY - 42, 40, 40);
        }
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
      ctx.shadowBlur = performanceMode === "lite" ? 8 : 16;
      ctx.shadowColor = "#74ff7e";
      ctx.drawImage(sprite, enemy.x - 4, screenY - 4, enemy.width + 8, enemy.height + 8);
      ctx.restore();
      continue;
    }

    const paletteByVariant = {
      dancing: { body: "#3d8f3d", accent: "#8eff6f" },
      climbing: { body: "#5b8f4a", accent: "#d4ff88" },
      "dancing-elite": { body: "#4f7c3d", accent: "#9ee8b2" },
      "climbing-elite": { body: "#60a24d", accent: "#d0ff74" },
      "dancing-fast": { body: "#3c7c42", accent: "#a3ffa0" },
    };
    const palette = paletteByVariant[enemy.variant] || { body: "#3d8f3d", accent: "#8eff6f" };

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
  const sprite = player.vy < 0
    ? (lastDirection < 0 ? playerSpriteJumpMirror || playerSpriteJump : playerSpriteJump)
    : (lastDirection < 0 ? playerSpriteContactMirror || playerSpriteContact : playerSpriteContact);
  if (sprite && sprite.complete) {
    ctx.save();
    ctx.shadowBlur = performanceMode === "lite" ? 10 : 24;
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

function drawVideoEffects() {
  drawTemporaryEffects();
}

function drawScore() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`${currentHeight}`, canvas.width / 2, 34);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(`${bestHeight}`, canvas.width / 2, 56);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(`${formatDuration(elapsedTime)}`, canvas.width - 16, 34);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(`${formatDuration(bestTime)}`, canvas.width - 16, 56);

  if (messageTimer > 0 && messageText) {
    ctx.textAlign = "center";
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
  ctx.fillText("Pause", canvas.width / 2, canvas.height / 2 - 72);
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
  drawVideoEffects();
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
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") lastDirection = -1;
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") lastDirection = 1;
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
window.addEventListener("touchstart", ensureAudio, { once: true, passive: true });
window.addEventListener("keydown", ensureAudio, { once: true });
restartButton.addEventListener("click", () => {
  ensureAudio();
  resetGame();
});
pauseButton.addEventListener("click", () => {
  ensureAudio();
  if (gameOver) {
    resetGame();
    return;
  }
  togglePause();
});
soundButton?.addEventListener("click", (event) => {
  event.preventDefault();
  openSoundSettings();
});
closeSoundSettingsButton?.addEventListener("click", closeSoundSettings);
soundSettingsPanel?.addEventListener("click", (event) => {
  if (event.target === soundSettingsPanel) {
    closeSoundSettings();
  }
});
effectsToggle?.addEventListener("change", (event) => {
  soundSettings.effects = event.target.checked;
  applyAudioSettingChange();
});
musicToggle?.addEventListener("change", (event) => {
  soundSettings.music = event.target.checked;
  applyAudioSettingChange();
});
ambianceSelect?.addEventListener("change", (event) => {
  setAmbiance(event.target.value);
});
pauseAmbianceSelect?.addEventListener("change", (event) => {
  setAmbiance(event.target.value);
});

// Swipe / drag to move on the bottom 50% of the canvas
if (swipeArea) {
  swipeArea.addEventListener(
    "pointerdown",
    (e) => {
      ensureAudio();
      const rect = canvas.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      if (relativeY < rect.height * 0.5) return; // only start when touching bottom 50%
      isDragging = true;
      dragStartX = e.clientX;
      playerStartX = player.x;
      try {
        swipeArea.setPointerCapture(e.pointerId);
      } catch (err) {}
    },
    { passive: false }
  );

  swipeArea.addEventListener("pointermove", (e) => {
    if (!isDragging) return;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const dx = (e.clientX - dragStartX) * scale;
    player.x = playerStartX + dx * getSpeedEffectMultiplier();
    if (dx < -8) lastDirection = -1;
    else if (dx > 8) lastDirection = 1;
  });

  const endDrag = (e) => {
    if (!isDragging) return;
    isDragging = false;
    try {
      swipeArea.releasePointerCapture && swipeArea.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };

  swipeArea.addEventListener("pointerup", endDrag);
  swipeArea.addEventListener("pointercancel", endDrag);
}

resizeCanvas();
if (performanceMode === "full") {
  backgroundVideo?.play().catch(() => {});
} else if (backgroundVideo) {
  backgroundVideo.pause();
}
resetGame(true);
updateSoundUI();
requestAnimationFrame(loop);
window.addEventListener("resize", resizeCanvas);
