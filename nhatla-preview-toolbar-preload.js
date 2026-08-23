// Bridge tối thiểu cho thanh điều khiển tách riêng khỏi canvas overlay Nhặt Lá.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpNhatLaPreviewToolbar', {
    beginDrag: () => ipcRenderer.send('nhatla-preview:dragStart'),
    moveDrag: (dx, dy) => ipcRenderer.send('nhatla-preview:dragMove', { dx, dy }),
    endDrag: () => ipcRenderer.send('nhatla-preview:dragEnd'),
    togglePin: () => ipcRenderer.send('nhatla-preview:togglePin'),
    toggleLock: () => ipcRenderer.send('nhatla-preview:toggleLock'),
    close: () => ipcRenderer.send('nhatla-preview:close'),
    onState: (callback) => {
        ipcRenderer.removeAllListeners('nhatla-preview:state');
        ipcRenderer.on('nhatla-preview:state', (_event, state) => { try { callback(state || {}); } catch {} });
    }
});
