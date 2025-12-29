const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadFrames: () => ipcRenderer.invoke('load-frames'),
  saveFrames: (frames, cropValues) => ipcRenderer.invoke('save-frames', frames, cropValues),
  previewPdf: (frames, cropValues) => ipcRenderer.invoke('preview-pdf', frames, cropValues),
  deleteFrames: (frames) => ipcRenderer.invoke('delete-frames', frames),
  onPdfProgress: (callback) => ipcRenderer.on('pdf-progress', (event, message) => callback(message))
});
