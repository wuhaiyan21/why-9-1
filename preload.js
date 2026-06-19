const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getTags: () => ipcRenderer.invoke('get-tags'),
  addTag: (name, color, dailyGoalMinutes) => ipcRenderer.invoke('add-tag', name, color, dailyGoalMinutes),
  updateTagDailyGoal: (tagId, dailyGoalMinutes) => ipcRenderer.invoke('update-tag-daily-goal', tagId, dailyGoalMinutes),
  deleteTag: (id) => ipcRenderer.invoke('delete-tag', id),
  getTagStats: (tagId) => ipcRenderer.invoke('get-tag-stats', tagId),
  getTagStatsByDate: (tagId, dateStr) => ipcRenderer.invoke('get-tag-stats-by-date', tagId, dateStr),
  getTodaySessions: (tagId) => ipcRenderer.invoke('get-today-sessions', tagId),
  getSessionsByDate: (tagId, dateStr) => ipcRenderer.invoke('get-sessions-by-date', tagId, dateStr),
  getWeeklyStats: (tagId) => ipcRenderer.invoke('get-weekly-stats', tagId),
  toggleSessionValid: (sessionId, isValid) => ipcRenderer.invoke('toggle-session-valid', sessionId, isValid),
  
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  startTimer: (tagId, tagName) => ipcRenderer.invoke('start-timer', tagId, tagName),
  startNextPhase: () => ipcRenderer.invoke('start-next-phase'),
  pauseTimer: () => ipcRenderer.invoke('pause-timer'),
  resumeTimer: () => ipcRenderer.invoke('resume-timer'),
  skipPhase: () => ipcRenderer.invoke('skip-phase'),
  getTimerState: () => ipcRenderer.invoke('get-timer-state'),
  
  closeFullscreen: () => ipcRenderer.invoke('close-fullscreen'),
  showMainWindow: () => ipcRenderer.invoke('show-main-window'),
  
  onTimerUpdate: (callback) => {
    ipcRenderer.on('timer-update', (event, data) => callback(data));
  },
  onStateUpdate: (callback) => {
    ipcRenderer.on('state-update', (event, data) => callback(data));
  },
  onSessionsUpdated: (callback) => {
    ipcRenderer.on('sessions-updated', callback);
  },
  onPlaySound: (callback) => {
    ipcRenderer.on('play-sound', (event, data) => callback(data));
  }
});
