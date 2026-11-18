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
- **Model 3D** (dê con, quan, hà mã…): Meshy / Tripo3D / Rodin — "image to 3D" dùng ảnh tham chiếu ChatGPT vẽ trước,
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

### 2b. Que tre — `stick.png` **[TỰ DÙNG]** (trò 🐐 Dê Núi)
- PNG trong suốt **120 × 470 px**, que tre xanh có 3 đốt, **đầu nhọn ở mép DƯỚI giữa** (điểm neo), vót vàng ở mũi.
- **Prompt:** *A single short bamboo skewer stick, vertical, green with three darker nodes, sharpened pale tip pointing down,
  soft 3D toy style shading, transparent background, PNG 120x470, no text.*

---

## 3. Dê núi — `goat.glb` **[ĐANG DÙNG model có sẵn]** (trò 🐐 Dê Núi — con giáp năm Đinh Mùi 2027)

> 18/11/2026: đang dùng `public/games/luotchoi/assets/goat.glb` = "Goat" by Poly by Google, **CC BY 3.0** (ghi công bắt buộc), tải từ https://poly.pizza/m/bSetPnvQB5G (low-poly ibex sừng cong). Muốn đổi: thay file, giữ tên `goat.glb` (code tự co theo chiều cao, đặt móng chạm đỉnh núi).

- **Dùng ở:** dê núi trốn trong mỏm đá, trúng hốc thì **nhảy vọt lên đứng trên đỉnh đá** (đứng nghiêng 3/4) nhìn ra người xem (thay con cóc cũ từ 18/11/2026).
- **Định dạng:** GLB, Y hướng lên, **mặt dê nhìn về +Z**, gốc toạ độ ở giữa đáy; ≤ 15k tam giác; PBR (base color, roughness, normal) 1024 px.
  Code tự co về khung ~1,35 đơn vị nên không cần đúng kích thước thật. Manifest: `"goat": "goat.glb"`.
- **Hình dáng:** dê núi con dễ thương nhưng **đúng dáng dê**: **mặt dài thuôn nhọn** hơi cúi, mõm hồng nâu, **mắt hai bên đầu tròng hổ phách con ngươi NGANG**,
  **tai dài chĩa ngang**, **sừng cong vút ra sau có vân** vàng nâu, **chòm râu cằm**, thân **lông ngắn mượt** trắng kem (KHÔNG xoăn như cừu), chân thon móng chẻ,
  đuôi ngắn vểnh, **vòng cổ đỏ có chuông vàng** (không khí Tết).
- **Prompt (ChatGPT, ảnh tham chiếu trước khi dựng 3D):**
  > Cute stylized young mountain goat, long tapered face slightly lowered, pinkish-brown muzzle, side-set amber eyes with horizontal pupils,
  > long sideways ears, ridged golden-brown horns curving backwards, small chin beard, short smooth cream-white coat (not woolly), slender legs with split hooves,
  > short upright tail, red collar with a golden bell,
  > Lunar New Year mood, premium vinyl toy look, soft studio lighting, front three-quarter view, plain white background, no text.
- **Prompt (AI 3D, image-to-3D):** dùng ảnh trên + *"game-ready stylized baby goat toy, single mesh, PBR, low poly 15k, facing +Z, origin at bottom center"*.
- **Tránh:** trông giống cừu (lông xoăn, mặt tròn ngắn), sừng nhọn hung dữ, mắt đỏ, dáng gầy guộc.

---

## 4. Hà mã đau răng — `hippo.glb` **[GĐ2]** (trò 🦛 Hà Mã Đau Răng)

- **Ý tưởng:** hà mã đồ chơi tím oải hương **há to miệng**, **dán băng cá nhân chéo trên má** (đang đau răng), mắt lồi tròn trên đỉnh đầu, tai nhỏ.
- **Bắt buộc tách node** để code điều khiển: `upperJaw` (hàm trên + đầu, **pivot ở bản lề sau miệng**), `lowerJaw` (hàm dưới + lưỡi),
  `body`. **Không** dựng răng (code tự đặt 6–16 răng có số vòng quanh hàm dưới) — chừa mép hàm dưới phẳng rộng ~ 3,0 × 2,3 để xếp răng.
- GLB, Y lên, mặt về +Z, ≤ 20k tam giác, PBR clearcoat (nhựa bóng).
- **Prompt:** *Cute glossy lavender toy hippo head with mouth wide open, a crossed adhesive bandage on one cheek, round bulging eyes on top, tiny ears,
  pink gums and tongue, no teeth, premium vinyl toy, front three-quarter view, white background, no text.*
- **Ghi chú code:** cần nối `upperJaw` vào xoay mở/ngoạm thay cho khối dựng sẵn trong `board3d.js` (mục HM).

## 5. Mỏm đá núi — `rock.glb` **[GĐ2]** (trò 🐐 Dê Núi)

- Mỏm đá núi **low-poly nhiều mặt vát góc cạnh**, đá xám nâu sẫm loang xám lạnh, mặt ngửa bạc nắng, rêu xanh lác đác ở chân;
  chân loe, lưng phình, **đỉnh bằng có miệng hang tối** (dê nhảy ra từ đây); **không đục hốc** (code tự đặt hốc có số theo mặt đá).
- GLB, ≤ 8k tam giác, cao ~3 : rộng ~3,6 (khớp code `ROCK_H` = 2,95). Kèm vài viên đá vụn + bụi cỏ núi nếu tiện.
- **Prompt:** *Low-poly faceted mountain crag, angular rock faces, dark grey-brown stone with cool grey variations, sunlit top facets, a little moss at the base,
  flat top with a dark cave opening, game asset, soft studio light, white background, no text.*

## 6. Tháp tre — `bamboo-bar.png` **[GĐ2]** (trò 🎋 Tháp Tre Chao Đảo)

- Texture **1024 × 256** mặt dài thanh tre đã chẻ (xanh vàng, thớ dọc, **2 đốt** ở 1/4 và 3/4), lặp được theo chiều ngang.
- Thêm `bamboo-end.png` **256 × 160**: mặt cắt đầu thanh (vòng thớ đồng tâm) — code in số lên trên.

## 7. Thẻ Săn Cặp Quà — `card-back.png` **[GĐ2]** (trò 🎁 Săn Cặp Quà)

- Mặt thẻ = **ảnh quà TikTok thật** lấy từ bảng quà của app (8 quà cố định) → KHÔNG cần vẽ.
- `card-back.png` **512 × 640**: lưng thẻ đen bóng kiểu TikTok, sọc chéo hồng `#FE2C55` / xanh `#25F4EE`, viền đôi lệch màu, **chừa vòng tròn trống ở giữa** (code in số).

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
- Bố cục: vật chính ở giữa (hà mã há miệng / dê con ló khỏi chum / tháp tre nghiêng / 3 thẻ đang lật / bàn ô ăn quan có tay rải quân),
  nền gradient tím-xanh đêm có ánh đèn sân khấu, **chừa 20% phía trên trống** để app đặt tên trò. Không chữ.

---

## 10. Bảng kiểm trước khi gửi lại

- [ ] Đúng tên file, đúng kích thước, PNG **nền trong suốt** (trừ texture bàn/thanh tre).
- [ ] Điểm neo đúng (đầu ngón tay ở mép trên giữa; mũi que ở mép dưới giữa).
- [ ] Model GLB mở được trên https://gltf-viewer.donmccurdy.com, Y lên, mặt về +Z, ≤ giới hạn tam giác.
- [ ] Không chữ, logo, watermark; không giống sản phẩm/nhân vật có thương hiệu.
- [ ] Nhìn rõ khi thu nhỏ còn ¼ (người xem TikTok xem trên điện thoại).
