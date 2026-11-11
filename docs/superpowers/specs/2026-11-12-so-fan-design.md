# 📒 Sổ Fan xuyên buổi — thiết kế

Ngày 12/11/2026 · nhánh `claude/so-fan-f10251` (tách từ `release-v1.26.0-clean`) · game `vipwelcome`.

## 1. Mục tiêu

Nhớ từng người xem qua nhiều buổi LIVE **theo từng kênh** (tổng xu, số buổi ghé, lần cuối gặp, cấp đội fan)
rồi chia **bậc fan** — dùng cho 🎉 Chào Mừng VIP: 1 huy hiệu trên thanh/thẻ chào + câu đọc riêng theo bậc.

Quyết định đã chốt:
- **Một huy hiệu duy nhất** — bậc ưu tiên cao nhất người đó đạt (thanh chào giữ gọn như hiện nay).
- **5 bậc**, thứ tự cố định, mốc sửa được trong panel.
- **Kiểu chào theo bậc = huy hiệu + câu đọc TTS riêng** (bật/tắt từng bậc). Màu thanh vẫn theo cấp TikTok như cũ.
- **Dùng chung sổ đã có**, không đẻ kho mới.

## 2. Dùng lại sổ nào

| Dữ liệu | Nguồn (đã có) | Thêm gì |
|---|---|---|
| Tổng xu | `lib/vipwelcome/gift-ledger.js` → `<DATA_DIR>/vipwelcome-ledger.json` (quà thật, mọi buổi) | không |
| Số buổi, chuỗi, lần cuối gặp | `lib/vipwelcome/visits.js` → `<DATA_DIR>/vipwelcome-visits.json` | `prevAt` (lần gặp trước buổi này), `fansLevel` (cấp đội fan gần nhất), `list()` |
| Cấp đội fan lúc vào | sự kiện TikTok (`user.fansLevel`, đã kiểm đúng chủ phòng ở `join-signals.js`) | ghi vào sổ ghé |

Không gộp với bộ đếm Creator Online (`lib/creatoronline-fans.js`): bộ đó chỉ ghi khi game Creator Online bật + có
overlay, mang khái niệm club G1–G5 riêng, và không tách theo kênh. Hai sổ của vipwelcome đã cùng khoá (`vipUserKey`:
userId, hoặc `u:<@id>` rồi `rekey` khi biết userId) và cùng tách theo kênh (`vipHostKey`).

Giới hạn giữ nguyên: sổ ghé chỉ ghi người **đã được chào** (overlay xác nhận thẻ đã hiện). Người không khớp bậc/luật
nào thì không vào sổ ghé — tránh phình file khi phòng đông. Bậc fan có `forceGreet` (mục 4) giúp khách sộp/lâu
ngày/fan cứng vẫn được chào dù cấp TikTok thấp.

## 3. Bậc fan

Logic thuần `lib/vipwelcome/fan-tiers.js` (test `tests/vipwelcome-fan-tiers.test.js`). Thứ tự ưu tiên cao → thấp:

| id | Huy hiệu mặc định | Điều kiện (mốc mặc định) | Chào dù không khớp bậc cấp | Đọc tên mặc định |
|---|---|---|---|---|
| `sop` | 💎 KHÁCH SỘP | tổng xu ≥ `minXu` (1.000) | có | bật — "Khách sộp {tên} đã tới, cả phòng chào nào!" |
| `lau` | 👋 LÂU RỒI MỚI GẶP | đã ghé ≥ `minPastSessions` (2) buổi trước đó VÀ vắng ≥ `minAwayDays` (14) ngày | có | bật — "Lâu quá không gặp {tên}, {ngày} ngày rồi đó!" |
| `fan` | 💜 FAN CỨNG | cấp đội fan ≥ `minFans` (10) | có | tắt — "Fan cứng {tên} đã vào phòng!" |
| `quen` | ⭐ KHÁCH QUEN | số buổi (tính cả buổi này) ≥ `minSessions` (5) | không | tắt — "{tên} ghé lần thứ {lần} rồi nè!" |
| `moi` | 🌱 KHÁCH MỚI | buổi đầu tiên ghé kênh | không | tắt — "Chào bạn mới {tên}!" |

- Config: `joinCard.fanTiers = [{ id, enabled, label, icon, …mốc, forceGreet, tts: { enabled, template } }]`;
  `normalizeFanTiers()` ghép với mặc định theo `id`, luôn trả đủ 5 bậc đúng thứ tự (id lạ bị bỏ). Công tắc tổng
  `joinCard.fanTiersOn` (mặc định bật).
- `classifyFan(stats, tiers)` → bậc đầu tiên thỏa, hoặc `null`. `stats = { visitNo, isFirst, prevAt, xu, fansLevel, now }`.
- Người ẩn danh / chủ phòng / người giả lập (`noVisit`) → không có bậc.
- Câu đọc thêm biến `{xu}`, `{buổi}` (= `{lần}`), `{ngày}` (số ngày vắng).

## 4. Nối vào luồng chào

- `vipFanFor(user, key)` (server) gom stats: `vipVisits.peek()` (visitNo, isFirst, prevAt) + `vipLedger.get()` +
  `max(user.fansLevel, fansLevel đã lưu)` → `classifyFan`.
- Khi `matchJoin` không khớp gì mà bậc fan có `forceGreet` → dựng match từ bậc fan (`fanMatch`): skin `violet`,
  `priority = TIER_PRIORITY_BASE + 25` (không bị gộp thẻ với mốc gộp mặc định), cooldown 0, không media.
- Thẻ mang `fanTier: { id, icon, label }`.
- Huy hiệu (ô điểm nhấn của thanh chào, `accentOf`): `fanTier` thắng; riêng bậc `quen` nhường chỗ cho "🔥 N BUỔI LIỀN"
  khi chuỗi ≥ 3 (cụ thể hơn). Chào muộn vẫn hiện "ĐANG Ở TRONG PHÒNG" như cũ. Thẻ to: chip `jc-fan` đầu dòng phụ.
- Đọc tên: bậc fan bật đọc → dùng câu của bậc fan (kể cả khi bậc cấp TikTok tắt đọc); không thì như cũ.
  Công tắc tổng `joinCard.tts.enabled` vẫn chặn tất cả.

## 5. Xem sổ

- `GET /api/vipwelcome/fanbook?q=&sort=xu|sessions|recent&limit=` → `{ host, items: [{ key, uniqueId, nickname, avatar,
  xu, sessions, lastAt, fansLevel, streak, tier }] }`, gộp 2 sổ theo khoá bằng hàm thuần `buildFanBook()`.
  `tier` tính như lúc vào phòng (buổi kế tiếp) để streamer thấy ai đang ở bậc nào.
- Panel: tab mới **📒 Sổ Fan** = bảng 5 bậc (bật, huy hiệu, mốc, chào dù cấp thấp, đọc tên + câu) + danh sách tìm/sắp xếp.
- Sửa/xoá số liệu vẫn ở 2 tab cũ (Sổ xu, Ghé phòng) trong 📊 Thống kê.

## 6. Kiểm thử

- Thuần: `tests/vipwelcome-fan-tiers.test.js` (normalize, classify từng bậc + thứ tự ưu tiên, enigma, fanMatch,
  accent, câu đọc biến mới, buildFanBook), bổ sung `tests/vipwelcome-visits.test.js` (prevAt, fansLevel, list).
- Chạy thử: server cổng riêng + `HP_DATA_DIR` riêng, giả lập vào phòng qua API có sẵn, xem thẻ và `/api/vipwelcome/fanbook`.
