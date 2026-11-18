# 🎛️ Plugin Stream Deck cho HP Action LIVE — thiết kế

Ngày: 12/11/2026 · Nhánh: `claude/stream-deck-ef9d9f` (tách từ `release-v1.26.0-clean`) · Trạng thái: đã chốt (user giao "tự quyết đến khi xong").

## 1. Mục tiêu

Streamer bấm nút trên Elgato Stream Deck để điều khiển HP Action LIVE mà không phải chuyển cửa sổ:
bật/tắt game, kết nối LIVE, thả quà / bình luận thử, các phím hành động đang có của game.
Icon trên nút **đổi theo trạng thái thật** (game bật/tắt, đang LIVE, đang nghe phụ đề…).
Plugin đi kèm bộ cài; trong app có nút **Cài plugin Stream Deck**.

Ngoài phạm vi: Stream Deck+ (núm xoay/màn cảm ứng), macOS, điều khiển từ máy khác trong LAN.

## 2. Bảo mật — đi đúng đường đã có, không nới

- Server chỉ nhận Host nội bộ (`lib/host-guard.js`) và request GHI có `Origin` lạ bị chặn; request **không có Origin** từ 127.0.0.1 là client không phải trình duyệt (curl, electron-main) → cho qua. Plugin chạy bằng **Node.js** (Stream Deck SDK v2, `CodePath: bin/plugin.js`) → gửi `Host: 127.0.0.1:<port>`, không có Origin → đúng đường được phép.
- Plugin kiểu HTML (chạy trong trình duyệt của Stream Deck) sẽ gửi Origin `null`/`file://` → bị chặn — đó là lý do chọn Node.
- Mọi route `/api/streamdeck/*` thêm điều kiện `requestIsTrusted(req)` (máy này, hoặc LAN đã bật + đúng token) — kể cả GET, vì trạng thái có @ID TikTok.
- Không mở cổng mới. Không thêm Host/Origin vào danh sách cho phép.
- Property Inspector (trang cài đặt nút, chạy trong trình duyệt của Stream Deck) **không gọi app trực tiếp**: mọi dữ liệu đi qua plugin (`sendToPlugin` / `sendToPropertyInspector`).

## 3. Kiến trúc

```
Stream Deck app ──ws(SDK)── bin/plugin.js (Node) ──HTTP 127.0.0.1:3000──► server.js /api/streamdeck/*
                                   ▲  SSE /api/streamdeck/events (đẩy trạng thái)        │
Property Inspector (pi/*.html) ◄───┘  sendToPropertyInspector(catalog)                    ▼
                                                                        route nội bộ sẵn có (qua 127.0.0.1)
```

### 3.1 Phía app

- `lib/streamdeck-actions.js` (thuần, test `tests/streamdeck-actions.test.js`):
  - `buildCatalog(ctx)` → danh sách game (id, tên, icon, khoá), quà (id, tên, xu), phím hành động theo game.
  - `buildState(ctx)` → `{ live:{connected,connecting,username}, games:{id:{on,locked}}, caption:{status} }`.
  - `planRun(cmd, ctx)` → `{ method, path, body }` hoặc `{ error }`. Không tự chạy gì.
  - `HOTKEY_DEFS` — bảng phím hành động: Đường Về Quê (Nhảy/Húc/Bắt đầu), Bắn Cung (Bắn/Hồi máu/Khiên/Hồi sinh/Kết liễu/Bắt đầu/Dừng), Đập Muỗi (theo `cfg.actions` + Bắt đầu/Dừng), Phụ đề (Bấm-Dừng/Mở/Tắt), PK (13 hiệu ứng + Dừng).
- `server.js`:
  - `GET /api/streamdeck/catalog`, `GET /api/streamdeck/state`.
  - `GET /api/streamdeck/events` — SSE; server tính `buildState` mỗi 400 ms, chỉ gửi khi đổi; nhịp tim `: ping` 15 s.
  - `POST /api/streamdeck/run {kind, ...}` — `planRun` rồi gọi **route thật** qua `http://127.0.0.1:PORT` (không Origin). Nhờ vậy giữ nguyên mọi middleware (khoá game theo KEY, kiểm bản quyền khi kết nối, chuẩn hoá config). Trả kết quả route + trạng thái mới.
  - `GET /api/streamdeck/plugin` (có bản plugin không, Stream Deck đã cài chưa) và `POST /api/streamdeck/install` — đóng gói thư mục plugin thành `<DATA_DIR>/streamdeck/HP-Action-LIVE.streamDeckPlugin` (zip, `lib/zip-writer.js`) rồi mở file bằng `explorer.exe` → Stream Deck tự cài. Chưa có Stream Deck → trả `needApp` + link tải của Elgato.
- Thư mục plugin `streamdeck/media.hpvn.actionlive.sdPlugin/` đóng gói vào bộ cài bằng `extraResources` (`resources/streamdeck`). Server tìm ở `__dirname` rồi `process.resourcesPath`. Zip dựng lúc bấm cài → không cần bước build riêng.
- ⚙ Cài đặt: khối "🎛️ Stream Deck" — trạng thái + nút **Cài plugin Stream Deck**.

### 3.2 Plugin (`streamdeck/media.hpvn.actionlive.sdPlugin/`)

- `manifest.json` — SDK 2, `Nodejs.Version: "20"`, Windows 10+, Stream Deck 6.5+.
- `bin/plugin.js` — vòng chính; `bin/lib/`:
  - `ws-client.js` — WebSocket client tối giản tự viết (bắt tay + khung text/ping/close, có mask) để không phải mang thư viện — Node 20 chưa có `WebSocket` toàn cục.
  - `app-client.js` — gọi `/api/streamdeck/*`, đọc SSE, tự nối lại (1 s → 5 s), báo `offline`.
  - `keys.js` — từ settings của nút + state → mô tả icon (`keyView`); thuần, có test.
  - `icons.js` — vẽ SVG 144×144 (nền màu theo trạng thái + hình vẽ đơn giản + chữ), trả data URI cho `setImage`. Không dùng emoji (Stream Deck vẽ SVG không có emoji màu). Icon tĩnh trong `imgs/` tự vẽ.
- `pi/` — 1 trang Property Inspector dùng chung cho 5 loại nút (`pi/index.html` + `pi/pi.js`), ô chọn đổ từ catalog.

### 3.3 Năm loại nút

| UUID (`media.hpvn.actionlive.*`) | Cài đặt | Bấm | Icon sống |
|---|---|---|---|
| `game` | game, kiểu (đảo / bật / tắt) | `POST /api/games/<id>/config {enabled}` | xanh = BẬT, xám = TẮT, 🔒 khoá KEY |
| `live` | kiểu (đảo / kết nối / ngắt), @ID (trống = ID dùng lần cuối) | `/api/connect` / `/api/disconnect` | đỏ = đang LIVE, cam = đang nối, xám = chưa |
| `gift` | quà, số lượng 1–99 | `/api/test-gift {giftId,count}` | tĩnh, chớp ✓ / ⚠ |
| `chat` | câu bình luận, tên | `/api/test-chat` | tĩnh, chớp ✓ / ⚠ |
| `hotkey` | game → hành động | route phím sẵn có của game | màu theo game; Phụ đề đỏ khi đang nghe; game tắt → mờ |

App chưa chạy → mọi nút hiện "HP chưa chạy" (nền tối, viền vàng); bấm → `showAlert`.

## 4. Lỗi & giới hạn

- Route thật trả lỗi (KEY khoá, chưa kích hoạt, chưa có @ID) → plugin `showAlert` + icon giữ trạng thái thật; nội dung lỗi gửi PI để hiện dưới ô cài đặt.
- `count` quà kẹp 1–99; bình luận ≤ 300 ký tự (route đã cắt).
- SSE đứt → plugin nối lại; server dọn client khi `close`.
- Cổng mặc định 3000 (app cố định `PORT`), đổi được ở PI (cài đặt chung của plugin).

## 5. Kiểm thử

- `tests/streamdeck-actions.test.js` — catalog/state/planRun (game khoá, toggle, @ID thiếu, phím lạ, Đập Muỗi theo cfg).
- `tests/streamdeck-plugin.test.js` — `keys.js`, `icons.js` (SVG hợp lệ, escape chữ), `ws-client.js` nói chuyện với server `ws` thật, đọc SSE.
- `tests/zip-writer.test.js` — zip đọc lại được bằng `tar`/PowerShell `Expand-Archive`.
- Chạy server thật ở cổng riêng + `HP_DATA_DIR` riêng: gọi `/api/streamdeck/*` bằng HTTP không Origin; kiểm request có Origin lạ vẫn bị 403.
- Máy chưa cài Stream Deck → không bấm thử thật được; kiểm manifest bằng `@elgato/cli validate` nếu tải được.
