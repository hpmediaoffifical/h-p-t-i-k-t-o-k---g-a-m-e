# 🔨 Đấu Giá + 🏆 Top 3 Kết Thúc Trận — thiết kế

Ngày: 12/11/2026 · Nhánh: `claude/dau-gia-top3-b1ba46` (tách từ `release-v1.26.0-clean`)

## 1. Mục tiêu

Hai game "bảng xếp hạng quà" riêng biệt, mỗi game 1 mục trong app + 1 link OBS, chạy độc lập
(có thể bật cả hai cùng lúc, ví dụ đấu giá trong lúc PK).

- **🔨 Đấu Giá (`daugia`)** — streamer bán MỘT món (áo, suất chơi cùng, lời chào riêng…). Người xem
  tặng quà để trả giá; tổng xu cao nhất lúc hết giờ thắng. Bảng xếp hạng chạy trên OBS.
- **🏆 Top 3 Kết Thúc Trận (`top3tran`)** — mở/đóng một "trận" (tay hoặc tự theo PK thật). Mọi quà trong
  trận cộng xu cho người tặng. Đóng trận → bục vàng/bạc/đồng công bố 3 người góp nhiều nhất.

## 2. Quyết định đã chốt

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | 2 game riêng hay gộp | **2 game riêng** (user chọn) |
| 2 | Quà nào tính trả giá | **Mọi quà, theo xu** (đã nhân combo), ô "tối thiểu X xu mỗi lượt" mặc định 0 (user chọn) |
| 3 | Hiệp phụ | **Chỉ khi hoà ở đỉnh** lúc hết giờ: hiệp phụ `tieSec` (15 giây), tối đa `tieRounds` (3) lần; vẫn hoà → ai lên tới mức đó TRƯỚC thắng. Mọi người vẫn trả giá được trong hiệp phụ (user chọn) |
| 4 | Chống cướp giây chót | **Bật mặc định, chỉ khi ĐỔI người dẫn**: quà trong `snipeWindowSec` (10) giây cuối làm đổi người đứng đầu → +`snipeAddSec` (10) giây, tối đa `snipeMax` (20) lần mỗi pha. Người đang dẫn tự tặng thêm không kéo dài phiên. (tự chốt — user giao "tự quyết đến khi xong") |
| 5 | Luật thùng rác | Đấu Giá là trò tranh nhau → khi chốt, **người về nhì bị ném vào thùng rác** trên OBS ("hụt món"), tắt được (`trashOn`). Top 3 là vinh danh, không có người thua → không áp dụng. |
| 6 | Top 3 trong trận có hiện gì không | Thanh nhỏ "Top trận" (3 người dẫn, cập nhật trực tiếp) — mặc định bật (`liveBar`). Hết trận mới hiện bục lớn. |
| 7 | Bục hiện bao lâu | `holdSec` 12 giây rồi tự ẩn; 0 = giữ tới khi bấm Ẩn. |
| 8 | Trận tay có hẹn giờ không | Có ô `durationSec` (0 = tới khi bấm Kết thúc). |
| 9 | PK tự mở khi đang có trận tay | Không cướp: trận tay đang chạy thì bỏ qua tín hiệu PK. PK chỉ đóng trận do chính PK mở. |
| 10 | Trạng thái có lưu đĩa không | Không. Phiên đấu giá / trận là dữ liệu tạm của buổi LIVE, sống trong RAM server. Overlay tải lại giữa phiên vẫn đúng vì hỏi lại server. |

## 3. Luật — Đấu Giá

Pha: `idle → live → (tie ×≤tieRounds) → done`.

- `start(title)`: xoá bảng, pha `live`, `endsAt = now + durationSec`.
- Quà (khi pha `live`/`tie`, game bật): `coins = coinValue × repeatCount` (đã gộp combo ở `emitGift`).
  `coins < minCoins` → bỏ. Không có `uniqueId` → bỏ (không gộp vào ô ẩn danh).
  Cộng vào người tặng; giữ 3 loại quà nhiều xu nhất của họ để hiện dưới thẻ người thắng.
- Gỡ hoà khi sắp hạng: xu giảm dần, rồi **bộ đếm tăng dần** `reachedAt` (ai lên tới mức hiện tại trước
  đứng trên). Không dùng `Date.now()` — combo chạy đồng bộ cùng mili-giây sẽ gỡ hoà sai.
- Chống cướp: `snipeOn` và còn ≤ `snipeWindowSec` và người đứng đầu sau quà ≠ trước quà và
  `extendCount < snipeMax` → `endsAt += snipeAddSec`, `extendCount++`, `lastExtendAt = now`.
  Mỗi pha (live / mỗi hiệp phụ) có quỹ gia hạn riêng.
- Hết giờ: nếu ≥2 người cùng xu cao nhất (>0), `tieSec > 0` và `tieRound < tieRounds` → pha `tie`
  (`tieRound++`, `tieIds` = những người hoà), `endsAt = now + tieSec`. Ngược lại → `done`.
- `done`: `winner` = hạng 1 nếu > 0 xu, `runnerUp` = hạng 2 nếu có. Không ai trả giá → không có người thắng.
- `end()` kết thúc ngay (bỏ hiệp phụ). `reset()` về `idle`. `setTitle()` đổi tên món giữa phiên.
- Hằng số chặn: `durationSec` 10–3600, `tieSec` 0–120, `tieRounds` 0–5, `snipeWindowSec` 1–60,
  `snipeAddSec` 1–60, `snipeMax` 0–50, `rows` 3–10.

## 4. Luật — Top 3 Kết Thúc Trận

- Trạng thái: `open` (đang tính), `source` (`manual` | `pk`), `endsAt` (0 = không hẹn giờ), sổ điểm,
  `announce` (lượt công bố đang chiếu: `seq`, 3 hàng, tổng, `hideAt`).
- `open({source, durationSec})`: xoá sổ, xoá công bố cũ.
- Quà khi `open` và game bật: như Đấu Giá (min xu, bỏ người không id, gỡ hoà bằng bộ đếm).
  Sổ giữ tối đa 2000 người, vượt thì cắt còn 1500 người điểm cao nhất.
- `close()`: đóng; có người > 0 xu → `announce` (seq tăng), `hideAt = now + holdSec` (0 = không tự ẩn).
  Không ai → không công bố.
- `tick()`: trận hẹn giờ hết giờ → `close()`; công bố quá `hideAt` → ẩn.
- PK (`autoPk`, mặc định bật): `pk:start` khi chưa mở → `open({source:'pk'})`; đang mở trận PK → bỏ qua
  (gói mở báo 2 lần không xoá sổ); đang mở trận tay → bỏ qua. `pk:end` chỉ đóng trận `source==='pk'`.

## 5. Kiến trúc

Theo mẫu 🏆 Thứ Hạng LIVE: **luật ở server, overlay chỉ vẽ**.

| Phần | File |
|---|---|
| Luật thuần Đấu Giá (đồng hồ tiêm `now`) | `lib/dau-gia.js` · test `tests/dau-gia.test.js` |
| Luật thuần Top 3 | `lib/top3-tran.js` · test `tests/top3-tran.test.js` |
| Nối server | `server.js`: `GAMES.daugia/top3tran`, móc trong `emitGift` + `emitPkState`, nhịp 250 ms, socket `daugia:state` / `top3tran:state`, route `/api/daugia/*`, `/api/top3tran/*`, `/overlay/daugia`, `/overlay/top3tran` |
| Vẽ (dùng chung overlay + xem trước) | `public/games/<id>/game.js` (`window.HpDauGia` / `window.HpTop3Tran`: `createRenderer`, `demoStates`) + `<id>.css` |
| Overlay OBS 1080×1920 | `public/games/<id>/overlay.html` (`?demo=1` = tự chạy kịch bản giả cho khung xem trước) |
| Panel | `public/games/<id>/<id>-panel.js`, section `#view-<id>` trong `index.html`, nhánh trong `openGame` (`app.js`), CSS `.daugia-*` / `.top3tran-*` trong `style.css` (chạy lại `tools/ui-tokenize-css.js`) |

Route lệnh (tránh `/api/games/:id/*`):
- `GET /api/daugia/state`, `POST /api/daugia/cmd {cmd}`: `start {title?}` · `end` · `reset` · `title {title}` · `bid {name, coins}` (quà thử đi đúng đường luật).
- `GET /api/top3tran/state`, `POST /api/top3tran/cmd {cmd}`: `start` · `end` · `hide` · `reset` · `bid {name, coins}` · `demo` (công bố giả 3 tên).

Đẩy state: đổi pha / bấm nút → đẩy ngay; quà → gom 150 ms. Snapshot có `serverNow` để overlay tự đếm ngược
từ `endsAt` (bù lệch giờ), server không phải đẩy mỗi giây.

## 6. Giao diện OBS

**Đấu Giá** (khung đặt theo `xPercent/yPercent/scale`, mặc định giữa trên):
đầu thẻ "🔨 ĐẤU GIÁ" + tên món · đồng hồ lớn + vòng tiến độ · nhãn pha (Đang trả giá / Hiệp phụ 1/3 / Đã chốt) ·
dòng gợi ý ("Giành đầu bảng ở 10s cuối: +10s") · `rows` hàng (hạng, ảnh, tên, xu, thanh tỉ lệ; người hoà được viền) ·
"+10s" nháy khi gia hạn. Chốt: thẻ người thắng (vương miện, ảnh, tên, xu, 3 quà) + người về nhì bay vào thùng rác.

**Top 3**: thanh "Top trận" nhỏ trong trận; hết trận → bục 2-1-3 (bạc trái, vàng giữa cao nhất, đồng phải)
mọc lần lượt 3 → 2 → 1, tổng xu cả trận.

Chữ giao diện tự đặt, gọn. Ảnh đại diện lỗi → ô chữ cái đầu.

## 7. Bảng Quà Tổng

Hai game nhận MỌI quà, không có quà chỉ định → không thêm vào `giftboard-collect.js`. Overlay vẫn gắn
`overlay-hello.js` để bảng biết game đang mở.

## 8. Kiểm thử

- `npm test`: luật thuần (pha, hoà, gỡ hoà theo bộ đếm, chống cướp chỉ khi đổi người dẫn + trần,
  min xu, bỏ người không id, sổ cắt, PK mở/đóng đúng nguồn, công bố tự ẩn).
- Chạy thử server riêng (cổng riêng + `HP_DATA_DIR` riêng, không kích hoạt key): gọi `/cmd bid`, xem
  overlay trong Browser pane (`?demo=1` và dữ liệu thật).

## 9. Ngoài phạm vi

Lưu lịch sử phiên đấu giá; xuất danh sách người thắng; phím tắt toàn cục; nhãn đa ngôn ngữ.
