/* Preload cho cửa sổ Khởi động nhanh — bridge renderer ↔ Electron main IPC. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpQuickLaunch', {
    setAlwaysOnTop: (on) => ipcRenderer.send('quick-launch:setAlwaysOnTop', !!on),
    setSize: (w, h) => ipcRenderer.send('quick-launch:setSize', { w, h }),
    setLayout: (mode) => ipcRenderer.send('quick-launch:setLayout', mode),
    // Ôm sát chiều cao theo nội dung (lưu theo bố cục đang dùng) / tự mở cửa sổ khi khởi động app
    setFit: (on) => ipcRenderer.send('quick-launch:setFit', !!on),
    setAutoOpen: (on) => ipcRenderer.send('quick-launch:setAutoOpen', !!on),
    getPrefs: () => ipcRenderer.invoke('quick-launch:getPrefs'),
    // Main báo user vừa kéo tay đổi chiều cao → fit của bố cục hiện tại đã tắt (renderer ngừng ép chiều cao)
    onFitChanged: (cb) => {
        ipcRenderer.removeAllListeners('quick-launch:fitChanged');
        ipcRenderer.on('quick-launch:fitChanged', (_e, payload) => { try { cb(payload || {}); } catch (_) {} });
    },
    onInitLayout: (cb) => {
        ipcRenderer.removeAllListeners('quick-launch:initLayout');
        ipcRenderer.on('quick-launch:initLayout', (_e, mode) => { try { cb(mode); } catch (_) {} });
    },
    // Main điều phối: bắn {mode, w, h, fit} → renderer áp bố cục; fit=true thì ôm sát chiều cao theo bề rộng w.
    onApplyLayout: (cb) => {
        ipcRenderer.removeAllListeners('quick-launch:applyLayout');
        ipcRenderer.on('quick-launch:applyLayout', (_e, payload) => { try { cb(payload || {}); } catch (_) {} });
    },
    close: () => ipcRenderer.send('quick-launch:close'),
    // Main process bắn 'quick-launch:initPin' với giá trị Pin đã lưu khi mở cửa sổ →
    // renderer dùng để sync UI nút 📌 đúng trạng thái persist.
    onInitPin: (cb) => {
        ipcRenderer.removeAllListeners('quick-launch:initPin');
        ipcRenderer.on('quick-launch:initPin', (_e, on) => { try { cb(!!on); } catch (_) {} });
    }
});
