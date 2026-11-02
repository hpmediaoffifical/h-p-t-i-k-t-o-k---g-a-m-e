'use strict';
// 🔗 hub-link-client - SDK để app HP (NPC LIVE, Action LIVE, …) khám phá, ghép đôi và nói chuyện với HP Game Hub.
// Không phụ thuộc npm: dùng fetch + WebSocket có sẵn của Node >= 22 / Electron (rơi về gói `ws` nếu app đã có).
// Giao thức: HP-GAME-HUB-LIEN-KET.md §1-§3. Hub không chạy thì mọi hàm vẫn an toàn (send → false, request → reject not_connected).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const PORT_FIRST = 3777;
const PORT_LAST = 3797;
const defaultPorts = () => Array.from({ length: PORT_LAST - PORT_FIRST + 1 }, (_, i) => PORT_FIRST + i);
const HOST = '127.0.0.1'; // không bao giờ dò ra ngoài máy này
const RESERVED_EVENTS = new Set(['state', 'connected', 'disconnected', 'pairing']); // tên sự kiện của chính SDK
const HOLD_DENIED_MS = 10 * 60 * 1000; // bị từ chối: không tự xin lại trong 10 phút (spec §2)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coded = (message, code) => Object.assign(new Error(message), { code });
const appData = () => process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

// pid còn sống? kill(pid, 0) không gửi tín hiệu thật; EPERM = có tiến trình nhưng thuộc người dùng khác (vẫn là sống).
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

// WebSocket có sẵn (Node >= 22) trước, rồi gói `ws` nếu app có; không có cả hai → null.
function pickWebSocket() {
  if (typeof globalThis.WebSocket === 'function') return globalThis.WebSocket;
  try { return require('ws'); } catch { return null; }
}

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

function createHubLink(opts = {}) {
  if (!opts.appId || typeof opts.appId !== 'string') throw new TypeError('createHubLink: thiếu appId');
  const o = {
    appName: opts.appId, version: '0.0.0', scopes: ['live.send', 'gift.plan', 'state.read'], capabilities: { queue: true },
    probePorts: defaultPorts(), pollMs: 10000, backoffMinMs: 1000, backoffMaxMs: 10000, pairPollMs: 1000,
    helloTimeoutMs: 300, deadMs: 15000, wsOpenTimeoutMs: 10000, logger: { info() {}, warn: (...a) => console.warn('[hub-link]', ...a) },
    ...opts,
  };
  // Chỉ để selftest thay child_process.spawn (bắt tham số, không mở cửa sổ thật). App không cần đặt.
  const spawnImpl = typeof opts._spawn === 'function' ? opts._spawn : spawn;
  // Logger của app có thể ném lỗi: bọc để không bao giờ làm sập vòng dò / sự kiện của SDK (chạy trong main process của app).
  const log = {
    info: (...a) => { try { o.logger.info(...a); } catch {} },
    warn: (...a) => { try { o.logger.warn(...a); } catch {} },
  };
  const discoveryFile = o.discoveryFile || process.env.HP_HUB_DISCOVERY_FILE || path.join(appData(), 'HP Media', 'HP Game Hub', 'hub.json');
  const installFile = o.installFile || process.env.HP_HUB_INSTALL_FILE || path.join(appData(), 'HP Media', 'HP Game Hub', 'install.json');
  const tokenFile = o.dataDir ? path.join(o.dataDir, 'hub-link.json') : null;

  // ---- trạng thái ----
  let stopped = true;
  let token = null;
  let storedMachineId = null; // machineId của Hub đã cấp token (đổi = Hub cài lại → token vô hiệu)
  let grantedScopes = [];
  let installInfo = null;
  let running = false;
  let hub = null; // { port, version, machineId }
  let connected = false;
  let pairing = null; // { code, pairId }
  let lastError = null;
  let held = null; // { reason, until? } - chặn TỰ ghép lại (thu hồi / từ chối / hết hạn mã) tới khi pair() tay
  let wasConnected = false; // đã từng nối trong lần chạy này → mất kết nối thì lùi theo backoff thay vì chu kỳ dò
  let backoff = o.backoffMinMs;
  let ws = null;
  let timer = null;
  let ticking = false;
  let pairingRun = null;
  let lastFrameAt = 0;
  let watchdog = null;
  let lastSig = '';
  let seq = 0;
  const pending = new Map(); // id → { resolve, reject, timer }
  const listeners = new Map(); // tên → Set<fn>
  const reqHandlers = new Map(); // tên → fn (Hub hỏi app)

  // ---- phát sự kiện / trạng thái ----
  function emit(name, data) {
    for (const fn of [...(listeners.get(name) || [])]) {
      try { fn(data); } catch (e) { log.warn(`handler "${name}" lỗi: ${e && e.message}`); }
    }
  }
  function state() {
    return {
      installed: !!installInfo || running, running, paired: !!token, connected,
      // quyền ĐÃ được cấp / còn thiếu so với o.scopes (thêm quyền mới thì token cũ thiếu - app hiện nút "Cho phép lại" gọi pair(); SDK không tự ghép lại)
      scopes: token ? [...grantedScopes] : [],
      missingScopes: token ? (o.scopes || []).filter((x) => !grantedScopes.includes(x)) : [],
      pairing: pairing ? { ...pairing } : null, hub: hub ? { ...hub } : null, lastError,
    };
  }
  function pushState() {
    const s = state();
    const sig = JSON.stringify(s);
    if (sig === lastSig) return;
    lastSig = sig;
    emit('state', s);
  }

  // ---- token trên đĩa ----
  function loadToken() {
    const j = tokenFile && readJson(tokenFile);
    if (j && typeof j.token === 'string' && j.token) {
      token = j.token; storedMachineId = j.hubMachineId || null; grantedScopes = Array.isArray(j.scopes) ? j.scopes : [];
    }
  }
  function saveToken(pairedAt) {
    if (!tokenFile) return;
    try {
      fs.mkdirSync(o.dataDir, { recursive: true });
      const tmp = tokenFile + '.tmp'; // ghi atomic
      fs.writeFileSync(tmp, JSON.stringify({ token, hubMachineId: storedMachineId, scopes: grantedScopes, pairedAt }, null, 2));
      fs.renameSync(tmp, tokenFile);
    } catch (e) { log.warn('không ghi được hub-link.json: ' + e.message); }
  }
  function dropToken(why) {
    token = null; storedMachineId = null; grantedScopes = [];
    if (tokenFile) { try { fs.rmSync(tokenFile, { force: true }); } catch {} }
    if (why) lastError = why;
  }
  // Gỡ Hub bằng trình gỡ vẫn để lại install.json → chỉ coi là "đã cài" khi exe còn trên đĩa.
  function refreshInstalled() {
    const j = readJson(installFile);
    let ok = false;
    try { ok = !!(j && typeof j.exe === 'string' && j.exe && fs.existsSync(j.exe)); } catch { ok = false; }
    installInfo = ok ? j : null;
  }
  // Mở exe Hub đã cài. null = chưa cài / spawn ném ngay; ngược lại Promise<boolean> (true = tiến trình đã mở, false = lỗi mở).
  // Lỗi mở (ENOENT, EACCES…) đến SAU qua sự kiện 'error' của tiến trình con: luôn có người nghe → không làm sập app.
  function spawnHub(args) {
    refreshInstalled();
    if (!installInfo) return null;
    const failed = (e) => { lastError = 'launch_failed'; log.warn('không mở được HP Game Hub: ' + (e && e.message)); pushState(); };
    let child;
    try {
      child = spawnImpl(installInfo.exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
    } catch (e) { failed(e); return null; }
    const started = new Promise((resolve) => {
      child.on('error', (e) => { failed(e); resolve(false); });
      child.on('spawn', () => resolve(true));
    });
    try { child.unref(); } catch {}
    return started;
  }

  // ---- khám phá Hub (spec §1) ----
  // Hỏi hello. KHÔNG kèm token khi dò: cổng lạ có thể là tiến trình khác trên máy, không được lộ token cho nó.
  // Chỉ lần hỏi có `auth` (sau khi đã xác nhận đúng Hub + đúng machineId đã ghép) mới gửi token.
  async function helloAt(port, auth = false) {
    try {
      const headers = { 'x-hp-app': o.appId };
      if (auth && token) headers.authorization = 'Bearer ' + token;
      const r = await fetch(`http://${HOST}:${port}/hub/v1/hello`, { headers, signal: AbortSignal.timeout(o.helloTimeoutMs) });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.ok && j.hub === 'hp-game-hub' ? { port, hello: j } : null;
    } catch { return null; }
  }
  async function discover() {
    const d = readJson(discoveryFile);
    let tried = null;
    if (d && pidAlive(d.pid) && Number.isInteger(d.port)) { // pid chết = file mồ côi, bỏ qua
      tried = d.port;
      const hit = await helloAt(d.port);
      if (hit) return hit;
    }
    const hits = await Promise.all(o.probePorts.filter((p) => p !== tried).map((p) => helloAt(p)));
    return hits.find(Boolean) || null;
  }

  // Token có vẻ không còn hợp lệ (hello.paired=false): hỏi một đường cần token để biết bị thu hồi hay Hub quên.
  async function tokenProblem(port) {
    try {
      const r = await fetch(`http://${HOST}:${port}/hub/v1/state`, {
        headers: { authorization: 'Bearer ' + token, 'x-hp-app': o.appId }, signal: AbortSignal.timeout(Math.max(o.helloTimeoutMs, 1000)),
      });
      if (r.status !== 401) return null; // 200 hoặc lỗi khác: cứ thử nối
      const j = await r.json().catch(() => null);
      return (j && j.error && j.error.code) || 'unauthorized';
    } catch { return null; }
  }

  function markRevoked() {
    dropToken('token_revoked');
    held = { reason: 'revoked' }; // không tự xin lại - user phải bấm (pair())
  }

  // ---- lịch dò ----
  function schedule(ms) {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(safeTick, ms);
    timer.unref();
  }
  function nextDelay() {
    if (!wasConnected) return o.pollMs;
    const d = backoff;
    backoff = Math.min(backoff * 2, o.backoffMaxMs);
    return d;
  }
  const holdActive = () => {
    if (held && held.until && Date.now() > held.until) held = null;
    return !!held;
  };

  // tick chạy không ai await: lỗi bất ngờ (option sai, …) mà thành unhandled rejection thì có thể giết main process của app.
  function safeTick() {
    tick().catch((e) => {
      lastError = 'tick_error';
      log.warn('vòng dò lỗi: ' + (e && e.message));
      pushState();
      schedule(nextDelay());
    });
  }

  async function tick() {
    if (stopped || ticking || connected || pairingRun) return;
    ticking = true;
    try {
      refreshInstalled();
      const found = await discover();
      if (stopped) return;
      if (!found) {
        running = false; hub = null;
        return;
      }
      running = true;
      hub = { port: found.port, version: found.hello.version, machineId: found.hello.machineId };
      // Chỉ gửi token cho Hub có machineId khớp lúc ghép. Khác / không biết = Hub khác hoặc cài lại → bỏ token, ghép lại.
      if (token && (!storedMachineId || storedMachineId !== found.hello.machineId)) dropToken('hub_changed');
      if (token) {
        const authed = await helloAt(found.port, true); // hello có token để biết `paired`
        if (stopped) return;
        found.hello.paired = authed ? authed.hello.paired : false;
      }
      if (token && found.hello.paired === false) {
        const why = await tokenProblem(found.port);
        if (why === 'token_revoked') markRevoked();
        else if (why) dropToken(why);
      }
      if (!token) {
        pushState();
        if (!holdActive()) runPairing(found);
        return;
      }
      pushState();
      await connectWs(found);
    } finally {
      ticking = false;
      pushState();
      if (!stopped && !connected && !pairingRun) schedule(nextDelay());
    }
  }

  // ---- ghép đôi (spec §2) ----
  function runPairing(found) {
    if (pairingRun) return pairingRun;
    const base = `http://${HOST}:${found.port}`;
    const J = { 'content-type': 'application/json' };
    pairingRun = (async () => {
      let outcome = 'error';
      try {
        const r = await fetch(base + '/hub/v1/pair', {
          method: 'POST', headers: J, signal: AbortSignal.timeout(3000),
          body: JSON.stringify({
            appId: o.appId, appName: o.appName, version: o.version, pid: process.pid, scopes: o.scopes,
            capabilities: o.capabilities, protocolMin: 1, protocolMax: 1,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.status !== 202 || !j.pairId) { lastError = (j.error && j.error.code) || 'pair_failed'; return outcome; }
        pairing = { code: j.code, pairId: j.pairId };
        lastError = null;
        pushState();
        emit('pairing', { ...pairing });
        const deadline = Date.now() + ((j.expiresIn || 120) + 2) * 1000;
        while (!stopped) {
          const s = await (await fetch(`${base}/hub/v1/pair/${j.pairId}`, { signal: AbortSignal.timeout(3000) })).json();
          if (s.status === 'approved' && s.token) {
            token = s.token; grantedScopes = s.scopes || o.scopes; storedMachineId = found.hello.machineId || null;
            held = null; lastError = null;
            saveToken(new Date().toISOString());
            return (outcome = 'approved');
          }
          if (s.status === 'denied') { held = { reason: 'denied', until: Date.now() + HOLD_DENIED_MS }; lastError = 'pair_denied'; return (outcome = 'denied'); }
          if (s.status === 'expired' || Date.now() > deadline) { held = { reason: 'expired' }; lastError = 'pair_expired'; return (outcome = 'expired'); }
          await sleep(o.pairPollMs);
        }
        return 'stopped';
      } catch (e) {
        lastError = 'pair_error';
        log.warn('ghép đôi lỗi: ' + e.message);
        return outcome;
      } finally {
        pairing = null;
        pairingRun = null;
        pushState();
        if (!stopped) { if (outcome === 'approved') safeTick(); else schedule(nextDelay()); }
      }
    })();
    return pairingRun;
  }

  // Ghép tay (nút "Cho phép lại" của app): gỡ chặn rồi xin ghép ngay. Trả 'approved' | 'denied' | 'expired' | 'no_hub' | 'error'.
  async function pair() {
    if (stopped) throw coded('SDK chưa start()', 'not_started');
    held = null;
    if (pairingRun) return pairingRun;
    const found = await discover();
    if (!found) { running = false; hub = null; lastError = 'hub_not_running'; pushState(); return 'no_hub'; }
    running = true;
    hub = { port: found.port, version: found.hello.version, machineId: found.hello.machineId };
    return runPairing(found);
  }

  // ---- WebSocket (spec §3) ----
  function connectWs(found) {
    return new Promise((resolve) => {
      const WS = pickWebSocket();
      if (!WS) { lastError = 'no_websocket'; resolve(); return; }
      const myToken = token;
      let sock;
      try {
        // ?app= chỉ để Hub giả biết app nào (WebSocket của trình duyệt/Node không gắn được header); Hub thật bỏ qua.
        sock = new WS(`ws://${HOST}:${found.port}/hub/v1/ws?token=${encodeURIComponent(myToken)}&app=${encodeURIComponent(o.appId)}`);
      } catch (e) { lastError = 'ws_error'; log.warn('không mở được WebSocket: ' + e.message); resolve(); return; }
      ws = sock;
      let opened = false;
      let done = false;
      // Bắt tay treo (cổng nhận TCP mà không trả lời nâng cấp): quá hạn thì đóng + resolve để tick chạy tiếp, không kẹt `ticking`.
      const handshake = setTimeout(() => {
        if (opened || done) return;
        lastError = 'ws_timeout';
        log.warn(`bắt tay WebSocket quá ${o.wsOpenTimeoutMs} ms, thử lại sau`);
        try { sock.close(); } catch {}
        onClosed(4000, 'ws_timeout');
      }, o.wsOpenTimeoutMs);
      if (handshake.unref) handshake.unref();
      const onClosed = (code, reason) => { // gọi đúng MỘT lần cho mỗi socket (từ sự kiện close, watchdog hoặc hạn bắt tay)
        if (done) return;
        done = true;
        clearTimeout(handshake);
        if (stopped || (ws && ws !== sock)) { resolve(); return; } // stop() đã dọn, hoặc đã có socket mới thay → socket cũ đóng muộn không được động vào trạng thái
        clearInterval(watchdog);
        if (ws === sock) ws = null;
        const wasOpen = opened;
        connected = false;
        failPending();
        if (code === 4001 || (code === 4401 && reason === 'token_revoked')) {
          if (myToken === token && !pairingRun) markRevoked(); // ghép lại chính app này cũng đóng socket cũ bằng 4001 → bỏ qua
        } else if (code === 4401) {
          if (myToken === token) dropToken('unauthorized'); // Hub không nhớ token (xoá dữ liệu): ghép lại bình thường
        } else if (code === 4403) lastError = 'bad_origin';
        if (wasOpen) { pushState(); emit('disconnected', { code, reason }); }
        resolve();
        if (!stopped && wasOpen) schedule(nextDelay());
      };
      sock.addEventListener('open', () => {
        if (done) { try { sock.close(1000, 'late'); } catch {} return; } // mở muộn sau khi đã bỏ (quá hạn bắt tay)
        clearTimeout(handshake);
        opened = true; connected = true; wasConnected = true; backoff = o.backoffMinMs; lastError = null;
        lastFrameAt = Date.now();
        clearInterval(watchdog);
        watchdog = setInterval(() => { // Hub im quá deadMs (không ping) → coi như chết, nối lại
          if (Date.now() - lastFrameAt > o.deadMs) { try { sock.close(4000, 'dead'); } catch {} onClosed(4000, 'dead'); }
        }, Math.max(50, Math.min(2000, o.deadMs / 3)));
        watchdog.unref();
        pushState();
        log.info('đã nối HP Game Hub cổng ' + found.port);
        emit('connected', state());
        resolve();
      });
      sock.addEventListener('message', (ev) => { lastFrameAt = Date.now(); onFrame(sock, ev.data); });
      sock.addEventListener('close', (ev) => onClosed(ev.code, ev.reason));
      sock.addEventListener('error', () => {}); // lỗi nối luôn kèm sự kiện close → xử lý ở đó
    });
  }

  function failPending() {
    for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.reject(coded('Mất kết nối với HP Game Hub.', 'not_connected')); }
  }

  function onFrame(sock, raw) {
    let m;
    try { m = JSON.parse(typeof raw === 'string' ? raw : String(raw)); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'res') {
      const p = pending.get(String(m.id));
      if (!p) return;
      clearTimeout(p.timer); pending.delete(String(m.id));
      if (m.ok) p.resolve(m.data);
      else p.reject(coded((m.error && m.error.message) || 'Hub báo lỗi.', (m.error && m.error.code) || 'hub_error'));
    } else if (m.t === 'ev') {
      if (m.name === 'hub.ping') { try { sock.send(JSON.stringify({ t: 'ev', name: 'hub.pong', ts: Date.now() })); } catch {} return; }
      // Tên ev của Hub trùng sự kiện của SDK thì chuyển thành hub:<tên> để không giả mạo state/connected/…
      emit(RESERVED_EVENTS.has(m.name) ? 'hub:' + m.name : m.name, m.data);
    } else if (m.t === 'req') { // Hub hỏi app
      const h = reqHandlers.get(m.name);
      const reply = (obj) => { try { sock.send(JSON.stringify({ t: 'res', id: m.id, ...obj })); } catch {} };
      if (!h) { reply({ ok: false, error: { code: 'unknown_name', message: `App không có xử lý cho "${m.name}".` } }); return; }
      Promise.resolve().then(() => h(m.data)).then(
        (data) => reply({ ok: true, data: data === undefined ? null : data }),
        (e) => reply({ ok: false, error: { code: (e && e.code) || 'handler_error', message: String((e && e.message) || e) } }),
      );
    }
  }

  // ---- API ----
  const api = {
    start() {
      if (!stopped) return api;
      stopped = false;
      loadToken();
      refreshInstalled();
      pushState();
      safeTick();
      return api;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(watchdog);
      const sock = ws;
      ws = null;
      const wasConnected2 = connected;
      connected = false; pairing = null;
      failPending();
      if (sock) { try { sock.close(1000, 'stop'); } catch {} }
      pushState();
      if (wasConnected2) emit('disconnected', { code: 1000, reason: 'stop' });
    },
    state,
    pair,
    send(name, data) {
      if (!connected || !ws) return false;
      try { ws.send(JSON.stringify({ t: 'ev', name, data, ts: Date.now() })); return true; } catch { return false; }
    },
    request(name, data, timeoutMs = 1500) {
      if (!connected || !ws) return Promise.reject(coded('Chưa nối HP Game Hub.', 'not_connected'));
      const id = 'c' + (++seq);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { pending.delete(id); reject(coded(`Hub không trả lời "${name}" trong ${timeoutMs} ms.`, 'timeout')); }, timeoutMs);
        pending.set(id, { resolve, reject, timer: t });
        try { ws.send(JSON.stringify({ t: 'req', id, name, data })); } catch (e) { clearTimeout(t); pending.delete(id); reject(coded(e.message, 'not_connected')); }
      });
    },
    // Đăng ký nghe sự kiện; trả hàm huỷ. Tên đặc biệt: 'state' | 'connected' | 'disconnected' | 'pairing' + mọi ev từ Hub.
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
      return () => api.off(name, fn);
    },
    off(name, fn) { const s = listeners.get(name); if (s) s.delete(fn); },
    // Hub hỏi app (req từ Hub): đăng ký trả lời cho một tên.
    handle(name, fn) { reqHandlers.set(name, fn); },
    // Chắc Hub đang chạy (mở ẩn dưới khay, `--minimized`). false = chưa cài (exe không còn) / không mở được.
    // Lỗi mở đến sau (exe hỏng) chỉ ghi log + lastError 'launch_failed', không ném.
    launch() {
      return spawnHub(['--minimized']) !== null;
    },
    // Mở một trang của Hub cho người dùng xem. page: home | camera | fxlib | obs | link | setup | settings | info.
    // Đã nối → POST /hub/v1/open tới đúng Hub đã ghép (cổng + machineId đã xác minh). Chưa nối mà đã cài → mở exe KHÔNG --minimized
    // (Hub đang chạy thì cửa sổ hiện lên). Trả 'opened' | 'launched' | 'not_installed' | 'failed'; không bao giờ reject.
    async open(page = 'home') {
      if (connected && ws && token && hub && storedMachineId && hub.machineId === storedMachineId) {
        try {
          const r = await fetch(`http://${HOST}:${hub.port}/hub/v1/open`, {
            method: 'POST', signal: AbortSignal.timeout(3000),
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-hp-app': o.appId },
            body: JSON.stringify({ page: String(page) }),
          });
          const j = await r.json().catch(() => null);
          if (r.ok && j && j.ok) return 'opened';
          log.warn(`Hub không mở được trang "${page}": ${(j && j.error && (j.error.code || j.error)) || r.status}`);
          if (r.status === 400) return 'failed'; // tên trang sai: mở exe cũng không giúp gì
        } catch (e) { log.warn('không gọi được Hub để mở trang: ' + (e && e.message)); }
      }
      const started = spawnHub([]);
      if (started === null) return installInfo ? 'failed' : 'not_installed';
      return (await started) ? 'launched' : 'failed';
    },
    // Link overlay OBS của Hub (spec §6): [{ id, url }]. Chưa nối → reject 'not_connected'; Hub báo lỗi → err.code của Hub.
    async overlays() {
      if (!connected || !token || !hub) throw coded('Chưa nối HP Game Hub.', 'not_connected');
      let r;
      try {
        r = await fetch(`http://${HOST}:${hub.port}/hub/v1/overlays`, {
          headers: { authorization: 'Bearer ' + token, 'x-hp-app': o.appId }, signal: AbortSignal.timeout(3000),
        });
      } catch (e) { throw coded('Không gọi được HP Game Hub: ' + (e && e.message), 'not_connected'); }
      const j = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(j)) throw coded((j && j.error && j.error.message) || 'Hub báo lỗi.', (j && j.error && j.error.code) || 'hub_error');
      return j;
    },
    get links() { return readJson(path.join(__dirname, 'links.json')) || {}; },
  };
  return api;
}

module.exports = { createHubLink, pidAlive };
