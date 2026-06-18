const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const db = require('./db');

let mainWindow = null;
let fullscreenWindow = null;
let tray = null;

let timerState = {
  isRunning: false,
  isPaused: false,
  phase: 'work',
  currentTagId: null,
  currentTagName: '',
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  soundEnabled: true,
  soundVolume: 70,
  completedWorkSessions: 0,
  remainingSeconds: 25 * 60,
  totalSeconds: 25 * 60,
  intervalId: null,
  autoStartNextPhase: false,
  skipped: false
};

function getDataDir() {
  const dataPath = process.env.POMODORO_DATA_DIR || path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
}

function getIconPath(filename) {
  const iconPath = path.join(__dirname, 'assets', filename);
  if (fs.existsSync(iconPath)) {
    return iconPath;
  }
  return undefined;
}

function createMainWindow() {
  const iconPath = getIconPath('icon.png');
  mainWindow = new BrowserWindow({
    width: 500,
    height: 600,
    title: '番茄钟习惯追踪',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('close', (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createFullscreenWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  fullscreenWindow = new BrowserWindow({
    width: width,
    height: height,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  fullscreenWindow.loadFile(path.join(__dirname, 'renderer', 'fullscreen.html'));

  fullscreenWindow.once('ready-to-show', () => {
    fullscreenWindow.show();
  });

  fullscreenWindow.on('closed', () => {
    fullscreenWindow = null;
  });
}

function getTrayIcon() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  if (fs.existsSync(iconPath)) {
    return nativeImage.createFromPath(iconPath);
  }
  const size = 16;
  const emptyIcon = nativeImage.createEmpty();
  return emptyIcon;
}

function createTray() {
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('番茄钟');
    updateTrayMenu();
  } catch (err) {
    console.warn('Failed to create tray:', err.message);
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateTrayMenu() {
  if (!tray) return;

  const statusText = timerState.isPaused ? '已暂停' : (timerState.isRunning ? (timerState.phase === 'work' ? '工作中' : (timerState.phase === 'longBreak' ? '长休息' : '休息中')) : '未开始');
  const timeText = timerState.isRunning || timerState.isPaused ? ` - ${formatTime(timerState.remainingSeconds)}` : '';

  tray.setToolTip(`番茄钟 - ${statusText}${timeText}`);

  const contextMenu = Menu.buildFromTemplate([
    { label: `状态: ${statusText}`, enabled: false },
    timerState.isRunning ? { label: '暂停', click: () => pauseTimer() } : { label: '开始', click: () => startTimer() },
    { label: '跳过当前阶段', click: () => skipPhase(), enabled: timerState.isRunning || timerState.isPaused },
    { type: 'separator' },
    { label: '显示主窗口', click: () => { if (mainWindow) mainWindow.show(); else createMainWindow(); } },
    { label: '退出', click: () => {
      app.isQuiting = true;
      if (fullscreenWindow) fullscreenWindow.close();
      if (mainWindow) mainWindow.close();
      app.quit();
    }}
  ]);

  tray.setContextMenu(contextMenu);
}

function startTimer(autoStart) {
  if (timerState.isRunning && !timerState.isPaused) return;

  if (!timerState.isPaused) {
    if (timerState.phase === 'work') {
      timerState.remainingSeconds = timerState.workDuration * 60;
    } else if (timerState.phase === 'longBreak') {
      timerState.remainingSeconds = timerState.longBreakDuration * 60;
    } else {
      timerState.remainingSeconds = timerState.shortBreakDuration * 60;
    }
    timerState.totalSeconds = timerState.remainingSeconds;
    timerState.skipped = false;
  }

  timerState.isRunning = true;
  timerState.isPaused = false;
  timerState.autoStartNextPhase = true;

  if (!fullscreenWindow) {
    createFullscreenWindow();
  } else {
    fullscreenWindow.show();
    fullscreenWindow.focus();
  }

  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
  }

  timerState.intervalId = setInterval(() => {
    timerState.remainingSeconds--;
    updateAllTimers();
    updateTrayMenu();

    if (timerState.remainingSeconds <= 0) {
      phaseComplete(false);
    }
  }, 1000);

  updateTrayMenu();
  sendStateToAllWindows();
}

function pauseTimer() {
  if (!timerState.isRunning || timerState.isPaused) return;

  timerState.isPaused = true;
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }

  updateTrayMenu();
  sendStateToAllWindows();
}

function resumeTimer() {
  if (!timerState.isPaused) return;

  timerState.isPaused = false;
  timerState.autoStartNextPhase = true;
  timerState.intervalId = setInterval(() => {
    timerState.remainingSeconds--;
    updateAllTimers();
    updateTrayMenu();

    if (timerState.remainingSeconds <= 0) {
      phaseComplete(false);
    }
  }, 1000);

  updateTrayMenu();
  sendStateToAllWindows();
}

function skipPhase() {
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
  timerState.skipped = true;
  phaseComplete(true);
}

function phaseComplete(isSkipped) {
  const previousPhase = timerState.phase;

  if (previousPhase === 'work' && timerState.currentTagId && !isSkipped) {
    const duration = Math.round((timerState.totalSeconds - timerState.remainingSeconds) / 60);
    const actualDuration = Math.min(duration, timerState.workDuration);
    if (actualDuration > 0) {
      db.addSession(timerState.currentTagId, actualDuration, previousPhase);
    }
  }

  showNotification(previousPhase);

  if (previousPhase === 'work') {
    timerState.completedWorkSessions++;
    if (timerState.completedWorkSessions >= 4) {
      timerState.completedWorkSessions = 0;
      timerState.phase = 'longBreak';
      timerState.remainingSeconds = timerState.longBreakDuration * 60;
    } else {
      timerState.phase = 'break';
      timerState.remainingSeconds = timerState.shortBreakDuration * 60;
    }
  } else {
    timerState.phase = 'work';
    timerState.remainingSeconds = timerState.workDuration * 60;
  }

  timerState.totalSeconds = timerState.remainingSeconds;
  timerState.skipped = false;
  timerState.isPaused = false;

  if (timerState.autoStartNextPhase && !isSkipped) {
    timerState.isRunning = true;

    if (!fullscreenWindow) {
      createFullscreenWindow();
    } else {
      fullscreenWindow.show();
      fullscreenWindow.focus();
    }

    if (timerState.intervalId) {
      clearInterval(timerState.intervalId);
    }

    timerState.intervalId = setInterval(() => {
      timerState.remainingSeconds--;
      updateAllTimers();
      updateTrayMenu();

      if (timerState.remainingSeconds <= 0) {
        phaseComplete(false);
      }
    }, 1000);
  } else {
    timerState.isRunning = false;
    timerState.autoStartNextPhase = false;
    if (fullscreenWindow) {
      fullscreenWindow.hide();
    }
  }

  updateTrayMenu();
  sendStateToAllWindows();
  if (mainWindow) mainWindow.webContents.send('sessions-updated');
}

function playPhaseEndSound(previousPhase) {
  if (!timerState.soundEnabled) return;
  const soundType = previousPhase === 'work' ? 'workEnd' : 'breakEnd';
  const payload = { type: soundType, volume: timerState.soundVolume };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('play-sound', payload);
  }
  if (fullscreenWindow && !fullscreenWindow.isDestroyed()) {
    fullscreenWindow.webContents.send('play-sound', payload);
  }
}

function showNotification(previousPhase) {
  const title = previousPhase === 'work' ? '工作结束！' : '休息结束！';
  const body = previousPhase === 'work' ? '休息一下吧~' : '准备开始工作啦~';

  playPhaseEndSound(previousPhase);

  if (Notification.isSupported()) {
    new Notification({
      title: title,
      body: body,
      silent: false
    }).show();
  }
}

function updateAllTimers() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('timer-update', {
      isRunning: timerState.isRunning,
      isPaused: timerState.isPaused,
      phase: timerState.phase,
      remainingSeconds: timerState.remainingSeconds,
      totalSeconds: timerState.totalSeconds
    });
  }

  if (fullscreenWindow && !fullscreenWindow.isDestroyed()) {
    fullscreenWindow.webContents.send('timer-update', {
      isRunning: timerState.isRunning,
      isPaused: timerState.isPaused,
      phase: timerState.phase,
      remainingSeconds: timerState.remainingSeconds,
      totalSeconds: timerState.totalSeconds,
      tagName: timerState.currentTagName
    });
  }
}

function sendStateToAllWindows() {
  const state = {
    isRunning: timerState.isRunning,
    isPaused: timerState.isPaused,
    phase: timerState.phase,
    currentTagId: timerState.currentTagId,
    currentTagName: timerState.currentTagName,
    workDuration: timerState.workDuration,
    shortBreakDuration: timerState.shortBreakDuration,
    longBreakDuration: timerState.longBreakDuration,
    completedWorkSessions: timerState.completedWorkSessions,
    remainingSeconds: timerState.remainingSeconds,
    totalSeconds: timerState.totalSeconds
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('state-update', state);
  }
  if (fullscreenWindow && !fullscreenWindow.isDestroyed()) {
    fullscreenWindow.webContents.send('state-update', state);
  }
}

app.whenReady().then(async () => {
  const dataDir = getDataDir();
  await db.init(path.join(dataDir, 'pomodoro.db'));

  const settings = db.getSettings();
  if (settings) {
    timerState.workDuration = settings.work_duration || 25;
    timerState.shortBreakDuration = settings.short_break_duration || 5;
    timerState.longBreakDuration = settings.long_break_duration || 15;
    timerState.soundEnabled = settings.sound_enabled !== 0;
    timerState.soundVolume = settings.sound_volume || 70;
    timerState.remainingSeconds = timerState.workDuration * 60;
    timerState.totalSeconds = timerState.workDuration * 60;
  }

  const tags = db.getTags();
  if (tags && tags.length > 0) {
    timerState.currentTagId = tags[0].id;
    timerState.currentTagName = tags[0].name;
  }

  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', (e) => {
  if (process.platform !== 'darwin') {
    // Do nothing - keep app running in tray
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
  }
});

ipcMain.handle('get-tags', () => {
  return db.getTags();
});

ipcMain.handle('add-tag', (event, name, color, dailyGoalMinutes) => {
  return db.addTag(name, color, dailyGoalMinutes);
});

ipcMain.handle('update-tag-daily-goal', (event, tagId, dailyGoalMinutes) => {
  return db.updateTagDailyGoal(tagId, dailyGoalMinutes);
});

ipcMain.handle('delete-tag', (event, id) => {
  return db.deleteTag(id);
});

ipcMain.handle('get-tag-stats', (event, tagId) => {
  return db.getTagStats(tagId);
});

ipcMain.handle('get-today-sessions', (event, tagId) => {
  return db.getTodaySessions(tagId);
});

ipcMain.handle('get-sessions-by-date', (event, tagId, dateStr) => {
  return db.getSessionsByDate(tagId, dateStr);
});

ipcMain.handle('get-weekly-stats', (event, tagId) => {
  return db.getWeeklyStats(tagId);
});

ipcMain.handle('toggle-session-valid', (event, sessionId, isValid) => {
  return db.toggleSessionValid(sessionId, isValid);
});

ipcMain.handle('get-settings', () => {
  return db.getSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
  db.saveSettings(settings);
  timerState.workDuration = settings.workDuration;
  timerState.shortBreakDuration = settings.shortBreakDuration;
  timerState.longBreakDuration = settings.longBreakDuration;
  timerState.soundEnabled = settings.soundEnabled !== false;
  timerState.soundVolume = settings.soundVolume || 70;
  if (!timerState.isRunning && !timerState.isPaused) {
    timerState.remainingSeconds = timerState.workDuration * 60;
    timerState.totalSeconds = timerState.workDuration * 60;
  }
  sendStateToAllWindows();
  return true;
});

ipcMain.handle('start-timer', (event, tagId, tagName) => {
  timerState.currentTagId = tagId || null;
  timerState.currentTagName = tagName || '';
  timerState.phase = 'work';
  timerState.completedWorkSessions = 0;
  timerState.isPaused = false;
  startTimer();
  return true;
});

ipcMain.handle('start-next-phase', () => {
  timerState.isPaused = false;
  startTimer();
  return true;
});

ipcMain.handle('pause-timer', () => {
  pauseTimer();
  return true;
});

ipcMain.handle('resume-timer', () => {
  resumeTimer();
  return true;
});

ipcMain.handle('skip-phase', () => {
  skipPhase();
  return true;
});

ipcMain.handle('get-timer-state', () => {
  return {
    isRunning: timerState.isRunning,
    isPaused: timerState.isPaused,
    phase: timerState.phase,
    currentTagId: timerState.currentTagId,
    currentTagName: timerState.currentTagName,
    workDuration: timerState.workDuration,
    shortBreakDuration: timerState.shortBreakDuration,
    longBreakDuration: timerState.longBreakDuration,
    completedWorkSessions: timerState.completedWorkSessions,
    remainingSeconds: timerState.remainingSeconds,
    totalSeconds: timerState.totalSeconds
  };
});

ipcMain.handle('close-fullscreen', () => {
  if (fullscreenWindow) {
    fullscreenWindow.hide();
  }
  return true;
});

ipcMain.handle('show-main-window', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
  return true;
});
