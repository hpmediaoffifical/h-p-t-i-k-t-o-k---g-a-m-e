# 🧟 Zombie Phá Nhà — đề xuất hoàn thiện (03/11/2026)

**Nguồn:**
- Chạy thử trực tiếp trên server thử (map 1, 4, 8, khung 540×960) và đo bộ nhớ GPU ngay trong trang.
- 5 agent của bộ Claude Code Game Studios, chỉ đọc code:
  - `game-designer`: vòng lặp lõi
  - `economy-designer`: cân bằng quà
  - `ux-designer`: giao diện trên điện thoại
  - `technical-artist`: hình ảnh, cảm giác va chạm, chi phí vẽ
  - `live-ops-designer`: giữ chân người xem trong buổi LIVE dài
- Bổ sung cho khảo sát `docs/superpowers/plans/2026-11-03-game-tuong-tac-khao-sat.md` (ở checkout gốc) và file bàn giao `2026-11-03-quaivat-lam-dep-ban-giao.md`.

Code đọc trên nhánh `feature/quaivat-dep-dot1`. Phần `public/games/quaivat/` của nhánh này giống hệt `tuongtac/zombie`. Số dòng ứng với `game.js` của nhánh này.

**Ký hiệu nguồn:**
- **[Đo]**: đo khi chạy.
- **[Code]**: đọc thẳng trong code, đã kiểm lại.
- **[Ước]**: tính từ công thức, chưa đo; hoặc là suy luận.

---

## 5 vấn đề lớn nhất

1. **Đổi map là rò bộ nhớ GPU, không bao giờ trả lại. [Đo]**
   - Mỗi lần đổi map thêm khoảng 20 texture và khoảng 27 geometry.
   - Mỗi lần zombie thắng là đổi map, nên LIVE càng lâu máy càng nặng.
2. **Quà chưa công bằng với người tặng.** Điều này trái luật "tặng bao nhiêu chạy bấy nhiêu".
   - Tăng tốc không cộng dồn. [Code]
   - Lion (29.999 xu) chỉ ra 1 Đá lăn, như Corgi. [Code]
   - Đá lăn tặng liên tiếp thì viên sau gần như mất trắng. [Ước]
   - Thang giá bị ngược: Động đất 999 xu yếu hơn Đá lăn 299 xu. [Ước]
3. **Người xem không có đường thắng.**
   - Đồng hồ tắt mặc định, nên phe chặn chỉ làm chậm được zombie. [Code]
   - Phòng đông quà thì zombie có thể kẹt mãi, ván không có kết. [Ước]
4. **Khung 9:16 chưa hợp với điện thoại.**
   - Zombie đứng đúng vùng bình luận của TikTok.
   - Cửa nhà, mục tiêu chính, chỉ cao khoảng 5% khung.
   - Chữ trên điện thoại chỉ khoảng 7pt.
   - Người xem không biết "tặng gì thì ra gì".
5. **Người tặng không được ghi công, và không có gì được lưu.**
   - MVP chỉ hiện khi hết giờ, mà đồng hồ thì tắt.
   - Mốc 20 WIN chỉ là con số. Tới 20 không có gì xảy ra, số cứ tăng thành 27/20.
   - OBS tải lại là mất hết.

---

## Số đo rò bộ nhớ khi đổi map [Đo]

**Cách làm:**
- Cho zombie thắng (`runAction('win')`), bỏ qua cảnh ăn não, chạy tiếp 2 khung hình.
- Lặp lại 11 lần và ghi `renderer.info.memory`.

| Sau lần đổi map | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 (vòng lại map 1) | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| texture | 44 | 64 | 84 | 104 | 135 | 156 | 178 | 192 | 212 | 232 | 252 | 272 |
| geometry | 81 | 109 | 138 | 163 | 232 | 262 | 283 | 318 | 343 | 370 | 397 | 416 |

- **Không chững lại, kể cả khi vòng lại map cũ.** Nguyên nhân: `buildMap()` chỉ gọi `world.clear()` (game.js:826), không dispose gì.
- **Đồ vật do quà tạo ra gần như không rò.** Thử 3 ván, mỗi ván 36 món: texture 279 → 285, geometry đứng yên.
- **Nguồn khựng hình lúc đổi map** (theo technical-artist): `pathTex` vẽ 70.000 nét trên canvas 768×1024 (game.js:410–481). Con số này nặng hơn mức 52k ghi trong khảo sát.

---

## Gói 1: Sửa lỗi, nên làm trước khi release (cỡ S, khoảng 1 buổi)

| # | Việc | Chỗ code | Ghi chú |
|---|---|---|---|
| 1.1 | Dispose map cũ trong `buildMap`, giữ cache `geo`/`MS`/ENV | game.js:824–845 | Kiểm `renderer.info.memory` sau 10 lần đổi map phải đứng yên |
| 1.2 | Tăng tốc cộng dồn: `mon.speedUntil = Math.max(time, mon.speedUntil) + 5` | game.js:3229 | Sửa luật, không phải cân bằng lại. Hiện 10 Heart Me chỉ ra khoảng 7–8 giây. Rosa khi tắt đồng hồ cũng dính lỗi này (3235) |
| 1.3 | Quà đắt khớp theo **tên** (lion, universe, galaxy, money gun → Đá lăn) phải chạy đủ theo xu thật | gift-data.js:15, `onGift` 3261 | Game đã nhận xu thật (`coinValue/diamondCount`, 3593/3677). Đề xuất: nếu xu thật > 2× giá trong bảng thì `n = count × floor(xu thật / g.coins)`. **Hỏi user** |
| 1.4 | Đá lăn / Bàn tay / Động đất chờ lượt khi zombie đang bị mang hoặc đang ở sát điểm bị đẩy về | `canRunNow` 3209, đá lăn 3079 | Đúng luật "món bận thì chờ lượt". Hiện viên thứ 2 trúng lúc zombie đã ở điểm về nên gần như phí |
| 1.5 | Món bị phí khi zombie đứng ở cửa: khoai/thùng lăn ra xa, bẫy mọc **trong nhà**. Thùng phình thì ngược lại, rơi trúng đầu | `aheadSpot` 2103, `spawnObstacleFromDoor` 2471, `spawnFromGround` 2483 | Ở cửa: đồ lăn ném thẳng vào zombie, bẫy mọc dưới chân zombie, thùng phình đặt cách 2m |
| 1.6 | Nhảy chỉ cao 0,74m (vy 6.2, g 26), thấp hơn ngưỡng trúng khoai 0,85m, nên chú thích "nhảy qua khoai" sai | `monJump` 1743, khoai 3063 | vy 6.2 → khoảng 6.8, hoặc hạ ngưỡng |
| 1.7 | Bẫy đặt sẵn mỗi map (`T.mines` 7/9/11, `CONFIG.mineCount`) không chạy vì `placeMine` không được gọi ở đâu | game.js:2330 | **Hỏi user**: bật lại (nhãn "Bẫy bật") hay bỏ hẳn |
| 1.8 | WIN có thể âm (`state.win--`) | game.js:3329 | Chặn ở 0 (**hỏi user**) |
| 1.9 | Ném "dự đoán" giả định zombie đang tiến 1.35 m/s, nên streamer đứng yên là né hết đá/dép/lưới | `aheadSpot` 2105, `predictMon` 2113 | Dùng vận tốc thật của khung hình trước |
| 1.10 | Dọn code chết: nút "🤖 Quái tự né" + `qvAutoDodge` + `autoDodge` (vô tác dụng vì `manual = true` cố định), `LIMIT` (không dùng, khoá `shield` trùng), `xbarrelChance`, `mineCount` | overlay.html:181, game.js:1900/3011/3260/47/50 | |
| 1.11 | Cờ chống ngừng vẽ khi cửa sổ game bị che. Nhà Tù đã làm, chép sang | lib mở cửa sổ (khảo sát mục 6) | |
| 1.12 | Từ khảo sát cũ: pool hạt `puff()`, dispose đồ vật, giới hạn 60 FPS, pixelRatio 1 khi có composer | game.js:1280, 2970, 202 | |

---

## Gói 2: Khung hình + HUD cho người xem điện thoại (cỡ S–M)

**Bố cục đề xuất** (vùng giao diện TikTok là [Ước], cần chụp 1 buổi LIVE thật để kiểm):

```
 0% ┌────────────────────────────┐
    │[TikTok tên kênh]  [👁 ✕]  │ để trống
11% ├────────────────────────────┤
    │   WIN 3/20 🏆   ⏱2:10      │ 1 dòng, chữ ≥1.4em
    │ 🧟━━━━━🚩━━━━🏠 ▮▮▮▯ CỬA   │ đường đi + MÁU CỬA
18% ├────────────────────────────┤
    │ [1 KHE THÔNG BÁO có hàng đợi]│
    │          🏠 NHÀ             │ chân trời khoảng 25%
    │┌GIÚP──┐           ┌─BẪY──┐ │ mỗi cột ≤6 dòng, xoay trang
    │└──────┘  đường+bẫy└──────┘ │
    │          🧟                 │ chân zombie khoảng 58%
62% ├────────────────────────────┤
    │[bình luận TikTok]    │[🎁] │ chỉ có mặt đường
100%└────────────────────────────┘
```

| # | Việc | Cỡ | Chỗ code |
|---|---|---|---|
| 2.1 | **Camera**: zombie lên khoảng 58% chiều cao, chân trời khoảng 25%, nhà to hơn khoảng 1.25×. Số khởi đầu: FOV 60→50, up 6→5, back 12.5→16, ahead 12→5.5, điểm nhìn y 1.5→0 (**phải chụp lại để kiểm**). Mục này thay cho B4 trong file bàn giao: B4 đẩy camera tới làm zombie lún sâu thêm vào vùng chat | S | game.js:265, 3479–3484 |
| 2.2 | **Cỡ chữ**: chip quà .52→.8em; tiêu đề cột, TOP .55→.75em; tên chủ bẫy thu nhỏ tối thiểu 0.28→0.5, chữ .55→.8em | S | overlay.html:19, 71–78; game.js:1326 |
| 2.3 | **Máu cửa trên HUD**, cạnh 🏠 trên thanh đường đi | S | overlay.html:141; game.js:3533–3542 |
| 2.4 | **Chip quà ghi đủ "tặng gì → ra gì"**: `[ảnh quà] Hoa hồng · 1🪙 → Khoai lăn`, mỗi cột ≤6 dòng, tự xoay trang. Chip nào vừa có người tặng thì sáng 2 giây kèm avatar | M | `buildLegends` game.js:3516; overlay.html:69–75 |
| 2.5 | **Một khe thông báo có hàng đợi**: gộp `banner`/`gBanner`/`showFeed`. Thứ tự ưu tiên: kết ván > combo > quà ≥99 xu > sự kiện. Hiện tại tin mới xoá tin cũ, `#banner` che nhà, còn `#feed`/`#gbanner` nằm dưới UI TikTok | M | game.js:3501–3515; overlay.html:81, 91, 94 |
| 2.6 | **Ghi công lúc trúng**: "BẪY KẸP! · Lan" kèm avatar; quà to ghi "Lan đẩy lùi 5m" (`owner` có sẵn) | S–M | `hitMonster` 1745 |
| 2.7 | **Hướng dẫn người mới**: khi khe thông báo rảnh, cứ 4 giây xoay 1 dòng ("Tặng 🌹 → khoai lăn", "Gõ 111 → ném dép") | S | (sau 2.5) |
| 2.8 | **Bẫy dễ thấy hơn**: vòng sáng nhấp nháy dưới bẫy, màu theo nhóm, dùng 1 material chung. Keo dính đổi khỏi màu xanh lá (đang lẫn vào cỏ). Bàn tay ma tăng độ đục 0.35→0.7 | S | `newItem` 2087, 2150–2153, `mkGhostHand` 2728 |
| 2.9 | Hàng chờ hiện "⏳ 37 quà chờ · tiếp: 🌹 Lan x12". Bỏ hai ô "x30 / x25" cạnh WIN, người xem không hiểu | S | `updateHud` 3529, 3554 |
| 2.10 | **Panel streamer**: thẻ "Bắt đầu 3 bước" (Mở cửa sổ game → OBS Window Capture → Gán quà + 🧪 Thử). Ẩn "Giờ mỗi ván" khi tắt đồng hồ. Thống nhất tên "Giúp Zombie" (overlay đang ghi "HỖ TRỢ QUÁI"). Bỏ dòng hướng dẫn có chữ "bom". Đổi emoji 💥 của Bẫy bật | S–M | quaivat-panel.js:139–154, 207; overlay.html:143 |

---

## Gói 3: Luật chơi hai phe + cân bằng quà (cỡ M, **cần user duyệt từng ý**)

| # | Việc | Ghi chú |
|---|---|---|
| 3.1 | **⏳ Pha GIỮ NHÀ**: cả ván vẫn không có đồng hồ; zombie qua cột mốc thì bật đếm ngược, ví dụ 60 giây + 10 giây mỗi map. Hết giờ mà cửa còn thì **khán giả thắng** (WIN −1 như cũ) | Cho phe người xem một mục tiêu, có phút cao trào "còn 10 giây!", và cắt được ván kẹt mãi. Không bỏ quà nào vì hàng chờ đã giữ sang ván sau. Bản nhẹ hơn: chỉ ghi "kỷ lục giữ nhà" theo từng map |
| 3.2 | **🧠 Thanh Cơn Đói**: mỗi mét bị đẩy lùi thì nạp thanh; đầy thì zombie "lên cơn" 5 giây (đi 1.6×, đấm 2×) | Chống kẹt khi phòng đông. Mọi bẫy vẫn chạy đủ. **Hỏi user có bị xem là ăn gian không** |
| 3.3 | Tim/bình luận/share/follow co giãn theo cỡ phòng: `likePer = max(qvLikePer, tim 60 giây gần nhất ÷ 8)`, dép 1 lần/người/5 giây, pháo share 1 lần/người/60 giây, follow 1 lần/người | Đây là tương tác miễn phí nên không đụng luật quà. Hiện khoảng 2.100 tim/phút đã ghim được zombie liên tục |
| 3.4 | **Sửa thang giá** (số là [Ước]): Động đất đưa về đầu đường bỏ qua cột mốc (khoảng 60–90 giây, phải mạnh hơn Đá lăn). Bàn tay hụt thì ngắm lại, tối đa 3 lần. Sấm sét lực đẩy 3.5→6, choáng 1.6→3 giây. Cáo 3→6 đấm mới chạy, lực cắn 0.1→0.4 | Hiện tại số giây cản trên mỗi xu: Thùng phình 1 xu khoảng 6; Sấm sét 99 xu khoảng 0.06; Động đất khoảng 0.03 |
| 3.5 | **Thùng phình (1 xu) dịu lại**: bán kính nổ 5.5→3.5, lực đẩy `1+6k`→`1+4k`, ngưỡng lộn nhào 0.55→0.7 | Đang là món mạnh nhất game |
| 3.6 | **Phe giúp zombie thêm món 30–500 xu**: Giáp vàng 99 xu (miễn mọi đòn 8 giây, cộng dồn; `mon.armorUntil` đã có sẵn nhưng chưa món nào dùng), Nắm đấm vàng 30 xu (đấm ×2 trong 10 giây), Xe ủi 499 xu (đưa zombie tới cửa, cửa −30% máu) | Hiện phe giúp chỉ có 4 món, không món nào giúp lúc đấm cửa. Fan giàu chỉ còn WIN NGAY |
| 3.7 | Túi mù 10 xu đang có giá trị kỳ vọng khoảng 101 xu (4% ra Động đất): đổi trọng số tỉ lệ nghịch với giá | |
| 3.8 | Combo ghi công người góp nhiều nhất, banner nêu đủ tên. Hiện chỉ ghi người tặng cuối | game.js:3274 |
| 3.9 | WIN/THUA NGAY: panel cảnh báo nếu gán vào quà rẻ (khuyến nghị ≥5.000 xu) | Gán nhầm vào quà 1 xu là bị troll vô hạn, vì hàng chờ giữ qua ván |
| 3.10 | Map 1 có nhịp hơn: bẫy đặt sẵn (xem 1.7), thêm quạ khoảng 30 giây/lần cho map 1 và 8, có thể rút map 1 còn 70–80m | Map đầu tiên đang nghèo cơ chế nhất |
| 3.11 | Đầm Sen (dễ) đang đứng sau Lâu Đài (boss) nên hụt cao trào; Núi Lửa thiên thạch 6 giây/lần quá dày | **Hỏi user** vị trí map. Chèn giữa danh sách thì phải chuyển đổi `qvStartMap` đã lưu |
| 3.12 | `monsterSpeed` 1.35→1.6: tốc độ thực khoảng 0.96→1.14 m/s, đi nhanh hơn khoảng 16% | Một vòng 8 map không quà hiện khoảng 26 phút [Ước] |

---

## Gói 4: Vinh danh + giữ chân buổi LIVE dài (cỡ M)

| # | Việc | Cỡ |
|---|---|---|
| 4.1 | **Thẻ kết ván 5–7 giây** ở **mọi** kết cục: 🛡️ MVP bảo vệ + 🧟 Bạn Zombie. Tách điểm theo phe (`addPoints(user, pts, side)`). TOP BẢO VỆ chỉ xếp phe chặn; hiện người tặng bóng bay cứu zombie cũng lên top bảo vệ | S |
| 4.2 | **Mốc WIN**: 5/10/15 có banner nhỏ; đủ 20 thì màn "VÔ ĐỊCH" kèm TOP 3 rồi sang "Chặng 2 · 0/20". Panel cho chỉnh 10/20/30 | S |
| 4.3 | **Lưu phiên** (win/map/ván/điểm) ở server `<DATA_DIR>/quaivat/session.json`, route `/api/quaivat/session`. Server ghi trực tiếp từ sự kiện LIVE để không đếm đôi khi cửa sổ game và nguồn OBS cùng mở | M |
| 4.4 | **Biến thể từ vòng 2**: mỗi vòng cửa +10%, mỗi ván bốc 1 luật công bố lúc mở ván (Đêm trăng đỏ: hiểm họa ×2; Cửa vàng: sửa ×2; Gió ngược; Lũ về: nước ở map bất kỳ; Zombie khổng lồ) | M |
| 4.5 | **Danh tiếng nhiều buổi** (`fame.json` do server ghi): 🛡️ Thần Giữ Cửa, 🪤 Thợ Bẫy, 🧟 Bạn Zombie, 🔁 Khách Quen. Huy hiệu cạnh tên; người top tuần tương tác lần đầu trong buổi thì hiện thẻ chào. Bảng đổi qua lại "Ván ↔ Tuần" | M/L |
| 4.6 | **Thanh ❤ TIM CẢ PHÒNG** mỗi ván, đầy thì ra Mưa đá thưởng; giữ nguyên 100 tim = 1 đá | S/M |
| 4.7 | **Giờ vàng** mỗi 30 phút, kéo dài 1 ván: ngưỡng tim giảm nửa, báo trước 1 ván | S |
| 4.8 | **Nhắc lời dẫn cho streamer**, chỉ hiện trong panel, không lên hình: cửa sắp vỡ, 3 phút không có quà, top tuần vừa vào, còn 2 WIN… | M |
| 4.9 | **Skin mùa** (chỉ đổi trang trí, giữ nguyên quà): Noel (Xứ Tuyết), Tết (~06/02/2027, Vườn Xanh mai đào, câu đối, bao lì xì) | M/mùa |

---

## Gói 5: Cảm giác va chạm + làm đẹp (xếp lại thứ tự đợt 2/3 của file bàn giao)

| # | Việc | Cỡ | Chi phí GPU |
|---|---|---|---|
| 5.1 | **Khung chạm** cho đòn ≥100 sát thương: dừng hình 0.12–0.18 giây (dừng cả hạt); chậm 0.3× trong 0.4 giây ở cú đấm cửa cuối và lúc Đá lăn trúng; rung camera đổi sang sóng sin tắt dần có hướng. Rung ngẫu nhiên hiện tại sau nén video trông như rè hình | S | ~0 |
| 5.2 | **Báo trước** Động đất (0.6 giây rung tăng dần + vết nứt) và Đá lăn (dùng lại vòng cảnh báo của thiên thạch). Tên người tặng hiện ở điểm chạm | S | ~0 |
| 5.3 | **Cửa nứt dần theo máu** (vẽ lên canvas như `chipShield`, rơi ván ở 66% và 33%) + **cửa vỡ thành mảnh** khi phá | M | thấp |
| 5.4 | Vết cháy/nứt dán xuống đất ở chỗ thiên thạch/tay/động đất (pool 8 mặt phẳng, mờ trong 6 giây) | S–M | ≤8 lệnh vẽ |
| 5.5 | Nhà ở map đêm sáng hơn (cửa sổ, đèn lồng); bóng tròn dưới chân zombie; tăng `rim` ở map 1/8 (zombie xanh trên cỏ xanh) | S | ~0 |
| 5.6 | Núi nhiều lớp + trăng sao (núi nằm giữa khung ở mọi map) | M | thấp |
| 5.7 | Hạt bay theo map: phải **to và thưa** vì hạt 2px mất hết sau nén video | M | thấp |
| 5.8 | **BỎ SSAO/GTAO** (sau nén TikTok gần như không thấy mà tốn thêm 1–2 lượt vẽ toàn màn hình); Bokeh để cuối | — | — |
| 5.9 | **Hiệu năng thêm**: (a) giữ số PointLight cố định, vì Lâu Đài khác số đèn nên đổi map phải biên dịch lại toàn bộ shader, gây khựng; đèn sảnh chỉ bật khi vào nhà; (b) dọn `castShadow` thừa (đồ trang trí nhà, mảnh vụn, bông sen); (c) map 8 chưa có `ENV` nên vẫn vẽ khoảng 400k tam giác cây tự dựng × 2 lượt; (d) `?q=low`: bóng 1024 PCF thường, pixelRatio 1, tắt antialias, bớt hoa, nửa lá sen; đưa "Chất lượng" vào panel | S–M | giảm |

---

## Thứ tự đề xuất

1. **Gói 1** (lỗi + rò bộ nhớ). Nên xong trước khi release `tuongtac/zombie`.
2. **Gói 2 phần 2.1–2.5** (camera, chữ, máu cửa, chip quà, khe thông báo). Đây là phần người xem thấy ngay.
3. **Gói 4.1 + 4.2** (MVP mỗi ván, mốc WIN). Rẻ mà tác động lớn.
4. **Gói 5.1–5.3** (cảm giác va chạm, cửa nứt).
5. **Gói 3** sau khi user chốt luật.
6. **Gói 4.3+** và phần còn lại của gói 5.

## Câu hỏi cần user quyết

1. **Pha GIỮ NHÀ (3.1)**: làm bản đầy đủ (khán giả có thể thắng) hay bản nhẹ (chỉ ghi kỷ lục)?
2. **Cơn Đói (3.2)**: có bị coi là "ăn gian người tặng" không?
3. **Quà đắt (1.3)**: cho chạy nhiều lần theo xu thật không? Ví dụ Lion 29.999 xu = khoảng 100 Đá lăn, hoặc đổi sang hành động lớn hơn.
4. **Bẫy đặt sẵn (1.7)**: bật lại hay bỏ hẳn?
5. **WIN âm (1.8)**: chặn ở 0?
6. **Lưu dữ liệu (4.3/4.5)**: server ghi (khuyến nghị) hay overlay ghi? Điểm danh tiếng chỉ tính xu, hay cả tim/bình luận?
7. **Vị trí Đầm Sen (3.11)**: giữ ở map 8 hay chèn trước Lâu Đài?
8. **Giờ vàng (4.7)**: chỉ giảm ngưỡng tim, hay có nhân đôi điểm? Nhân đôi điểm sẽ kích người xem tặng.

---

## ✅ Đã làm (03/11/2026, nhánh `tuongtac/zombie`, worktree `.claude/worktrees/zombie-dep`)

User chốt: làm hết đề xuất, **quà đắt chạy theo xu thật**, chip quà **chỉ ghi tên trò** (bỏ tên quà + số xu),
**gắn quà TikTok thật** cho mọi hành động, Demo cho **zombie tự chạy**. Câu còn lại tự quyết: Giữ nhà + Cơn đói bật
mặc định (có công tắc), bỏ hẳn bẫy đặt sẵn (`placeMine`), chặn WIN ở 0, server ghi dữ liệu, Đầm Sen giữ map 8,
giờ vàng chỉ giảm ngưỡng tim.

| Commit | Nội dung |
|---|---|
| `fdc1c99` | Gói 1: giải phóng GPU khi đổi map (đo: trước +20 texture/+27 khối mỗi lần, sau đứng yên), tăng tốc/khiên cộng dồn + giữ sang ván, quà đắt theo xu, Đá lăn/Bàn tay/Động đất chờ lượt, món ở cửa không phí, nhảy 0,9m, ném đón đầu theo vận tốc thật, WIN ≥ 0, dọn code chết, cờ chống ngừng vẽ |
| `b5b6cbe` | Gói 2: camera dọc (zombie 58%), HUD chữ to, máu cửa, chip quà phân trang + sáng khi tặng, khe thông báo có hàng đợi (`logic.js` NoteQueue), hướng dẫn xoay vòng, ghi tên người tặng khi trúng, vòng sáng dưới bẫy, panel "Bắt đầu 3 bước" |
| `9035035` | Gói 3+4: Giữ nhà, Cơn đói, tim co giãn + mưa đá, cân lại quà, quà giúp mới (Zombie con / Giáp vàng / Nắm đấm vàng / Xe ủi), quà TikTok thật theo giftId, biến thể ván, giờ vàng, MVP mỗi ván, mốc WIN + chặng, lưu phiên + TOP tuần (`lib/quaivat-store.js`), nhắc lời dẫn, Demo zombie tự chạy, test |
| `ffdd6a0` | Gói 5: đồ vật đẹp hơn (bẫy kẹp, thùng phình, bó pháo, bẫy bật, lưới…), khựng hình / quay chậm / rung sin, cửa nứt + văng ván, núi gồ ghề, trăng sao, hạt bay theo map, trang trí Noel / Tết, chất lượng hình, số đèn cố định |
| (cuối) | Trần đồ vật sống (quà chờ lượt), chào TOP 1 tuần, vết nứt thiên thạch/tay, ảnh quà thật trên bảng quà OBS |

**Test:** `tests/quaivat-logic.test.mjs` (19) + `tests/quaivat-store.test.js` (4), đã thử đột biến (đổi về hành vi cũ → test đỏ).
`npm test` 554/554. Thử trong trình duyệt (render phần mềm): không lỗi console; bộ nhớ đứng yên ~350 khối / ~97 texture sau nhiều vòng đổi map.

**Còn lại / chưa làm:**
- Thử trên OBS + GPU thật của máy stream (FPS, `renderer.info.render.calls` ở map 1/6/7/8) và 1 buổi LIVE thật (vị trí khung bình luận TikTok).
- Nút "Link OBS" vào menu phụ (nằm trong `public/index.html` dùng chung — chưa đụng để tránh xung đột nhánh khác).
- Huy hiệu danh hiệu cạnh tên (Thần Giữ Cửa, Thợ Bẫy…); đặc sản riêng cho Đầm Sen (lục bình trôi); SSAO bỏ hẳn (không đáng).
