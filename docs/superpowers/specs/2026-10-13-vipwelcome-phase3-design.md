# VIP Welcome — Giai đoạn 3: giọng đọc, khách quen, gộp thẻ, BXH ghé phòng, phím tắt

**Ngày:** 2026-10-13 · **Nhánh:** `feature/vipwelcome-phase3` · Nền: v1.10.0 (spec `2026-10-13-vipwelcome-join-card-design.md`)

## Quyết định của người dùng
1. TTS: mẫu câu riêng theo từng bậc / luật @id; mặc định bật từ bậc Đại gia (minLevel ≥ 25); đọc SAU media của người đó, chung hàng media. Giọng: Google TTS qua `/api/live-translate/tts` (vi).
2. Khách quen: đếm theo BUỔI LIVE (roomId; thiếu roomId → ngày `YYYY-MM-DD`). Thẻ: "🎉 Lần đầu ghé phòng" / "Ghé lần thứ N" / "🔥 K buổi liền" (K ≥ 3).
3. Gộp thẻ: chỉ khi đông, chỉ bậc thấp (priority < 100 + belowTierLevel, mặc định 25 ⇒ dưới Đại gia); người chỉ định không bao giờ gộp.
4. BXH: tab panel + overlay OBS riêng `/overlay/vipwelcome-board`; xếp theo số buổi ghé; phạm vi tháng này / từ trước tới nay; cột chuỗi buổi liền.
5. Phím tắt global (Electron) tắt mặc định: Ctrl+Shift+S bỏ qua mục đang phát, Ctrl+Shift+C xoá thẻ + hàng chờ.

## Module mới (`lib/vipwelcome/`)

### visits.js — `createVisits({file, saveDelayMs})`
- Dữ liệu: `{version:1, hosts:{<host>:{ rooms:[roomId…≤400], users:{<key>:{sessions,lastRoom,firstAt,lastAt,streak,bestStreak,monthKey,monthCount,uniqueId,nickname,avatar}}}}}` (object không prototype, chặn `__proto__/constructor/prototype`).
- `startRoom(host, roomId)` — ghi roomId vào `rooms` nếu là buổi mới (idempotent).
- `record(host, key, roomId, meta, now) → {visitNo, isFirst, streak, counted}`: cùng roomId đã đếm → trả số hiện có, `counted:false`. Buổi mới: `sessions++`; streak = (buổi trước của kênh ngay trước roomId này === user.lastRoom) ? streak+1 : 1; `monthKey` = `YYYY-MM` theo `now`; đổi tháng → `monthCount=1` ngược lại `+1`.
- `peek(host, key, roomId) → {visitNo, isFirst, streak}` — số SẼ hiện nếu ghi lần ghé này (không ghi).
- `top(host, {scope:'all'|'month', limit, q}, now)`; `reset(host)`; `rekey(host, from, to)`; `flushSync()`.
- File hỏng → `.bad-<ts>`, sổ rỗng.

### batcher.js — `createBatcher({windowMs=3000, groupMs=2500, maxAvatars=3})`
- `decide(now, {priority, threshold, maxStack, enabled}) → 'single'|'batch'`: đếm thẻ gửi trong `windowMs` (`noteSent(now)`); `batch` khi enabled && priority < threshold && recentCount ≥ maxStack.
- `add(member, now) → {flushAt}` — thêm vào nhóm đang mở (mở mới nếu chưa có). `due(now) → group|null` khi `now ≥ flushAt`; group = `{members, total}`; nhóm đóng sau khi trả.
- `clear()`.

### tts-text.js — `renderTts(template, ctx) → string`
- Biến `{tên} {nickname} {bậc} {lv} {fan} {lần}`; bỏ emoji / ký tự điều khiển; gộp khoảng trắng; cắt 80 ký tự; `ctx.isEnigma` → `''`.

## Server
- `connectToUser` / kết nối lại: `visits.startRoom(host, roomId || ngày)`; `vipSessionRoomKey`.
- `vipHandleJoinSignal` (decision welcome/upgrade):
  1. `batcher.decide` → `batch`: `batcher.add({key,user(card user), match})`, đặt timer flush; KHÔNG media/TTS.
  2. `single`: card thêm `visit = visits.peek(...)` (khi `joinCard.showVisits`); media như cũ; nếu `tts` bật (bậc/luật + `joinCard.tts.enabled`) → enqueue mục `{mediaType:'tts', mediaUrl:'/api/live-translate/tts?lang=vi&text=…', volume: joinCard.tts.volume}` cùng key-suffix `|tts`, priority = match.priority − 0.5 (ngay sau media của người đó).
  3. `batcher.noteSent(now)` khi gửi thẻ riêng hoặc thẻ gộp.
- Thẻ gộp: `{id, kind:'group', keys:[…], members:[{nickname, avatar}…≤3], total, skin (bậc cao nhất), enterText}`; pendingCards dùng key `group:<id>`.
- `vipOnCardShown`: thẻ riêng → `markWelcomed` + `visits.record`; thẻ gộp → cho từng key; sau ghi → `io.to('overlay:vipwelcome-board').emit('vipwelcome:board', top)` (throttle 2s).
- Trigger mới: `skip` (overlay `vipwelcome:skip` → overlay dừng mục, báo done), `clearAll` (= stop). Hotkey bridge `global.__vipwelcomeApplyHotkeys(cfg)` gọi lúc lưu config + 1.5s sau khởi động.
- REST: `GET /api/games/vipwelcome/visits?scope&limit&q`, `POST /api/games/vipwelcome/visits {action:'reset'}`; route `/overlay/vipwelcome-board`.
- Config: `joinCard.batch {enabled:true, belowTierLevel:25}`, `joinCard.showVisits:true`, `joinCard.tts {enabled:true, volume:90}`, `joinCard.hotkeys {enabled:false, skip:'S', clear:'X'}`, `joinCard.board {title:'KHÁCH QUEN CỦA PHÒNG', scope:'month', skin:'violet', limit:10}`; tier & userRule `tts {enabled, template}` (mặc định tier minLevel ≥ 25 bật, template `'{bậc} {tên} đã tới phòng!'`; userRule join `'Chào mừng {tên} vào phòng!'` tắt).

## Overlay
- Thẻ riêng: chip visits ở `.jc-sub`. Thẻ gộp `.jc-card.jc-group`: chồng ≤3 avatar, tên "A, B và N người khác".
- Mục `tts`: phát bằng `<audio>`; watchdog như audio.
- `vipwelcome:skip` → `finish()` mục hiện tại.
- `/overlay/vipwelcome-board`: `board.html` nền trong suốt, top N, skin violet/amber, tự cập nhật.

## Panel
- Bậc + luật @id join: "🗣 Đọc tên" + mẫu câu + ▶ nghe thử (`new Audio(tts url)` trong app).
- Cài đặt: gộp khi đông, hiện lần ghé, âm lượng giọng đọc, phím tắt.
- Tab "🏆 Ghé phòng": BXH, phạm vi, tìm, copy link OBS BXH, cài đặt bảng (tiêu đề, skin, số dòng), xoá sổ (confirm).

## Test
Unit: visits, batcher, tts-text. Tích hợp: burst 10 người → thẻ riêng bậc cao + thẻ gộp; TTS sau media; visits đổi theo roomId; BXH cập nhật; skip.
