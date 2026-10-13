# VIP Welcome Join Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thẻ vào phòng (LV/FAN/💎/vai trò, 5 skin) + nhận diện vào phòng qua member+barrage + thuật toán vào lại luôn phát.

**Architecture:** 5 module thuần CommonJS trong `lib/vipwelcome/` (test `node --test`), `server.js` chỉ nối dây sự kiện TikTok/socket/REST; overlay `public/games/vipwelcome/overlay.html` thêm khu thẻ song song + làm cứng media; panel thêm tab Bậc / Sổ xu / cài đặt thẻ.

**Tech Stack:** Node 24 / Electron, Express, socket.io, tiktok-live-connector 2.4.4 (proto v3), vanilla JS/CSS.

**Spec:** `docs/superpowers/specs/2026-10-13-vipwelcome-join-card-design.md`

## Global Constraints

- `server.js` dùng LF; `public/**`, `hpkey/**`, `package.json` dùng CRLF — giữ nguyên kiểu xuống dòng của file đang sửa.
- Test file phải tên `tests/*.test.js` (glob `npm test` = `tests/**/*.test.js`).
- Không release, không đổi `package.json:version`; commit trên `feature/vipwelcome-joincard`.
- Text UI tiếng Việt; CSS namespace `.vw-*` (panel) và `.jc-*` (thẻ overlay).
- Mặc định: `antiDupSec 10`, `rejoinCooldownSec 0`, `lateWelcome true`, `mediaMaxWaitSec 30`, `maxStack 3`, `durationMs 5000`, `enterText 'VÀO PHÒNG'`, pending card ≤ 60s.

## Review Focus

- Payload thiếu `user` / user rỗng / ID '0' → không crash, không thẻ trống tên (join-signals test `empty payloads`).
- Cùng 1 lần vào đến cả `member` lẫn `barrage` cách 2s → chỉ 1 thẻ (presence test `member+barrage dedupe`).
- Overlay chưa mở rồi mở sau 20s → thẻ chờ vẫn hiện; sau 70s → bỏ (server pendingCards test qua module `card-pending` trong presence test `pending expiry`).
- Ledger file JSON hỏng → khởi động bình thường, file cũ đổi tên `.bad-*` (gift-ledger test `corrupt file`).
- Config cũ chỉ có `globalJoin` bật + media → sau migrate vẫn chào người đủ cấp (tier-match test `migrate globalJoin`).

---

### Task 1: join-signals

**Files:** Create `lib/vipwelcome/join-signals.js`; Test `tests/vipwelcome-join-signals.test.js`

**Interfaces — Produces:**
- `readUser(u, ctx) -> UserInfo` với `ctx = { hostUserId }`; UserInfo như spec 3.1.
- `fromMember(data, ctx) -> JoinSignal|null` (null khi action 3 hoặc không có id nào).
- `fromBarrage(data, ctx) -> JoinSignal|null` (null khi msgType ∉ {9,11,15} và không phải superfan-joined).
- `isSubscribeMember(data) -> boolean`.

- [ ] Test: member action 1 và 26 → signal `source:'member'`; action 3 → null.
- [ ] Test: LV từ `badgeList[{sceneType:8, privilegeLogExtra:{level:'23'}}]` khi `payGrade.level=0` → 23; FAN từ `fansClub.data {level:3, anchorId:host, userFansClubStatus:1}` → 3; `anchorId` khác host → 0 (trừ khi có badge 10).
- [ ] Test: barrage msgType 9 với `userGradeParam {currentGrade:35, user}` → level 35, source `barrage-grade`; 11 với `fansLevelParam {currentGrade:12, user}` → fansLevel 12; 15 → `isEnigma:true`; content.key superfan-joined → source `superfan`; msgType 8 → null; user chỉ có trong `content.pieces[0].userValue.user` → lấy được.
- [ ] Test `empty payloads`: `fromMember({})`, `fromBarrage({msgType:9})`, id `'0'` → null, không throw.
- [ ] Test vai trò: `userAttr.isAdmin` → isModerator; `followInfo.followStatus:'2'` → isFriend; `topUserNo:2` → topUserNo 2; avatar từ `avatarThumb.url[]`.
- [ ] Implement, run `node --test tests/vipwelcome-join-signals.test.js` → PASS, commit.

### Task 2: presence + pending cards

**Files:** Create `lib/vipwelcome/presence.js`; Test `tests/vipwelcome-presence.test.js`

**Interfaces — Produces:**
- `createPresence() -> { onJoinSignal(key, now, {antiDupMs, cooldownMs}) -> 'welcome'|'dup'|'cooldown', onActivity(key, now, {lateEnabled}) -> 'late'|null, markWelcomed(key, now), get(key) -> {lastSignalAt, lastWelcomedAt, joinCount, lateFired}|undefined, reset(), size() }`
- `createPendingCards({maxAgeMs}) -> { put(card, now) (thay mục cùng card.key), take(now) -> card[] (bỏ mục quá hạn), ack(id) -> card|null, markSent(id, now), unackedOlderThan(ms, now) -> card[], clear(), size() }`

- [ ] Tests presence: lần đầu → welcome; vào lại sau 3s (antiDup 10s) → dup; sau 11s → welcome; sau 5 phút → welcome; cooldown 120s với lastWelcomed 60s trước → cooldown; `member+barrage dedupe` 2s → dup; onActivity người lạ → late một lần rồi null; onActivity sau khi có join signal → null; activity rồi im 10 phút rồi activity → null (không bao giờ là vào lại).
- [ ] Tests pending: put 2 card cùng key → size 1 (card mới); `pending expiry` take sau 61s → []; ack trả card và xoá.
- [ ] Implement, run tests → PASS, commit.

### Task 3: tier-match (+ defaults + migrate)

**Files:** Create `lib/vipwelcome/tier-match.js`; Test `tests/vipwelcome-tier-match.test.js`

**Interfaces — Produces:**
- `SKINS = ['violet','ice','amber','flame','diamond']`
- `makeDefaultTiers() -> Tier[]` (5 bậc theo spec 3.3, Tân binh `enabled:false`).
- `makeDefaultJoinCard() -> joinCard` (spec 3.7).
- `migrateJoinConfig(cfg) -> cfg` (mutates+returns; idempotent; thêm `joinCard`, `profile.joinTiers`, chuyển globalJoin).
- `matchJoin(cfg, user) -> { kind:'user'|'tier', profileId, ruleId, title, skin, frameUrl, media|null, cooldownSec, priority } | null`

- [ ] Tests: LV 23 FAN 0 → "Hào kiệt"; LV 0 FAN 12 → "Đại gia"; LV 40 FAN 25 → "Chí tôn"; LV 5 (Tân binh tắt) → null; luật @id `uniqueId:'@Abc'` khớp user `abc` trước bậc, priority 1000; luật lưu `userId:'77'` khớp user đổi @id; bậc 0/0 bắt tất cả; profile tắt bị bỏ qua.
- [ ] Test `migrate globalJoin`: profile cũ `{globalJoin:{enabled:true,mediaUrl:'/a.mp4',minLevel:30,minFansLevel:0}}` → joinTiers có bậc "Tất cả user (cũ)" minLevel 30 media '/a.mp4', globalJoin.enabled false; chạy migrate 2 lần không nhân đôi bậc.
- [ ] Implement, run → PASS, commit.

### Task 4: gift-ledger + media-queue

**Files:** Create `lib/vipwelcome/gift-ledger.js`, `lib/vipwelcome/media-queue.js`; Tests `tests/vipwelcome-ledger.test.js`, `tests/vipwelcome-media-queue.test.js`

**Interfaces — Produces:**
- `createGiftLedger({file, saveDelayMs=5000}) -> { add(host, key, xu, meta{uniqueId,nickname}), get(host, key) -> number, list(host, {q, limit}) -> [{key, xu, uniqueId, nickname, lastAt}], set(host, key, xu), reset(host), flushSync(), rekey(host, fromKey, toKey) }`
- `createMediaQueue() -> { push(item{key, priority, ts, payload}), next(now, maxWaitMs) -> {item, expired: item[]}, size(), clear(), list() }` — 1 mục/key (push cùng key thay mục cũ, giữ ts mới).

- [ ] Ledger tests (thư mục tmp `fs.mkdtempSync`): add 2 lần cộng dồn; host khác tách biệt; flushSync rồi tạo ledger mới đọc lại đúng; `corrupt file` → get=0, có file `.bad-`; list sắp giảm dần + lọc q theo uniqueId/nickname; set/reset.
- [ ] Queue tests: ưu tiên cao ra trước; cùng ưu tiên theo ts; push cùng key thay mục; next với mục quá maxWait → nằm trong expired, trả mục kế.
- [ ] Implement, run → PASS, commit.

### Task 5: server wiring

**Files:** Modify `server.js` (khối config defaults ~464-526, migrate ~1023, TikTok handlers ~2787-2973, emitGift ~3780, khối VIP ~8474-9283, socket ~10024/10205)

**Interfaces — Consumes:** Task 1–4. **Produces:** socket `vipwelcome:card|cardShown`, REST:
`POST /api/games/vipwelcome/simulate {mode:'one'|'burst'|'rejoin', level, fansLevel, enigma, source}`,
`GET /api/games/vipwelcome/ledger?q=&limit=`, `POST /api/games/vipwelcome/ledger {action:'set'|'reset', key, xu}`,
`GET /api/games/vipwelcome/avatar?u=`, `POST /api/games/vipwelcome/upload` chấp nhận thêm `png`.

- [ ] `makeDefaultVipWelcomeConfig` thêm `joinCard`; profile mặc định thêm `joinTiers`; `migrateVipWelcomeConfig` gọi `migrateJoinConfig` cuối hàm (cả 2 nhánh).
- [ ] Hàm `vipJoinPipeline(signal)`: chẩn đoán log → key → `matchJoin` → `presence.onJoinSignal` → nếu welcome: dựng card (xu từ ledger), `pendingCards.put`, gửi nếu có overlay; media → `mediaQueue.push` + drain. `vipActivity(user)` cho chat/like/social/follow/share/envelope/roomUser/gift: `onActivity` → late card.
- [ ] MEMBER: `fromMember` → pipeline (bỏ `maybeFireFirstSeenJoin`); thêm `conn.on(WebcastEvent.BARRAGE)` → `fromBarrage` → pipeline. Xoá cơ chế seq drop-out/time rejoin + `rejoinThresholdSec` khỏi đường join.
- [ ] Drain media mới thay `vipWelcomeQueue` cho join (non-join trigger vẫn dùng enqueue cũ nhưng đi qua cùng mediaQueue với priority cũ: userRule 500, global 50); emit tới room `overlay:vipwelcome`.
- [ ] `emitGift`: `source==='tiktok'` → `ledger.add(host, key, coinValue*repeat)`.
- [ ] Socket: `vipwelcome:cardShown` → `pendingCards.ack` → `presence.markWelcomed`; subscribe `overlay:vipwelcome` → gửi lại `pendingCards.take()` + unacked > 8s.
- [ ] Avatar proxy (whitelist host, https, ≤2MB, image/*, cache sha1, cap 500) + SVG mặc định.
- [ ] `user-status` dùng presence (status `inRoom` khi có lastSignalAt, `welcomed` count); trigger `resetSession` reset presence + pending + media queue.
- [ ] Run `node -e "require('./server.js')"`-free check: `node --check server.js`; `npm test` → PASS; commit.

### Task 6: overlay

**Files:** Modify `public/games/vipwelcome/overlay.html`; Create `public/games/vipwelcome/joincard.css`

- [ ] Khu thẻ `#jc-stack` (vị trí/tỉ lệ theo `joinCard.card`), render thẻ theo spec 3.6, 5 skin, đếm 💎, chip, ẩn danh, frame PNG, ack `vipwelcome:cardShown` khi thẻ vào DOM, bỏ id trùng, maxStack + rút ngắn thẻ cũ.
- [ ] Media: preload mục kế (`preloadNext`), watchdog duration+2s/15s có ack, play bị chặn → muted → ack, `vipwelcome:play` chỉ media (nhãn cũ chỉ khi `eventType!=='join'`).
- [ ] Verify bằng preview: simulate one/burst/rejoin; screenshot; commit.

### Task 7: panel

**Files:** Modify `public/games/vipwelcome/vipwelcome-panel.js`, `public/games/vipwelcome/game.js`, `public/index.html` (section view-vipwelcome), `public/style.css`

- [ ] Tab "🏅 Bậc vào phòng" (CRUD bậc, upload media + PNG khung, ▶ Thử = simulate với LV/FAN của bậc, công cụ giả lập one/burst/rejoin).
- [ ] Luật @id trigger join: chọn skin + danh hiệu.
- [ ] Cài đặt "Thẻ vào phòng" (spec 4). Tab "💎 Sổ xu".
- [ ] `game.js` defaultConfig/newProfile thêm joinCard/joinTiers (khớp server).
- [ ] Verify preview: thêm/sửa bậc lưu được, simulate chạy; commit.

### Task 8: Review toàn nhánh

- [ ] `npm test` PASS; fresh reviewer agent đọc diff `git diff 30f8d42..HEAD`; sửa phát hiện; commit.
