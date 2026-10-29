// lib/obs-bridge.js
// OBS WebSocket bridge — MỘT kết nối HP Action LIVE → OBS Studio dùng chung cho cả app:
//   - feed camera 🎥 Game Camera (lib/touchplay-obs-feed.js gọi GetSourceScreenshot… qua bridge.obs),
//   - Bộ Tách Người ẩn/hiện camera, Chém Trái Cây (đổi Scene, chụp nguồn), kiểm Scene Game Camera,
//   - tự bấm Refresh các Browser Source overlay của app lúc mở app (refreshBrowserSources).
// (Hàm chạy hiệu ứng LUA — hotkey / chuyển Scene — đã gỡ cùng trang 🎬 Hiệu ứng OBS, 29/10/2026.)
//
// Architecture: dependency-injected (isLicensed callback) để tránh coupling
// chặt với appConfig — dễ test + tách module rõ ràng.
//
// Usage:
//   const { OBSBridge } = require('./lib/obs-bridge');
//   const bridge = new OBSBridge({
//     isLicensed: () => Boolean(appConfig.license?.activated),
//     logger: console
//   });
//   await bridge.connect('ws://localhost:4455', 'optional-password');
//   await bridge.obs.call('GetSceneList');

const { OBSWebSocket } = require('obs-websocket-js');

// URL Browser Source trỏ đúng cổng `port`? Cùng máy thường chạy cả HP LIVE NPC (cổng 3001, cũng có /overlay/…)
// → chỉ so đường dẫn là refresh nhầm overlay của app kia. Host nào cũng được (localhost, 127.0.0.1, hpaction.obs,
// IP LAN) miễn cổng khớp. URL không đọc được → KHÔNG khớp (refresh là ghi vào OBS, thà bỏ sót còn hơn bấm nhầm).
function urlOnPort(url, port) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return String(u.port || (u.protocol === 'https:' ? 443 : 80)) === String(port);
  } catch (_) { return false; }
}

class OBSBridge {
  /**
   * @param {Object} opts
   * @param {() => boolean} [opts.isLicensed]  Hàm trả về true nếu license hợp lệ.
   *                                            Mặc định () => true (cho dev/test).
   * @param {Object}   [opts.logger]            Logger interface { log, warn, error }.
   * @param {boolean}  [opts.autoReconnect]     Tự reconnect khi mất kết nối (default true).
   * @param {number}   [opts.reconnectDelayMs]  Delay giữa các lần reconnect (default 5000).
   */
  constructor(opts = {}) {
    this.obs = new OBSWebSocket();
    this.connected = false;
    this.connecting = false;
    this.lastError = null;
    this.url = null;
    this.password = '';
    this.autoReconnect = opts.autoReconnect !== false;
    this.reconnectDelayMs = opts.reconnectDelayMs || 5000;
    this.isLicensed = opts.isLicensed || (() => true);
    this.logger = opts.logger || console;
    this._reconnectTimer = null;
    this._wantConnected = false;

    // OBS WS event hooks
    this.obs.on('ConnectionClosed', () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) this.logger.log('[obs-bridge] connection closed');
      if (this.autoReconnect && this._wantConnected) this._scheduleReconnect();
    });

    this.obs.on('ConnectionError', (err) => {
      this.lastError = err && err.message ? err.message : String(err);
      // không log spam — chỉ log lần đầu hoặc khi connected==true
    });
  }

  /**
   * Kết nối tới OBS WebSocket server.
   * @param {string} url       vd "ws://localhost:4455"
   * @param {string} [password] Để trống nếu OBS không bật authentication
   */
  async connect(url, password) {
    if (this.connecting) {
      this.logger.log('[obs-bridge] connect: already connecting, skip');
      return;
    }
    this.connecting = true;
    this.url = url;
    this.password = password || '';
    this._wantConnected = true;

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    try {
      const result = await this.obs.connect(url, this.password);
      this.connected = true;
      this.lastError = null;
      this.logger.log(
        `[obs-bridge] connected to ${url} ` +
        `(OBS WS v${result.obsWebSocketVersion}, RPC v${result.negotiatedRpcVersion})`
      );
      return result;
    } catch (err) {
      this.connected = false;
      this.lastError = err && err.message ? err.message : String(err);
      this.logger.log(`[obs-bridge] connect FAIL: ${this.lastError}`);
      if (this.autoReconnect && this._wantConnected) this._scheduleReconnect();
      throw err;
    } finally {
      this.connecting = false;
    }
  }

  /**
   * Đóng kết nối + dừng auto-reconnect.
   */
  async disconnect() {
    this._wantConnected = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    try {
      await this.obs.disconnect();
    } catch (e) {
      // ignore
    }
    this.connected = false;
    this.logger.log('[obs-bridge] disconnected');
  }

  isConnected() {
    return this.connected;
  }

  getStatus() {
    return {
      connected: this.connected,
      connecting: this.connecting,
      url: this.url,
      lastError: this.lastError,
      licensed: this.isLicensed()
    };
  }

  /**
   * Refresh (nạp lại) các Browser Source trong OBS đang trỏ tới overlay của app.
   * Tương đương user mở Thuộc tính source → bấm "Refresh cache of current page",
   * nhưng tự động → KHÔNG cần vào OBS bấm thủ công sau khi mở lại app.
   *
   * @param {Object} opts
   * @param {string[]} [opts.urlIncludes]  Chỉ refresh source có URL chứa MỘT trong các chuỗi
   *   này (vd ['/overlay/','localhost:3000']). Bỏ trống = refresh MỌI browser source.
   *   → Lọc để KHÔNG đụng các browser source khác của user (BEAUTY, WEBM, banner…).
   * @param {number|string} [opts.port]  Chỉ refresh source có URL trỏ đúng cổng này (cổng app) — tránh refresh
   *   overlay của app khác cùng máy (HP LIVE NPC :3001). Áp CÙNG LÚC với urlIncludes.
   * Returns: { ok, refreshed: string[], reason?, error? }
   */
  async refreshBrowserSources(opts = {}) {
    if (!this.isLicensed()) return { ok: false, reason: 'unlicensed' };
    if (!this.connected) return { ok: false, reason: 'disconnected' };
    const urlIncludes = Array.isArray(opts.urlIncludes) && opts.urlIncludes.length
      ? opts.urlIncludes : null;
    const port = opts.port != null && opts.port !== '' ? opts.port : null;
    try {
      const { inputs } = await this.obs.call('GetInputList');
      const browserInputs = (inputs || []).filter(i =>
        String(i.inputKind || '').includes('browser_source'));
      const refreshed = [];
      for (const inp of browserInputs) {
        const name = inp.inputName;
        if (urlIncludes || port) {
          let url = '';
          try {
            const s = await this.obs.call('GetInputSettings', { inputName: name });
            url = String((s.inputSettings && s.inputSettings.url) || '');
          } catch (_) { /* không đọc được settings → bỏ qua source này */ }
          if (!url) continue;
          if (urlIncludes && !urlIncludes.some(u => url.includes(u))) continue;
          if (port && !urlOnPort(url, port)) continue;
        }
        try {
          await this.obs.call('PressInputPropertiesButton', {
            inputName: name, propertyName: 'refreshnocache'
          });
          refreshed.push(name);
        } catch (e) {
          this.logger.log(`[obs-bridge] refresh '${name}' FAIL: ${e && e.message ? e.message : e}`);
        }
      }
      this.logger.log(`[obs-bridge] ✓ refreshed ${refreshed.length} browser source: ${refreshed.join(', ') || '(none)'}`);
      return { ok: true, refreshed };
    } catch (err) {
      this.lastError = err && err.message ? err.message : String(err);
      this.logger.log(`[obs-bridge] refreshBrowserSources FAIL: ${this.lastError}`);
      return { ok: false, reason: 'error', error: this.lastError };
    }
  }

  // ===== Internal =====

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    if (!this._wantConnected) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._wantConnected || !this.url) return;
      this.logger.log(`[obs-bridge] reconnecting to ${this.url}...`);
      this.connect(this.url, this.password).catch(() => {
        // _scheduleReconnect đã được gọi lại trong catch handler của connect()
      });
    }, this.reconnectDelayMs);
  }
}

module.exports = { OBSBridge, urlOnPort };
