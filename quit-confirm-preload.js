// 🔐 Preload hộp thoại xác nhận thoát — thay cho nodeIntegration:true (trang chỉ cần gửi đúng 1 kênh IPC).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hpQuit', { send: (ok) => ipcRenderer.send('hp-quit-confirm', !!ok) });
