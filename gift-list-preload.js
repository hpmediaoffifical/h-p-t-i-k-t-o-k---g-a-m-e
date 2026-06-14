/* Preload cho cửa sổ Danh sách quà tách rời — bridge renderer ↔ Electron main IPC. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpGiftList', {
    setAlwaysOnTop: (on) => ipcRenderer.send('gift-list:setAlwaysOnTop', !!on),
    close: () => ipcRenderer.send('gift-list:close'),
    // Main process bắn 'gift-list:initPin' với giá trị Pin đã lưu khi mở cửa sổ →
    // renderer dùng để sync UI nút 📌 đúng trạng thái persist.
    onInitPin: (cb) => {
        ipcRenderer.removeAllListeners('gift-list:initPin');
        ipcRenderer.on('gift-list:initPin', (_e, on) => { try { cb(!!on); } catch (_) {} });
    }
});
