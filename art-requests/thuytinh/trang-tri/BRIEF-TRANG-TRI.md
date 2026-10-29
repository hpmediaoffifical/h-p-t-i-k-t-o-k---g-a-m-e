# 🫙 Hũ Thủy Tinh — Khung trang trí 2.5D–3D quanh hũ (đặt vẽ)

> Thay cho **46 kiểu hũ dựng tự động** (đã gỡ khỏi game ngày 29/10/2026 vì xấu). `../BRIEF-HU.md` **không dùng nữa**.
>
> **Ý tưởng mới:** cái hũ thủy tinh **mặc định** giữ nguyên (dáng, viền kính, va chạm vật lý, 7 màu kính). Mỗi "kiểu" chỉ là **một bộ trang trí đặt BÊN NGOÀI hũ**: bệ đỡ, hoa, ruy băng, vòng cổ, đồ vật theo mùa… **Vùng kính để trống hoàn toàn**, người xem phải luôn thấy rõ quà rơi và nằm trong hũ.
>
> Phong cách: **2.5D–3D, sang trọng, có gu**, kiểu ảnh quảng cáo nước hoa hay trang sức cao cấp, **không** phải hoạt hình dễ thương.

---

## 1. Năm điều không được sai

1. **Không vẽ vào VÙNG KÍNH** (màu đỏ trong khung mẫu), ở cả 2 lớp. Đây là chỗ quà nằm.
2. **Lớp trước không che VIỀN KÍNH** (màu cam). Viền hũ thủy tinh phải còn nguyên.
3. **Lớp trước không vẽ vào LÀN RƠI QUÀ** (sọc đỏ phía trên miệng hũ). Quà rơi từ trên xuống qua đây.
4. **Không vẽ lại cái hũ.** Game tự vẽ hũ, ảnh giao về chỉ có đồ trang trí trên **nền trong suốt thật**.
5. **Không có chữ, số, logo, người, nhân vật có bản quyền** (Disney, Sanrio, Pokémon…). Chữ trên hũ đã có tính năng riêng trong app.

---

## 2. Khung mẫu và toạ độ

Ảnh nằm trong `khung-mau/` (sinh bằng `../_tools/khung_trang_tri.py`, đo thẳng từ ảnh hũ trong game nên khớp từng pixel):

| File | Dùng để |
|---|---|
| `khung-trang-tri.png` | **Ảnh hướng dẫn**: hũ + các vùng tô màu + nhãn. Gửi cho người vẽ xem |
| `hu-dat-san.png` | Chỉ có cái hũ, nền trong suốt, **đúng vị trí và cỡ**. Đặt làm lớp tham chiếu khi vẽ, giao ảnh thì tắt lớp này đi |
| `mat-na-truoc.png` | Mặt nạ lớp trước: **trắng = được vẽ**, đen = cấm |
| `mat-na-sau.png` | Mặt nạ lớp sau: trắng = được vẽ, đen = cấm |

**Canvas vuông 2048 × 2048.** Nếu công cụ chỉ ra được 1024 × 1024 thì vẫn được, giữ đúng tỉ lệ và chia mọi số dưới đây cho 2.

| Vùng | Toạ độ (canvas 2048) | Lớp TRƯỚC | Lớp SAU |
|---|---|---|---|
| Khung ảnh hũ (1024×1536) | x 512→1536, y 256→1792 | (tham chiếu) | (tham chiếu) |
| Hình hũ thật | x 559→1458, y 439→1720 | | |
| 🟥 **Vùng kính** (lòng hũ + lỗ miệng + đĩa đáy) | trong hũ | **cấm** | **cấm** |
| 🟧 **Viền kính** (thành hũ, vành miệng) | dải ~25–45px ôm hình hũ | **cấm** | được chạm (để giấu mép vật "lách ra sau hũ") |
| 🟨 **Cổ hũ** (phần ren dưới miệng) | y 490→642 | **được** quấn nơ, dây, vòng cổ, thẻ treo | được |
| 🟥 sọc **Làn rơi quà** | x 611→1399, y 0→490 | **cấm** | được (vòm, hào quang **sau** quà) |
| 🟩 Hai bên hũ | x 0→559 và 1458→2048 | tự do | tự do |
| Đáy hũ | y = 1720 | | |
| Đế / bệ đỡ | y 1720→2020 (**tối đa 300px** dưới đáy) | tự do | tự do |

**Lưu ý về cỡ:** trên LIVE, hũ thường cao khoảng 400px trên màn 1080×1920, nên canvas 2048 chỉ còn khoảng **530px**, tức mọi thứ nhỏ đi **4 lần**. Phải vẽ khối to, rõ hình. Chi tiết nhỏ nhất **≥ 12px**, không nét mảnh, không hạt kim tuyến li ti.

---

## 3. Phong cách: 2.5D–3D sang trọng, có gu

| Mục | Yêu cầu |
|---|---|
| Kiểu render | **3D product render cao cấp** (Octane / Cinema 4D / Blender Cycles), như ảnh quảng cáo nước hoa, trang sức, mỹ phẩm luxury. Vật thể có khối, có chất liệu thật. **Không** vector phẳng, **không** viền đen hoạt hình, **không** chibi |
| Góc nhìn | **Nhìn thẳng, cao hơn tầm mắt khoảng 10°**, khớp với hũ (thấy elip miệng và elip đáy). Mặt trên của bệ đỡ là elip **cùng độ dẹt** với đáy hũ |
| Ánh sáng | Đèn chính **trên-trái 45°**, rim light mềm bên phải, ánh sáng studio ấm. Kim loại phản chiếu mềm (HDRI studio), không chói gắt |
| Bóng | Có **bóng tiếp xúc** mềm dưới mọi vật đặt trên bệ, kể cả bóng của hũ trên mặt bệ (vẽ quanh chân hũ, ngoài vùng kính) |
| Chất liệu gợi ý | Vàng champagne, vàng hồng, đồng thau xước, bạc; ngọc trai; đá cẩm thạch (trắng Carrara, đen Marquina, xanh emerald); sứ trắng; sơn mài; gỗ óc chó; nhung; lụa và ruy băng satin; pha lê mài; hoa thật (mẫu đơn, hồng, lan, cẩm tú cầu, khuynh diệp, hoa khô) |
| Màu | Mỗi bộ **tối đa 3 màu chính + 1 kim loại**. Tông trầm sang: ngà, champagne, hồng phấn, xanh sage, đỏ rượu vang, xanh ngọc lục bảo, xanh navy, đen bóng. **Tránh** neon, cầu vồng, màu bão hoà gắt |
| Bố cục có gu | **Bất đối xứng**: cụm chính ở **một góc dưới** (trái hoặc phải), ôm lên tới khoảng 1/3 thân hũ. Cụm phụ nhỏ ở vai hoặc chân phía đối diện. **Ít nhất 60% đường viền hũ để trống.** Nặng dưới, nhẹ trên |
| Nổi trên nền | Phải đẹp trên cả nền LIVE **tối** lẫn **sáng** (phòng có đèn), nhờ rim light + bóng đổ, không dựa vào nền |
| Kính | Thiết kế trên **kính trong (mặc định)**. Mỗi bộ ghi thêm 1 màu kính hợp nhất (trong / xanh dương / cam / xanh lá / hồng / tím / vàng) |

---

## 4. Lớp và file giao

| File | Bắt buộc? | Vẽ ở đâu trong game | Ghi chú |
|---|---|---|---|
| `truoc.png` | **Bắt buộc** | Trên cả hũ và quà | Gần như mọi thứ nằm ở đây: bệ, hoa, ruy băng, vòng cổ. Vật chạm hũ thì **cắt gọn theo mép ngoài viền kính**, nhìn sẽ như hũ đứng trước/trên nó |
| `sau.png` | Tuỳ chọn | Sau hũ, sau quà | Chỉ cho thứ nằm **phía sau**: vòm hoa, hào quang, quạt Art Deco, rèm lụa. Được lấn vào làn rơi vì quà rơi đè lên trên |
| `xem-thu.png` | Nên có | (không dùng trong game) | 1024×1024: hũ + trang trí ghép thử trên nền tối, để duyệt nhanh |

- **PNG RGBA, nền trong suốt thật.** Không nền trắng, không ô cờ giả.
- Mép mềm (khử răng cưa), **không** quầng trắng hay quầng màu nền quanh vật.
- Không chi tiết nào chạm mép canvas (chừa ≥ 24px).
- Nếu công cụ bắt buộc phải vẽ cả cái hũ: vẽ chồng lên `hu-dat-san.png` và **giữ nguyên vị trí, cỡ của hũ** (lệch quá 4px là hỏng). Code sẽ tự xoá vùng hũ theo mặt nạ.

---

## 5. Danh sách đợt 1 (20 bộ)

Cột **Vòng cổ** = bộ có quấn nơ/vòng ở cổ hũ (khi đó game tự ẩn "phụ kiện miệng hũ" cũ để không chồng lên nhau).

### Dùng quanh năm

| # | Thư mục (id) | Tên | Kính hợp | Vòng cổ | Mô tả |
|---|---|---|---|---|---|
| 1 | `champagne-gala` | Champagne Gala | trong | – | Bệ tròn **cẩm thạch trắng** viền vàng champagne. Cụm **mẫu đơn trắng + hồng phấn** ở góc trái dưới, một nhánh khuynh diệp vươn lên vai phải |
| 2 | `nhung-hoang-gia` | Nhung Hoàng Gia | trong | ✔ | Bệ **nhung đỏ rượu vang** viền tua vàng. Ruy băng satin đỏ thắt nơ ở cổ hũ, đuôi rủ xuống bên phải. Vương miện vàng nhỏ đặt **trên bệ** cạnh chân trái |
| 3 | `ngoc-trai` | Ngọc Trai | trong | ✔ | **Chuỗi ngọc trai** quấn 2 vòng ở cổ hũ, một đoạn rủ xuống bên trái. Vỏ sò xà cừ + ngọc trai rời trên bệ đá trắng |
| 4 | `luc-bao` | Lục Bảo | xanh lá | – | Bệ **đá emerald vân vàng**. Lá monstera đậm + hoa lan trắng ở góc phải dưới, chi tiết đồng thau |
| 5 | `dem-sapphire` | Đêm Sapphire | xanh dương | – | Bệ đá navy viền bạc. Hoa hồng trắng-xanh góc trái. Trăng lưỡi liềm + 2 ngôi sao **vàng 3D** treo ở góc trên phải (ngoài làn rơi) |
| 6 | `art-deco` | Art Deco | trong | – | Bệ bậc hình học **đen bóng + viền vàng**. `sau.png`: quạt nan Art Deco vàng xoè phía sau hũ |
| 7 | `vintage-go` | Vintage Gỗ | cam | ✔ | Đế **gỗ óc chó**. Dây gai buộc cổ + thẻ da treo (không chữ). Bó hoa khô (lúa mì, oải hương) dựng nghiêng bên phải |
| 8 | `pha-le-bang` | Pha Lê Băng | xanh dương | – | Bệ **pha lê mài** lấp lánh. Cụm tinh thể băng + hoa tuyết bạc ở 2 chân, hơi sương lạnh mờ (chỉ ngoài hũ) |
| 9 | `vuon-pastel` | Vườn Pastel | tím | – | Bệ sứ trắng. **Cẩm tú cầu** tím-xanh pastel góc trái, 2 con bướm 3D đậu ở vai phải |
| 10 | `anh-dao` | Anh Đào | hồng | – | Cành **hoa anh đào** vắt từ góc trên trái xuống ngang vai (không vào làn rơi), cánh hoa rơi lác đác trên bệ gỗ sáng |
| 11 | `macaron` | Macaron Paris | hồng | ✔ | Nơ satin hồng phấn ở cổ. Tháp **macaron** 3 tầng pastel cạnh chân phải, bệ sứ viền vàng hồng. Ngọt nhưng sang, **không** trẻ con |
| 12 | `nhiet-doi` | Nhiệt Đới | xanh lá | – | Bệ đá travertine. Lá cọ + **hoa dâm bụt** đỏ cam ở góc phải dưới, một lá vươn lên bên trái |

### Theo mùa / dịp lễ

| # | Thư mục (id) | Tên | Mùa | Kính hợp | Vòng cổ | Mô tả |
|---|---|---|---|---|---|---|
| 13 | `tet-mai-vang` | Tết Mai Vàng | Tết | vàng | ✔ | Bệ **sơn mài đỏ son** viền vàng. Cành **mai vàng** góc trái vươn lên vai, 2 bao lì xì đỏ dập vàng (không chữ), đồng xu vàng trên bệ. Dây đỏ thắt nút may mắn ở cổ |
| 14 | `tet-dao-hong` | Tết Đào Hồng | Tết | hồng | – | Bệ **sơn mài đen** khảm xà cừ. Cành **đào Nhật Tân** hồng góc phải, mứt Tết trong đĩa sứ nhỏ trên bệ |
| 15 | `valentine` | Valentine | 14/2 | hồng | ✔ | **Hoa hồng đỏ nhung** bó ở góc trái, nơ satin đỏ ở cổ, hộp quà nhung hình tim mở nắp trên bệ |
| 16 | `phu-nu` | Ngày Phụ Nữ | 8/3 · 20/10 | hồng | – | Bó **tulip + hồng pastel** gói giấy lụa ở chân phải, ruy băng lụa uốn lượn trên bệ sứ trắng |
| 17 | `trung-thu` | Trung Thu | Trung Thu | vàng | – | **Đèn lồng lụa đỏ** treo ở góc trên trái (ngoài làn rơi), bánh nướng + ấm trà sứ trên bệ gỗ, mây cát tường vàng mờ ở `sau.png` |
| 18 | `halloween` | Halloween Sang | 31/10 | cam | – | Bệ đá đen. **Bí ngô** cam đồng + bí trắng, nến sáp ngà có lửa, 2 con dơi nhỏ đen bóng ở vai. Sang, **không** ghê rợn |
| 19 | `giang-sinh` | Giáng Sinh | Noel | trong | ✔ | Vòng **nguyệt quế thông** + quả châu vàng/đỏ ôm chân hũ, nơ nhung đỏ ở cổ, bệ phủ tuyết |
| 20 | `quoc-khanh` | Quốc Khánh | 2/9 | trong | – | Dải **lụa đỏ sao vàng** bay mềm ở góc trái, **hoa sen** hồng + lá sen ở chân phải, bệ sơn mài đỏ |

---

## 6. Prompt mẫu (ChatGPT)

Gửi kèm **2 ảnh**: `khung-trang-tri.png` + `hu-dat-san.png`. Mỗi lượt chỉ làm **1 bộ**. Thay phần `[...]` bằng dòng của bộ đó ở bảng trên.

```text
Bạn là họa sĩ 3D product render. Tôi gửi 2 ảnh: (1) khung hướng dẫn có tô vùng màu, (2) cái hũ thủy tinh đặt sẵn đúng vị trí trên canvas 2048×2048.

Hãy vẽ BỘ TRANG TRÍ "[Tên bộ]" quanh cái hũ: [Mô tả bộ].

Bắt buộc:
- Xuất PNG 2048×2048, NỀN TRONG SUỐT THẬT, KHÔNG vẽ cái hũ. Chỉ có đồ trang trí, đặt đúng chỗ so với hũ ở ảnh 2.
- KHÔNG vẽ gì vào vùng ĐỎ (lòng hũ) và vùng CAM (viền hũ), KHÔNG vẽ vào làn SỌC ĐỎ phía trên miệng hũ. Vùng VÀNG (cổ hũ) được quấn nơ/vòng cổ. Vùng XANH tự do.
- Vật nào chạm hũ thì cắt gọn đúng theo mép ngoài của viền hũ.
- Phong cách 3D render cao cấp như quảng cáo nước hoa/trang sức: chất liệu thật, ánh sáng studio từ trên-trái, rim light mềm bên phải, bóng tiếp xúc mềm. Nhìn thẳng, cao hơn tầm mắt ~10° giống cái hũ.
- Bố cục bất đối xứng, cụm chính ở một góc dưới, để trống ít nhất 60% viền hũ. Tối đa 3 màu chính + 1 kim loại, tông trầm sang.
- Khối to rõ hình (sẽ hiển thị nhỏ lại 4 lần), không chữ, không số, không logo, không người.
- Không vẽ các màu đỏ/cam/vàng/xanh/sọc của khung hướng dẫn vào ảnh.
```

Nếu ChatGPT không ra được nền trong suốt hoặc cứ vẽ cả cái hũ: cho phép vẽ cả hũ, nhưng nhắc **"giữ nguyên vị trí và kích thước cái hũ như ảnh 2"**. Code sẽ tự xoá phần hũ.

---

## 7. Giao hàng

- Mỗi bộ 1 thư mục: `ve-xong/<id>/truoc.png` (+ `sau.png`, `xem-thu.png` nếu có). `<id>` đúng cột "Thư mục" ở trên.
- Trước khi giao, tự kiểm:
  - [ ] Đặt `truoc.png` lên `khung-trang-tri.png`: không có gì lấn vào đỏ, cam, sọc đỏ
  - [ ] Nền trong suốt thật (mở bằng trình xem ảnh thấy ô cờ)
  - [ ] Thu nhỏ ảnh còn 25% vẫn nhận ra từng vật
  - [ ] Không chữ, số, logo
- Điền bảng dưới:

| # | id | truoc.png | sau.png | Ghi chú |
|---|---|---|---|---|
| 1 | champagne-gala | | | |
| … | | | | |

---

## 8. Phần kỹ thuật (cho Claude khi tích hợp — người vẽ bỏ qua)

- **Hiện trạng (29/10/2026):** `public/games/thuytinh/jar-skins.js` rỗng, ảnh `public/assets/thuytinh/hu/` đã xoá (còn trong git, commit 4d304d8). Panel tự ẩn lưới kiểu hũ khi danh sách rỗng và tự hiện lại khi có phần tử. Config cũ `jarSkin: 'quoc-khanh'`… engine bỏ qua, coi là hũ mặc định.
- **Vật lý không đổi:** bỏ `buildSkinWalls()` và phần `Object.assign(SHAPE, …skin.shape)` trong `applyJarSkin()` của `game.js` (thừa từ 46 hũ cũ). Tường va chạm luôn là hũ mặc định. Đo 29/10: hũ mặc định 36/36 quà nằm trong, còn dáng `quoc-khanh` cũ thì cứ 12 quà lại văng ra khoảng 1.
- **Dữ liệu** mỗi bộ trong `jar-skins.js`: `{ id, no, name, season, glass, collar, front, back?, padBottom }`. Ảnh ở `/assets/thuytinh/trang-tri/<id>/truoc.webp|sau.webp`.
- **Engine:** 2 thẻ `<img>` mới. `.jar-decor-back` z-index 1 (dưới `jar-bottom` z2), `.jar-decor-front` z-index 4 đặt sau `jar-glass` trong DOM (dưới `fx-canvas` z5). Kích thước vuông, cạnh = `2 × jarRect().w`, `left = r.x − 0.5·r.w`, `top = r.y − (256/1536)·r.h`. Phải đi theo mọi hiệu ứng hũ (rung, nghiêng, nứt, trộm hũ, ẩn hũ) bằng cách soi style của `jarGlassEl`, giống lớp chữ `jar-text.js`.
- `collar: true` thì ẩn phụ kiện miệng hũ (`JAR_ACCESSORIES`). `glass` = màu kính gợi ý, chỉ là gợi ý, không ép.
- Thanh mục tiêu và số đếm dưới hũ: đẩy xuống theo `padBottom` (đo từ alpha bbox của ảnh) để không đè lên bệ.
- **Script nhập** `_tools/import_trang_tri.py` (chưa viết): kiểm RGBA và ảnh vuông, resize về 2048, nhân alpha với `mat-na-truoc.png` / `mat-na-sau.png` (xoá phần tràn). Báo % pixel bị xoá: trên 1% thì trả về người vẽ. Xuất WebP q90 (≤ 400KB/lớp), thumb 256px, tính `padBottom`, sinh `jar-skins.js`.
- **Kiểm sau khi nhập:** thả quà thử (`POST /api/test-gift`), quà phải thấy rõ trong hũ ở mọi bộ, xem cả overlay OBS 1080×1920 lẫn 4K.
