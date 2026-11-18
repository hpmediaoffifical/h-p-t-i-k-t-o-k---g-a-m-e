# 🎲 Đấu Trường Mini — Brief thiết kế đồ họa (gửi ChatGPT / AI vẽ 3D)

> File này để **đưa nguyên cho người vẽ / AI** (ChatGPT tạo ảnh, hoặc công cụ AI dựng 3D như Meshy, Tripo3D, Rodin).
> Mỗi mục có: dùng ở đâu, định dạng, kích thước, **điểm neo**, prompt tiếng Anh (dán thẳng), điều cần tránh, tiêu chí nhận.
> Hiện game đã chạy bằng hình **dựng sẵn bằng code** (Three.js). Ảnh/model vẽ tay chỉ để **nâng cấp cho xịn hơn**.

## 0. Quy trình nhận file

1. Vẽ / dựng theo từng mục bên dưới, đặt **đúng tên file**.
2. Chép file vào `public/games/luotchoi/assets/`.
3. Mở `public/games/luotchoi/assets/manifest.json`, thêm dòng tương ứng, ví dụ:
   ```json
   { "hand": "hand.png", "stick": "stick.png", "frog": "frog.glb" }
   ```
4. Tải lại overlay OBS (hoặc bấm vào game trong app). Không cần sửa code với các mục ghi **[TỰ DÙNG]**.
   Các mục ghi **[GĐ2]** cần sửa code nhỏ sau khi có file (đã chừa chỗ, xem ghi chú từng mục).

Gợi ý công cụ:
- **Ảnh 2D** (bàn tay, que tre, ảnh bìa, texture): ChatGPT (tạo ảnh) → yêu cầu "transparent background PNG".
  Nếu nền chưa trong suốt: tách nền bằng công cụ xoá nền rồi kiểm mép tóc/ngón không bị răng cưa.
- **Model 3D** (cóc, quan, hà mã…): Meshy / Tripo3D / Rodin — "image to 3D" dùng ảnh tham chiếu ChatGPT vẽ trước,
  xuất **GLB**, PBR, ≤ 15 000 tam giác, texture 1024 px. Không cần xương / hoạt ảnh (code tự làm chuyển động).

## 1. Phong cách chung (áp cho mọi mục)

- **Chất:** đồ chơi cao cấp kiểu "toy diorama" — nhựa bóng mềm, gỗ thật, đất nung, tre; ánh sáng studio dịu,
  bóng đổ mềm, viền rõ để đọc được trên điện thoại (khung dọc 1080×1920 của TikTok LIVE).
- **Màu chủ đạo:** tím oải hương `#9a84d8` (hà mã), xanh lá non `#47b83a` (cóc), đất nung `#c27a44`,
  tre `#a8cf62`, gỗ ấm `#b8743f`, vàng điểm nhấn `#ffd54a`, hồng thương hiệu `#ff5e94`.
- **Không có chữ, không logo, không watermark** trong ảnh/model (số trên ô do code vẽ).
- **Tự thiết kế**, không giống bất kỳ đồ chơi thương hiệu hay game có sẵn nào; không dùng nhân vật có bản quyền.
- Góc nhìn chuẩn của game: **từ trên chéo xuống ~40°**, nhìn từ phía trước.

---

## 2. Bàn tay chỉ — `hand.png` **[TỰ DÙNG]**

- **Dùng ở:** tay bay vào bấm răng / rút thanh / lật thẻ / chọn ô (cả 5 trò); trò Ô Ăn Quan xoay ngược 180° để úp xuống rải quân.
- **Định dạng:** PNG nền trong suốt, **560 × 800 px** (tỉ lệ 7:10), bàn tay **phải**, ngón trỏ **chỉ thẳng LÊN**.
- **Điểm neo (bắt buộc):** **đầu ngón trỏ chạm mép trên, ở giữa chiều ngang** (x = 50%, y ≤ 2%) — code đặt đúng điểm này vào ô được chọn.
- Ba ngón còn lại co lại, ngón cái ôm bên trái; cổ tay có **tay áo màu hồng `#ff5e94` + 1 sọc trắng**, cắt gọn ở mép dưới.
- **Prompt:**
  > A friendly cartoon right hand with the index finger pointing straight up, other fingers curled into the palm, thumb resting on the side,
  > warm light skin tone with soft 3D shading and subtle rim light, clean bold outline, short pink sleeve cuff (#ff5e94) with one white stripe at the wrist,
  > game UI asset, centered, the index fingertip touching the top edge of the canvas, transparent background, PNG, 560x800, no text, no logo.
- **Tránh:** găng tay trắng kiểu hoạt hình cũ, móng dài, nhẫn, hình xăm, nền màu, bóng đổ ra ngoài khung, tay trái.
- **Nhận khi:** nhìn rõ ở kích thước 140 × 200 px; đầu ngón đúng mép trên giữa; mép trong suốt sạch.

### 2b. Que tre — `stick.png` **[TỰ DÙNG]** (trò Cóc Trốn Chum)
- PNG trong suốt **120 × 470 px**, que tre xanh có 3 đốt, **đầu nhọn ở mép DƯỚI giữa** (điểm neo), vót vàng ở mũi.
- **Prompt:** *A single short bamboo skewer stick, vertical, green with three darker nodes, sharpened pale tip pointing down,
  soft 3D toy style shading, transparent background, PNG 120x470, no text.*

---

## 3. Con cóc — `frog.glb` **[TỰ DÙNG]** (trò 🐸 Cóc Trốn Chum)

- **Dùng ở:** cóc trốn trong chum, trúng lỗ thì **nhảy vọt lên ngồi trên miệng chum** nhìn ra người xem.
- **Định dạng:** GLB, Y hướng lên, **mặt cóc nhìn về +Z**, gốc toạ độ ở giữa đáy; ≤ 15k tam giác; PBR (base color, roughness, normal) 1024 px.
  Code tự co về khung ~1,3 đơn vị nên không cần đúng kích thước thật.
- **Hình dáng:** cóc **ngồi xổm, thân thấp và rộng**, đầu to tròn, **mắt lồi trên đỉnh đầu** (tròng vàng, **con ngươi nằm ngang**, có mí xanh),
  **miệng cười rộng**, má hồng nhạt, lưng xanh lá có **đốm sẫm**, bụng kem, chân trước chống, **chân sau gập hai bên**, bàn chân có màng.
  Dễ thương, hơi tinh nghịch (vừa bị chọc ra khỏi chum).
- **Prompt (ChatGPT, ảnh tham chiếu trước khi dựng 3D):**
  > Cute chubby toy frog sitting squat, wide flat body, big bulging eyes on top of the head with golden irises and horizontal pupils and green eyelids,
  > wide happy smile, light pink cheeks, glossy green skin with darker spots on the back, cream belly, front legs planted, folded back legs with webbed feet,
  > premium vinyl toy look, soft studio lighting, front three-quarter view, plain white background, no text.
- **Prompt (AI 3D, image-to-3D):** dùng ảnh trên + *"game-ready stylized frog toy, single mesh, PBR, low poly 15k, facing +Z, origin at bottom center"*.
- **Tránh:** cóc thật đáng sợ / nhầy nhụa, răng, màu độc (đỏ, đen), tư thế đứng hai chân.

---

## 4. Hà mã đau răng — `hippo.glb` **[GĐ2]** (trò 🦛 Hà Mã Đau Răng)

- **Ý tưởng:** hà mã đồ chơi tím oải hương **há to miệng**, **dán băng cá nhân chéo trên má** (đang đau răng), mắt lồi tròn trên đỉnh đầu, tai nhỏ.
- **Bắt buộc tách node** để code điều khiển: `upperJaw` (hàm trên + đầu, **pivot ở bản lề sau miệng**), `lowerJaw` (hàm dưới + lưỡi),
  `body`. **Không** dựng răng (code tự đặt 6–16 răng có số vòng quanh hàm dưới) — chừa mép hàm dưới phẳng rộng ~ 3,0 × 2,3 để xếp răng.
- GLB, Y lên, mặt về +Z, ≤ 20k tam giác, PBR clearcoat (nhựa bóng).
- **Prompt:** *Cute glossy lavender toy hippo head with mouth wide open, a crossed adhesive bandage on one cheek, round bulging eyes on top, tiny ears,
  pink gums and tongue, no teeth, premium vinyl toy, front three-quarter view, white background, no text.*
- **Ghi chú code:** cần nối `upperJaw` vào xoay mở/ngoạm thay cho khối dựng sẵn trong `board3d.js` (mục HM).

## 5. Chum đất nung — `jar.glb` **[GĐ2]** (trò 🐸 Cóc Trốn Chum)

- Chum sành bụng phình, miệng loe, **men nâu một dải ở vai + hoa văn sóng tự vẽ**, đất nung ấm có hạt; **không đục lỗ** (code tự đặt lỗ có số).
- GLB, ≤ 8k tam giác, chiều cao : bề rộng ≈ 1 : 1,15.
- **Prompt:** *Traditional Vietnamese terracotta storage jar, round belly, flared rim, one glazed brown band with a hand-drawn wave pattern,
  warm clay with subtle speckles, soft studio light, white background, no text.*

## 6. Tháp tre — `bamboo-bar.png` **[GĐ2]** (trò 🎋 Tháp Tre Chao Đảo)

- Texture **1024 × 256** mặt dài thanh tre đã chẻ (xanh vàng, thớ dọc, **2 đốt** ở 1/4 và 3/4), lặp được theo chiều ngang.
- Thêm `bamboo-end.png` **256 × 160**: mặt cắt đầu thanh (vòng thớ đồng tâm) — code in số lên trên.

## 7. Thẻ Săn Cặp Trái Cây — `card-back.png`, `fruit-*.png` **[GĐ2]**

- `card-back.png` **512 × 640**: lưng thẻ xanh dương hoa văn chéo, viền trắng, **chừa vòng tròn trống ở giữa** (code in số).
- 12 hình trái cây **512 × 512** nền trong suốt, phong cách đồ chơi bóng: dưa hấu (miếng), táo, chuối, nho, dâu, dứa, kiwi (bổ đôi), đào, anh đào, dừa, chanh, xoài.
  Tên file: `fruit-duahau.png`, `fruit-tao.png`, `fruit-chuoi.png`, `fruit-nho.png`, `fruit-dau.png`, `fruit-dua.png`, `fruit-kiwi.png`, `fruit-dao.png`,
  `fruit-anhdao.png`, `fruit-dualeo.png` (dừa), `fruit-chanh.png`, `fruit-xoai.png`.
- **Prompt mẫu:** *Glossy toy-style 3D illustration of a {fruit}, soft studio lighting, slight top-down angle, centered, transparent background, PNG 512x512, no text.*

## 8. Ô Ăn Quan — bàn gỗ + quân **[GĐ2]** (trò 🪨 Ô Ăn Quan)

- `oq-board.png` **2048 × 720**: mặt bàn gỗ nhìn thẳng từ trên, **10 ô vuông lõm (2 hàng × 5)** + **2 ô quan bán nguyệt ở 2 đầu**, gỗ ấm có vân,
  mép ô viền sáng. Tỉ lệ khớp code: dài 8,9 × rộng 3,1; ô dân 1,0 × 1,0 cách nhau 0,17; tâm 2 ô quan cách tâm bàn 3,36.
- `quan.glb`: viên **quan** — ngọc/đá quý tròn dẹt màu vàng hổ phách, bóng, Ø ~ 3 lần viên dân.
- `dan-*.png` hoặc `dan.glb`: sỏi dân dẹt nhiều màu pastel (ngọc bích, trắng sữa, hổ phách, hồng thạch anh, xanh nhạt, tím nhạt).
- **Prompt bàn:** *Top-down view of a traditional Vietnamese "o an quan" wooden game board, warm carved wood with grain, two rows of five square
  shallow pits and one large half-moon pit at each end, soft light, no stones, no text, 2048x720.*

## 9. Ảnh bìa (thư viện game / panel / quảng bá) **[GĐ2]**

- 6 ảnh **1024 × 1024** PNG: bìa bộ `cover-dau-truong-mini.png` + mỗi trò 1 ảnh:
  `cover-hama.png`, `cover-chumcoc.png`, `cover-thaptre.png`, `cover-latcap.png`, `cover-oanquan.png`.
- Bố cục: vật chính ở giữa (hà mã há miệng / cóc ló khỏi chum / tháp tre nghiêng / 3 thẻ đang lật / bàn ô ăn quan có tay rải quân),
  nền gradient tím-xanh đêm có ánh đèn sân khấu, **chừa 20% phía trên trống** để app đặt tên trò. Không chữ.

---

## 10. Bảng kiểm trước khi gửi lại

- [ ] Đúng tên file, đúng kích thước, PNG **nền trong suốt** (trừ texture bàn/thanh tre).
- [ ] Điểm neo đúng (đầu ngón tay ở mép trên giữa; mũi que ở mép dưới giữa).
- [ ] Model GLB mở được trên https://gltf-viewer.donmccurdy.com, Y lên, mặt về +Z, ≤ giới hạn tam giác.
- [ ] Không chữ, logo, watermark; không giống sản phẩm/nhân vật có thương hiệu.
- [ ] Nhìn rõ khi thu nhỏ còn ¼ (người xem TikTok xem trên điện thoại).
