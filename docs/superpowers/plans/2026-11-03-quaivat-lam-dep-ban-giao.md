# 🧟 Zombie Phá Nhà — bàn giao làm đẹp (03/11/2026)

Tài liệu để người/tài khoản khác làm tiếp phần làm đẹp + map mới của game `quaivat`.

## Trạng thái

- **Nhánh:** `feature/quaivat-dep-dot1`, cắt từ tag `v1.20.0` (commit `cbd95ec`). **Chưa push, chưa release.**
- **Worktree:** `.claude/worktrees/zombie-dep` (nằm trong thư mục project gốc `F:\PHAT TRIEN GAME\HP Action LIVE`).
  - `node_modules` là junction trỏ về `node_modules` của project gốc.
  - Đã copy `hpkey/secret.local.js` (cần cho license, xem CLAUDE.md).
- **Commit:**
  - `1676003` — Đợt 1 làm đẹp: mặt đường riêng từng map, màu kiểu phim, viền sáng zombie, mây đêm, nền mờ sau chữ giữa màn.
  - `3f6c702` — Map 8 **Đầm Sen**: nước xen đất liền, phao vịt, bẫy trên lá sen.
- **User đã duyệt:** "đẹp rồi" cho cả hai commit.

## Chạy thử

```bash
# server riêng, kho dữ liệu riêng (không đụng app thật)
PORT=3075 HP_DATA_DIR=<thư mục tạm> node .claude/worktrees/zombie-dep/server.js
```

Hoặc trong Claude Desktop: `preview_start` với cấu hình `hp-zombie-dep` trong `.claude/launch.json` (của project gốc).

- **Link thử:** `http://localhost:3075/overlay/quaivat?ratio=9:16&map=<1..8>&clean=1`
- **Điều khiển từ console** (trang không cần hiện lên màn hình):
  - `__game.mon.z = -30; __game.step(60)`: dịch zombie tới chỗ đó rồi chạy 60 khung.
  - `__game.runAction('bomb' | 'mine' | 'trap' | 'plant', { id: 'a', name: 'A', avatar: '' })`: thả quà thử.
  - `__game.items`: danh sách đồ vật. Mỗi món có cờ `lotus` = đang nằm trên lá sen.
- Ảnh chụp lần đầu sau khi tải trang hay bị trống → chụp lại.
- Số FPS đo trong trình duyệt thử bi quan hơn OBS thật nhiều, chỉ dùng để so tương đối.

## Đã làm — nằm ở đâu (`public/games/quaivat/game.js`)

| Phần | Chỗ trong code | Ghi chú |
|---|---|---|
| Màu hậu kỳ | `GradeShader` | vibrance + đường cong chữ S + vùng tối lạnh / vùng sáng ấm (`uSh`/`uHi`) + tối 4 góc |
| Viền sáng zombie | `addRim()`, uniform `RIM` | gắn vào `mon.mats` trong `setupMonster()` |
| Thông số theo map | `MAPS[i]` | `path` (mặt đường), `grade { sh, hi, sat, con, vig }`, `expo`, `rim`, `cloudCol`, `water` |
| Áp thông số khi đổi map | `buildMap()` | |
| Mặt đường | `pathTex()` | ảnh canvas 12m × `PATH_M` m (64px/m). Kiểu `stripe`, `leaves`, `snow`, `stone`, `brick`, `basalt` (có `emissiveMap` khe nham thạch, cố ý để dịu hơn bẫy `lavacrack` thật), `cobble` |
| Chia đoạn nước | `planWater()` | gọi đầu `buildWorld()`. Chừa ±3m quanh cột mốc và 12m trước cửa nhà |
| Hỏi một điểm có nằm trong nước không | `waterAt(x, z, pad)` | |
| Dựng cảnh nước | `buildWater()` | mặt nước gợn (ảnh `waterTex` chạy trong `updateWade`), bờ cát, đá viền, lá sen + bông sen, lau sậy. Hàng rào cây / cỏ / hoa bỏ qua các đoạn nước |
| Lội nước | `groundY()` trả `-WATER_DEPTH` (0.55); `terrainFactor()` nhân `WATER_SLOW` (0.55) | |
| Phao vịt | `mkDuckRing()` + `updateWade()` | gắn vào `mon.root`. Có bắn nước, chữ "🦆 LỘI NƯỚC!", gợn sóng (`parts` ring) |
| Lá sen dưới bẫy | `lotusIfWater(it)` cho `LOTUS_KINDS` (mine, bomb, trap, plant) | gọi trong `placeMine`, `spawnFromGround`, `onLand`. Mìn ẩn ụ đất (`g.userData.dirt`) |
| Nền mờ sau chữ giữa màn | `overlay.html` `#banner::before` | |
| Tên map trong panel | `quaivat-panel.js` mảng `MAPS` | |

## Luật / bẫy cần nhớ

- **Map mới luôn thêm CUỐI `MAPS`** (và cuối mảng tên trong `quaivat-panel.js`). `qvStartMap` lưu theo số thứ tự, chèn giữa sẽ lệch map người dùng đã chọn.
- **Máu cửa và thời gian ván tăng theo số thứ tự map** (`mapDoorHp`, `mapRoundT`). Đầm Sen ở vị trí 8 nên cửa trâu gấp khoảng 2 lần map 1. Nếu user muốn dễ hơn thì thêm `doorMul < 1` cho map đó.
- **`sph()/box()` đặt `scale` = kích thước.** Muốn kéo dẹt thì dùng `scale.multiply(new V3(...))`, KHÔNG dùng `scale.set(...)`. Lỗi này từng làm phao vịt to 1m che mất zombie.
- **`MS()` cache theo `JSON.stringify(extra)`.** Đừng truyền texture vào `extra` (nó sẽ serialize cả ảnh). Tạo material riêng như `lotusMat`.
- **Nhãn trên màn hình phải ngắn, tránh từ dễ bị TikTok bóp:** chết, bom, mìn, nổ, thảm họa… Tên biến trong code thì không sao.
- **Ý user về phao vịt:** vẫn phải thấy rõ zombie; phao chỉ là phụ kiện nhỏ quanh lưng.
- **Electron tắt GPU** → game chơi qua cửa sổ Edge/Chrome `--app` (`POST /api/quaivat/window/open`).
- **File LF** (game.js, overlay.html, quaivat-panel.js). Git báo "LF will be replaced by CRLF" là bình thường.
- **Một session khác đang làm nhóm menu "🎮 Game Tương Tác"** ở checkout gốc. Nhóm đó KHÔNG sửa `public/games/quaivat/`, nhưng cần giữ `#view-quaivat .game-header .overlay-bar`. Đừng gom file của nhóm đó (`public/games/gametuongtac/*`, `app.js`, `index.html`, `style.css`) vào commit Zombie.

## Gợi ý làm tiếp (ưu tiên từ trên xuống)

### A. Hoàn thiện Đầm Sen (nhỏ, nên làm trước khi release)
1. **Thử trên OBS thật + máy stream**, đo FPS: có thêm khoảng 1–2 nghìn mesh lá sen / lau sậy. Nếu nặng thì gộp lá sen trang trí thành `InstancedMesh`.
2. **Hỏi user vị trí map:** để ở map 8 (sau boss) hay chèn sau Mùa Thu. Nếu chèn thì phải chuyển đổi `qvStartMap` cũ (+1 cho giá trị ≥ vị trí chèn).
3. **Đồ vật khác rơi xuống nước:**
   - Thùng gỗ / khoai lăn: nổi bập bềnh, trôi chậm.
   - Đá: chìm một nửa + bắn nước.
   - Keo dính (slime) trong nước: thành vệt dầu loang.
4. **Âm thanh lội nước riêng.** Hiện dùng `sfx('splat')`; có thể thêm tiếng "bõm" và tiếng vịt kêu khi xuống nước.
5. **Nhà cuối map:** nhà sàn / chòi lá cho hợp đầm sen (`T.style = 'pond'` trong `buildHouse`).
6. **Thêm vào `ENV` mô hình CC0** (cây dừa, cầu tre) để `decorateMap()` trang trí map 8. Hiện map này chưa có mục `ENV` nên dùng cây tự vẽ.

### B. Đợt 2 — cảnh vật
1. **Núi:** thay `ConeGeometry` bằng địa hình gồ ghề nhiều lớp (Plane + dịch đỉnh bằng hàm nhiễu), xa thì nhạt theo sương. Đây là chỗ nhìn "rẻ" nhất còn lại, rõ nhất ở map đêm và Núi Lửa.
2. **Map đêm:** trăng (sprite sáng + `bloom`), sao (Points trên `skyDome`). Mũ tuyết trên núi đang quá sáng ở map đêm → nhuộm theo `T.mtn`.
3. **Mặt trời thấp hơn** (`updateCamera`: `sun.position.set(mon.x + 16, 34, …)`) để bóng đổ dài hơn, nhìn có chiều sâu.
4. **Khung lúc mở ván:** 1/3 dưới màn hình là nhựa đường xám trống.
   - Cách 1: hạ / đẩy camera tới trong `intro`.
   - Cách 2: làm vỉa hè, đường đẹp hơn (vạch kẻ, vết nứt, vũng nước, rác).
5. **Xứ Tuyết vẫn hơi xám:** thử `expo` 0.86 + thêm tuyết rơi (đợt 3).

### C. Đợt 3 — hiệu ứng
1. **Hạt bay theo map** (`THREE.Points`, một hệ cho cả map):
   - lá rơi (Mùa Thu), tuyết rơi, tro bay (Núi Lửa)
   - đom đóm / ma trơi (Nghĩa Trang, Lâu Đài)
   - chuồn chuồn (Đầm Sen)
2. **Cửa vỡ thành mảnh** khi zombie phá được (`endRound` → mảnh gỗ có vật lý đơn giản).
3. **SSAO / GTAO** cho bóng tối ở góc khuất: cần thêm `GTAOPass.js` (+ shader phụ thuộc) của three **r160** vào `vendor/addons/postprocessing/`. Phải tải đúng bản r160, hỏi user trước khi tải.
4. **Nhòe hậu cảnh lúc kết ván** (BokehPass, chỉ bật trong cảnh thắng).

### D. Chức năng (user có hỏi "chức năng chuyên nghiệp" nhưng chưa soi sâu)
- **Hỏi user chỗ nào chơi chưa ổn** trước khi đoán.
- **Ứng viên:**
  - Chữ nổi `.pt.big` và `#banner` vẫn có thể chồng nhau → xếp hàng đợi thông báo, mỗi lúc chỉ hiện một cái.
  - Cột quà hai bên (`.colL/.colR`) chiếm nhiều chỗ trên khung 9:16 → cho thu gọn / tự ẩn khi đang có hành động.

## Ảnh tham khảo

Ảnh trước/sau đã gửi user trong phiên 02–03/11. Muốn có ảnh mới thì chụp lại bằng link thử ở trên.
