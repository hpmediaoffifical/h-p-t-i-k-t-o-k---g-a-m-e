# Giao diện mới HP Action LIVE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Vỏ app tông sáng chia nhóm (sidebar + topbar + statusbar + Ctrl K + trang chủ có dải sẵn sàng), mọi game đổi sang sáng mà overlay OBS không đổi.

**Architecture:** `style.css` được tokenize: màu cứng → `var(--bg|fg|bd-<hex>, <màu cũ>)`; chỉ `public/ui/ui-v2.css` (nạp ở `index.html`, phạm vi `body.ui-v2`) khai báo biến → app sáng, overlay y cũ. Vỏ mới thêm vào `index.html` giữ nguyên id cũ.

**Tech Stack:** HTML/CSS/vanilla JS, Node `node --test`, Edge headless để chụp.

**Spec:** `docs/superpowers/specs/2026-11-06-giao-dien-moi-design.md`

## Global Constraints

- Không đổi đường dẫn `/overlay/*`, `buildOverlayURL()`, id DOM mà app.js/panel dùng, hàm toàn cục.
- `public/index.html`, `public/style.css` CRLF? — kiểm dòng kết thúc trước khi vá (memory: public/* CRLF).
- Màu token đúng như mẫu: bg `#FBF5F4`, surface `#FFFFFF`, subtle `#F8F1EF`, muted-bg `#F2E8E5`, line `#EEE3E0`, line-strong `#DFD0CC`, ink `#241B1F`, ink-2 `#54474B`, muted `#6B5E62`, brand `#FF2D6F→#FF7A45`.
- Font: "Be Vietnam Pro" nếu cài, fallback "Segoe UI Variable", system-ui (không tải mạng).

## Review Focus

- Overlay `/overlay/thuytinh` (nạp style.css) phải vẽ y cũ → test fallback = màu tên biến + so ảnh trước/sau.
- Nút gradient/nhấn vẫn chữ trắng (không bị đổi thành mực) → script bỏ qua `fg` trong rule có nền bão hoà; kiểm ảnh.
- Kết nối/ngắt TikTok vẫn đổi nút + hiện stats trong topbar → `setConnectedUI` không đổi, chỉ dời DOM.
- Game con Camera/Tương Tác vẫn ẩn khỏi sidebar, mở được từ hub → renderGameList giữ bộ lọc.
- `tests/app-smoke.test.js` nạp app.js trong vm → mọi hàm mới phải chịu được DOM thiếu.

---

### Task 1: Tokenize `style.css`

**Files:** Create `tools/ui-tokenize-css.js`; Modify `public/style.css`; Test `tests/ui-tokenize.test.js`

**Interfaces:** Produces `tokenize(css) -> {css, vars: Map<name,{kind,color}>}`, `untokenize(css) -> css`, `varName(kind, color) -> '--bg-0b0d12'` (hex 3/6/8 chữ số chuẩn hoá thường; rgb/rgba → `--bg-rgba-11-13-18-50`); CLI `node tools/ui-tokenize-css.js` ghi file + `public/ui/ui-v2-map.css` (bảng ánh xạ sinh tự động).

- [ ] Test: `untokenize(tokenize(x).css) === x` cho mẫu; `tokenize` idempotent; mọi `var(--(bg|fg|bd)-K, V)` trong `public/style.css` có `V` khớp K; rule có `background: linear-gradient(#ff2d6f…)` không bị đổi `color:#fff`.
- [ ] Chạy test → FAIL. Viết script (bỏ qua `@keyframes`, giá trị trong `box-shadow`/`text-shadow`/`filter`, comment). Chạy CLI, script tự assert untokenize === gốc. Test PASS. Commit.

### Task 2: `ui-v2.css` token + ánh xạ + kiểu chung

**Files:** Create `public/ui/ui-v2.css`, `public/ui/ui-v2-map.css` (từ Task 1); Modify `public/index.html` (link 2 file sau style.css, `<body class="ui-v2">`)

- [ ] Ánh xạ sinh theo độ sáng (spec §1); reset `initial` trong khung preview overlay (`#stage-frame`, `.stage-wrap`, iframe không cần).
- [ ] Kiểu chung `.game-header`, `.card`, input, nút, tabs, bảng, modal, thanh cuộn.
- [ ] Chụp headless app (server chạy) vài màn, chỉnh. Commit.

### Task 3: Nhóm sidebar

**Files:** Create `public/ui/nav-groups.js`; Modify `public/app.js` `renderGameList()`; Test `tests/nav-groups.test.js`

**Interfaces:** `HpNavGroups.GROUPS: [{id,label}]`, `HpNavGroups.groupOf(gameId) -> groupId` (lạ → `'gift'`), `HpNavGroups.group(games) -> [{id,label,items}]` giữ thứ tự, bỏ nhóm rỗng. UMD (window + module.exports).

- [ ] Test `groupOf('camgames')==='camera'`, `groupOf('pktiktok')==='fx'`, `groupOf('liveTranslate')==='tools'`, `groupOf('xyz')==='gift'`, `group()` bỏ nhóm rỗng + giữ thứ tự. FAIL → code → PASS.
- [ ] renderGameList chèn `<div class="nav-sec">label <span>n</span></div>` theo nhóm. app-smoke PASS. Commit.

### Task 4: Vỏ app — topbar, statusbar, sidebar mới

**Files:** Modify `public/index.html:31-97`, `public/app.js` (`setStatus`, `setConnectedUI`, `updateLicenseBadge`, footer version)

- [ ] Dời `#conn-row`, `#btn-connect`, `#status-row`, `#live-stats-grid`, 5 fab vào `header.topbar`; statusbar `#sb-tiktok`, `#sb-host`, `#sb-version`; sidebar: brand, `#nav-search`, `#game-list`, giftboard, footer.
- [ ] `setStatus` cập nhật thêm `#sb-tiktok` (an toàn khi null). Kiểm kết nối giả. Commit.

### Task 5: Ctrl K

**Files:** Create `public/ui/cmdk.js`; Modify `public/app.js` (xuất `window.hpGameIndex = () => games đã lọc`), `index.html`; Test `tests/cmdk.test.js` cho `HpCmdk.match(query, items)` (bỏ dấu, "hu" khớp "Hũ Thủy Tinh", rỗng → tất cả).

- [ ] Test FAIL → code → PASS → kiểm tay Ctrl K → commit.

### Task 6: Trang chủ dải sẵn sàng

**Files:** Modify `public/index.html` (`#view-home`), `public/app.js` (`renderHomeReady()` gọi từ setConnectedUI/updateLicenseBadge/syncSideToggle/loadGames).

- [ ] 3 ô TikTok / Bản quyền / Game đang bật; chụp; commit.

### Task 7: Rà từng màn game

- [ ] Chụp headless mọi `#view-*` (mở qua `?` hoặc `hpOpenGame` bằng CDP), vá chỗ tối còn sót bằng `body.ui-v2 #view-<id> …`. So ảnh overlay thuytinh trước/sau. `npm test` PASS. Commit.
