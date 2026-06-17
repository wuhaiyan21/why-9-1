const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getTags: () => ipcRenderer.invoke('get-tags'),
  addTag: (name, color) => ipcRenderer.invoke('add-tag', name, color),
  deleteTag: (id) => ipcRenderer.invoke('delete-tag', id),
  getTagStats: (tagId) => ipcRenderer.invoke('get-tag-stats', tagId),
  getTodaySessions: (tagId) => ipcRenderer.invoke('get-today-sessions', tagId),
  toggleSessionValid: (sessionId, isValid) => ipcRenderer.invoke('toggle-session-valid', sessionId, isValid),
  
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  
  startTimer: (tagId, tagName) => ipcRenderer.invoke('start-timer', tagId, tagName),
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
  }
});
