# HP Game Hub - hướng dẫn liên kết cho app HP (HP Hub Link v1)

> **Dành cho**: HP NPC LIVE, HP Action LIVE, HP Group LIVE và mọi app HP sau này (gọi chung là **app**). Chép file này vào `docs/`
> của app và trỏ từ `CLAUDE.md` / `AGENTS.md`: *"Liên kết HP Game Hub: đọc docs/HP-GAME-HUB-LIEN-KET.md trước khi sửa `lib/hub-link*`"*.
> Thiết kế gốc + lý do: `F:\PHAT TRIEN GAME\HP Game Hub\docs\thiet-ke-kien-truc.md`.
>
> **HP Game Hub** là app Electron riêng trên **cùng máy**, chạy nền (khay hệ thống), mở một máy chủ cục bộ
> `http://127.0.0.1:3777` (hosts `hpgame.obs`). Nó **thực thi** Game Camera · Bộ Tách Người · Level Quest · hiệu ứng Douyin 直播伴侣 /
> TikTok LIVE Studio / VTube Studio · cài máy. App **không** làm những việc đó nữa - app là **nguồn sự kiện LIVE +
> Bảng Quà**, gửi quà sang Hub và hỏi Hub "quà này game có ăn không".

Phiên bản giao thức: **1** (2026-11-01). Mọi thay đổi phá tương thích = tăng `protocol`; thêm trường mới = không tăng.

---

## 0. Việc app phải làm - tóm tắt một trang

| # | Việc | Ở đâu trong app |
|---|---|---|
| 1 | Thêm `lib/hub-link-client` (SDK chép từ `HP Game Hub/sdk/hub-link-client`, không phụ thuộc npm) | server của app |
| 2 | Lúc mở app + mỗi 10 s: **khám phá** Hub (file `hub.json` → `/hub/v1/hello`) | SDK tự làm |
| 3 | Chưa có token → **ghép đôi** (`POST /hub/v1/pair`, chờ user bấm Cho phép trên Hub); có token → mở WebSocket | SDK tự làm; app chỉ cấp `appId / appName / version / scopes` |
| 4 | Gửi `live.status`, `profile.changed`, `catalog.gifts` khi đổi; gửi `live.gift / like / comment / follow / share / member` theo thời gian thực | hook vào nơi app nhận sự kiện TikTok (NPC: sau `giftStreak.normalize`, trước `processGift`) |
| 5 | Trước khi xử lý mỗi quà: `gift.plan` → theo `decision` (`pass / consume / hold`) | NPC: đầu `processGift`; Action: đầu `emitGift` |
| 6 | Nhận `game.session`, `fx.row`, `gift.test`, `hub.state` và xử lý như §5 | SDK phát sự kiện, app gắn handler |
| 7 | UI: thẻ **"HP Game Hub"** trong Cài đặt (đèn + Mở Hub / Tải Hub / Ngắt); khi Hub nối → **ẩn** mục Game Camera · Thư viện hiệu ứng · Cài đặt máy của app, thay bằng thẻ trạng thái | dashboard |
| 8 | Mất Hub → mọi quà `pass`, không treo LIVE; 🐔 Gà HP nhắc "Hub chưa chạy" mức **warn** (không block) | reminders |
| 9 | Selftest với **Hub giả** (`sdk/hub-link-client/fake-hub.cjs`) chạy trong CI của app | `scripts/hub-link-selftest.mjs` |

---

## 1. Khám phá Hub (discovery)

App **không** hỏi user cổng. Thứ tự:

1. Đọc `%APPDATA%\HP Media\HP Game Hub\hub.json` (Hub ghi khi mở, xoá khi thoát; nếu file còn mà `pid` chết → coi như chưa chạy):
   ```json
   { "protocol": 1, "port": 3777, "pid": 18324, "version": "1.0.0", "startedAt": "2026-11-01T07:12:40.000Z", "host": "127.0.0.1" }
   ```
2. Kiểm sống: `GET http://127.0.0.1:<port>/hub/v1/hello` (không cần token, ≤ 300 ms):
   ```json
   { "ok": true, "hub": "hp-game-hub", "protocol": 1, "version": "1.0.0", "machineId": "HPGH-7K2Q-9M3A", "paired": false, "lan": false }
   ```
   `paired` = token của **app này** còn hợp lệ (Hub nhìn header `X-Hp-App: <appId>`).
3. Không có file / `hello` lỗi → dò nhanh 3777…3797 (Hub dò cổng trống như NPC). Vẫn không → **Hub không chạy**.
4. Hub đã cài chưa: đọc `%APPDATA%\HP Media\HP Game Hub\install.json` `{ "installPath", "exe", "version" }` (bản cài HP Game Hub tự ghi
   mỗi lần mở, không cần quyền Admin; bản dev không ghi; SDK: option `installFile` / env `HP_HUB_INSTALL_FILE`). Gỡ Hub bằng trình gỡ
   **vẫn để lại** file này → chỉ coi là "đã cài" khi `exe` còn trên đĩa (SDK tự kiểm). App hiện nút **"Mở HP Game Hub"** (SDK `launch()` /
   `open(page)`, §4.10; `spawn` luôn có người nghe `'error'` - exe hỏng không được làm sập app) hoặc **"Tải HP Game Hub"** (link trong
   `hub-link-client/links.json`, trỏ GitHub Releases `hpmediaoffifical/hp-game-hub-releases`).

Chu kỳ dò lại khi mất Hub: 10 s (như `yield.cjs` của HP Douyin OBS). Không bao giờ dò ra ngoài `127.0.0.1` trừ khi user bật
"Hub ở máy khác" và gõ địa chỉ (HP Group LIVE điều khiển từ máy MC).

## 2. Ghép đôi (pairing) - mẫu VTube Studio API

Mỗi app một token, lưu trong userData của app (`data/hub-link.json` `{ token, hubMachineId, scopes, pairedAt }`). Token mất hiệu lực
khi user **Ngắt** trên Hub, khi **cùng appId ghép lại** (token cũ bị thu hồi, xem §8), hoặc khi **mất dữ liệu Hub** (xoá thư mục dữ
liệu: Hub không còn nhớ token → WebSocket đóng `4401 unauthorized` → app ghép lại).

`machineId` = băm `hostname + MachineGuid` của Windows → **cài lại Hub KHÔNG đổi** `machineId` (token vẫn dùng được nếu dữ liệu Hub còn).
`machineId` khác lúc ghép chỉ khi gặp Hub của máy khác / Hub giả → app bỏ token, **không** gửi token cho Hub đó, ghép lại.

```
POST /hub/v1/pair
{ "appId": "hp-npc-live", "appName": "HP NPC LIVE", "version": "1.9.0", "pid": 4120,
  "scopes": ["live.send", "gift.plan", "fx.control", "game.control", "state.read"], "protocolMin": 1, "protocolMax": 1 }
→ 202 { "pairId": "p_8f3a…", "code": "482719", "expiresIn": 120 }
```

- Hub hiện hộp thoại **"<appName> muốn liên kết"** + mã 6 số + danh sách quyền (xem bản mẫu). App cũng hiện mã đó để user đối chiếu.
- App poll `GET /hub/v1/pair/p_8f3a…` mỗi 1 s: `{ "status": "pending" | "approved" | "denied" | "expired", "token"?: "hpl_…", "scopes"?: […] }`.
- `approved` → lưu token; `denied` → báo "KTV đã từ chối trên Hub", không tự xin lại trong 10 phút; `expired` → xin lại khi user bấm.
- Hub có công tắc KTV **"Tự cho phép app HP trên máy này"** (mặc định tắt): bật thì `approved` ngay cho `appId` trong danh sách đã biết.

Scope (quyền) - Hub cấp đúng những gì app xin, user có thể bỏ bớt trong hộp thoại:

| scope | Cho phép |
|---|---|
| `live.send` | gửi `live.*`, `profile.changed`, `catalog.gifts` |
| `gift.plan` | hỏi `gift.plan` (bắt buộc nếu app có Bảng Quà) |
| `fx.control` | `fx.fire / fx.stop / fx.list` (libFx, Kịch bản, Túi mù) |
| `game.control` | `game.session.start / end`, `game.list`, `game.fx.run / cancel / trim` |
| `obs.control` | dự phòng - nhờ Hub đổi Scene / bật tắt nguồn OBS; GĐ0 chưa có lệnh nào dùng (mặc định **tắt**, app đã có kết nối OBS riêng) |
| `state.read` | nhận `hub.state` (đèn, game đang chạy, tính năng KEY) |

Mọi yêu cầu có token gửi `Authorization: Bearer <token>` và `X-Hp-App: <appId>`. WebSocket: `ws://127.0.0.1:3777/hub/v1/ws?token=<token>`.
Hub từ chối `Origin` không rỗng và không phải `http(s)://127.0.0.1|localhost|hpgame.obs[:port]`.

## 3. Kênh WebSocket - phong bì chung

Một kết nối WS cho mọi thứ (JSON, UTF-8). Ba loại:

```jsonc
{ "t": "ev",  "name": "live.gift",  "ts": 1761980400123, "data": { … } }                 // sự kiện một chiều
{ "t": "req", "id": "r17", "name": "gift.plan", "data": { … } }                           // yêu cầu, chờ trả lời
{ "t": "res", "id": "r17", "ok": true,  "data": { … } }                                   // trả lời
{ "t": "res", "id": "r17", "ok": false, "error": { "code": "scope_denied", "message": "…" } }
```

- `id` do bên gửi đặt, duy nhất trong kết nối. Hết hạn mặc định **1.500 ms**; `gift.plan` **300 ms** (quá hạn = `pass`).
- Giữ sống: Hub gửi `{"t":"ev","name":"hub.ping"}` mỗi 5 s, app trả `hub.pong`; 15 s không thấy → đóng, SDK nối lại (backoff 1 → 10 s).
  Bắt tay WebSocket treo quá 10 s → SDK đóng, thử lại vòng sau.
- Nối lại xong app **gửi lại** `live.status`, `profile.changed`, `catalog.gifts` (Hub coi phiên mới).
- Trường không biết → bỏ qua. `name` không biết → `res ok:false code:unknown_name` (không đóng kết nối).

Mã đóng WebSocket của Hub:

| Mã | `reason` | Nghĩa | App (SDK) làm gì |
|---|---|---|---|
| `4401` | `unauthorized` | thiếu / sai token (Hub không biết token - vd mất dữ liệu Hub) | bỏ token, ghép lại |
| `4401` | `token_revoked` | token đã bị thu hồi | bỏ token, **không** tự xin lại tới khi user bấm |
| `4403` | `bad_origin` | `Origin` lạ (trang web) | không nối lại bằng trang đó |
| `4001` | `token_revoked` | user bấm **Ngắt** trên Hub, hoặc cùng appId vừa **ghép lại** (token cũ bị thu hồi) | như `token_revoked`; nếu chính app đang ghép lại thì bỏ qua |
| `4002` | `ping_timeout` | app không trả `hub.pong` | nối lại với token cũ (backoff) |
| `1009` | - | khung > 1 MB | nối lại; đừng gửi gói lớn (chia nhỏ `catalog.gifts` nếu cần) |

## 4. App → Hub

### 4.1 `live.status` (ev) - mỗi khi đổi, và khi vừa nối

```json
{ "connected": true, "live": true, "uniqueId": "kenh_cua_ban", "roomId": "7312…", "viewers": 1204, "demo": false, "since": 1761979000000 }
```
`demo: true` = 🧪 phòng giả / chạy thử của app → Hub chạy game bình thường nhưng **không ghi** nhật ký / thống kê thật.

### 4.2 `profile.changed` (ev) - hồ sơ NPC đang dùng

```json
{ "profileId": "grp_yuna", "name": "Yuna", "sceneName": "Yuna", "all": [ { "profileId": "common", "name": "MẶC ĐỊNH" }, { "profileId": "grp_yuna", "name": "Yuna" } ] }
```
Hub lưu mọi cấu hình game / quà theo `appId + profileId`. `common` là hồ sơ mặc định của mọi app.

### 4.3 `catalog.gifts` (ev) - danh mục quà app đang dùng (kể cả quà ảo ×N)

```json
{ "gifts": [ { "giftId": "5655", "name": "Rose", "nameVi": "Hoa hồng", "image": "https://…", "coins": 1, "virtual": false },
             { "giftId": "5655x10", "name": "Rose ×10", "nameVi": "Hoa hồng ×10", "image": "https://…", "coins": 10, "virtual": true, "baseId": "5655", "size": 10 } ],
  "sig": "a91c…" }
```
Gửi khi mở, khi đổi (`sig` = băm danh mục; Hub bỏ qua nếu trùng). Hub **không** tự đọc Google Sheet "gift".

### 4.4 `live.gift` (ev) - **quà chuẩn HP** (đã gộp combo)

```jsonc
{
  "id": "g_01JB…",            // BẮT BUỘC: id lần phát, duy nhất; Hub dùng chống trùng khi app gửi lại
  "giftId": "5655", "giftName": "Rose", "giftNameVi": "Hoa hồng", "giftImage": "https://…", "coins": 1,
  "quantity": 10,              // số lượng của LẦN PHÁT NÀY (NPC: quantity sau gift-streak; Action: repeatCount lúc repeatEnd)
  "totalCoins": 10,
  "user": { "uniqueId": "minhanh_89", "userId": "6812…", "nickname": "Minh Anh", "avatar": "https://…", "level": 23 },
  "profileId": "grp_yuna",
  "source": "tiktok",          // tiktok | test | demo
  "tier":  { "baseId": "5655", "size": 10, "fromQty": 12 },        // chỉ khi là phần chia của 🎁 Quà gộp số lượng
  "pair":  { "openId": "5269", "mainId": "7934" },                 // chỉ khi là quà ảo 🔗 ghép đôi
  "streaking": false,          // true = phao đang chạy, Hub chỉ hiện đếm, không chạy game
  "receivedAt": 1761980400000
}
```
**Quy tắc**: app gửi `live.gift` **cho mọi quà** (kể cả quà Hub sẽ không quan tâm) - Hub cần để đếm KPI Level Quest, vẽ Quà mới,
Đồng minh. App **không** chờ `live.gift`; chỉ `gift.plan` mới chờ.

**`id` BẮT BUỘC** và giống nhau giữa `live.gift` và `gift.plan` của cùng một lần phát: Hub chỉ chống trùng theo `id`. Thiếu `id` thì
Hub tự cấp id mới cho mỗi gói → một quà gửi cả `live.gift` lẫn `gift.plan` bị **chạy 2 lần** (game đếm đôi).

### 4.5 `live.like` · `live.comment` · `live.follow` · `live.share` · `live.member` (ev)

```json
{ "user": { "uniqueId": "…", "nickname": "…", "avatar": "…" }, "count": 15, "total": 24600, "profileId": "grp_yuna" }        // like
{ "user": { … }, "text": "xin bài", "profileId": "grp_yuna" }                                                                  // comment
```
Level Quest dùng like / share; game mới có thể dùng comment (ví dụ Vote). App nào không có thì không gửi.

### 4.6 `gift.plan` (req) - **hỏi trước khi xử lý quà**

Gửi **ngay trước** chỗ app bắt đầu xử lý quà (NPC: đầu `processGift`, sau `giftTiersSplit`/`giftPairSplit`; Action: đầu `emitGift`).
`data` = đúng object `live.gift` ở trên (app vẫn gửi `live.gift` song song).

```jsonc
// res
{
  "decision": "pass",                       // pass = app chạy Bảng Quà như cũ · consume = quà thuộc game/hiệu ứng, app CHỈ ghi sổ ·
                                            // hold = phiên game đang mở, app GIỮ hàng tới game.session end
  "session": { "role": "trigger", "action": "start", "mode": "defer", "gameId": "dapmuoi", "until": 1761980580000 },   // luật gatedGame
  "ally":    { "kind": "swat", "label": "Diệt 10 muỗi", "gameId": "dapmuoi" },                                            // 🛡 Đồng minh → consume
  "claims":  [ { "gameId": "dapmuoi", "label": "Thả 10 muỗi" } ],                                                        // gắn vào socket gift của app (overlay)
  "rows":    [ { "rowId": "cfx_9a2…", "game": "body", "kind": "heart", "name": "Bắn Tim", "icon": "…", "mode": "queue", "runMode": "music", "qty": 1, "estMs": 15000 } ]
}
```

- `rows[]` (GĐ2): hiệu ứng Bộ Tách Người **xếp hàng** cùng quà thường. App đặt mỗi row thành một hàng trong hàng đợi của mình
  (NPC: `placeCamFx` / `attachCamFx`), khi tới lượt gửi `queue.row {rowId, phase:'start'}` → Hub chạy thật → Hub phát `fx.row` các pha.
  GĐ1 Hub trả `rows: []` và tự chạy ngay.
- App **không có hàng đợi** (HP Action LIVE) khai `capabilities.queue = false` → Hub không bao giờ trả `rows`, tự chạy. GĐ0 Hub đọc
  `capabilities` từ **`live.status.capabilities`** (gửi khi vừa nối và mỗi lần đổi), không đọc từ gói ghép đôi - SDK vẫn gửi
  `capabilities` lúc ghép để hiện cho người duyệt.
- Hết hạn 300 ms / mất Hub → coi là `pass`. Ghi nhật ký 1 dòng, không spam.
- **Hợp đồng phát lại quà `hold`**: Hub tự giữ và tự phát lại **phần game** khi hết phiên. Nhận `game.session end` xong, app phát lại
  **phần Bảng Quà** của từng quà đang giữ bằng cách gửi lại `gift.plan` **cùng `id`** → Hub trả đúng kết quả lần phát lại của nó
  (`pass` / `consume`, hoặc lại `hold` nếu quà bị giữ tiếp cho phiên mới) và **không bao giờ** chạy quà đó lần hai. Hub nhớ id quà
  đang giữ tới lúc phát lại, rồi thêm 60 s; quà thường nhớ 5 s.

### 4.7 `queue.row` (ev) - vòng đời hàng camFx trong hàng đợi app (GĐ2)

```json
{ "rowId": "cfx_9a2…", "phase": "start" }        // start | cancel | trim(n) | skip
```

### 4.8 `fx.list` / `fx.fire` / `fx.stop` (req) - Thư viện hiệu ứng cho libFx, Kịch bản, Túi mù

> **GĐ2 - GĐ0 trả `unknown_name`.** App phải chịu được lỗi này (coi như chưa có Thư viện hiệu ứng).

```jsonc
// fx.list → { "sources": [ { "id": "douyin", "ready": true, "items": [ { "id": "d_112", "name": "Bướm mộng vàng", "kind": "face", "installed": true, "icon": "/fxicon/douyin/112" } ] }, { "id": "tiktokStudio", … }, { "id": "vtubeStudio", … } ] }
// fx.fire { "src": "tiktokStudio", "id": "ts_bg_07", "tag": "row_8812", "seconds": 10, "profileId": "grp_yuna" } → { "ok": true, "untilTs": … }
// fx.stop { "tag": "row_8812" } → { "ok": true }
```
Thay cho `camGameFxFire` / `tiktokStudio.stopTag` / `douyinFire` / `scriptPress` hôm nay. Studio: Hub giữ luật "mặt 1 chỗ, thay lặng lẽ".

### 4.9 `game.list` / `game.session.start` / `game.session.end` / `game.fx.run|cancel|trim` (req)

> **GĐ2 - GĐ0 trả `unknown_name`.**

Dùng cho 🎮 pkFx (game theo trận PK), nút ▶ Thử phiên, Đồng minh trừ lượt. Luật như `startSessionFromRow / endSession / runCamFx / cancelCamFx / trimCamFx`.

### 4.10 `hub.open` (req, không cần WS) - `POST /hub/v1/open { "page": "home" | "camera" | "fxlib" | "obs" | "link" | "setup" | "settings" | "info" }`
Đưa cửa sổ Hub lên (hiện cả khi đang ẩn dưới khay) và mở đúng trang (nút "Mở Hub" trong app). Tám trang này khớp `OPEN_PAGES` ở `server/app.cjs` và tên trang của giao diện: `home` Tổng quan · `camera` Game Camera · `fxlib` Thư viện hiệu ứng · `obs` Kết nối OBS · `link` Liên kết app · `setup` Cài đặt máy · `settings` Cài đặt & KEY · `info` Thông tin. Tên khác → `400 bad_request`. Cần token có scope bất kỳ (`requireLink`).

**SDK: `hub.open(page)`** làm trọn nút này: đã nối → `POST /hub/v1/open` tới đúng Hub đã ghép (cổng + `machineId` đã xác minh, kèm
`Authorization: Bearer` + `X-Hp-App`); chưa nối mà đã cài → mở exe (Hub đang chạy thì cửa sổ hiện lên). Trả
`'opened' | 'launched' | 'not_installed' | 'failed'`, không bao giờ reject. `hub.launch()` chỉ để chắc Hub chạy (mở ẩn dưới khay);
`hub.overlays()` = `GET /hub/v1/overlays` (§6).

## 5. Hub → App

| name | data | App làm gì |
|---|---|---|
| `hub.state` (ev, khi đổi + mỗi 5 s) | `{ lights: { obs, camera, douyin, studio, vtube, key }, running: [ { gameId, name, until } ], features: { dapmuoi: 'on' \| 'locked' \| 'off' }, version }` | vẽ thẻ "HP Game Hub" + 🐔 nhắc nhở; `features` thay `licenseState` của 4 mục cũ |
| `game.session` (ev) | `{ type: 'start' \| 'extend' \| 'end' \| 'skip', gameId, until, reason }` | gửi cho app có quyền `state.read` **hoặc** `gift.plan` · `start` → cắt hiệu ứng đang chạy + xếp lại (như `onCamSessionEvent`) · `end` → phát lại quà đang `hold` (gift.plan cùng id, §4.6) |
| `fx.row` (ev) - **GĐ2, GĐ0 chưa gửi** | `{ rowId, phase: 'start' \| 'len' \| 'done' \| 'skip' \| 'trim', ms, removed, left, reason }` | nhả / giữ hàng (như `onCamFxRow`) |
| `gift.test` (ev) | object `live.gift` với `source: 'test'` | chạy `processGift(gift, true)` - nút 🧪 Thử quà trên Hub |
| `hub.needs` (ev) - **GĐ2, GĐ0 chưa gửi** | `{ kind: 'overlay_missing' \| 'obs_disconnected' \| 'install_pending', message, action: { page } }` | 🐔 Gà HP mức `warn`; chỉ `overlay_missing` lúc có phiên = `block` |
| `catalog.request` (ev) - **GĐ2, GĐ0 chưa gửi** | `{}` | gửi lại `catalog.gifts` (Hub vừa mở) - GĐ0: app tự gửi khi vừa nối |
| `hub.ping` (ev) | `{}` | trả `hub.pong` |

## 6. REST (ngoài WS) - cho trang web / công cụ / ảnh

| | |
|---|---|
| `GET /hub/v1/hello` | không token (xem §1) |
| `POST /hub/v1/pair` · `GET /hub/v1/pair/:id` | ghép đôi |
| `GET /hub/v1/state` | = `hub.state` (+ `ok: true`); token **bất kỳ quyền** nào cũng đọc được - gói không chứa bí mật (SDK dùng để biết token còn sống) |
| `POST /hub/v1/gift` | = `live.gift` một lần (công cụ dòng lệnh / HP LIVE Studio C++ gửi NDJSON → cầu nối) |
| `GET /hub/v1/overlays` | `[ { "id": "camgames", "url": "http://localhost:3777/overlay/camgames" }, { "id": "body", "url": "http://localhost:3777/overlay/body" } ]` (cổng = cổng Hub đang chạy; GĐ0 dùng `localhost`, chưa cài hosts `hpgame.obs`) - app thêm vào Trung tâm OBS của mình **chỉ dạng chữ + link**, không tự chèn. SDK: `hub.overlays()` |
| `POST /hub/v1/open` | mở trang Hub (§4.10). SDK: `hub.open(page)` |
| `GET /glassets/*` | ảnh / tệp game trong `list/` |
| `GET /fxicon/:src/:id` | ảnh hiệu ứng - **GĐ2, GĐ0 chưa có** |

## 7. Quy tắc giao diện trong app (bắt buộc, cùng khuôn hướng dẫn thiết kế HP)

1. **Thẻ "HP Game Hub"** ở Cài đặt (và dòng trong Trung tâm OBS): chấm + chữ sống - *"Đã nối · 1.0.0 · Đập Muỗi đang chạy"* /
   *"Đã cài, chưa mở"* [Mở HP Game Hub] / *"Chưa cài"* [Tải HP Game Hub] / *"Chờ cho phép trên Hub (mã 482719)"*. Một nút chính.
2. Hub **đã nối** → ẩn 3 mục menu của app: Game Camera · Thư viện hiệu ứng · tab Cài đặt máy (🎬 Hiệu ứng OBS / LUA đã gỡ khỏi HP NPC LIVE 2026-11-01). Người dùng bấm phím tắt cũ
   → mở thẻ Hub. Chưa cài Hub → **vẫn hiện** 4 mục cũ (bản cầu nối, tới GĐ3 mới gỡ).
3. Bảng chọn quà của app không đổi. Quà đã gắn game bên Hub hiện nhãn **"Game · Đập Muỗi"** (từ `claims`) trong Bảng quà, như nhãn
   ⚡ hôm nay - để không gắn trùng. Trùng = Hub thắng (`consume`), app hiện ⚠ "Quà này game đang dùng".
4. Chữ trên overlay OBS giữ luật ngắn: "OBS chưa nhận tín hiệu game!" - Hub tự hiện, app không chèn thêm.
5. Không nói "Hub Link", "token", "WebSocket" với người dùng. Nói: *"Liên kết HP Game Hub"*, *"Cho phép"*, *"Ngắt"*.

## 8. Lỗi & an toàn

| Tình huống | Hành vi bắt buộc |
|---|---|
| Hub không chạy | mọi quà `pass`; thẻ Hub vàng; không chặn LIVE, không hộp thoại |
| Hub chết giữa phiên game (`hold` đang giữ) | app chờ tối đa 20 s rồi tự phát lại quà giữ như `game.session end` |
| `gift.plan` quá 300 ms | `pass` + đếm; > 5 lần / phút → thẻ Hub vàng "Hub phản hồi chậm" |
| Token bị thu hồi (`401 token_revoked`) | xoá token, hiện "Cần cho phép lại trên Hub", **không** tự xin lại tới khi user bấm |
| Hub phiên bản `protocol` lớn hơn app hiểu | nối bình thường, bỏ trường lạ; thẻ Hub ghi "Nên cập nhật app" |
| Một `appId` = một token | ghép lại cùng `appId` → token cũ bị thu hồi, socket cũ đóng `4001` |
| App chạy 2 bản (dev + cài) cùng máy | dùng `appId` riêng cho bản dev (vd `hp-npc-live-dev`) **hoặc** dùng chung `dataDir` token; nếu không, hai bản ghép đè nhau và thu hồi token của nhau liên tục. Quà trùng `id` vẫn bỏ qua trong 5 s |
| LAN | chỉ khi Hub bật "Máy khác trong mạng"; token vẫn bắt buộc; không bao giờ tự dò LAN |

## 9. Checklist đổi mã trong từng app (cho Claude đọc)

**HP NPC LIVE** (`server.js`, `src/dashboard.jsx`)
- [ ] `lib/hub-link-client/` (chép SDK) + `hubLink = createHubLink({ appId:'hp-npc-live', … })` khởi động cùng server; `publicState.hub = hubLink.state()`.
- [ ] Gửi `live.status` ở `onLive*` / `status` đổi; `profile.changed` ở nơi đổi `giftList.globals.activeGroup` / Scene↔NPC; `catalog.gifts` trong `refreshGiftCatalogFromSheet` + sau `catalogWithTierGifts`.
- [ ] Gửi `live.gift` + hỏi `gift.plan` ở đầu `processGift` (sau `giftTiersSplit` / `giftPairSplit`, **trước** `handleSubtractGift`); map `decision` → `camSessionHeld` / `consume` / chạy tiếp. `like` / `share` / `comment` ở `onLive*`.
- [ ] GĐ2: `rows` → `placeCamFx`; `queue.row` ở `onCamFxRow`; `fx.fire/stop` thay `camGameFxFire` / `tiktokStudio.stopTag` / `douyinFire` / `scriptPress` trong `boardFx*`, `fxScriptPress`, Túi mù.
- [ ] `game.session` → `onCamSessionEvent`; `fx.row` → `onCamFxRow`; `gift.test` → `processGift(gift, true)`.
- [ ] Menu: 4 mục đọc `state.hub.connected` để ẩn; thẻ Hub trong `SetupMode`; `useReminderSources` thêm nguồn `hub`; `lib/obs-link-hub.cjs` thêm dòng link Hub dạng chữ.
- [ ] Selftest `scripts/hub-link-selftest.mjs` dùng `fake-hub.cjs`: pass / consume / hold / mất Hub / quá hạn.

**HP Action LIVE** (`server.js`, Electron 42, cổng 3000)
- [ ] SDK + `capabilities.queue = false`; `live.gift` + `gift.plan` ở đầu `emitGift` (đã có `repeatEnd` → `quantity = repeatCount`); `live.status` ở `conn.on`.
- [ ] `gift.plan consume` → không phát `gameGift` cho các game camgames cũ; GĐ3 gỡ `lib/camgames*.js`, `lib/body-server.js`, `bgInstall*`.
- [ ] Trung tâm link OBS: thêm link Hub; giữ `hpaction.obs` cho overlay của chính nó.

**HP Group LIVE / app mới**: chỉ SDK + §4.1–4.6 + thẻ Hub. Không chép game.

## 10. Thử nghiệm bắt buộc trước khi phát hành app có Hub Link

1. Máy **chưa cài Hub**: app chạy y như cũ, thẻ Hub "Chưa cài" + nút Tải.
2. Cài Hub, mở app → hộp thoại mã trên Hub, mã khớp trên app → Cho phép → thẻ xanh ≤ 3 s.
3. Tắt Hub giữa LIVE → quà vẫn chạy Bảng Quà; mở lại Hub → tự nối, không hỏi lại.
4. Quà kích hoạt Đập Muỗi → `hold` → hàng đợi app đứng → phiên hết → phát lại.
5. Người ở ➖ Chế độ trừ quà tặng quà trong phiên → `consume` (Đồng minh), Bảng Quà không chạy.
6. 🧪 Thử quà trên Hub → app chạy như quà thật nhưng `isTest`.
7. Ngắt trên Hub → app báo cần cho phép lại, không xin lại tự động.
