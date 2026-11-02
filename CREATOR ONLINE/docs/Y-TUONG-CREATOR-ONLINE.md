# Creator Online — Ý tưởng thiết kế

> Phát triển từ **Nhà Tù Online** (cùng phong cách chibi 3D, cùng lối "đi lại, tán gẫu, sinh hoạt"), nhưng thay các phòng giam bằng **25 phòng LIVE** trong một tòa nhà sáng tạo. Người chơi đi dọc hành lang như đi qua các dãy phòng giam: đến gần phòng nào nghe nhạc phòng đó, vào xem, thả tim, tặng quà và có thể tự lên sân khấu.

## 1. Câu chốt

Một tòa nhà LIVE chibi 3D, nơi bạn dạo qua 25 phòng phát trực tiếp, nghe nhạc từng phòng, tặng quà để chọn thể loại, giành vai MC / Kỹ thuật / Quản lý / Idol và cùng cả nhóm làm nên một phiên live hoành tráng.

## 2. Bản đồ tòa nhà (85 m × 76 m)

```
                 BẮC — 5 SÂN KHẤU NHÓM (17 m × 16 m, cửa mở rộng 5 m)
   ┌──────────┬──────────┬──────────┬──────────┬──────────┐
   │ G1       │ G2       │ G3       │ G4       │ G5       │
   │VITAMIN B │  VENUS   │ LOLLIPOP │  BONITA  │BLACKSWAN │
   │          │  STAR    │          │  GIRL    │          │
   └────╥─────┴────╥─────┴────╥─────┴────╥─────┴────╥─────┘
        hành lang Bắc (khán giả đứng xem các phòng hát)
 TÂY  ┌────┬────┬────┬────┬────┐                          ĐÔNG
 vòng │ S1 │ S2 │ S3 │ S4 │ S5 │  ← 5 phòng NGỒI HÁT (mặt Bắc)  bảng
 quay ├────┼────┼────┼────┼────┤                          xếp
 + tủ │ P1 │ P2 │ P3 │ P4 │ P5 │  ← 5 phòng GAME (mặt Nam)      hạng
 đồ   └────┴────┴────┴────┴────┘
        hành lang Nam — sảnh chính, logo CREATOR ONLINE, sofa, điểm xuất phát
   ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
   │N01│N02│N03│N04│N05│N06│N07│N08│N09│N10│  ← 10 phòng LIVE ĐỨNG
   └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
                                NAM
```

- Mặt trước mỗi phòng là **kính** (như song sắt của Nhà Tù) + **biển neon** trên cửa: `● LIVE  G2 · VENUS STAR · K-Pop Dance · 👁 1.2K · ❤ 8.4K`.
- Phòng không có trần: kéo camera ra xa sẽ nhìn từ trên cao thấy cả 25 phòng cùng lúc.

## 3. Bốn mô hình LIVE

### 3.1 LIVE nhóm (G1–G5) — 5 đến 9 người
| Thành phần | Mô tả |
|---|---|
| Sân khấu | Bục cao 0,55 m, viền LED theo màu nhóm, bậc lên xuống |
| Đèn | Giàn truss 2 tầng, **9 đèn moving-head** quét theo nhạc, vũng sáng trên sàn nháy theo nhịp, chớp mạnh khi có quà lớn |
| Màn LED lớn (13 × 5,6 m) | Tên nhóm, thể loại, số thành viên, equalizer nhảy theo nhịp, dòng chữ chạy báo quà, thanh PK khi đang đấu |
| TV trực tiếp (tường trái) | Chiếu **hình thật từ máy quay** trong phòng (3 góc: toàn cảnh, cận sân khấu, từ trên cao), tự chuyển góc mỗi 7 giây |
| Bảng bình luận (tường phải) | 6 bình luận mới nhất + top 3 fan; bình luận đã được MC trả lời đổi màu xanh |
| Thành viên | **Idol** 2–6 người nhảy đồng bộ theo nhịp nhạc (đổi vũ đạo mỗi 16 nhịp, 2 idol đầu cầm mic hát), **MC** cầm mic dẫn, **Kỹ thuật** đeo tai nghe đứng bàn mixer, **Quản lý** cầm bảng kẹp hồ sơ |
| Khán giả | Khu đứng trước sân khấu, fan NPC vẫy lightstick, vỗ tay, hô "Yeah!!!" |

Tổng thành viên = số idol + 3 → luôn trong khoảng **5–9 người**.

**5 nhóm nhảy** (đặt trong `groupRooms` của `game-config.json`):

| Phòng | Nhóm | Phong cách | Nhạc mặc định | Màu đèn |
|---|---|---|---|---|
| G1 | **VITAMIN B** | Nhóm nam mặc định (tóc ngắn, mũ lưỡi trai, đồ cam/trắng) — ai vào cũng được | Hip-hop | Lửa vàng |
| G2 | **VENUS STAR** | Nữ, tím–vàng, tóc dài/búi | K-Pop Dance | Venus tím vàng |
| G3 | **LOLLIPOP** | Nữ, kẹo ngọt hồng–xanh, tóc hai bím | Trend TikTok | Kẹo ngọt |
| G4 | **BONITA GIRL** | Nữ, Latin đỏ–đen | V-Pop Remix | Latin rực lửa |
| G5 | **BLACKSWAN** | Nữ, đen–trắng thiên nga | EDM Festival | Thiên nga đen |

Nhóm nào để trống `name` sẽ lấy **tên ngẫu nhiên** từ `randomGroupNames` (GALAXY BOYS, NEON KIDS, SUGAR RUSH, KẸO NGỌT…); tên idol trong mọi nhóm luôn ngẫu nhiên.

### 3.2 LIVE NPC đứng (N01–N10) — 1 người

Dựng theo bản vẽ `docs/phong-npc-ban-ve.png` (nhìn từ trên xuống):

```
   tường sau ── [đèn] [ĐÈN GIỮA] [đèn] ──   ← giàn 3 đèn trên đầu
                  ↘      ↓ màu     ↙
                       NPC  ↓ (mặt hướng ra tivi)
          [đèn]                     [đèn]   ← 2 softbox chiếu vào mặt
                     [ TIVI ]               ← màn hình tương tác
   ───────────── kính mặt trước ─────────────
```

- **Giàn 3 đèn trên đầu**: đèn **giữa** đánh ra sau tạo mảng **màu cố định** của phòng trên tường (mỗi phòng một màu); **2 đèn hai bên** chiếu vào lưng/vai người đứng phía trước để tách người khỏi nền.
- **2 đèn softbox** phía trước hai bên, hướng vào NPC.
- **Tivi** đặt thấp phía trước, ngửa lên về phía NPC (bình luận chạy, số tim, widget theo chủ đề: đơn hàng / lá bài tarot / tin nóng / biểu tượng cười). Mặt sau tivi cũng hiện cùng nội dung để fan đứng ngoài kính xem được.
- Chủ đề: Tâm sự đêm khuya, Bán hàng chốt đơn, Tarot huyền bí, Hài & kể chuyện, Tin nóng 24h.

### 3.3 LIVE ngồi tương tác, ca hát (S1–S5) — 1 người
- Streamer **ngồi ghế đẩu hát**, mic cầm tay, đung đưa theo nhạc.
- TV karaoke trên tường sau: tên bài, dòng lời chạy màu theo nhịp, nốt nhạc bay, bình luận mới nhất.
- Đàn phím, 2 đèn, xốp tiêu âm, máy tính bàn hiển thị bình luận và sóng âm.
- Thể loại: Ballad, Bolero, Acoustic, R&B Chill.

### 3.4 LIVE game (P1–P5) — 1 người
- Streamer **ngồi ghế gaming quay lưng ra kính**, đeo tai nghe, tay trên bàn phím.
- Bàn 2 màn hình + **TV lớn trên tường sau chiếu trận đấu** (khán giả nhìn qua vai streamer như xem stream thật).
- Dải LED RGB chạy màu, case máy phát sáng.
- Trận đấu mô phỏng: "Trận #N · còn X người" → TOP 1 hoặc bị loại.
- Thể loại: Đua xe, Sinh tồn bắn súng, MOBA 5v5, Xây dựng sandbox, Kinh dị (mỗi loại có hình riêng trên màn hình).

## 4. Âm thanh theo phòng

- Mỗi phòng có **kênh nhạc riêng**. Đứng ngoài: nghe nhỏ dần theo khoảng cách và **bị nghẹt sau kính** (lọc tần số thấp). Đi qua cửa: rõ hơn. Bước vào: nghe rõ hoàn toàn. Tai trái/phải theo hướng phòng.
- Không đứng gần phòng nào → nhạc sảnh lounge.
- Khi chưa có file nhạc, game tự tổng hợp nhạc theo phong cách từng thể loại (K-pop, EDM, bolero, lo-fi, chiptune…). Thả file mp3 vào `assets/audio/` là game dùng file đó — danh sách tên file và mô tả nhạc ở `assets/audio/DANH-SACH-NHAC.md`.
- Âm thanh phụ: tiếng "ting" quà, fanfare quà lớn, đám đông reo, pháo giấy, laser, khói, nhịp tim (phòng kinh dị), giọng "líu lo" khi NPC nói.

## 5. Tương tác của người chơi

### 5.1 Xu và cấp fan
- Bắt đầu với **500 xu**. Kiếm thêm: xem live (**+3 xu mỗi 30 giây**), vòng quay may mắn (2 phút/lần), mini game, làm idol/MC (nhận **10% quà** phòng nhận được), thắng PK.
- Cấp fan theo tổng xu đã tặng: Fan mới → Fan cứng (100) → Fan VIP (500) → Đại gia (2.000) → Thần tài (10.000).

### 5.2 Quà tặng
| Quà | Giá | Hiệu ứng |
|---|---|---|
| 🌹 Hoa hồng | 1 | bay lên trên sân khấu |
| 💖 Trái tim | 5 | |
| 🍦 Kem ốc quế | 10 | streamer cảm ơn bằng tên |
| 🎤 Micro vàng | 30 | |
| 🎂 Bánh kem | 50 | |
| 🏎️ Siêu xe | 199 | **pháo giấy + thông báo lớn + đèn chớp + đám đông reo** |
| 🏰 Lâu đài | 499 | như trên |
| 🚀 Tên lửa | 999 | như trên |

Tặng x1 / x10 / x99. **Thả tim (H) miễn phí**: mỗi 100 tim được streamer gọi tên và +5 xu.

### 5.3 Tặng quà để chọn
- **Thể loại phòng**: 50 xu (phòng nhóm) / 20 xu (phòng đơn) — đổi nhạc, màn hình, lời thoại của streamer.
- **Yêu cầu**: 10 xu — yêu cầu bài hát (phòng hát), chủ đề (phòng đứng), thách đấu trận mới (phòng game).
- **Vai trò trong nhóm** (NPC đang giữ vai sẽ nhường chỗ):

| Vai | Quà | Giá | Làm gì |
|---|---|---|---|
| 💃 Idol nhảy | Giày nhảy | 30 | Lên sân khấu nhảy cùng nhóm, **F bắt nhịp** ăn combo, nhận 10% quà |
| 🎙️ MC | Micro MC | 50 | **E trả lời bình luận** trên TV, kêu gọi thả tim (NPC tặng quà nhiều hơn 20 giây), giới thiệu tiết mục |
| 🎛️ Kỹ thuật | Bàn mixer | 50 | Đứng ở bàn mixer: đổi **5 bộ màu đèn**, bắn **pháo giấy / khói / laser / chớp đèn**, đổi **góc máy TV trực tiếp**, đổi đoạn nhạc |
| 📋 Quản lý | Cặp quản lý | 100 | **Thêm/bớt idol (5–9 thành viên)**, đổi trang phục idol, đổi thể loại miễn phí, **mở PK** với nhóm khác |

Mỗi người chỉ giữ 1 vai; ra khỏi phòng là tự rời vai.

## 6. Mini game đề xuất (đã có trong game)

1. **⚔ PK đấu nhóm** — 60 giây, 2 sân khấu thi điểm quà + tim. Tự động mỗi ~2,5 phút hoặc do Quản lý mở. Đoán đội thắng miễn phí (+20 xu), góp quà cho đội thắng (+15 xu).
2. **💃 Bắt nhịp** — khi làm Idol: vòng hồng thu nhỏ vào vòng vàng theo nhịp nhạc, nhấn F đúng lúc → PERFECT / GOOD / MISS, mỗi 8 combo thưởng xu.
3. **🎵 Đoán bài hát** (phòng hát) — streamer ngân nga giai điệu dân gian / thiếu nhi, chọn 1 trong 4 tên bài, đúng +15 xu.
4. **❓ Hỏi nhanh đáp gọn** (phòng đứng) — câu hỏi kiến thức, 3 đáp án, đúng +10 xu.
5. **🎮 Dự đoán TOP 1** (phòng game) — đoán streamer có TOP 1 không trước khi còn 15 người, đúng +25 xu.
6. **🎡 Vòng quay may mắn** (sảnh Tây) — 2 phút/lần, 10–300 xu hoặc Vương miện hiếm.
7. **❤ Thả tim combo** — mốc 100 tim được gọi tên.
8. **🏆 Bảng xếp hạng** (sảnh Đông) — top phòng theo quà, hồ sơ fan của bạn.

Ý tưởng mở rộng sau: song ca với streamer phòng hát (người chơi cầm mic, ghi âm micro thật), đấu PK 3 nhóm, "đại sứ phòng" (top fan tuần được tên trên biển), sự kiện giờ vàng (quà x2), sân khấu Gala chung cho cả 5 nhóm.

## 7. Chơi nhiều người (LAN)

- Server Node tự viết, không cần cài thư viện. Đồng bộ: vị trí, chat, bình luận theo phòng, quà, tim, thể loại, màu đèn, số idol, hiệu ứng, góc máy, **ai đang giữ vai nào** (server khóa để 2 người không cùng giữ 1 vai), PK.
- NPC mô phỏng riêng trên từng máy (giống Nhà Tù Online).

## 8. Logo

Bảng nghiên cứu 3 phương án: `docs/logo/logo-concepts.html` (mở bằng trình duyệt). Logo gốc HP Media màu đào–hồng lưu ở `docs/logo/hp-mau-goc.png`.

- **A · Huy hiệu hp nguyên bản** — nhận diện hãng mạnh nhất.
- **B · hp dưới giàn 3 đèn** (đề xuất, đang dùng) — huy hiệu hp + giàn 3 đèn của phòng NPC + chấm đỏ LIVE.
- **C · Nút Play LIVE** — hiện đại, gọn ở cỡ nhỏ, nhưng nhận diện HP yếu hơn.

Logo B xuất hiện ở: biểu tượng tab (`src/web/assets/logo-mark.svg`), màn hình bắt đầu (`src/web/assets/logo-full.svg`), góc HUD, và **logo tròn trên sàn sảnh** (chữ CREATOR ONLINE uốn theo cung trên, ★ BY HP MEDIA ★ cung dưới). Màu: gradient #F6C3A8 → #E6A2D0, đỏ LIVE #FF2D55, chữ Impact.

## 9. Giới hạn hiện tại
- Hồ sơ lưu trong trình duyệt, xu không kiểm tra trên server.
- PK tự động chạy riêng từng máy; PK do Quản lý mở thì đồng bộ.
- Nhân vật dựng từ khối hình học (chưa có model/animation thật).
