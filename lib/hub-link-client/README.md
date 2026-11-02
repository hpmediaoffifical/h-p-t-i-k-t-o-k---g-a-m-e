# hub-link-client

SDK để app HP (HP NPC LIVE, HP Action LIVE, HP Group LIVE…) tự **tìm**, **ghép đôi** và **nói chuyện** với HP Game Hub trên cùng máy.
Không phụ thuộc npm, CommonJS (`index.cjs`) + ESM (`index.mjs`). Cần Node >= 22 / Electron (có sẵn `fetch` + `WebSocket`);
nếu app dùng Node cũ hơn thì cài gói `ws`, SDK tự dùng. Không có cả hai → `state().lastError === 'no_websocket'`.

Giao thức đầy đủ: `HP-GAME-HUB-LIEN-KET.md` (chép vào `docs/` của app).

## Chép vào app

```
node "F:\PHAT TRIEN GAME\HP Game Hub\sdk\install.cjs" <đường dẫn app>
```

Chép 5 file vào `<app>/lib/hub-link-client/` và ghi `kit.json` (phiên bản + sha256). Chạy lại để nâng cấp; file bị sửa tay thì
lệnh từ chối, thêm `--force` để ghi đè. **Đừng sửa tay file trong thư mục này** - sửa ở repo HP Game Hub rồi chép lại.

## Gắn vào app (6 dòng)

```js
const { createHubLink } = require('./lib/hub-link-client');
const hub = createHubLink({ appId: 'hp-npc-live', appName: 'HP NPC LIVE', version: pkg.version, scopes: ['live.send', 'gift.plan', 'state.read'], dataDir });
hub.on('state', (s) => publicState.hub = s);                 // thẻ "HP Game Hub" + Gà HP
hub.on('game.session', (d) => onCamSessionEvent(d));         // sự kiện Hub → app (tên theo HP-GAME-HUB-LIEN-KET.md §5)
hub.start();                                                 // tự dò Hub mỗi 10 s, tự ghép đôi, tự nối lại
const plan = await hub.request('gift.plan', gift, 300).catch(() => ({ decision: 'pass' })); // Hub chết / quá hạn = pass
hub.send('live.gift', gift);                                 // mất Hub thì trả false, không ném
```

Quy tắc: **mất Hub không được làm treo LIVE** - luôn có đường `pass` khi `request` lỗi.

## Tuỳ chọn `createHubLink({...})`

| Tuỳ chọn | Mặc định | Ý nghĩa |
|---|---|---|
| `appId` | (bắt buộc) | Mã app, `a-z 0-9 -`, 3-40 ký tự |
| `appName` | `appId` | Tên hiện trên hộp thoại "muốn liên kết" của Hub |
| `version` | `'0.0.0'` | Phiên bản app |
| `scopes` | `['live.send','gift.plan','state.read']` | Quyền xin: `live.send gift.plan fx.control game.control obs.control state.read` |
| `capabilities` | `{ queue: true }` | App không có hàng đợi (Action LIVE) khai `{ queue: false }` |
| `dataDir` | (không) | Nơi lưu `hub-link.json` `{ token, hubMachineId, scopes, pairedAt }`. Không đặt = token chỉ giữ trong bộ nhớ |
| `discoveryFile` | `%APPDATA%\HP Media\HP Game Hub\hub.json` (env `HP_HUB_DISCOVERY_FILE`) | File Hub ghi cổng đang chạy |
| `probePorts` | `3777…3797` | Cổng dò `hello` khi không có file khám phá. `[]` = không dò |
| `pollMs` | `10000` | Chu kỳ dò lại khi chưa nối |
| `backoffMinMs` / `backoffMaxMs` | `1000` / `10000` | Lùi khi đang nối mà bị ngắt |
| `pairPollMs` | `1000` | Chu kỳ hỏi Hub "đã duyệt chưa" |
| `helloTimeoutMs` | `300` | Quá hạn hỏi `hello` |
| `deadMs` | `15000` | Hub im (không ping) quá lâu → coi là chết, nối lại |
| `wsOpenTimeoutMs` | `10000` | Bắt tay WebSocket quá hạn → đóng, `lastError = 'ws_timeout'`, thử lại vòng sau |
| `installFile` | `%APPDATA%\HP Media\HP Game Hub\install.json` (env `HP_HUB_INSTALL_FILE`) | Dấu vết trình cài Hub, để biết "đã cài chưa" (chỉ tính khi `exe` trong file còn trên đĩa) |
| `logger` | `console.warn` | `{ info, warn }` |

## Hàm

| Hàm | Làm gì |
|---|---|
| `start()` / `stop()` | Bật / tắt vòng dò + kết nối |
| `state()` | Ảnh chụp trạng thái (bảng dưới) |
| `send(name, data)` | Gửi sự kiện một chiều. Trả `true/false` (chưa nối = `false`) |
| `request(name, data, timeoutMs = 1500)` | Hỏi Hub, chờ trả lời. Chưa nối → reject ngay `err.code = 'not_connected'`; quá hạn `'timeout'`; Hub báo lỗi → `err.code` = mã Hub (`scope_denied`, `unknown_name`…) |
| `on(name, fn)` / `off(name, fn)` | Nghe sự kiện (`on` trả hàm huỷ) |
| `handle(name, fn)` | Trả lời khi Hub hỏi app (req từ Hub) |
| `pair()` | Xin ghép tay, trả `'approved' \| 'denied' \| 'expired' \| 'no_hub' \| 'error'`. Nút "Cho phép lại" của app gọi hàm này |
| `launch()` | Chắc Hub đang chạy: mở exe đã cài, ẩn dưới khay (`--minimized`). `false` = chưa cài / exe đã bị gỡ. Mở lỗi về sau chỉ ghi log + `lastError = 'launch_failed'`, không bao giờ làm sập app. Link tải: `hub.links.download` |
| `open(page)` | Mở một trang Hub cho người dùng xem (`home camera fxlib obs link setup settings info`). Đã nối → `POST /hub/v1/open` tới đúng Hub đã ghép; chưa nối mà đã cài → mở exe (hiện cửa sổ). Trả `'opened' \| 'launched' \| 'not_installed' \| 'failed'`, không reject |
| `overlays()` | `GET /hub/v1/overlays` → `[{ id, url }]` (link overlay để app ghi vào Trung tâm OBS của mình, dạng chữ + link). Chưa nối → reject `not_connected` |

## Sự kiện (`on`)

`'state'` (mỗi lần đổi, dữ liệu = `state()`) · `'connected'` · `'disconnected'` (`{ code, reason }`) · `'pairing'` (`{ code, pairId }` - hiện mã
cho người dùng đối chiếu với hộp thoại trên Hub) · cùng **mọi tên `ev` Hub gửi** (tên trùng sự kiện SDK - `state`, `connected`, `disconnected`, `pairing` - được chuyển thành `hub:<tên>`) (`game.session`, `fx.row`, `gift.test`, `hub.state`…, dữ liệu = `data`).

| Sự kiện từ Hub | Ghi chú |
|---|---|
| `fx.row` | Chỉ app khai `queue: true`. Luật thứ tự: `start` luôn trước `len` / `trim`; `done` hoặc `skip` đúng MỘT lần mỗi hàng rồi hết |
| `hub.needs` (cần scope `state.read`) | `{ kind, message, action: { page } }` khi một loại việc cần làm VỪA xuất hiện (`overlay_missing` · `obs_disconnected` · `install_pending`); danh sách sống nằm ở `hub.state.needs` - tắt nhắc khi loại đó biến mất. `action.page` đưa thẳng cho `open(page)` |
| `catalog.request` | Hub chưa có danh mục quà: app trả lời bằng cách gửi lại `catalog.gifts` |

`hub.ping` SDK tự trả `hub.pong`, không đến app.
`hub.state` mang `provides` (mảng, vd `['camera']`) = việc Hub làm được cho app lúc này: app chỉ nhường việc / ẩn mục menu khi `provides` có nó
(thiếu hoặc rỗng = app tự chạy như cũ). Quà thật đã bị app chia gửi bằng `live.gift` `{ kpiOnly: true }`, từng phần chia bằng `gift.plan` có `tier` -
xem `HP-GAME-HUB-LIEN-KET.md` §4.4.

## `state()`

| Trường | Ý nghĩa |
|---|---|
| `installed` | Hub đã cài (`install.json` có `exe` còn trên đĩa) hoặc đang chạy |
| `running` | Thấy Hub đang chạy |
| `paired` | Có token hợp lệ |
| `connected` | WebSocket đang mở |
| `scopes` | Quyền ĐÃ được cấp (bản sao; `[]` khi chưa có token) |
| `missingScopes` | `scopes` xin trong `createHubLink` trừ quyền đã cấp (`[]` khi chưa ghép). **Thêm quyền mới (vd `fx.control`) thì token cũ thiếu quyền**: SDK KHÔNG tự ghép lại - app hiện nút "Cho phép lại" gọi `pair()` khi `missingScopes` khác rỗng |
| `pairing` | `{ code, pairId }` khi đang chờ người dùng duyệt, ngược lại `null` |
| `hub` | `{ port, version, machineId }` hoặc `null` |
| `lastError` | `null` hoặc: `no_websocket` · `ws_error` · `tick_error` · `pair_error` · `token_revoked` · `pair_denied` · `pair_expired` · `pair_failed` · `hub_not_running` · `unauthorized` · `hub_changed` · `bad_origin` · `ws_timeout` · `launch_failed` |

## App có hàng đợi

App có hàng đợi hiệu ứng riêng (HP NPC LIVE) khai `capabilities: { queue: true }` ở `createHubLink` **và trong `live.status`** (Hub chỉ gửi `rows`
trong `gift.plan` cho app khai `queue === true` trong `live.status`; không khai = `rows: []`, Hub tự chạy ngay như GĐ1):

**Nhường VTube Studio (GĐ2c):** Hub báo `provides` có `vtube` hễ công tắc VTube Studio của Hub bật. App có VTube Studio riêng thấy `vtube` thì **dừng VTS của mình trước**, rồi mới khai `capabilities.vtube = true` (cũng trong `live.status`); khi `vtube` biến mất thì chạy lại VTS của mình rồi khai `vtube = false`. Không khai thì Hub bỏ qua quà của app cho VTS (luật đầy đủ: `HP-GAME-HUB-LIEN-KET.md` §4.1, §5). Phía HP NPC LIVE chưa làm (Phần B).

1. `gift.plan` trả về `rows[]` → app đặt từng hàng vào hàng đợi rồi gửi ngay `hub.send('queue.row', { rowId, phase: 'placed', ... })` (trong 3 s, quá hạn Hub tự chạy hàng đó).
2. Tới lượt chạy → `queue.row` `phase: 'start'` kèm bản sao `row` (Hub khởi động lại giữa chừng vẫn nhận được).
3. Hub trả lời bằng `fx.row` (`start` → `len` / `trim` → `done` | `skip`). App có thể gửi `cancel`, `trim { n }`, `skip` cho hàng của mình.

Chi tiết trường: `HP-GAME-HUB-LIEN-KET.md` §4.6-§4.7. Thử bằng Hub giả: `fake.emit(appId, 'fx.row', {...})` và đọc `fake.received`.

## Hành vi cần biết

- **Thu hồi** (người dùng bấm Ngắt trên Hub, `401 token_revoked` / WS đóng 4001): xoá token, `paired=false`, **không** tự xin lại
  cho tới khi gọi `pair()`. Bị từ chối: không xin lại 10 phút. Mã ghép hết hạn: chờ `pair()`.
- Mất kết nối vì lý do khác: nối lại với token cũ, lùi 1 s → 10 s. Sau khi nối lại hãy **gửi lại** `live.status`, `profile.changed`, `catalog.gifts` (nghe `'connected'`).
- `hello.machineId` khác lúc ghép (Hub của máy khác / Hub giả) → bỏ token, ghép lại. machineId = hostname + MachineGuid của Windows nên
  **cài lại Hub không đổi**; mất dữ liệu Hub (xoá `data/`) thì app nhận 4401 rồi tự ghép lại.
- **Một appId = một token.** Ghép lại cùng appId = token cũ bị thu hồi (socket cũ đóng 4001). Bản dev chạy song song bản cài trên cùng
  máy: dùng appId riêng (vd `hp-npc-live-dev`) hoặc dùng chung `dataDir` token, nếu không hai bản sẽ thu hồi token của nhau.

## Chạy selftest của app với Hub giả

`fake-hub.cjs` cần gói `ws` (app dùng socket.io thì đã có; không thì `npm i -D ws`).

```js
const { startFakeHub } = require('../lib/hub-link-client/fake-hub.cjs');
const { createHubLink } = require('../lib/hub-link-client');

const fake = await startFakeHub({
  handlers: { 'gift.plan': (gift) => ({ decision: gift.giftId === '5655' ? 'consume' : 'pass' }) }, // mặc định: { decision: 'pass' }
});
const hub = createHubLink({ appId: 'hp-npc-live', appName: 'Test', version: '1', scopes: ['live.send', 'gift.plan'],
  dataDir: tmpDir, discoveryFile: fake.discoveryFile, probePorts: [], pollMs: 200 }).start();
// ... đợi hub.state().connected, chạy ca thử ...
hub.send('live.status', { live: true });   // fake.received có { appId, t, name, data }
fake.emit('hp-npc-live', 'game.session', { type: 'start', gameId: 'dapmuoi' });   // Hub → app
await fake.close(); hub.stop();
```

`startFakeHub({ port = 0, autoApprove = true, handlers = {}, discoveryFile, pingMs = 5000, grantScopes = (requested) => requested })` (hàm async) trả
`{ port, url, token, received, pongs, opened, pairCount, discoveryFile, emit(appId, name, data), approve(), revoke(appId), scopesOf(appId), close() }`
(`opened` = các lần `POST /hub/v1/open` `{ appId, page, auth, xHpApp }`; `pairCount` = số lần `POST /hub/v1/pair` đã tới Hub giả - đọc lúc nào cũng
được, test dùng `=== 0` để chứng minh app KHÔNG xin ghép (vd máy chủ cách ly) và `=== 1` sau một lần ghép; Hub giả cũng trả `GET /hub/v1/overlays`):
`grantScopes(requested)` quyết định quyền được cấp (vd `(r) => r.filter((s) => s !== 'fx.control')` để thử `state().missingScopes`); `scopesOf(appId)` = quyền đã cấp cho app
(`null` nếu chưa ghép). Handler mặc định còn có `fx.list` → `{ sources: [], sig: '' }`, `fx.fire` → `{ ok: false, code: 'unknown_src', … }`, `fx.stop` → `{ ok: true, stopped: false }`.
`autoApprove: false` → app hiện `state().pairing.code`, test gọi `fake.approve()`; `revoke(appId)` mô phỏng người dùng bấm Ngắt.
