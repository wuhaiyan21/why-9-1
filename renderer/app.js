let tags = [];
let selectedTagId = null;
let currentHistoryTagId = null;
let weeklyTagId = null;
let timerState = null;
let historyDateOffset = 0;
let audioContext = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadTags();
  await loadSettings();
  await loadTimerState();
  setupEventListeners();
  setupIpcListeners();
  initDateNavigation();
});

function initDateNavigation() {
  updateDateDisplay();
}

function setupEventListeners() {
  document.getElementById('start-btn').addEventListener('click', startTimer);
  document.getElementById('pause-btn').addEventListener('click', pauseTimer);
  document.getElementById('skip-btn').addEventListener('click', skipPhase);
  document.getElementById('add-tag-btn').addEventListener('click', showTagModal);
  document.getElementById('cancel-tag-btn').addEventListener('click', hideTagModal);
  document.getElementById('confirm-tag-btn').addEventListener('click', addTag);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('tag-select').addEventListener('change', (e) => {
    selectedTagId = parseInt(e.target.value);
    updateStats();
  });
  document.getElementById('history-tag-select').addEventListener('change', (e) => {
    currentHistoryTagId = parseInt(e.target.value);
    loadHistory();
  });
  document.getElementById('weekly-tag-select').addEventListener('change', (e) => {
    weeklyTagId = parseInt(e.target.value);
    loadWeeklyStats();
  });
  document.getElementById('edit-goal-btn').addEventListener('click', showGoalModal);
  document.getElementById('cancel-goal-btn').addEventListener('click', hideGoalModal);
  document.getElementById('confirm-goal-btn').addEventListener('click', saveGoal);
  document.getElementById('prev-date-btn').addEventListener('click', () => {
    if (historyDateOffset < 6) {
      historyDateOffset++;
      updateDateDisplay();
      loadHistory();
    }
  });
  document.getElementById('next-date-btn').addEventListener('click', () => {
    if (historyDateOffset > 0) {
      historyDateOffset--;
      updateDateDisplay();
      loadHistory();
    }
  });
  document.getElementById('sound-volume').addEventListener('input', (e) => {
    document.getElementById('sound-volume-value').textContent = e.target.value + '%';
  });
}

function setupIpcListeners() {
  window.api.onTimerUpdate((data) => {
    updateTimerDisplay(data);
  });

  window.api.onStateUpdate((state) => {
    timerState = state;
    updateUIState(state);
    updateTimerDisplay(state);
    if (state.isRunning || state.isPaused) {
      updateStats();
    }
  });

  window.api.onSessionsUpdated(() => {
    updateStats();
    loadHistory();
    loadWeeklyStats();
  });

  window.api.onPlaySound((data) => {
    playSound(data.type, data.volume);
  });
}

function getHistoryDate() {
  const d = new Date();
  d.setDate(d.getDate() - historyDateOffset);
  return d.toISOString().split('T')[0];
}

function getHistoryDateDisplay() {
  const d = new Date();
  d.setDate(d.getDate() - historyDateOffset);
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const dateStr = d.toISOString().split('T')[0];
  if (dateStr === todayStr) return '今天';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === yesterday.toISOString().split('T')[0]) return '昨天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function updateDateDisplay() {
  document.getElementById('history-date').textContent = getHistoryDateDisplay();
  document.getElementById('history-title').textContent = historyDateOffset === 0 ? '今日记录' : '历史记录';
  document.getElementById('prev-date-btn').disabled = historyDateOffset >= 6;
  document.getElementById('next-date-btn').disabled = historyDateOffset <= 0;
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
    } else {
      playToneSequence([
        { freq: 783.99, duration: 0.12, delay: 0 },
        { freq: 659.25, duration: 0.12, delay: 0.12 },
        { freq: 523.25, duration: 0.2, delay: 0.24 }
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

async function loadTags() {
  tags = await window.api.getTags();
  populateTagSelects();
  if (tags.length > 0) {
    selectedTagId = tags[0].id;
    currentHistoryTagId = tags[0].id;
    weeklyTagId = tags[0].id;
    updateStats();
    loadHistory();
    loadWeeklyStats();
  }
}

function populateTagSelects() {
  const tagSelect = document.getElementById('tag-select');
  const historyTagSelect = document.getElementById('history-tag-select');
  const weeklyTagSelect = document.getElementById('weekly-tag-select');

  tagSelect.innerHTML = '';
  historyTagSelect.innerHTML = '';
  weeklyTagSelect.innerHTML = '';

  tags.forEach(tag => {
    const option1 = document.createElement('option');
    option1.value = tag.id;
    option1.textContent = tag.name;
    option1.style.color = tag.color;
    tagSelect.appendChild(option1);

    const option2 = document.createElement('option');
    option2.value = tag.id;
    option2.textContent = tag.name;
    option2.style.color = tag.color;
    historyTagSelect.appendChild(option2);

    const option3 = document.createElement('option');
    option3.value = tag.id;
    option3.textContent = tag.name;
    option3.style.color = tag.color;
    weeklyTagSelect.appendChild(option3);
  });

  if (selectedTagId) {
    tagSelect.value = selectedTagId;
  }
  if (currentHistoryTagId) {
    historyTagSelect.value = currentHistoryTagId;
  }
  if (weeklyTagId) {
    weeklyTagSelect.value = weeklyTagId;
  }
}

async function loadSettings() {
  const settings = await window.api.getSettings();
  document.getElementById('work-duration').value = settings.work_duration || 25;
  document.getElementById('short-break').value = settings.short_break_duration || 5;
  document.getElementById('long-break').value = settings.long_break_duration || 15;
  document.getElementById('sound-enabled').checked = settings.sound_enabled !== 0;
  const vol = settings.sound_volume !== undefined ? settings.sound_volume : 70;
  document.getElementById('sound-volume').value = vol;
  document.getElementById('sound-volume-value').textContent = vol + '%';
}

async function saveSettings() {
  const workDuration = parseInt(document.getElementById('work-duration').value);
  const shortBreak = parseInt(document.getElementById('short-break').value);
  const longBreak = parseInt(document.getElementById('long-break').value);
  const soundEnabled = document.getElementById('sound-enabled').checked;
  const soundVolume = parseInt(document.getElementById('sound-volume').value);

  await window.api.saveSettings({
    workDuration,
    shortBreakDuration: shortBreak,
    longBreakDuration: longBreak,
    soundEnabled,
    soundVolume
  });

  const btn = document.getElementById('save-settings-btn');
  const originalText = btn.textContent;
  btn.textContent = '已保存 ✓';
  setTimeout(() => {
    btn.textContent = originalText;
  }, 1500);
}

async function loadTimerState() {
  timerState = await window.api.getTimerState();
  updateUIState(timerState);
  updateTimerDisplay(timerState);
}

function updateUIState(state) {
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const skipBtn = document.getElementById('skip-btn');
  const phaseText = document.getElementById('phase-text');
  const cycleCount = document.getElementById('cycle-count');

  if (state.isRunning && !state.isPaused) {
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    pauseBtn.textContent = '暂停';
    skipBtn.style.display = 'inline-block';
  } else if (state.isPaused) {
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'inline-block';
    pauseBtn.textContent = '继续';
    skipBtn.style.display = 'inline-block';
  } else {
    startBtn.style.display = 'inline-block';
    pauseBtn.style.display = 'none';
    skipBtn.style.display = 'none';

    if (state.phase === 'work') {
      startBtn.textContent = '开始专注';
    } else if (state.phase === 'longBreak') {
      startBtn.textContent = '开始长休息';
    } else {
      startBtn.textContent = '开始休息';
    }
  }

  const runningPhaseMap = {
    'work': '工作中',
    'break': '休息中',
    'longBreak': '长休息中'
  };
  const waitingPhaseMap = {
    'work': '准备开始工作',
    'break': '等待进入休息',
    'longBreak': '等待进入长休息'
  };

  if (state.isRunning || state.isPaused) {
    phaseText.textContent = runningPhaseMap[state.phase] || '准备开始';
  } else {
    phaseText.textContent = waitingPhaseMap[state.phase] || '准备开始';
  }

  cycleCount.textContent = `第 ${state.completedWorkSessions}/4 个番茄`;
}

function updateTimerDisplay(data) {
  const timerText = document.getElementById('timer-text');
  const progressFill = document.getElementById('progress-ring-fill');

  const minutes = Math.floor(data.remainingSeconds / 60);
  const seconds = data.remainingSeconds % 60;
  timerText.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const progress = data.totalSeconds > 0 ? (data.totalSeconds - data.remainingSeconds) / data.totalSeconds : 0;
  const circumference = 2 * Math.PI * 90;
  const offset = circumference * progress;
  progressFill.style.strokeDashoffset = offset;

  const color = getPhaseColor(data.phase);
  progressFill.style.stroke = color;
}

function getPhaseColor(phase) {
  const colors = {
    'work': '#667eea',
    'break': '#4CAF50',
    'longBreak': '#FF9800'
  };
  return colors[phase] || '#667eea';
}

async function startTimer() {
  ensureAudioContext();
  if (timerState && !timerState.isRunning && !timerState.isPaused &&
      (timerState.phase === 'break' || timerState.phase === 'longBreak')) {
    await window.api.startNextPhase();
  } else {
    const selectedTag = tags.find(t => t.id === selectedTagId);
    await window.api.startTimer(selectedTagId, selectedTag ? selectedTag.name : '');
  }
}

async function pauseTimer() {
  if (timerState && timerState.isPaused) {
    await window.api.resumeTimer();
  } else {
    await window.api.pauseTimer();
  }
}

async function skipPhase() {
  await window.api.skipPhase();
}

async function updateStats() {
  if (!selectedTagId) return;

  const tag = tags.find(t => t.id === selectedTagId);
  const stats = await window.api.getTagStats(selectedTagId);
  const todayMinutes = stats.today_minutes || 0;
  const goalMinutes = tag ? (tag.daily_goal_minutes || 120) : 120;
  const remaining = Math.max(0, goalMinutes - todayMinutes);
  const progress = goalMinutes > 0 ? Math.min(100, (todayMinutes / goalMinutes) * 100) : 0;

  document.getElementById('goal-minutes').textContent = `${todayMinutes} / ${goalMinutes} 分钟`;
  document.getElementById('goal-remaining').textContent = remaining > 0 ? `剩余 ${remaining} 分钟` : '已达成目标 🎉';
  document.getElementById('daily-progress-fill').style.width = progress + '%';
  document.getElementById('stat-today-minutes').textContent = todayMinutes;
  document.getElementById('stat-total-minutes').textContent = stats.total_minutes || 0;
}

async function loadWeeklyStats() {
  if (!weeklyTagId) return;
  const days = await window.api.getWeeklyStats(weeklyTagId);
  const chart = document.getElementById('weekly-chart');
  chart.innerHTML = '';
  const maxMinutes = Math.max(1, ...days.map(d => d.minutes));
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];

  days.forEach(day => {
    const d = new Date(day.date);
    const dayLabel = weekdayLabels[d.getDay()];
    const heightPct = (day.minutes / maxMinutes) * 100;

    const wrapper = document.createElement('div');
    wrapper.className = 'weekly-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'weekly-bar';
    bar.style.height = heightPct + '%';

    if (day.minutes > 0) {
      const val = document.createElement('div');
      val.className = 'weekly-bar-value';
      val.textContent = day.minutes;
      bar.appendChild(val);
    }

    const label = document.createElement('div');
    label.className = 'weekly-bar-label';
    label.textContent = dayLabel;

    wrapper.appendChild(bar);
    wrapper.appendChild(label);
    chart.appendChild(wrapper);
  });
}

async function loadHistory() {
  if (!currentHistoryTagId) return;

  let sessions;
  if (historyDateOffset === 0) {
    sessions = await window.api.getTodaySessions(currentHistoryTagId);
  } else {
    sessions = await window.api.getSessionsByDate(currentHistoryTagId, getHistoryDate());
  }

  const historyList = document.getElementById('history-list');

  if (sessions.length === 0) {
    historyList.innerHTML = '<p class="empty-text">暂无记录</p>';
    return;
  }

  historyList.innerHTML = '';
  sessions.forEach(session => {
    const item = document.createElement('div');
    item.className = 'history-item';
    if (!session.is_valid) {
      item.classList.add('history-invalid');
    }

    const time = new Date(session.started_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const phaseText = session.phase === 'work' ? '工作' : (session.phase === 'longBreak' ? '长休息' : '休息');

    item.innerHTML = `
      <div class="history-info">
        <span class="history-duration">${phaseText} - ${session.duration_minutes} 分钟</span>
        <span class="history-time">${time}</span>
      </div>
      <div class="history-actions">
        <button class="btn-mini" onclick="toggleValid(${session.id}, ${session.is_valid})">
          ${session.is_valid ? '标记无效' : '恢复有效'}
        </button>
      </div>
    `;
    historyList.appendChild(item);
  });
}

async function toggleValid(sessionId, currentValid) {
  await window.api.toggleSessionValid(sessionId, !currentValid);
  await Promise.all([updateStats(), loadHistory(), loadWeeklyStats()]);
}

window.toggleValid = toggleValid;

function showTagModal() {
  document.getElementById('tag-modal-title').textContent = '新建标签';
  document.getElementById('tag-modal').style.display = 'flex';
  document.getElementById('new-tag-name').value = '';
  document.getElementById('new-tag-color').value = '#4CAF50';
  document.getElementById('new-tag-goal').value = 120;
  document.getElementById('new-tag-name').focus();
}

function hideTagModal() {
  document.getElementById('tag-modal').style.display = 'none';
}

async function addTag() {
  const name = document.getElementById('new-tag-name').value.trim();
  const color = document.getElementById('new-tag-color').value;
  const goal = parseInt(document.getElementById('new-tag-goal').value);

  if (!name) {
    alert('请输入标签名称');
    return;
  }

  try {
    await window.api.addTag(name, color, goal);
    await loadTags();
    hideTagModal();
  } catch (err) {
    alert('创建标签失败，可能名称已存在');
  }
}

function showGoalModal() {
  if (!selectedTagId) {
    alert('请先选择标签');
    return;
  }
  const tag = tags.find(t => t.id === selectedTagId);
  document.getElementById('edit-goal-input').value = tag ? (tag.daily_goal_minutes || 120) : 120;
  document.getElementById('goal-modal').style.display = 'flex';
}

function hideGoalModal() {
  document.getElementById('goal-modal').style.display = 'none';
}

async function saveGoal() {
  if (!selectedTagId) return;
  const goal = parseInt(document.getElementById('edit-goal-input').value);
  if (!goal || goal < 1) {
    alert('请输入有效的目标分钟数');
    return;
  }
  await window.api.updateTagDailyGoal(selectedTagId, goal);
  await loadTags();
  hideGoalModal();
}
