# Nghiên cứu UI/UX — Thẻ chào người xem vào phòng

> Mục tiêu: thẻ chào **nhìn là biết của HP**, khác hẳn TikTok gốc và các tool khác (TikFinity, IndoFinity, GGTT…). Đồng thời phải **đọc được trong 1–2 giây trên màn hình điện thoại** của người xem.
> Mẫu chạy thử: `/_prototype/vip-concepts.html` (mở trong app, `localhost:3000`).

## 1. Hiện trạng thị trường — "ai cũng một khuôn"

| Bên | Cách chào người vào phòng | Nhận xét |
|---|---|---|
| **TikTok gốc** | Thanh ngang trượt ở mép trái, gồm huy hiệu cấp + tên + "đã tham gia". Cấp cao thì có hiệu ứng vào phòng (xe, cánh…) | Người xem đã **quen mắt** với khuôn này, nên thẻ giống kiểu đó sẽ bị coi như giao diện của TikTok và bị lướt qua |
| **TikFinity / IndoFinity** | Sự kiện "join" kích hoạt âm thanh, GIF, đọc tên (TTS). Phần hình là **GIF + chữ do người dùng tự chọn** ([TikFinity](https://blog.tikfinity.com/?p=11452), [IndoFinity](https://docs.indofinity.com/en/docs/intro)) | Mạnh về tự động hoá, **yếu về thiết kế riêng**: mọi kênh trông giống nhau |
| **Tool Việt** (GGTT…) | Banner ngang + avatar, theo màu thương hiệu | Cùng khuôn "thanh ngang + avatar trái" |
| **HP hiện tại** | Cũng là thanh ngang + avatar trái, 5 bậc khác nhau ở màu | Đẹp hơn sau khi làm lại vòng viền, nhưng **vẫn cùng khuôn** |

**Kết luận:** muốn khác biệt, phải đổi **ẩn dụ thị giác** (thẻ này "là cái gì"), không chỉ đổi màu.

## 2. Nguyên tắc UX áp dụng

1. **Đọc trong 1,5 giây.** Thứ bậc thông tin: **Tên** (to nhất) → **Bậc** → **Giá trị** (xu đã tặng) → **1 điểm nhấn ngữ cảnh** (lần đầu / chuỗi buổi / TOP). Bản cũ nhồi tới 8 chip, mắt không biết nhìn đâu.
2. **Cỡ chữ cho điện thoại.** Overlay 1080 px chỉ hiện trên màn hình rộng khoảng 390 pt, tức thu nhỏ còn khoảng 1/3.
   - Chữ dưới 22 px trên canvas sẽ còn dưới 8 pt, **gần như không đọc được**. Bản cũ có chữ 13–15 px.
   - Mẫu mới: chữ nhỏ nhất **≥ 20 px** (nhãn), giá trị **≥ 26 px**, tên **40–56 px**.
3. **Ít mà đắt.** Mỗi thẻ chỉ **1 điểm nhấn ngữ cảnh**, chọn theo độ ưu tiên: Lần đầu ghé > Chuỗi ≥ 3 buổi > TOP > MOD > Bạn bè > Ghé lần thứ N.
4. **Nhận ra bậc qua HÌNH, không chỉ qua MÀU.** Mỗi bậc khác nhau về **chất liệu và chi tiết** (giấy, bạc, vàng, nhung, hologram). Người mù màu và người xem lướt vẫn phân biệt được.
5. **Chuyển động có chủ đích** (theo nguyên tắc lower-third: hiệu ứng phải giúp *vào – sắp xếp thông tin – ra gọn*, không tranh chỗ với người đang nói, [Vimeo](https://vimeo.com/blog/post/what-is-lower-thirds)):
   - Vào 450–600 ms, có đà rồi nảy nhẹ.
   - Các phần hiện **so le** (khung → tên → chi tiết → dấu đóng) để dẫn mắt.
   - Giữ nguyên ~4 s, chỉ còn ánh sáng nhẹ chạy.
   - Ra nhanh hơn lúc vào (300 ms).
6. **Vùng an toàn của app TikTok.** Trên điện thoại, TikTok che **khoảng 35% đáy** (bình luận, ô chat) và **cột nút bên phải**. Thẻ mặc định nên đặt **cao 28–50%, mép trái**. Vị trí hiện tại (y = 60%) hay bị khung bình luận đè. Mẫu thử có nút bật **lưới vùng an toàn** để căn.
7. **Nhiều người vào cùng lúc:** tối đa 2 thẻ to; người thứ 3 trở đi gộp thành 1 dòng gọn ("+ 5 người vừa vào"). Không để thẻ chồng che mặt streamer.

## 3. Ba hướng thiết kế

### A — "VÉ VÀO PHÒNG" 🎫 (đề xuất chọn)
- **Ẩn dụ:** người xem vào phòng = **soát vé vào cửa**. Thẻ là tấm vé có **cuống vé** (avatar + cấp), **đường răng cưa xé** và **khoét bán nguyệt** 2 đầu, thân vé ghi tên to.
- **Ô thông tin kiểu vé:** CẤP · FAN · ĐÃ TẶNG · LẦN GHÉ, nhãn nhỏ phía trên và giá trị to phía dưới. Vị trí các ô **cố định**, nên người xem quen là đọc rất nhanh.
- **Chuyển động:** vé trượt vào, hơi nghiêng rồi thẳng lại → **con dấu "CHÀO MỪNG" đóng cộp** (phóng to rồi thu lại, nghiêng −12°, rung nhẹ) → ánh foil chạy qua vé.
- **Bậc = hạng vé:**

| Bậc | Hạng vé | Chất liệu |
|---|---|---|
| Tân binh | Vé thường | Giấy kem |
| Hào kiệt | Vé bạc | Lá bạc |
| Đại gia | Vé vàng | Lá vàng nhũ |
| Huyền thoại | Hạng nhất | Nhung đỏ + chỉ vàng |
| Chí tôn | Vé Chí tôn | Đen huyền + hologram cầu vồng |

- **Vì sao khác biệt:** chưa tool nào dùng hình vé. Gắn chặt với hành động "vào phòng". Dấu đóng tạo khoảnh khắc "đã được ghi nhận" khiến người xem thấy mình được chào riêng. Rất hợp văn hoá "check-in" của giới trẻ.

### B — "THẺ THÀNH VIÊN" 💳
- **Ẩn dụ:** thẻ hội viên kim loại, tỉ lệ thẻ ngân hàng 1,586 : 1.
- **Bố cục:** logo HP + hạng thẻ ở góc trên, chip vàng, **tên dập nổi**, @id như số thẻ, ảnh avatar góc phải. Cột "ĐÃ TẶNG / LẦN GHÉ" như ngày hiệu lực.
- **Chuyển động:** **lật 3D** từ cạnh (xoay quanh trục dọc 90° về 0°) → ánh foil chéo quét qua → nghiêng nhẹ theo phối cảnh.
- **Bậc = hạng thẻ:** Bạc → Vàng → Bạch kim → Đen → Kim cương.
- **Ưu / nhược:** rất sang, hợp người tặng nhiều. Nhưng thẻ **cao hơn** nên chỉ hiện 1–2 thẻ cùng lúc, và tên quá dài phải thu nhỏ nhiều.

### C — "SPOTLIGHT" (chỉ mô tả, chưa dựng)
- Không có khung. Avatar loé sáng giữa vùng trống, **tên hiện từng chữ** (kinetic typography) kèm một vạch sáng.
- Tối giản, điện ảnh. Nhưng dễ chìm khi nền livestream sáng hoặc rối, và khó phân bậc.

## 4. Đề xuất
- **Chọn A — Vé vào phòng** làm kiểu mặc định: khác biệt nhất, đọc nhanh nhất, chuyển động có ý nghĩa.
- **B** để làm tuỳ chọn "kiểu thẻ" thứ 2 cho kênh muốn sang trọng.
- Thẻ thanh ngang hiện tại giữ làm kiểu "Cổ điển".
- Sau khi chọn: chuyển mẫu vào `overlay.html` + `joincard.css`, thêm tuỳ chọn "Kiểu thẻ" trong panel, dời vị trí mặc định lên vùng an toàn.
- `BRIEF.md` cho ChatGPT sẽ sửa theo kiểu được chọn: con dấu, họa tiết foil, logo hạng vé.

## 5. Cập nhật sau video mẫu của user (Douyin "闪亮登场")
User thấy thẻ A/B **quá to, chướng màn LIVE**, nên gửi 3 video mẫu. Phân tích video:
1. **Viên nhộng gọn** [avatar + tên] trôi từ phải sang mép trái, nằm **ngay trên khu bình luận**.
2. **Linh vật** của bậc (hoa hồng / thiên thần cánh vàng / rồng xanh) bay vào và chạm viên nhộng, loé sáng.
3. Viên nhộng **giãn thành thanh dài**: avatar có khung · danh hiệu · tên · "闪亮登场" · điểm trang trí cuối. Viền là chỉ kim loại, nền mờ dần về phải.
4. Giữ khoảng 4 s rồi mờ đi.

Người cấp thấp chỉ có chip đơn "vào phòng". Thanh cao **khoảng 45 px trên 1080** (thẻ cũ cao 150 px).

→ Đã dựng **Kiểu C — Thanh gọn**: `/_prototype/vip-compact.html`, xem trong khung điện thoại 9:16 có giả lập bình luận TikTok.
- Thanh cao 46 px; sao băng màu bậc thay cho linh vật.
- GIF: `khung-mau/thanh-chao-gon_dien-thoai.gif`.
- Việc cho ChatGPT sau này: **5 linh vật bay vào** (PNG nhiều khung, bay từ phải sang trái, kết thúc ở avatar). Mỗi bậc 1 con, ví dụ: chim én băng / đại bàng tím / cá chép vàng / phượng hoàng lửa / rồng kim cương.

## 6. Lớp "WOW" — hiệu ứng chữ, viền, avatar (tham khảo game/app)
| Hiệu ứng | Nguồn tham khảo | Áp vào thanh chào |
|---|---|---|
| **Dàn so le** (staggering): đưa phần chính vào trước, phần phụ vào sau | 12 nguyên lý hoạt hình Disney áp cho UI ([Dribbble](https://dribbble.com/stories/2020/07/27/disney-principles-of-animation-ui-interactions), [Behance](https://www.behance.net/gallery/112903811/Basic-principles-of-animation-to-UI-design)) | Avatar → thanh → tên từng chữ → danh hiệu → VÀO PHÒNG → viền chạy |
| **Nén-giãn + vượt đích** (squash & stretch, overshoot) | như trên | Avatar lăn từ trái, chạm thì nén dẹt rồi bật lại; thanh trượt quá 6 px rồi về |
| **Chữ hiện từng ký tự** (mờ + nhoè → rõ) | Text reveal / Pixel Highlight ([21st.dev](https://21st.dev/@scrollxui/components/pixel-highlight.md)) | Tên người xem, mỗi chữ trễ 34 ms |
| **Chữ ánh kim có vệt sáng chạy** (shiny / shimmer text) | Animated Shiny Text ([Magic UI](https://21st.dev/@magicui/components/animated-shiny-text)), Shimmer Text ([21st.dev](https://21st.dev/@kevingirelli/components/shimmer-text.md)) | Danh hiệu bậc |
| **Viền chạy** (animated gradient border, conic-gradient + `@property`) | [CodeTV](https://codetv.dev/blog/animated-css-gradient-border), [Ryan Mulligan](https://ryanmulligan.dev/blog/css-property-new-style/), GlowEdge ([Framer](https://www.framer.com/community/marketplace/components/glowedge/)) | Vệt sáng chạy vòng mép thanh |
| **Bật ra + nhịp sáng** | Pop-in kiểu nhận thưởng trong game | Chữ "VÀO PHÒNG" |

Mẫu: nút **✨ WOW** trong `/_prototype/vip-compact.html` để so bật/tắt.
