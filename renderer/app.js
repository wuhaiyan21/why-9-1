let tags = [];
let selectedTagId = null;
let currentHistoryTagId = null;
let timerState = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadTags();
  await loadSettings();
  await loadTimerState();
  setupEventListeners();
  setupIpcListeners();
});

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
      loadHistory();
    }
  });

  window.api.onSessionsUpdated(() => {
    updateStats();
    loadHistory();
  });
}

async function loadTags() {
  tags = await window.api.getTags();
  populateTagSelects();
  if (tags.length > 0) {
    selectedTagId = tags[0].id;
    currentHistoryTagId = tags[0].id;
    updateStats();
    loadHistory();
  }
}

function populateTagSelects() {
  const tagSelect = document.getElementById('tag-select');
  const historyTagSelect = document.getElementById('history-tag-select');

  tagSelect.innerHTML = '';
  historyTagSelect.innerHTML = '';

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
  });

  if (selectedTagId) {
    tagSelect.value = selectedTagId;
  }
  if (currentHistoryTagId) {
    historyTagSelect.value = currentHistoryTagId;
  }
}

async function loadSettings() {
  const settings = await window.api.getSettings();
  document.getElementById('work-duration').value = settings.work_duration || 25;
  document.getElementById('short-break').value = settings.short_break_duration || 5;
  document.getElementById('long-break').value = settings.long_break_duration || 15;
}

async function saveSettings() {
  const workDuration = parseInt(document.getElementById('work-duration').value);
  const shortBreak = parseInt(document.getElementById('short-break').value);
  const longBreak = parseInt(document.getElementById('long-break').value);

  await window.api.saveSettings({
    workDuration,
    shortBreakDuration: shortBreak,
    longBreakDuration: longBreak
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
  }

  const phaseMap = {
    'work': '工作中',
    'break': '休息中',
    'longBreak': '长休息中'
  };
  phaseText.textContent = (state.isRunning || state.isPaused) ? (phaseMap[state.phase] || '准备开始') : '准备开始';
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
  const selectedTag = tags.find(t => t.id === selectedTagId);
  await window.api.startTimer(selectedTagId, selectedTag ? selectedTag.name : '');
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

  const stats = await window.api.getTagStats(selectedTagId);
  document.getElementById('stat-today-minutes').textContent = stats.today_minutes || 0;
  document.getElementById('stat-total-minutes').textContent = stats.total_minutes || 0;
}

async function loadHistory() {
  if (!currentHistoryTagId) return;

  const sessions = await window.api.getTodaySessions(currentHistoryTagId);
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
  await Promise.all([updateStats(), loadHistory()]);
}

window.toggleValid = toggleValid;

function showTagModal() {
  document.getElementById('tag-modal').style.display = 'flex';
  document.getElementById('new-tag-name').value = '';
  document.getElementById('new-tag-color').value = '#4CAF50';
  document.getElementById('new-tag-name').focus();
}

function hideTagModal() {
  document.getElementById('tag-modal').style.display = 'none';
}

async function addTag() {
  const name = document.getElementById('new-tag-name').value.trim();
  const color = document.getElementById('new-tag-color').value;

  if (!name) {
    alert('请输入标签名称');
    return;
  }

  try {
    await window.api.addTag(name, color);
    await loadTags();
    hideTagModal();
  } catch (err) {
    alert('创建标签失败，可能名称已存在');
  }
}
