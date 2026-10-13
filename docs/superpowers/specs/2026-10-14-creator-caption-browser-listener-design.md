# 🎙️ Phụ đề giọng Creator — nghe realtime bằng Edge/Chrome, dịch nhiều ngôn ngữ

- Ngày: 14/10/2026 · Trạng thái: thiết kế đã duyệt trong chat, chờ duyệt spec
- Liên quan: Dịch Thuật LIVE (`public/app.js` khối `creatorCaption*`, `public/index.html` popup
  `#creator-caption-popup`), overlay `public/overlay/creator-caption.html`, server `server.js`
  (`DEFAULT_CREATOR_CAPTION_CONFIG`, `sanitizeCreatorCaptionConfig`, `processCreatorCaptionSpeech`,
  `translateTextToTarget`, route `/api/creator-caption/*`), socket tin cậy `socketIsTrusted()/requestIsTrusted()`

## Mục tiêu

Streamer nói → chữ hiện **ngay khi đang nói** trên OBS, câu xong thì có **bản dịch ra tối đa 5 ngôn ngữ**
(như tính năng "Chuyển giọng nói thành văn bản" của GGTT), chạy thật với mọi khách, không đụng DLL của
Microsoft hay key của người khác.

Thành công khi: bấm BẮT ĐẦU NGHE trong app → một cửa sổ Edge nhỏ tự mở, cho phép micro một lần → nói
tiếng Việt thì overlay `/overlay/creator-caption` (link cũ, không đổi) hiện chữ tạm trong < 1 giây và câu
dịch trong ~1–3 giây sau khi ngừng nói; tắt app thì cửa sổ Edge tự đóng.

## Hiện trạng (kiểm tra 14/10/2026)

- Tính năng đã có từ v1.0.54: popup "🎙️ Phụ đề giọng Creator" trong Dịch Thuật LIVE, 17 ngôn ngữ đích,
  "tự bật ngôn ngữ theo người xem đang chat", overlay thẻ kính chữ chạy từng từ. **Phần dịch, overlay,
  lưu cấu hình dùng lại được.**
- **Phần nghe đang hỏng:** v1.0.54 dùng nhận diện giọng của Chromium → thất bại trong Electron (Electron
  không có khóa dịch vụ của Google) → đổi sang Whisper local (`whisper-cli.exe` + `ggml-base.bin`). File
  model **không có** trong repo, project gốc lẫn bản cài → bấm BẮT ĐẦU NGHE là `missing_whisper_local_model`.
  Kể cả có model: thu từng khúc 3s rồi mới nhận → trễ 4–8s, cắt giữa câu, không có chữ tạm.
- GGTT nghe bằng `webkitSpeechRecognition` trong WebView2 nhờ chép thành phần Speech của Edge vào runtime
  riêng; dịch bằng Google Translate v2 với key của họ. Không chép cách này.

## Quyết định đã chốt (chat 14/10/2026)

1. **Tai nghe = trang web mở trong Edge (mặc định) hoặc Chrome**, dùng nhận diện giọng có sẵn của trình
   duyệt (miễn phí, tiếng Việt tốt, có chữ tạm). Không mở "trình duyệt mặc định" (máy khách có thể là Cốc
   Cốc/Firefox — không nghe được); gọi đích danh exe.
2. **Bỏ hẳn đường Whisper** (route, hàm, giao diện). Cần thì lấy lại từ git.
3. **Dịch giữ `translateTextToTarget()`** hiện có (Google gtx + MyMemory dự phòng, đã chạy thật với dịch
   bình luận). Không thêm nhà cung cấp mới.
4. **Không khoá theo gói key** — mọi key nghe + dịch tối đa 5 ngôn ngữ.
5. Giữ link OBS cũ `/overlay/creator-caption`; kiểu overlay mặc định giữ nguyên "Thẻ", thêm kiểu "Phụ đề".

## Kiến trúc & luồng

```
[App HP] BẮT ĐẦU NGHE
   └─ POST /api/creator-caption/listener/open
        └─ server tìm msedge.exe/chrome.exe → spawn --app=<URL> --user-data-dir=<profile HP>
             └─ trang /listen/caption ──socket.io (loopback = tin cậy)──▶ server
                   creatorCaption:partial  {text}  → phát lại cho overlay + popup (không dịch)
                   creatorCaption:speech   {text}  → processCreatorCaptionSpeech → dịch → creatorCaption:line
                   creatorCaption:listener {state} → lưu + phát creatorCaption:listenerState cho popup
```

- Profile riêng `<DATA_DIR>/caption-listener/<edge|chrome>` → quyền micro xin **một lần**, không đụng
  Edge/Chrome cá nhân của streamer.
- Server dùng `appConfig.creatorCaption.targetLangs` khi dịch; trang nghe không biết gì về dịch.
  Popup đã tự lưu cấu hình khi "tự bật theo người xem" bật/tắt ngôn ngữ (`saveCreatorCaptionConfigSilent`),
  nên luồng này giữ nguyên.
- Mọi event từ trang nghe chỉ nhận qua `onTrusted` (socket loopback hoặc LAN có token) — như timer/levelquest.

## Thành phần

### 1. `public/lib/caption-speech.mjs` (thuần, test bằng node)

- `createResultTracker()` → `{ newSession(), onResult(ev) }`. `onResult` nhận object kiểu
  `SpeechRecognitionEvent` (`resultIndex`, `results[i] = { isFinal, 0: { transcript } }`), trả
  `{ partial: string, finals: string[] }`:
  - `finals` = transcript của các result `isFinal` **chưa phát** trong phiên (theo chỉ số), đã `trim()`
    + gộp khoảng trắng; rỗng thì bỏ.
  - `partial` = nối transcript các result chưa final kể từ `resultIndex`, `trim()`; `''` nếu không có.
  - `newSession()` xoá bộ nhớ chỉ số (Chromium đánh số lại sau mỗi `start()`).
- `restartDelay({ reason, hadResults, emptySessions, networkErrors })` → ms hoặc `-1` (không bật lại):
  - `not-allowed`, `service-not-allowed`, `audio-capture`, `language-not-supported` → `-1`.
  - `network` → `min(30000, 1000 × 2^(networkErrors−1))`; `networkErrors > 5` → `-1`.
  - `no-speech` → `0`.
  - còn lại (`end` tự nhiên, `aborted`): `hadResults` → `300`; không → `min(5000, 500 × max(1, emptySessions))`.
- `createPartialThrottle(intervalMs, now)` → `push(text)` trả `text` nếu được gửi ngay, `null` nếu bị giữ;
  `flush()` trả text đang giữ. Khoảng cách tối thiểu 100ms giữa 2 lần gửi; text trùng text đã gửi → `null`.
- `isFatalError(reason)` = `restartDelay` trả `-1`.

### 2. Trang nghe `public/listen/caption.html` + `caption.js`

- Mở qua `GET /listen/caption`; đọc `?browser=edge|chrome` để hiển thị. Nối `io()` cùng origin.
- Khi nối socket xong: emit `creatorCaption:listener { state: 'starting', browser, lang }`, lấy cấu hình
  (`creatorCaption:config` server gửi ngay khi connect), tạo `SpeechRecognition`:
  `continuous = true`, `interimResults = true`, `maxAlternatives = 1`, `lang = cfg.sourceLang` (mặc định
  `vi-VN`), rồi `start()`.
- Sự kiện:
  - `onresult` → `tracker.onResult(ev)`; mỗi `finals[i]` → emit `creatorCaption:speech { text, sourceLang: lang }`;
    `partial` → qua throttle → emit `creatorCaption:partial { text }`; sau final emit `creatorCaption:partial { text: '' }`
    để overlay xoá dòng tạm.
  - `onerror` → ghi `reason = ev.error`; `network` thì `networkErrors++`.
  - `onend` → `delay = restartDelay(...)`; `-1` → state `error` kèm `error` (chuỗi mã + hướng dẫn);
    ngược lại `setTimeout(start, delay)`, `tracker.newSession()`. Có kết quả trong phiên → reset
    `emptySessions`, `networkErrors`.
  - Nhận `creatorCaption:config` với `sourceLang` khác → `abort()` rồi start lại với lang mới (không tính lỗi).
  - Nhận `creatorCaption:listener:stop` → `active = false`, `abort()`, emit `state: 'idle'`, `window.close()`
    (cửa sổ `--app` mở mới có lịch sử 1 trang nên đóng được).
  - Nhận `creatorCaption:listener:start` → nếu đang `idle/error` thì start lại (reset bộ đếm lỗi).
- Giao diện (tối giản, cỡ cửa sổ ~460×340, nền tối):
  - Tiêu đề "🎙️ HP Phụ đề giọng" + tên trình duyệt + ngôn ngữ nghe.
  - Micro đang dùng: sau khi được cấp quyền, `enumerateDevices()` → nhãn thiết bị `audioinput` mặc định
    (Web Speech API luôn dùng micro mặc định của hệ thống; không chọn được từng thiết bị). Kèm link
    `edge://settings/content/microphone` / `chrome://settings/content/microphone` để đổi.
  - Dòng chữ tạm (đang nói), câu cuối đã gửi, trạng thái (Đang nghe / Mất mạng, thử lại sau Ns / Chưa cho
    phép micro…).
  - Nút **DỪNG** (= như server gửi stop) và nút **🎙 BẮT ĐẦU** chỉ hiện khi `error`/`idle` (trình duyệt
    chặn tự bật, hoặc `not-allowed`).
  - Không có `SpeechRecognition` (mở nhầm trình duyệt) → chữ đỏ "Trình duyệt này không hỗ trợ nhận diện
    giọng. Hãy mở bằng Edge hoặc Chrome." + emit `state: 'error', error: 'unsupported'`.
- Nhịp tim: emit `creatorCaption:listener` mỗi 5s với `{ state, browser, lang, micLabel }` (server dùng để
  biết trang còn sống kể cả khi socket chưa kịp ngắt).

### 3. `lib/caption-listener.js` (thuần, test bằng node)

- `resolveBrowserExe(preferred, { exists, env, regQuery })` → `{ browser, exe, fallback }` hoặc `null`:
  thử `preferred` trước, không có thì thử trình duyệt kia (`fallback: true`). Mỗi trình duyệt: đường dẫn
  chuẩn → registry `App Paths`.
  - Edge: `%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe`, `%ProgramFiles%\Microsoft\Edge\Application\msedge.exe`,
    `%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe`, rồi `HKLM/HKCU\...\App Paths\msedge.exe`.
  - Chrome: `%ProgramFiles%\Google\Chrome\Application\chrome.exe`, `%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe`,
    `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`, rồi `App Paths\chrome.exe`.
- `buildLaunchArgs({ url, profileDir })` →
  `['--app=' + url, '--user-data-dir=' + profileDir, '--no-first-run', '--no-default-browser-check',
  '--disable-sync', '--disable-features=TranslateUI', '--window-size=460,340']`.
- `createListenerState({ now, connectTimeoutMs = 15000, onChange })` — máy trạng thái phía server:
  - snapshot `{ status: 'idle'|'opening'|'listening'|'error', browser, lang, micLabel, error, openedAt, socketId, updatedAt }`.
  - `open({ browser })` → nếu đang `listening` thì trả snapshot (không mở thêm); nếu có `socketId` đang
    nối mà `idle/error` → trả `{ action: 'start' }` (server emit start cho trang); ngược lại → `status: 'opening'`,
    trả `{ action: 'spawn' }`; sau `connectTimeoutMs` không có `attach` → `status: 'error', error: 'listener_timeout'`.
  - `attach(socketId)`, `report(socketId, { state, browser, lang, micLabel, error })` (state của trang ánh xạ:
    `starting/listening` → `listening`, `idle` → `idle`, `error` → `error`), `detach(socketId)` → `idle`
    (chỉ khi đúng socket đang giữ).
  - `stop()` → `status: 'idle'`, trả `{ action: 'stop', socketId }`.
  - Mọi thay đổi gọi `onChange(snapshot)`.

### 4. Server (`server.js`)

- Route:
  - `GET /listen/caption` → `public/listen/caption.html`.
  - `POST /api/creator-caption/listener/open` body `{ browser? }` — chỉ `requestIsTrusted(req)` (403 nếu
    không). Lưu `browser` vào cấu hình nếu có. `state.open()`:
    `spawn` → `resolveBrowserExe` (null → 404 `{ ok:false, error:'browser_not_found' }`), tạo thư mục
    profile, `spawn(exe, args, { detached: true, stdio: 'ignore' }).unref()`;
    `start` → `io.to(socketId).emit('creatorCaption:listener:start')`. Trả `{ ok:true, state }`.
  - `POST /api/creator-caption/listener/stop` → `state.stop()` → emit `creatorCaption:listener:stop` tới
    socket đang giữ (không có thì `io.emit`), trả `{ ok:true, state }`.
  - `GET /api/creator-caption/listener/state` → snapshot.
  - **Gỡ** `POST /api/creator-caption/transcribe`.
- Socket (trong `io.on('connection')`):
  - `onTrusted('creatorCaption:listener', p)` → `state.attach(socket.id)` lần đầu, rồi `state.report(...)`.
  - `onTrusted('creatorCaption:partial', p)` → `io.emit('creatorCaption:partial', { text: String(p.text||'').slice(0, 300), ts })`.
    Chỉ khi `appConfig.creatorCaption.enabled`.
  - `creatorCaption:speech` giữ handler cũ; `processCreatorCaptionSpeech` bỏ `payload.targetLangs`, giữ
    `payload.sourceLang`.
  - `socket.on('disconnect')` → `state.detach(socket.id)`.
  - `onChange` → `io.emit('creatorCaption:listenerState', snapshot)`; socket mới connect nhận snapshot ngay.
  - Khi connect gửi `creatorCaption:config` như cũ (trang nghe cần `sourceLang`).
- `processCreatorCaptionSpeech`: giữ kiểm tra `enabled`, cắt 450 ký tự, chống trùng 30s, dịch song song theo
  `cfg.targetLangs`, `creatorCaption:line` như cũ (thêm `style` từ cấu hình vào payload). **Gỡ**
  `isLikelyWhisperHallucination`, `validateCreatorCaptionAudioMetrics`, `transcribeCreatorCaptionAudio*`,
  `runWhisperLocal`, `cleanWhisperOutput`, `resolveWhisperLocal*`.
- Cấu hình `DEFAULT_CREATOR_CAPTION_CONFIG`:
  `{ enabled: false, sourceLang: 'vi-VN', targetLang: 'en', targetLangs: ['en'], browser: 'edge',
  style: 'card', showOriginal: true, showInterim: true, maxItems: 3, holdSeconds: 12,
  autoTargetsEnabled: true, autoTargetTimeoutSeconds: 60 }`. `sanitize` xây object mới chỉ gồm các khoá
  này (khoá lạ như `whisperLocalExe`, `silenceSeconds` trong file cũ bị bỏ); `browser ∈ {edge, chrome}`,
  `style ∈ {card, subtitle}`; `targetLangs` tối đa **5**.
- Tắt app: Electron `before-quit` gọi `srv.captionListenerStop()` (server export thêm hàm này) → emit stop
  cho trang nghe trước khi thoát. `node server.js` chạy tay: `SIGINT` gọi cùng hàm rồi thoát.

### 5. Popup trong app (`public/index.html` + `public/app.js` + `public/style.css`)

- Giữ: BẮT ĐẦU NGHE/DỪNG NGHE, Test phụ đề, Link OBS, "Bật nhận giọng Creator", "Hiện cả câu gốc", chọn
  ngôn ngữ nói, lưới ngôn ngữ đích (cảnh báo + không cho tick quá 5), tự bật theo người xem + thời gian tự
  tắt, ô "Test nhận giọng".
- Bỏ: chọn micro + nút ✓ kiểm tra micro, sóng âm `#cc-wave`, thanh "Dừng nói sau", 2 hàng Whisper; toàn bộ
  JS thu âm (`startCreatorCaptionMicMonitor`, `MediaRecorder`, WAV, metrics) và CSS tương ứng.
- Thêm: chọn "Nghe bằng: Edge (có sẵn trên Windows) / Chrome"; chọn "Kiểu overlay: Thẻ / Phụ đề";
  bật/tắt "Hiện chữ đang nói trên OBS" (`showInterim`).
- Trạng thái (từ `creatorCaption:listenerState`): `opening` → "Đang mở Edge… Nếu được hỏi, hãy *Cho phép*
  micro"; `listening` → "🎙 Đang nghe trong Edge · micro: <tên>"; `idle` sau khi từng nghe → "Cửa sổ nghe
  đã đóng"; `error` → chữ đỏ theo mã: `browser_not_found` ("Không tìm thấy Edge/Chrome — cài Edge tại …"),
  `listener_timeout` ("Cửa sổ nghe chưa kết nối — bấm BẮT ĐẦU NGHE lại"), `not-allowed` ("Chưa cho phép
  micro trong Edge — mở cửa sổ nghe và bấm Cho phép"), `network` ("Nhận diện mất mạng"), `unsupported`.
- Nút: `idle/error` → "BẮT ĐẦU NGHE" (POST open); `opening/listening` → "DỪNG NGHE" (POST stop).
- Ô "Test nhận giọng": dòng chữ tạm từ `creatorCaption:partial`, câu final + bản dịch từ `creatorCaption:line`.
- Đổi `sourceLang`/ngôn ngữ đích/kiểu → lưu như cũ (`POST /api/creator-caption/config`), server phát
  `creatorCaption:config` → trang nghe và overlay tự cập nhật.

### 6. Overlay `public/overlay/creator-caption.html` (link cũ)

- Dòng **chữ tạm** `#interim`: nhận `creatorCaption:partial`; text rỗng → ẩn; có text → hiện câu gốc mờ
  (`opacity .8`) + "…" nhấp nháy; tự ẩn sau 8s không có cập nhật; ẩn khi `showInterim === false`.
  Nằm dưới cụm thẻ/phụ đề cuối.
- Kiểu `card` (mặc định) = giao diện hiện tại, không đổi.
- Kiểu `subtitle`: không nền, không nhãn tuyến; mỗi ngôn ngữ đích một dòng chữ trắng 36px đậm viền đen
  (`text-shadow` 4 hướng + bóng), câu gốc 24px nghiêng xám trong ngoặc ở dưới (khi `showOriginal`); vào/ra
  bằng mờ dần + trượt nhẹ như hiện tại. Chọn kiểu theo `item.style` (payload) hoặc `config.style`.
- `holdSeconds`, `maxItems` giữ nguyên.

## Luồng lỗi & khôi phục

| Tình huống | Xử lý |
|---|---|
| Phiên nhận diện tự kết thúc | bật lại sau 300ms (có kết quả) / 0.5–5s (không có) |
| `no-speech` | bật lại ngay |
| `network` | lùi 1→2→4→…→30s; quá 5 lần liên tiếp → `error`, popup đỏ, nút 🎙 trong trang nghe để thử lại |
| `not-allowed` | dừng, hướng dẫn cho phép micro; popup báo |
| Không tìm thấy Edge lẫn Chrome | popup `browser_not_found` + link tải Edge |
| Trình duyệt mở nhưng không nối socket trong 15s | `listener_timeout`, cho bấm lại |
| Người dùng tự đóng cửa sổ Edge | socket ngắt → `idle`, popup "Cửa sổ nghe đã đóng" |
| Bấm BẮT ĐẦU khi trang còn mở nhưng đang dừng | không mở cửa sổ mới, gửi `listener:start` |
| Dịch lỗi / quá 15s | hiện câu gốc thay bản dịch (hành vi hiện có) |
| Tắt app | gửi stop → cửa sổ Edge tự đóng |

## Kiểm thử

- `tests/caption-speech.test.mjs`: tracker (interim → partial, final đúng 1 lần, newSession đánh số lại,
  bỏ rỗng), `restartDelay` từng nhánh (bảng trên), throttle (100ms, trùng → null, flush).
- `tests/caption-listener.test.js`: `resolveBrowserExe` (ưu tiên, dự phòng, registry, không có → null),
  `buildLaunchArgs`, máy trạng thái (open→spawn, open khi listening → không spawn, open khi idle có socket →
  start, timeout 15s → error, attach/report/detach, stop).
- Thử tay (ghi trong plan): nghe thật tiếng Việt trong Edge và Chrome; overlay trong OBS kiểu Thẻ + Phụ đề,
  3 ngôn ngữ; tự đóng Edge giữa chừng; tắt app; đổi ngôn ngữ nói khi đang nghe; máy đặt Cốc Cốc làm mặc định.

## Ngoài phạm vi

Whisper offline; điều khiển game bằng giọng; "gọi AI qua micro"; khách nhập key Google dịch chính thức;
chọn micro theo thiết bị (Web Speech API không hỗ trợ).
