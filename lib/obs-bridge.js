// lib/obs-bridge.js
// OBS WebSocket bridge — kết nối HP Action LIVE → OBS Studio để trigger
// hiệu ứng (Lua scripts) trong OBS qua TriggerHotkeyByName.
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
//   await bridge.triggerHotkey('effect_chao_dap_trigger');

const { OBSWebSocket } = require('obs-websocket-js');

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

  // ===== Effect triggers =====

  /**
   * Trigger 1 hotkey đã đăng ký trong OBS Lua script.
   * Tên hotkey = giá trị string trong obs_hotkey_register_frontend(...).
   *
   * Returns: { ok: bool, reason?: string, error?: string }
   *   - ok=true: lệnh đã gửi thành công
   *   - reason='unlicensed': license invalid → skip silent (bảo mật)
   *   - reason='disconnected': chưa kết nối OBS
   *   - reason='error': OBS trả lỗi (xem field 'error')
   */
  async triggerHotkey(hotkeyName) {
    // License gate — silent skip để tránh tiết lộ
    if (!this.isLicensed()) {
      // chỉ log nếu logger có debug mode, tránh spam
      return { ok: false, reason: 'unlicensed' };
    }
    if (!this.connected) {
      this.logger.log(`[obs-bridge] SKIP triggerHotkey('${hotkeyName}'): not connected to OBS`);
      return { ok: false, reason: 'disconnected' };
    }
    try {
      await this.obs.call('TriggerHotkeyByName', { hotkeyName });
      this.logger.log(`[obs-bridge] ✓ trigger OK: ${hotkeyName}`);
      return { ok: true };
    } catch (err) {
      this.lastError = err && err.message ? err.message : String(err);
      this.logger.log(`[obs-bridge] ✗ triggerHotkey('${hotkeyName}') FAIL: ${this.lastError}`);
      return { ok: false, reason: 'error', error: this.lastError };
    }
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
   * Returns: { ok, refreshed: string[], reason?, error? }
   */
  async refreshBrowserSources(opts = {}) {
    if (!this.isLicensed()) return { ok: false, reason: 'unlicensed' };
    if (!this.connected) return { ok: false, reason: 'disconnected' };
    const urlIncludes = Array.isArray(opts.urlIncludes) && opts.urlIncludes.length
      ? opts.urlIncludes : null;
    try {
      const { inputs } = await this.obs.call('GetInputList');
      const browserInputs = (inputs || []).filter(i =>
        String(i.inputKind || '').includes('browser_source'));
      const refreshed = [];
      for (const inp of browserInputs) {
        const name = inp.inputName;
        if (urlIncludes) {
          let url = '';
          try {
            const s = await this.obs.call('GetInputSettings', { inputName: name });
            url = String((s.inputSettings && s.inputSettings.url) || '');
          } catch (_) { /* không đọc được settings → bỏ qua source này */ }
          if (!url || !urlIncludes.some(u => url.includes(u))) continue;
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

  /**
   * Liệt kê các hotkey hiện đang đăng ký trong OBS (debug helper).
   * Returns: Array<string> tên hotkey
   */
  async listHotkeys() {
    if (!this.connected) return [];
    try {
      const result = await this.obs.call('GetHotkeyList');
      return result.hotkeys || [];
    } catch (err) {
      this.logger.log(`[obs-bridge] listHotkeys FAIL: ${err.message || err}`);
      return [];
    }
  }

  /**
   * Lấy phiên bản OBS Studio (debug helper).
   */
  async getOBSVersion() {
    if (!this.connected) return null;
    try {
      const r = await this.obs.call('GetVersion');
      return {
        obsVersion: r.obsVersion,
        obsWebSocketVersion: r.obsWebSocketVersion,
        platform: r.platform,
        rpcVersion: r.rpcVersion
      };
    } catch (err) {
      return null;
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

module.exports = { OBSBridge };
