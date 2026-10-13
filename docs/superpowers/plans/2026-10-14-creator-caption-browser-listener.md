# Phụ đề giọng Creator — nghe realtime bằng Edge/Chrome — Kế hoạch thực thi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay đường nghe Whisper (hỏng) bằng trang nghe `/listen/caption` mở trong Edge/Chrome, chữ tạm + câu final về server, dịch ≤5 ngôn ngữ, overlay cũ thêm dòng chữ tạm và kiểu "Phụ đề".

**Architecture:** Server spawn Edge/Chrome `--app` với profile riêng → trang nghe dùng `webkitSpeechRecognition` và đẩy `creatorCaption:partial/speech/listener` qua socket.io (loopback = tin cậy) → server lưu trạng thái, dịch câu final bằng `translateTextToTarget` sẵn có, phát `creatorCaption:line/partial/listenerState` cho overlay + popup. Logic thuần tách ra 2 module test bằng `node --test`.

**Tech Stack:** Node 24 / Electron 42, Express + socket.io 4, Web Speech API (Chromium), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-14-creator-caption-browser-listener-design.md`

## Global Constraints

- Link OBS `/overlay/creator-caption` giữ nguyên; kiểu mặc định `card` không đổi hình với khách cũ.
- `targetLangs` tối đa **5**; `browser ∈ {edge, chrome}` mặc định `edge`; `style ∈ {card, subtitle}`; `showInterim` mặc định `true`.
- Mọi event từ trang nghe chỉ qua `onTrusted`; route `listener/open|stop` chỉ `requestIsTrusted(req)`.
- Không còn tham chiếu Whisper nào trong `server.js`, `public/app.js`, `public/index.html` sau Task 3 + 6.
- Test chạy bằng `npm test` (node --test `tests/**/*.test.{js,mjs}`); module thuần không import DOM/Node fs trực tiếp (tiêm phụ thuộc).
- File mới dùng LF; `public/overlay/creator-caption.html` ghi lại toàn bộ bằng LF.

## Review Focus

1. Chromium phát lại cùng result final sau khi tự `start()` lại (chỉ số reset) → không được gửi trùng câu; Task 1 test `newSession` + server dedupe 30s giữ nguyên.
2. `partial` tới sau `final` của cùng câu (sự kiện trễ) → overlay phải xoá dòng tạm khi final tới; Task 5 test tay + Task 4 gửi `partial ''` ngay sau final.
3. Người dùng bấm BẮT ĐẦU 2 lần nhanh khi đang `opening` → không spawn 2 cửa sổ; Task 2 test `open()` khi `opening`.
4. Socket trang nghe cũ ngắt SAU khi trang mới đã attach (F5 trong cửa sổ Edge) → `detach` của socket cũ không được đưa trạng thái về `idle`; Task 2 test detach sai socket.
5. Cấu hình cũ có `targetLangs` 8 phần tử / khoá `whisperLocalExe` → sanitize cắt còn 5 và bỏ khoá lạ; Task 3 kiểm bằng curl.

---

### Task 1: `public/lib/caption-speech.mjs` — logic thuần của trang nghe

**Files:**
- Create: `public/lib/caption-speech.mjs`
- Test: `tests/caption-speech.test.mjs`

**Interfaces:**
- Produces:
  - `createResultTracker()` → `{ newSession(): void, onResult(ev): { partial: string, finals: string[] } }`; `ev = { resultIndex, results: Array<{ isFinal: boolean, 0: { transcript: string } }> }`.
  - `restartDelay({ reason, hadResults, emptySessions, networkErrors })` → `number` (ms) hoặc `-1`.
  - `isFatalError(reason)` → `boolean`.
  - `createPartialThrottle(intervalMs = 100, now = () => Date.now())` → `{ push(text): string|null, flush(): string|null }`.

- [ ] **Step 1: Viết test** `tests/caption-speech.test.mjs` (import ESM như `tests/body-frames.test.mjs`):

```js
test('tracker: interim → partial, final 1 lần, bỏ rỗng', () => {
    const t = createResultTracker();
    assert.deepEqual(t.onResult(ev(0, [[false, ' xin ']])), { partial: 'xin', finals: [] });
    assert.deepEqual(t.onResult(ev(0, [[false, 'xin chào']])), { partial: 'xin chào', finals: [] });
    assert.deepEqual(t.onResult(ev(0, [[true, 'xin chào  cả nhà ']])), { partial: '', finals: ['xin chào cả nhà'] });
    assert.deepEqual(t.onResult(ev(0, [[true, 'xin chào cả nhà'], [false, 'hôm']])), { partial: 'hôm', finals: [] }); // final cũ không gửi lại
    assert.deepEqual(t.onResult(ev(1, [[true, 'xin chào cả nhà'], [true, '   ']])), { partial: '', finals: [] });
});
test('tracker: newSession đánh số lại → final index 0 mới được gửi', ...)  // sau newSession, ev(0,[[true,'câu hai']]) → finals ['câu hai']
test('restartDelay: bảng spec', () => {
    assert.equal(restartDelay({ reason: 'not-allowed' }), -1);
    assert.equal(restartDelay({ reason: 'service-not-allowed' }), -1);
    assert.equal(restartDelay({ reason: 'audio-capture' }), -1);
    assert.equal(restartDelay({ reason: 'language-not-supported' }), -1);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 1 }), 1000);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 3 }), 4000);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 5 }), 16000);
    assert.equal(restartDelay({ reason: 'network', networkErrors: 6 }), -1);
    assert.equal(restartDelay({ reason: 'no-speech' }), 0);
    assert.equal(restartDelay({ reason: '', hadResults: true }), 300);
    assert.equal(restartDelay({ reason: 'aborted', hadResults: false, emptySessions: 0 }), 500);
    assert.equal(restartDelay({ reason: '', hadResults: false, emptySessions: 3 }), 1500);
    assert.equal(restartDelay({ reason: '', hadResults: false, emptySessions: 40 }), 5000);
});
test('throttle: 100ms, trùng → null, flush', () => { let now = 0; const th = createPartialThrottle(100, () => now);
    assert.equal(th.push('a'), 'a'); now = 50; assert.equal(th.push('ab'), null); now = 120; assert.equal(th.push('ab'), 'ab');
    assert.equal(th.push('ab'), null); now = 300; assert.equal(th.push('ab'), null); // trùng text đã gửi
    now = 310; assert.equal(th.push('abc'), 'abc'); now = 320; th.push('abcd'); assert.equal(th.flush(), 'abcd'); assert.equal(th.flush(), null); });
```

- [ ] **Step 2:** `node --test tests/caption-speech.test.mjs` → FAIL (module không tồn tại).
- [ ] **Step 3:** Viết `public/lib/caption-speech.mjs` đúng chữ ký; `restartDelay` công thức: network `Math.min(30000, 1000 * 2 ** (networkErrors - 1))`, không kết quả `Math.min(5000, 500 * Math.max(1, emptySessions))`.
- [ ] **Step 4:** Chạy lại → PASS.
- [ ] **Step 5:** Commit `feat(caption): module thuần nhận diện giọng — gộp kết quả, chính sách bật lại, tiết lưu`.

### Task 2: `lib/caption-listener.js` — tìm trình duyệt, tham số chạy, máy trạng thái

**Files:**
- Create: `lib/caption-listener.js` (CommonJS như `lib/camgames.js`)
- Test: `tests/caption-listener.test.js`

**Interfaces:**
- Produces:
  - `BROWSERS = ['edge', 'chrome']`, `normalizeBrowser(v)` → `'edge'|'chrome'`.
  - `candidatePaths(browser, env)` → `string[]` (theo spec, `env` = object có `ProgramFiles`, `ProgramFiles(x86)`, `LOCALAPPDATA`).
  - `resolveBrowserExe(preferred, { exists, env, regQuery })` → `{ browser, exe, fallback }|null`; `regQuery(exeName)` → path|''.
  - `buildLaunchArgs({ url, profileDir })` → `string[]` đúng thứ tự spec.
  - `createListenerState({ now = Date.now, connectTimeoutMs = 15000, setTimer = setTimeout, clearTimer = clearTimeout, onChange })` →
    `{ snapshot(), open({ browser }) → { action: 'spawn'|'start'|'none', state }, attach(socketId), report(socketId, info), detach(socketId), stop() → { action: 'stop', socketId } }`.
    Snapshot: `{ status, browser, lang, micLabel, error, openedAt, socketId, updatedAt }`.

- [ ] **Step 1: Viết test** (require như `tests/camgames.test.js`):
  - `resolveBrowserExe('edge', {exists: p => p === X, env})` → `{browser:'edge', exe:X, fallback:false}`; edge không có, chrome có → `fallback:true`; cả hai không, `regQuery('msedge.exe')` trả path → dùng path đó; không gì → `null`.
  - `buildLaunchArgs({url:'http://localhost:3000/listen/caption?browser=edge', profileDir:'D:\\p'})` → mảng đúng 7 phần tử theo spec.
  - Máy trạng thái (tiêm `now`, `setTimer` giả trả id và ghi callback):
    - `open()` từ idle → `{action:'spawn'}`, status `opening`, `onChange` gọi 1 lần.
    - `open()` khi `opening` → `{action:'none'}`, không spawn thêm.
    - `attach('s1')` + `report('s1',{state:'listening',lang:'vi-VN',micLabel:'Mic A'})` → status `listening`, timer timeout bị clear.
    - `open()` khi listening → `{action:'none'}`.
    - `report('s1',{state:'idle'})` rồi `open()` → `{action:'start', socketId:'s1'}` (không spawn).
    - `attach('s2')` rồi `detach('s1')` → status giữ nguyên (socket cũ không hạ trạng thái); `detach('s2')` → `idle`.
    - `open()` rồi timer timeout chạy → status `error`, error `listener_timeout`.
    - `report('s1',{state:'error',error:'not-allowed'})` → status `error`, error `not-allowed`.
    - `stop()` → `{action:'stop', socketId}` và status `idle`.
- [ ] **Step 2:** `node --test tests/caption-listener.test.js` → FAIL.
- [ ] **Step 3:** Viết `lib/caption-listener.js`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(caption): lib tìm Edge/Chrome + máy trạng thái cửa sổ nghe`.

### Task 3: Server — cấu hình mới, gỡ Whisper, route + socket trang nghe, tắt app

**Files:**
- Modify: `server.js` — `DEFAULT_CREATOR_CAPTION_CONFIG` (~1764), `sanitizeCreatorCaptionConfig` (~2162), khối Whisper 2189–2353, `processCreatorCaptionSpeech` (2361–2428), route 4634–4668, route overlay ~5888, socket 10891–10896 + `disconnect` ~11118, `module.exports` (11215).
- Modify: `electron-main.js` — `before-quit` (1763).

**Interfaces:**
- Consumes: Task 2 `createListenerState`, `resolveBrowserExe`, `buildLaunchArgs`, `normalizeBrowser`.
- Produces: HTTP `GET /listen/caption`; `POST /api/creator-caption/listener/open` `{browser?}` → `{ok, state}` (403 untrusted, 404 `browser_not_found`); `POST .../listener/stop` → `{ok, state}`; `GET .../listener/state` → snapshot. Socket in: `creatorCaption:listener`, `creatorCaption:partial`, `creatorCaption:speech`. Socket out: `creatorCaption:listenerState`, `creatorCaption:partial {text, ts}`, `creatorCaption:listener:start|stop`, `creatorCaption:line` (+`style`), `creatorCaption:config`. Export `captionListenerStop()`.

- [ ] **Step 1:** Đổi `DEFAULT_CREATOR_CAPTION_CONFIG` theo spec; viết lại `sanitizeCreatorCaptionConfig` trả object chỉ gồm các khoá mặc định (`browser` qua `normalizeBrowser`, `style` ∈ {card, subtitle}, `showInterim`, `targetLangs.slice(0, 5)`).
- [ ] **Step 2:** Xoá `isLikelyWhisperHallucination`, `validateCreatorCaptionAudioMetrics`, `sourceLangForTranscription`, `transcribeCreatorCaptionAudio`, `runWhisperLocal`, `cleanWhisperOutput`, `resolveWhisperLocalExe/Model`, `transcribeCreatorCaptionAudioLocal`, route `/api/creator-caption/transcribe`. Giữ `bundledResourcePath` chỉ nếu nơi khác dùng (grep); không thì xoá.
- [ ] **Step 3:** `processCreatorCaptionSpeech`: bỏ nhánh `payload.targetLangs` và kiểm tra ảo giác; thêm `style: cfg.style` vào cả 2 payload `creatorCaption:line`.
- [ ] **Step 4:** Thêm `const CaptionListener = require('./lib/caption-listener')`, tạo `captionListener = createListenerState({ onChange: s => io.emit('creatorCaption:listenerState', s) })`, hàm `captionListenerSpawn(browser)` (resolve → mkdir profile `path.join(DATA_DIR, 'caption-listener', browser)` → `spawn(exe, args, { detached: true, stdio: 'ignore' }).unref()`), hàm `captionListenerStop()` (state.stop → emit `creatorCaption:listener:stop` tới socketId hoặc `io.emit`). URL trang nghe: `http://127.0.0.1:${PORT}/listen/caption?browser=<b>` (đọc biến port hiện có của server).
- [ ] **Step 5:** Route `GET /listen/caption` → `public/listen/caption.html`; 3 route API theo Interfaces (open: lưu `browser` vào `appConfig.creatorCaption` + `saveAppConfig()` + `io.emit('creatorCaption:config')` khi body có `browser`).
- [ ] **Step 6:** Socket: trong `io.on('connection')` gửi `creatorCaption:listenerState` snapshot; `onTrusted('creatorCaption:listener', …)` → `attach` (lần đầu) + `report`; `onTrusted('creatorCaption:partial', …)` → nếu `enabled` thì `io.emit('creatorCaption:partial', { text: String(p?.text || '').slice(0, 300), ts: Date.now() })`; `socket.on('disconnect')` → `captionListener.detach(socket.id)`. Giữ `creatorCaption:speech`; xoá handler `creatorCaption:debug` (không còn nguồn phát) và các `io.emit('creatorCaption:debug')` còn sót.
- [ ] **Step 7:** `module.exports = { httpServer, app, io, captionListenerStop }`; `process.on('SIGINT', () => { try { captionListenerStop(); } catch (e) {} process.exit(0); })` chỉ khi `!process.versions.electron`. `electron-main.js` `before-quit`: thêm `try { require('./server.js').captionListenerStop(); } catch (_) {}`.
- [ ] **Step 8: Kiểm tra** — `node -e "require('./server.js')"` khởi động không lỗi (tắt bằng Ctrl+C); `grep -n -i whisper server.js` → rỗng; `curl -X POST localhost:3000/api/creator-caption/config -d '{"targetLangs":["en","vi","th","id","ja","ko"],"whisperLocalExe":"x"}' -H "Content-Type: application/json"` → `targetLangs` 5 phần tử, không có `whisperLocalExe`; `curl localhost:3000/api/creator-caption/listener/state` → `{"status":"idle",…}`; `npm test` PASS.
- [ ] **Step 9:** Commit `feat(caption): server nhận chữ từ trang nghe Edge/Chrome, gỡ đường Whisper`.

### Task 4: Trang nghe `public/listen/caption.html` + `public/listen/caption.js`

**Files:**
- Create: `public/listen/caption.html`, `public/listen/caption.js` (`<script type="module">` import `/lib/caption-speech.mjs`)

**Interfaces:**
- Consumes: Task 1 (`createResultTracker`, `restartDelay`, `isFatalError`, `createPartialThrottle`); Task 3 socket events.
- Produces: emit `creatorCaption:listener { state: 'starting'|'listening'|'idle'|'error', browser, lang, micLabel, error? }` (mỗi chuyển trạng thái + nhịp 5s), `creatorCaption:partial { text }`, `creatorCaption:speech { text, sourceLang }`.

- [ ] **Step 1:** HTML: nền `#0f1218`, chữ `#e6e8ee`, cỡ chữ 14px; khối: tiêu đề `🎙️ HP Phụ đề giọng` + `#browser` + `#lang`; `#mic` (micro đang dùng + link `edge://settings/content/microphone`/`chrome://…` hiện theo `?browser`); `#interim` (chữ tạm, xám nghiêng, 18px); `#last` (câu cuối, trắng); `#status`; nút `#btn-stop` (DỪNG) và `#btn-start` (🎙 BẮT ĐẦU, ẩn mặc định). Không có `SpeechRecognition` → `#status` đỏ "Trình duyệt này không hỗ trợ nhận diện giọng. Hãy mở bằng Edge hoặc Chrome." + emit `error: 'unsupported'`.
- [ ] **Step 2:** JS: `io()`; `socket.on('creatorCaption:config', cfg)` → lưu `cfg.sourceLang`; đang nghe mà lang đổi → `abort()` (đánh dấu `langSwitch = true` để không tính lỗi) rồi start lại. `startListening()`: tạo recognizer một lần (`continuous`, `interimResults`, `maxAlternatives = 1`), set `lang`, `tracker.newSession()`, `start()`, state `starting`; `onstart` → `listening`, `micLabel` qua `enumerateDevices()` (nhãn `audioinput` đầu tiên có label); `onresult` → tracker → emit finals (`speech`) + `partial ''` sau final, partial qua throttle; `onerror` → ghi `lastError`, `network` tăng `networkErrors`; `onend` → nếu `!active` → `idle`; nếu `langSwitch` → start ngay; else `d = restartDelay({ reason: lastError, hadResults, emptySessions, networkErrors })`; `-1` → state `error` + hiện `#btn-start`; else `setTimeout(startListening, d)` và `#status` "Bật lại sau Ns". Có kết quả → reset `emptySessions`, `networkErrors`. `socket.on('creatorCaption:listener:stop')` → `active=false; abort(); emit idle; window.close()`. `socket.on('creatorCaption:listener:start')` → reset bộ đếm, `startListening()`. Heartbeat `setInterval(report, 5000)`. Nút DỪNG = như lệnh stop; nút BẮT ĐẦU = như lệnh start. Tự gọi `startListening()` sau khi socket `connect` lần đầu.
- [ ] **Step 3: Kiểm tra tay:** mở `http://localhost:3000/listen/caption?browser=edge` trong Edge thật → cho phép micro → nói "xin chào cả nhà" → `GET /api/creator-caption/listener/state` → `status: 'listening'`, `micLabel` có tên; server log/`creatorCaption:line` có bản dịch (bật `enabled` trước qua POST config). Tắt mạng 10s → trang hiện "Bật lại sau…" rồi tự hồi.
- [ ] **Step 4:** Commit `feat(caption): trang nghe /listen/caption cho Edge/Chrome`.

### Task 5: Overlay — dòng chữ tạm + kiểu "Phụ đề"

**Files:**
- Modify (ghi lại toàn bộ, LF): `public/overlay/creator-caption.html`

**Interfaces:**
- Consumes: `creatorCaption:partial {text}`, `creatorCaption:line {… style}`, `creatorCaption:config {style, showInterim, showOriginal, maxItems, holdSeconds}`.

- [ ] **Step 1:** Thêm `#interim` dưới `#wrap` (căn giữa, `clamp(18px, 1.8vw, 28px)`, màu `#d3d3d3` nghiêng, viền đen như `.subtitle`, `::after` "…" nhấp nháy `steps(3)` 1.2s); `partial.text` rỗng hoặc `config.showInterim === false` → ẩn; có text → hiện, đặt lại timer ẩn 8s.
- [ ] **Step 2:** Thêm CSS `body.style-subtitle`: `.line` không nền/viền/blur/bo góc, `.route` ẩn, `.lang-label` ẩn, `.translated` 36px đậm trắng `text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 0 6px rgba(0,0,0,.6)`, không karaoke (`.word` opacity 1, animation none), `.original` 24px nghiêng `#d3d3d3` bọc trong ngoặc `(…)`. Áp class theo `item.style || config.style`.
- [ ] **Step 3: Kiểm tra tay:** mở overlay trong trình duyệt, `curl -X POST /api/creator-caption/test` với style `card` rồi `subtitle` (đổi qua POST config) → ảnh chụp 2 kiểu; emit partial thử qua trang nghe → dòng tạm hiện rồi biến mất khi final tới.
- [ ] **Step 4:** Commit `feat(caption): overlay hiện chữ đang nói + kiểu Phụ đề`.

### Task 6: Popup trong app

**Files:**
- Modify: `public/index.html:2361-2428`, `public/app.js` (hằng DOM 3469–3514, hàm 3522–3548, 3760–3802, 3803–3805, 3877–4205, wiring 4226–4275), `public/style.css:1723-1771` (xoá `.cc-wave*`; giữ `.cc-transcript*`).

**Interfaces:**
- Consumes: Task 3 route + `creatorCaption:listenerState`, `creatorCaption:partial`, `creatorCaption:line`, `creatorCaption:config`.

- [ ] **Step 1: index.html:** xoá 2 hàng Whisper, hàng Micro + nút ✓, `#cc-wave`, hàng "Dừng nói sau". Thêm sau "Creator nói": hàng `Nghe bằng` `<select id="cc-browser">` (`edge` "Edge (có sẵn trên Windows)", `chrome` "Chrome"); hàng `Kiểu overlay` `<select id="cc-style">` (`card` "Thẻ", `subtitle` "Phụ đề"); `<label class="translate-check"><input type="checkbox" id="cc-interim" checked /> Hiện chữ đang nói trên OBS</label>`. Thêm `<div id="cc-listener" class="translate-status"></div>` ngay dưới 2 nút đầu. Ô transcript: mặc định "Bấm BẮT ĐẦU NGHE — cửa sổ Edge nhỏ sẽ mở, cho phép micro rồi nói."
- [ ] **Step 2: app.js:** xoá hằng/biến/hàm thu âm (`ccWhisper*`, `ccMic`, `btnCcMicTest`, `ccWave`, `ccSilence*`, `creatorCaptionRecognition…creatorCaptionLastSkipNoticeAt`, `getSpeechRecognitionCtor`, `flushCreatorCaptionBuffer`, `scheduleCreatorCaptionFlush`, `refreshCreatorCaptionMicrophones`, `resetCreatorCaptionWave`, `stop/startCreatorCaptionMicMonitor`, `testCreatorCaptionMicrophone`, `blobToBase64`, `encodeWavFromAudioBuffer`, `analyzeCreatorCaptionAudio`, `convertBlobToWav`, `sendCreatorCaptionAudio`, `start/stopCreatorCaptionLocalRecorder`, `scheduleCreatorCaptionNoResultCheck`, `updateCreatorCaptionProviderUi`, wiring `ccSilence/ccWhisper*/btnCcMicTest`). Thêm hằng `ccBrowser`, `ccStyle`, `ccInterim`, `ccListener`; biến `captionListenerState = { status: 'idle' }`.
- [ ] **Step 3: app.js:** `applyCreatorCaptionConfig` đọc `browser/style/showInterim`; `saveCreatorCaptionConfig` gửi `browser, style, showInterim`, bỏ whisper/silence; `getSelectedCreatorCaptionTargets` giữ. Giới hạn 5: trong listener `change` của `ccTargets`, nếu đã có 5 tick và tick thêm → bỏ tick + `setCreatorCaptionStatus('Tối đa 5 ngôn ngữ dịch cùng lúc', 'err')`.
- [ ] **Step 4: app.js:** `startCreatorCaptionListening()` = tick `ccEnabled`, `saveCreatorCaptionConfig()`, `POST /api/creator-caption/listener/open {browser}`; lỗi 404 → status `browser_not_found`. `stopCreatorCaptionListening()` = `POST .../listener/stop`. `renderCaptionListenerState(s)`: nút `BẮT ĐẦU NGHE`/`DỪNG NGHE` + class `listening` theo `status ∈ {opening, listening}`; `#cc-listener` text theo bảng spec mục 5 (`opening`, `listening` + `micLabel`, `idle` sau khi từng nghe → "Cửa sổ nghe đã đóng", `error` theo mã `browser_not_found | listener_timeout | not-allowed | network | unsupported | <khác>`), class `ok/err`. `socket.on('creatorCaption:listenerState', renderCaptionListenerState)`; `socket.on('creatorCaption:partial', …)` → transcript "Đang nói: …" (pending); `socket.on('creatorCaption:line', item)` → transcript `Đã nhận: <originalText>\n→ <translations.map(t => t.targetLangLabel + ': ' + t.translatedText).join('\n')>` (ok). Khi mở popup/view gọi `GET /api/creator-caption/listener/state` để vẽ ngay.
- [ ] **Step 5: style.css:** xoá `.cc-wave`, `.cc-wave span`, `.cc-wave.listening span`.
- [ ] **Step 6: Kiểm tra:** `grep -n -i "whisper\|cc-wave\|cc-mic\|cc-silence" public/app.js public/index.html public/style.css` → rỗng; `node --check public/app.js`; mở app (Electron hoặc trình duyệt `localhost:3000`) → Dịch Thuật LIVE → BẮT ĐẦU NGHE → Edge mở → trạng thái đổi `Đang mở Edge… → 🎙 Đang nghe trong Edge · micro: …`; nói → transcript hiện chữ tạm rồi câu dịch; DỪNG NGHE → cửa sổ Edge đóng; mở lại rồi tự đóng cửa sổ Edge → "Cửa sổ nghe đã đóng".
- [ ] **Step 7:** Commit `feat(caption): popup điều khiển cửa sổ nghe Edge/Chrome, bỏ phần thu âm cũ`.

### Task 7: Kiểm thử toàn luồng, ghi chú, dọn

- [ ] **Step 1:** `npm test` PASS toàn bộ.
- [ ] **Step 2:** Thử tay theo bảng "Luồng lỗi & khôi phục" của spec: Chrome thay Edge; đổi "Creator nói" sang `en-US` khi đang nghe → trang nghe đổi ngôn ngữ; tắt server (Ctrl+C) → cửa sổ Edge đóng; kiểu Thẻ/Phụ đề trong OBS 1080×1920 với 3 ngôn ngữ.
- [ ] **Step 3:** CLAUDE.md "Kiến trúc nhanh": thêm 1 dòng về trang nghe `/listen/caption` (Edge/Chrome `--app`, profile `<data>/caption-listener/`) + lib/test tương ứng.
- [ ] **Step 4:** Commit `docs: CLAUDE.md — Phụ đề giọng Creator nghe bằng Edge/Chrome`.
