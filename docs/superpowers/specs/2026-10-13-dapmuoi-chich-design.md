# Đập Muỗi — Giai đoạn 2: Muỗi chích, nốt sưng bám theo người, Kem chống muỗi (thiết kế, 13/10/2026)

Bổ sung cho spec `2026-10-13-dapmuoi-design.md`. Yêu cầu của user sau khi chơi thật:

> Muỗi bay lâu → tự tìm vào mặt → chích → mặt nổi hột đỏ, hột bám theo mặt/cổ/vai theo thời gian
> thực, N giây (đề xuất 30 s) thì mờ dần rồi hết. Thêm KEM CHỐNG MUỖI 30 s, kèm trị vết cắn: tự xoa
> vào chỗ bị cắn rồi vết biến mất. Nghiên cứu thật kỹ.

## 1. Kết quả nghiên cứu (những gì đã có để dựa vào)

| Cần | Đã có | Ghi chú |
|---|---|---|
| Vị trí mặt/cổ/vai theo thời gian thực | Model body MediaPipe Pose (33 khớp) **đang chạy sẵn** trong overlay Đập Muỗi (`HpTracker.pose`, ~45 ms/khung, 15–17 khung/s khi test thật) | Mũi 0, mắt 2/5, tai 7/8, miệng 9/10, vai 11/12, hông 23/24. Đủ để đặt nốt ở trán, má, cằm, cổ, vai. |
| Vết dính theo người khi xoay/di chuyển | Bắn Cung đã giải: toạ độ **cục bộ** theo khung ĐẦU (O = giữa 2 tai, u = tai→tai, v = vuông góc xuống) và khung THÂN (O = giữa 2 vai, u = vai→vai, v = vai→hông): `P = O + a·u + b·v` (`public/games/bancung/body-track.mjs` `body()/toStage()/toLocal()`) | Người quay/ngả đầu thì (a,b) giữ nguyên, điểm trên màn đi theo. Kèm lọc EMA 33 khớp để khỏi rung. |
| Model mặt chi tiết (478 điểm) | `face_landmarker.task` có sẵn nhưng `hp-tracking` chỉ trả miệng, và chạy **xen kẽ** khung với body (giảm nửa tốc độ) | **Không dùng** ở giai đoạn này: body đủ chính xác cho nốt cỡ 40–60 px; giữ tốc độ nhận diện cho vỗ tay. Để ngỏ nếu sau này muốn nốt đúng má/mũi từng mm. |
| Mặt nạ người (segmentation) | Có (`want({segment:true})`, Bắn Cung dùng để phủ đỏ cả người) | Không cần cho nốt; tốn thêm ~6 ms/khung. Không bật. |
| Độ ổn định tracking thật | Đo 13/10: body thấy người liên tục, mũi (779,927) ổn; tay 0–2 | Mất người (quay đi/ra khỏi khung) → nốt **ẩn** chứ không trôi, thấy lại thì hiện đúng chỗ (nhờ toạ độ cục bộ). |

Kết luận: **không cần model mới, không tốn thêm AI**. Chỉ thêm (a) luật "tìm mặt → đậu → chích" trong engine thuần, (b) một module nốt sưng thuần (toạ độ cục bộ, hạn giờ, xoa kem), (c) overlay tính khung đầu/thân từ pose và vẽ.

## 2. Luật chơi

### Muỗi tìm người và chích
- Mỗi con có `age` (ms đang bay). Bay quá `bite.afterSec` (mặc định **20 s**, ± 30% ngẫu nhiên để không chích đồng loạt) **và** đang thấy người → chuyển `state: 'seek'`: bay thẳng tới một **điểm đậu** trên người.
- Điểm đậu chọn theo trọng số vùng (`bite.zones`): trán 25%, má trái/phải 30%, cằm 10%, cổ 20%, vai 15%. Overlay tính các điểm này từ pose mỗi khung và đẩy vào engine qua `setBiteSpots([{x, y, frame, a, b, zone}])` (toạ độ sân khấu + cục bộ).
- Tới nơi (≤ 25 px) → `state: 'landed'`, đứng yên bám theo điểm đậu (overlay cập nhật vị trí theo người mỗi khung), **cánh ngừng nhịp, bụng phồng dần** trong `bite.landSec` (mặc định **1.2 s**).
- Hết `landSec` → sự kiện `{ type: 'bite', x, y, frame, a, b, zone }`, muỗi bay đi (về `fly`, `age = 0`, no hơn: chậm 0.7× trong 5 s). HUD "🩸 Bị chích N".
- **Đập được lúc đang đậu**: `hit()` coi `seek/landed` như `fly`. Giết con đang đậu/đang chích thì **+2 điểm** và hiện "Kịp rồi!". Đây là lý do streamer phải nhìn mặt mình mà vỗ.
- Cùng lúc tối đa `bite.maxLanded` (mặc định 3) con đậu; muỗi thông minh chích nhanh hơn (afterSec × 0.6).
- Mất người (pose cũ > 700 ms): con `seek` quay về `fly`; con `landed` **tạm dừng đếm** (không chích khi không thấy người).

### Nốt sưng (bump)
- Mỗi lần chích → một nốt tại (frame, a, b): vẽ gradient đỏ hồng (tâm đậm, rìa mờ), đường kính **46 px × cỡ đầu/220** (đầu to gần camera thì nốt to theo), hơi "phập phồng" 2 s đầu.
- Sống `bite.bumpSec` (mặc định **30 s**); 30% thời gian cuối mờ dần; trần `bite.maxBumps` **12** (vượt thì nốt cũ nhất biến mất).
- Bám theo người: mỗi khung `toStage(mark)` theo khung đầu/thân hiện tại (lọc EMA 0.6 như Bắn Cung). Pose mất → không vẽ, không chạy giờ mờ (giờ sống vẫn chạy).
- Âm: tiếng "tít" nhỏ lúc chích; chữ "Ái!" bay lên.

### KEM CHỐNG MUỖI (hành động mới, nhóm "cứu")
- `type: 'cream'`, mặc định `{ seconds: 30 }`, icon 🩹, gắn quà + phím tắt như 4 hành động cũ; combo quà cộng dồn thời gian, trần 120 s.
- Hiệu lực trong `creamMs`:
  1. **Chống**: không con nào vào `seek`; con đang `seek/landed` bị **đẩy văng** ra khỏi người (bay ngược hướng mặt 350 ms rồi `fly`), đích bay tránh vùng quanh mặt bán kính `faceRadius × 1.5`.
  2. **Trị**: mỗi **0.5 s** chữa một nốt (cũ nhất trước): tuýp kem hiện cạnh nốt, **xoa tròn 0.8 s** (vệt kem trắng mờ quét qua), nốt co lại rồi biến mất; hết nốt thì tuýp ẩn. Thời gian trị không ảnh hưởng thời gian chống.
  3. HUD chip "🩹 Kem Ns"; viền màn hình ánh xanh ngọc nhẹ 1 s lúc bật.
- Bình xịt / vợt / màn không chữa nốt (giữ vai trò riêng).

## 3. Kiến trúc

- `public/games/dapmuoi/game.js` (engine, test node): thêm `age`, `state seek|landed`, `setBiteSpots(spots)`, `setPersonSeen(bool)`, `cream(seconds)`, `creamMs`, sự kiện `bite`/`landed`/`repel`; `ACTION_TYPES` thêm `cream`; config `bite: { enabled, afterSec, landSec, bumpSec, maxBumps, maxLanded, zones }`.
- `public/games/dapmuoi/bumps.js` (UMD thuần, test node): `createBumps(cfg)` → `add(mark, now)`, `tick(now, frames)` (hết hạn, trần), `heal(now)` (hàng đợi xoa kem: trả nốt đang xoa + tiến độ), `list()` → `[{x, y, alpha, scale, healing}]` khi có `frames`; `frames` = `{ head:{O,u,v,width}, torso:{O,u,v} }`.
- `public/lib/body-frames.mjs` (mới, **tách từ Bắn Cung** phần tính khung đầu/thân + lọc EMA, không đụng socket/feed): `bodyFrames(pose, prev, {W,H})` → `{ head, torso, shoulderW, seen }`; Bắn Cung giữ nguyên code (refactor dùng chung để sau, không trong phạm vi này).
- Overlay: mỗi khung tính `frames` từ `tracker.pose`, dựng danh sách điểm đậu (7 vùng) → `engine.setBiteSpots`; vẽ muỗi `landed` tại điểm đậu đã cập nhật; vẽ nốt từ `bumps.list()`; vẽ tuýp kem khi `heal()` đang chạy; sprite `kem-chong-muoi.svg` (200×320) + `not-muoi-can.svg` (120×120) vẽ tay như các dụng cụ trước (đã có prompt trong `PROMPT-ve-dung-cu.md` mục 4–5).
- Server: `ACTION_TYPES` lấy từ game.js nên `cream` tự có trong `/api/dapmuoi/test` và quà; Electron hotkey tự theo `actions[]`.
- Panel: tab Muỗi thêm thẻ "🩸 Muỗi chích" (bật/tắt, sau N giây, đậu N giây, nốt sống N giây, tối đa nốt, tối đa con đậu, vùng chích 5 checkbox); tab Quà có sẵn "+ 🩹 Kem chống muỗi".

## 4. Kiểm thử
- Engine: sau `afterSec` có người → `seek`; không người → không seek; tới điểm → `landed`; hết `landSec` → event `bite` + về `fly`; đập con đang đậu → +2; `maxLanded`; cream chặn seek + đẩy văng con đang đậu; cream cộng dồn trần 120 s.
- Bumps: thêm/hết hạn 30 s/mờ 30% cuối/trần 12/heal 0.5 s một nốt + tiến độ xoa/ẩn khi không có frames.
- body-frames: khung đầu từ 2 tai, dự phòng từ mắt khi mất 1 tai; `toStage(toLocal(p)) ≈ p`.
- Thật: user ngồi trước webcam, chờ 20 s không vỗ → muỗi đậu trán/má → nốt hiện và bám khi quay đầu; gửi thử Kem → nốt được xoa mất, muỗi dạt ra.

## 5. Mặc định đề xuất

```
bite: { enabled: true, afterSec: 20, landSec: 1.2, bumpSec: 30, maxBumps: 12, maxLanded: 3,
        zones: { forehead: true, cheeks: true, chin: true, neck: true, shoulders: true } }
action cream: { seconds: 30 }  (icon 🩹, tên "Kem chống muỗi")
```

## 6. Ngoài phạm vi / rủi ro
- Nốt trên **tay** không làm (tay cử động nhanh, model tay hay mất) — chỉ mặt/cổ/vai như user nêu.
- Người quay nghiêng > 70° thì 1 tai mất: khung đầu dự phòng từ mắt + mũi, nốt có thể lệch vài chục px.
- Muỗi đậu lúc người ra khỏi khung: đếm giờ dừng, không chích "ảo".
- Cần vẽ 2 sprite mới (kem, nốt) — có thể dùng ChatGPT theo prompt đã viết hoặc tôi vẽ SVG.
