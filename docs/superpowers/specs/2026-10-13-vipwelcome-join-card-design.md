# VIP Welcome — Thẻ vào phòng + nhận diện vào/ra/vào lại tin cậy

**Ngày:** 2026-10-13 · **Nhánh:** `feature/vipwelcome-joincard` · **Phạm vi:** Giai đoạn 1 + 2 (không release, chỉ commit)

## 1. Mục tiêu

Khi người xem vào phòng LIVE, overlay OBS hiện **thẻ thông tin** giống các tool đang thịnh hành
(avatar + khung, nhãn danh hiệu, LV, FAN LV, tên, @id, 💎 tổng xu đã tặng kênh, chip vai trò) và phát
video/âm thanh đã cài. **Vào → ra → vào lại luôn hiện lại** (trừ khi người dùng tự đặt cooldown).

Tiêu chí thành công:
- VIP cấp cao / fan club (TikTok gửi qua `barrage`, không qua `member`) được chào.
- Vào lại sau 3 giây hay 5 phút đều hiện thẻ; ngồi im rồi thả tim KHÔNG bị coi là vào lại.
- Phòng đông: ai vào cũng hiện thẻ gần như ngay; media không làm trễ thẻ.
- Không mất lượt chào vì overlay chưa mở / hàng đợi đầy.

## 2. Hiện trạng (lỗi gốc)

1. `server.js` không nghe `barrage` → VIP cấp cao/fan club thường không có `member` → bị sót.
2. `maybeFireFirstSeenJoin` đoán "rời phòng" bằng im lặng ≥ `rejoinThresholdSec` (60s): vào lại < 60s
   không phát; im lặng > 60s rồi tim/chat lại phát nhầm; đánh dấu "đã chào" lúc xếp hàng chứ không lúc
   phát.
3. `payGrade.level` thường = 0 ở proto v3; `fansClub.data` có thể là club của kênh khác.
4. Overlay: audio bị chặn autoplay → kẹt 20–25s; nhãn cố định 3.5s; không preload.

## 3. Kiến trúc

Nâng cấp game `vipwelcome` tại chỗ (giữ link OBS, tự migrate config). Logic mới là module thuần,
test bằng `npm test`:

| Module | Trách nhiệm |
|---|---|
| `lib/vipwelcome/join-signals.js` | Payload TikTok → `JoinSignal`/`UserInfo` chuẩn. `fromMember`, `fromBarrage`, `readUser`. |
| `lib/vipwelcome/presence.js` | Máy trạng thái vào/ra/vào lại theo user key. Không I/O, nhận `now`. |
| `lib/vipwelcome/tier-match.js` | Bậc mặc định, migrate bậc, chọn luật cho 1 lần vào phòng. |
| `lib/vipwelcome/gift-ledger.js` | Sổ xu cộng dồn theo kênh (host) + userId, lưu đĩa (ghi trễ, atomic). |
| `lib/vipwelcome/media-queue.js` | Hàng đợi media ưu tiên, gộp theo user, hết hạn theo thời gian chờ. |

`server.js` chỉ nối dây: nghe sự kiện → gọi module → emit socket.

### 3.1 JoinSignal

```
JoinSignal = { source: 'member'|'barrage-grade'|'barrage-fans'|'barrage-enigma'|'superfan',
               user: UserInfo }
UserInfo   = { userId, uniqueId, nickname, avatar, level, fansLevel, fansClubName,
               isModerator, isSubscriber, isFriend, isFollowing, topUserNo, isEnigma, verified }
```

- `member`: mọi `action` **trừ 3** (subscribe) là vào phòng (đã thấy `action=26` khi vào thật).
- `barrage`: `msgType` 9 (GRADE_USER_ENTRANCE), 11 (FANS_LEVEL_ENTRANCE), 15 (ENIGMA_ENTRANCE), hoặc
  `content.key`/`commonBarrageContent.key` chứa `ttlive_superfan_commentnotif_superfanjoined`.
  User lấy theo thứ tự `userGradeParam.user` → `fansLevelParam.user` → `user` → `content.pieces[].userValue.user`.
  `userGradeParam.currentGrade` bổ sung LV, `fansLevelParam.currentGrade` bổ sung FAN LV.
  (Connector emit `barrage` cho mọi WebcastBarrageMessage, kể cả superFanJoin → chỉ nghe `barrage`.)
- **LV**: `badgeList[sceneType=8].privilegeLogExtra.level` → `payGrade.level` → `userHonor.level`; lấy max.
- **FAN LV**: `badgeList[sceneType=10].privilegeLogExtra.level` → `fansClubInfo.fansLevel` →
  `fansClub.data.level` (chỉ nhận khi `anchorId` rỗng hoặc = chủ phòng, và `userFansClubStatus` ≠ 0).
- Vai trò: MOD (`userAttr.isAdmin|isSuperAdmin`, `isSetToAdmin`, badge scene 1), SUB (`subscribeInfo`,
  badge 4/7), Bạn bè (`followInfo.followStatus ≥ 2`), TOP (`topUserNo` 1–3), ẩn danh (`enigmaInfo.isEnigmaMaskOn` hoặc barrage 15).

### 3.2 Presence — thuật toán vào/ra/vào lại

Key người dùng = `userId` nếu có, ngược lại `u:<uniqueId thường>` (server quy đổi uniqueId→userId qua cache sẵn có).

```
onJoinSignal(key, now, {antiDupMs, cooldownMs, source}) →
   'dup'      nếu now − lastSignalAt < antiDupMs VÀ nguồn này chưa xuất hiện trong lần vào đó
              (member + banner cấp/fan/superfan của CÙNG 1 lần vào); cùng nguồn lặp lại = vào lại thật
              (server: tín hiệu 'dup' giàu hơn được nâng thẻ nếu thẻ trước chưa hiện, không vượt cooldown)
   'cooldown' nếu cooldownMs > 0 và now − lastWelcomedAt < cooldownMs
   'welcome'  ngược lại
   (luôn ghi lastSignalAt = now trừ khi 'dup'; joinCount++)
onActivity(key, now, {lateEnabled}) →
   'late' nếu chưa từng có tín hiệu vào phòng, chưa từng được chào, chưa từng 'late' trong phiên
   null   ngược lại     (hoạt động KHÔNG BAO GIỜ là "vào lại")
markWelcomed(key, now)  — chỉ gọi khi overlay báo đã hiện thẻ
```

Mặc định: `antiDupSec = 10`, `rejoinCooldownSec = 0` (mỗi luật/bậc tự đặt), chào muộn = bật.
Không có sự kiện "rời phòng" từ TikTok — và không cần: mỗi tín hiệu vào phòng là một lần vào thật.

Reset phiên khi người dùng bấm Kết nối (như cũ) hoặc nút "Reset phiên".

### 3.3 Chọn luật (tier-match)

Thứ tự: **luật @id** (trigger `join`, khớp `userId` đã lưu hoặc `uniqueId`) > **bậc**.
Bậc khớp khi `(minLevel>0 && LV≥minLevel) || (minFans>0 && FAN≥minFans) || (minLevel≤0 && minFans≤0)`.
Nhiều bậc khớp → bậc có `minLevel` cao nhất, hoà thì `minFans` cao nhất. Duyệt mọi nhóm hồ sơ đang bật,
lấy **một** kết quả tốt nhất (1 lần vào = 1 thẻ). Luật @id không cần media (chỉ thẻ cũng được).

Bậc lưu trong từng nhóm hồ sơ: `profile.joinTiers[]`
`{ id, enabled, name, minLevel, minFans, skin, frameUrl, mediaUrl, mediaName, mediaType, volume, rejoinCooldownSec }`.

5 bậc mẫu (không media): Tân binh LV≥1|FAN≥1 `ice` (**tắt** mặc định để không đổi hành vi phòng đông) ·
Hào kiệt LV≥15|FAN≥5 `violet` · Đại gia LV≥25|FAN≥10 `amber` · Huyền thoại LV≥35|FAN≥15 `flame` ·
Chí tôn LV≥45|FAN≥20 `diamond`.

Luật @id thêm field tuỳ chọn: `userId`, `skin`, `title`, `rejoinCooldownSec`.

**Migrate:** profile chưa có `joinTiers` → tạo 5 bậc mẫu; nếu `globalJoin.enabled` có media → thêm bậc
"Tất cả user (cũ)" với `minLevel/minFans` từ globalJoin + media, skin `violet`, rồi tắt `globalJoin`
(các điều kiện requireVerified/requireFollowing… không mang sang — ghi chú trong panel).
`globalGift`, `globalSubscribe` và luật @id trigger khác `join` giữ nguyên hành vi cũ.

### 3.4 Sổ xu (gift-ledger)

`DATA_DIR/vipwelcome-ledger.json`: `{ version:1, hosts: { <hostUniqueIdLower>: { <userId|u:uid>: { xu, uniqueId, nickname, lastAt } } } }`.
Cộng `coinValue × repeatCount` cho quà `source==='tiktok'` (sau cổng combo). Ghi trễ 5s, ghi file tạm
rồi rename. File hỏng → đổi tên `.bad-<ts>` và bắt đầu rỗng (không crash). Panel xem/sửa/reset.

### 3.5 Thẻ & media — giao thức socket

Mọi emit vipwelcome mới gửi `io.to('overlay:vipwelcome')` (play cũ cũng chuyển sang room này).

| Sự kiện | Chiều | Nội dung |
|---|---|---|
| `vipwelcome:card` | S→O | `{id, user, title, skin, frameUrl, xu, late, enterText, roles}` |
| `vipwelcome:cardShown` | O→S | `{id}` → server `markWelcomed` |
| `vipwelcome:play` | S→O | media như cũ (+`preloadNext`) |
| `vipwelcome:done` | O→S | `{seq}` như cũ |

- Thẻ không xếp hàng ở server. Chưa có overlay → giữ trong `pendingCards` (≤ 60s, 1 mục/người), gửi khi
  overlay subscribe `overlay:vipwelcome`. Đã gửi mà chưa ack sau 8s → gửi lại khi có overlay mới subscribe.
- Media: `media-queue` sắp theo ưu tiên (luật @id 1000, bậc = 100 + minLevel), cùng ưu tiên theo thời gian;
  1 mục/người (vào lại thì thay); mục chờ > `mediaMaxWaitSec` (30) bị bỏ lúc lấy ra (log `expire`).
- Chào muộn: chỉ thẻ, nhãn "đã ở trong phòng", không media.

### 3.6 Overlay

- Khu thẻ: tối đa `maxStack` (3) thẻ; thẻ mới vào đáy, đẩy thẻ cũ lên (hướng `up`/`down`). Đầy → thẻ cũ
  nhất rút ngắn còn 400ms rồi ra. Mỗi thẻ hiện `durationMs` (5000). Overlay bỏ `id` đã xử lý.
- Thẻ: avatar tròn trong khung skin (hoặc PNG `frameUrl`), nhãn danh hiệu, chip `LV n`, `FAN LV n`,
  chữ "VÀO PHÒNG" (sửa được), tên lớn, `@id` nhỏ, 💎 đếm 0→xu trong 1.2s (ẩn khi 0 nếu `hideZeroXu`),
  chip MOD/SUB/TOP n/Bạn bè. Ẩn danh → "Người xem ẩn danh", avatar mặc định.
- 5 skin CSS: `violet` (tím), `ice` (xanh băng), `amber` (vàng cam), `flame` (đỏ lửa), `diamond` (kim cương).
  Mỗi skin: gradient thân thẻ, viền, màu chip, vòng khung avatar, hạt lấp lánh, ánh quét.
- Khu media giữ `display` cũ (x/y/scale) + nhãn chữ cũ cho trigger không phải `join`.
- Media: preload mục kế; watchdog = `duration + 2s` (không đọc được → 15s); `play()` bị chặn → thử muted,
  vẫn lỗi → ack ngay; dọn element sau mỗi clip.
- Avatar qua `/api/games/vipwelcome/avatar?u=<url>`: chỉ host `*.tiktokcdn.com`, `*.tiktokcdn-us.com`,
  `*.tiktokcdn-eu.com`, `*.ibyteimg.com`, `*.byteimg.com`, `*.muscdn.com`; https; ≤ 2MB; content-type
  image/*; cache đĩa `DATA_DIR/vipwelcome-avatars/<sha1>` (≤ 500 file); lỗi → ảnh mặc định SVG.

### 3.7 Cấu hình mới (cấp game)

```
joinCard: {
  enabled: true, antiDupSec: 10, lateWelcome: true, mediaMaxWaitSec: 30, hideZeroXu: true,
  enterText: 'VÀO PHÒNG', diagnostics: false,
  card: { xPercent: 3, yPercent: 60, scale: 100, maxStack: 3, direction: 'up', durationMs: 5000 }
}
```

Chẩn đoán bật → ghi payload thô `member`/`barrage` (đã cắt bớt) vào `DATA_DIR/logs/vipwelcome-raw.jsonl`
(xoay vòng ở 5MB).

## 4. Panel

- Tab mới **🏅 Bậc vào phòng** (thay tab "Tất cả user" cho phần Vào phòng; globalGift/globalSubscribe vẫn ở tab cũ).
  Mỗi bậc: bật/tắt, tên, LV≥, FAN≥, skin, khung PNG, media, âm lượng, cooldown vào lại, ▶ Thử, xoá; thêm bậc.
- Tab **👤 Người chỉ định**: thêm ô skin + danh hiệu cho luật trigger `join`.
- Tab **⚙ Cài đặt**: nhóm "Thẻ vào phòng" (vị trí, tỉ lệ, số thẻ chồng, hướng, thời gian, chữ VÀO PHÒNG,
  chống trùng, chào muộn, chờ media tối đa, ẩn 💎=0, chẩn đoán).
- Tab **💎 Sổ xu**: top 200 theo kênh đang kết nối, tìm kiếm, sửa số, reset (confirm).
- Công cụ thử (tab Bậc): giả lập 1 người (LV, FAN, ẩn danh, nguồn member/barrage), 10 người cùng lúc,
  kịch bản vào→ra→vào (đi qua đúng đường presence + tier-match như sự kiện thật).

## 5. Lỗi & biên

- Thiếu cả userId lẫn uniqueId → bỏ qua (log).
- Avatar lỗi/không phải host cho phép → ảnh mặc định.
- Ledger/raw-log ghi lỗi → log warn, tiếp tục.
- Tắt game → xoá pendingCards + media queue, emit stop.

## 6. Kiểm thử

- Unit (`tests/vipwelcome-*.test.js`): join-signals, presence, tier-match (+migrate), gift-ledger, media-queue.
- Tích hợp qua preview: giả lập → thẻ chồng ≤3, media tuần tự ưu tiên, vào lại luôn hiện, avatar lỗi, migrate config cũ.
- Thật (người dùng): bật chẩn đoán trong buổi LIVE, gửi `vipwelcome-raw.jsonl`.

## 7. Ngoài phạm vi (Giai đoạn 3)

TTS đọc tên, khách quen "lần thứ N", gộp thẻ "A, B và 5 người khác", bảng xếp hạng ghé phòng, phím tắt skip.
