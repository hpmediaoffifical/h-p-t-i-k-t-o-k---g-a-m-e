# 🧟 Zombie Phá Nhà — nhân vật mới theo khuôn "cây chặn zombie" (03/11/2026)

**Hướng user chốt:** game theo mô-típ Plants vs. Zombies (đã có Cây bắn đậu, Khoai lăn). Tham khảo các **kiểu nhân vật**
của thể loại để bộ nhân vật đồng bộ, nhưng **tên + tạo hình riêng**, ưu tiên chất Việt. Không chép tên/hình gốc
(Peashooter, Wall-nut, Conehead… thuộc EA/PopCap) để tránh bị TikTok gỡ LIVE vì khiếu nại bản quyền.

## Đã làm (nhánh `tuongtac/zombie`)

### Trang phục zombie (streamer) — `public/games/quaivat/skins.js`, commit `b4985da`
Không cần tải mô hình mới: đổi màu quần áo qua bảng màu (atlas nhân đôi bề rộng) + phụ kiện gắn xương.
Đổi ngay lúc đang chơi; panel "Trang phục" + "🎲 Đổi trang phục mỗi ván".

| Trang phục | Khuôn tham khảo | Ghi chú |
|---|---|---|
| 🦸 Siêu Nhân Zombie | siêu anh hùng chung | áo choàng vải rủ theo trọng lực, bay theo tốc độ; không logo S/dơi/nhện |
| 🧸 Quý Ông Vụng Về | quý ông vụng về (kiểu hài câm) | vest nâu tweed, cà vạt, gấu bông — **không** dùng tên/mặt Mr. Bean |
| 🥢 Cái Bang | ăn mày võ công chung | khăn đỏ, gậy tre, hồ lô, miếng vá — không dùng tên nhân vật Kim Dung |
| 👒 Nón Lá Áo Bà Ba | zombie đội nón (kiểu "conehead") | |
| 🍚 Đội Nồi Cơm Điện | zombie đội xô (kiểu "buckethead") | |
| 🛵 Mũ Bảo Hiểm | zombie đội mũ cứng | |
| 👨‍🍳 Đầu Bếp · 📰 Ông Đọc Báo · 🚩 Cầm Cờ · 🧑‍🚀 Phi Hành Gia | đầu bếp / đọc báo / cầm cờ / phi hành gia | cờ ngũ sắc (không dùng quốc kỳ) |

### Cây chặn + đồng minh mới — commit `e0f5194` (quà TikTok thật gắn sẵn theo giftId)
| Món | Khuôn tham khảo | Quà | Tác dụng |
|---|---|---|---|
| 🧊 Đậu băng | cây bắn băng | Bing Chilling (5) | đạn băng làm zombie chậm ½ |
| 🍈 Trái mít chắn | quả óc chó chắn | Quả đào (5) | tường gai 320 máu |
| 🎃 Bí đỏ đè | bí nhảy đè | Takoyaki (88) | nhảy lên đè bẹp |
| 🌶️ Ớt hiểm | ớt nổ cả hàng | Pháo hoa giấy (100) | lửa phụt dọc làn ~5m |
| 🪴 Cây nắp ấm | cây ăn thịt | Bó hoa (100) | nuốt 2,2 giây rồi nhả văng lùi |
| 🤸 Nhảy sào *(cứu)* | zombie nhảy sào | Chuyển động chậm (10) | phóng 7,5m qua vật cản |
| ⛏️ Đào hầm *(cứu)* | zombie đào đất | Mũ lưỡi trai (99) | đi ngầm 16m, bẫy không chạm |

Trước đó đã có: Cây bắn đậu, Khoai lăn, Bẫy bật, Zombie con dọn đường, Xe ủi, Giáp vàng… (xem file đề xuất hoàn thiện).

## Nhân vật NGƯỜI thật (không phải zombie) — chờ user quyết vì phải tải mô hình

Nghiên cứu web (agent, 03/11): zombie hiện tại lấy từ **Quaternius Zombie Apocalypse Kit**; bộ này còn **4 nhân vật người
chơi được + 20 hoạt ảnh**, nhiều khả năng **cùng bộ xương** với zombie → thả vào là chạy (cần kiểm sau khi tải).

| Nguồn | Giấy phép | Có gì | Ghi chú |
|---|---|---|---|
| Quaternius Zombie Apocalypse Kit | CC0 trên trang pack; Quaternius ra **QAL v1.0 (28/08/2026)**: dùng trong sản phẩm OK, **cấm phát tán asset rời** | 4 người sống sót, 20 clip | ít việc nhất |
| Quaternius Ultimate Modular Men/Women | như trên | Business Man (quý ông), SWAT, Astronaut, Worker… 24 clip | hợp style |
| KayKit (Kay Lousberg) Adventurers + Character Animations | CC0 | 1 bộ xương, ~150 clip; Series 5 (trả phí) có **The Superhero** | style chibi khác Quaternius |
| Kenney Mini Characters | CC0 | 12 người, 32 clip | nhẹ, style lệch |

Khuyến nghị: tải **Zombie Apocalypse Kit** (cùng nhà, cùng rig) trước để có người thật; nếu cần siêu anh hùng đúng nghĩa
thì KayKit Series 5. Ghi ngày tải + ảnh trang giấy phép vào `models/CREDITS.txt`. **Cần user đồng ý trước khi tải.**

## Ý tưởng làm tiếp (chưa làm)
- **Bối cảnh:** Sân Thượng Phố (kiểu map mái nhà), Ruộng Lúa (lội nước như Đầm Sen + bù nhìn), Bãi Biển.
- **Cây:** Bắp cải ném vòng cầu (vượt khiên), Nấm phun khói (che tầm nhìn), Hoa hướng dương sửa cửa từ từ, Tỏi (đẩy zombie sang làn khác), Xương rồng gai (map Sa Mạc).
- **Phe cứu / biến thể:** Zombie khổng lồ (ván boss: to ×1,5, đấm ×2), Zombie khổng lồ ném zombie tí hon về phía trước, Zombie lái xe đá bào (vệt băng tăng tốc).
- Trang phục bằng quà: người xem tặng quà → zombie đổi đồ ngẫu nhiên.
