let isPaused = false;
let audioContext = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupIpcListeners();
  await loadState();
});

function setupEventListeners() {
  document.getElementById('pause-btn').addEventListener('click', togglePause);
  document.getElementById('skip-btn').addEventListener('click', skipPhase);
  document.getElementById('minimize-btn').addEventListener('click', minimize);
}

function setupIpcListeners() {
  window.api.onTimerUpdate((data) => {
    updateDisplay(data);
  });

  window.api.onStateUpdate((state) => {
    updateState(state);
  });

  window.api.onPlaySound((data) => {
    playSound(data.type, data.volume);
  });
}

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playSound(type, volume) {
  try {
    ensureAudioContext();
    const vol = Math.max(0, Math.min(100, volume || 70)) / 100;

    if (type === 'workEnd') {
      playToneSequence([
        { freq: 523.25, duration: 0.15, delay: 0 },
        { freq: 659.25, duration: 0.15, delay: 0.15 },
        { freq: 783.99, duration: 0.3, delay: 0.3 }
      ], vol);
    } else if (type === 'breakEnd') {
      playToneSequence([
        { freq: 783.99, duration: 0.12, delay: 0 },
        { freq: 659.25, duration: 0.12, delay: 0.12 },
        { freq: 523.25, duration: 0.2, delay: 0.24 }
      ], vol);
    } else if (type === 'goal') {
      playToneSequence([
        { freq: 523.25, duration: 0.1, delay: 0 },
        { freq: 659.25, duration: 0.1, delay: 0.1 },
        { freq: 783.99, duration: 0.1, delay: 0.2 },
        { freq: 1046.50, duration: 0.3, delay: 0.3 }
      ], vol);
    }
  } catch (e) {
    console.warn('Sound playback failed:', e);
  }
}

function playToneSequence(notes, volume) {
  notes.forEach(note => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.type = 'sine';
    osc.frequency.value = note.freq;
    const startTime = audioContext.currentTime + note.delay;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, startTime + note.duration);
    osc.start(startTime);
    osc.stop(startTime + note.duration + 0.05);
  });
}

async function loadState() {
  const state = await window.api.getTimerState();
  updateState(state);
  updateDisplay(state);
}

function updateState(state) {
  isPaused = state.isPaused;

  const pauseBtn = document.getElementById('pause-btn');
  pauseBtn.textContent = state.isPaused ? '继续' : '暂停';

  const phaseDisplay = document.getElementById('phase-display');
  const tagDisplay = document.getElementById('tag-display');

  const phaseMap = {
    'work': '专注中',
    'break': '休息中',
    'longBreak': '长休息中'
  };
  phaseDisplay.textContent = phaseMap[state.phase] || '专注中';

  if (state.currentTagName) {
    tagDisplay.textContent = `# ${state.currentTagName}`;
    tagDisplay.style.display = 'block';
  } else {
    tagDisplay.style.display = 'none';
  }

  const color = getPhaseColor(state.phase);
  document.getElementById('progress-ring-fill-lg').style.stroke = color;
}

function getPhaseColor(phase) {
  const colors = {
    'work': '#667eea',
    'break': '#4CAF50',
    'longBreak': '#FF9800'
  };
  return colors[phase] || '#667eea';
}

function updateDisplay(data) {
  const timerDisplay = document.getElementById('timer-display');
  const progressFill = document.getElementById('progress-ring-fill-lg');

  const minutes = Math.floor(data.remainingSeconds / 60);
  const seconds = data.remainingSeconds % 60;
  timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progress = data.totalSeconds > 0 ? (data.totalSeconds - data.remainingSeconds) / data.totalSeconds : 0;
  const circumference = 2 * Math.PI * 180;
  const offset = circumference * progress;
  progressFill.style.strokeDashoffset = offset;
}

async function togglePause() {
  ensureAudioContext();
  if (isPaused) {
    await window.api.resumeTimer();
  } else {
    await window.api.pauseTimer();
  }
}

async function skipPhase() {
  await window.api.skipPhase();
}

async function minimize() {
  await window.api.closeFullscreen();
  await window.api.showMainWindow();
}
