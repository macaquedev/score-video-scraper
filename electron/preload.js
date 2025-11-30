const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadFrames: () => ipcRenderer.invoke('load-frames'),
  saveFrames: (frames) => ipcRenderer.invoke('save-frames', frames),
  deleteFrames: (frames) => ipcRenderer.invoke('delete-frames', frames),
  onPdfProgress: (callback) => ipcRenderer.on('pdf-progress', (event, message) => callback(message))
});
