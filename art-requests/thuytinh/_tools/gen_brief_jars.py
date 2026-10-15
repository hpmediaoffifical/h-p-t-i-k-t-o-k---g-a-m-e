# -*- coding: utf-8 -*-
"""Sinh BRIEF-HU.md từ jar-skins.json (không chép tay số liệu)."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
d = json.load(open(os.path.join(OUT, 'jar-skins.json'), encoding='utf-8'))
W, H = d['meta']['canvas']


SEASONS = [
    ('tet', 'Tết Nguyên Đán', 'khoảng 3 tuần quanh Tết âm lịch'),
    ('valentine', 'Valentine', '07/02 → 15/02'),
    ('phu-nu', 'Quốc tế Phụ nữ 8/3 · Phụ nữ Việt Nam 20/10', '01/03 → 09/03 và 13/10 → 21/10'),
    ('xuan', 'Mùa xuân', 'tháng 2 → 4 (ngoài Tết)'),
    ('he', 'Mùa hè', 'tháng 5 → 8'),
    ('quoc-khanh', 'Quốc khánh 2/9', '28/08 → 03/09'),
    ('trung-thu', 'Trung Thu', 'khoảng 2 tuần quanh rằm tháng 8 âm lịch'),
    ('thu', 'Mùa thu', 'tháng 9 → 11'),
    ('halloween', 'Halloween', '20/10 → 01/11'),
    ('noel', 'Giáng sinh', '01/12 → 26/12'),
    ('dong', 'Mùa đông', 'tháng 12 → 1'),
]


def px(v, n):
    return round(v * n)


L = []
L.append("""# 🫙 Hũ Thủy Tinh — 46 kiểu hũ (30 kiểu thường + 16 kiểu theo mùa, 2 lớp ảnh)

> Đây là file đặt hàng vẽ cho ChatGPT. Đọc kỹ **Quy tắc chung** ở `../README.md` trước.
> Mỗi kiểu hũ có 1 **ảnh khung mẫu** trong `khung-mau/NN-<id>.png`. Hãy **đính kèm ảnh khung mẫu khi yêu cầu vẽ**, vì hình dáng hũ đã được tính sẵn để quà rơi lọt và nằm gọn trong hũ.

## 1. Vì sao phải 2 lớp ảnh

Trong game, quà (ảnh tròn, vật lý Matter.js) được vẽ **kẹp giữa** 2 lớp ảnh hũ:

```
z4  front.png  ← LỚP TRƯỚC: kính mặt trước, viền ngoài, phản quang, nửa trước miệng, trang trí đè lên quà
z3  (quà rơi, vẽ bằng code)
z2  back.png   ← LỚP SAU: mặt trong thành sau, nửa sau miệng, mặt đáy bên trong, trang trí phía sau
```

Nhờ vậy quà trông như **nằm trong** hũ: thành kính phía trước phủ lên quà, còn mặt đáy và thành sau nằm phía sau quà.

## 2. Thông số kỹ thuật (bắt buộc cho MỌI kiểu)

| Mục | Giá trị |
|---|---|
| Kích thước canvas | **1024 × 1536 px** (dọc), cả 2 lớp **cùng kích thước, cùng vị trí, chồng khít nhau** |
| Nền | **Trong suốt thật (PNG RGBA)**. KHÔNG vẽ nền ô caro giả, nền trắng hay nền màu |
| Lề an toàn | Mọi pixel có màu (kể cả glow, lấp lánh, bóng) phải nằm trong khung **x 41→983 px, y 46→1490 px**. Không phần nào bị cắt ở mép ảnh |
| Góc nhìn | Chính diện, nhìn hơi từ trên xuống ~10°, nên miệng và đáy hiện thành **elip dẹt** |
| Ánh sáng | Nguồn sáng từ **trên-trái**. Phản quang mạnh ở thành trái, phản quang mảnh ở thành phải |
| Độ dày kính | Khoảng **25 px** (vùng xám trong khung mẫu = bề dày kính nhìn từ trước) |
| Đường đỏ trong khung mẫu | **Mặt trong của thành kính**. Quà va chạm đúng đường này, nên mép trong của kính PHẢI trùng đường đỏ (sai số ≤ 6 px) |
| Đường xanh nét đứt | **Miệng hũ** (mép trong). Phía trên miệng là **LÀN RƠI QUÀ** (khung xanh): lớp trước KHÔNG được có gì trong làn này |
| Vạch xanh lục ở đáy | Mặt đáy bên trong (quà nằm trên đường này) |
| Hộp cam | Vùng cho trang trí **lớp TRƯỚC** |
| Hộp tím | Vùng cho trang trí **lớp SAU** |

### Độ trong suốt (alpha) — để quà luôn nhìn rõ
- **front.png**
  - Bên trong lòng hũ (vùng xanh nhạt của khung mẫu): kính phủ alpha **≤ 12%**.
  - Vệt phản quang alpha tối đa **55%**, dạng vệt dài mảnh, tổng diện tích **≤ 15%** lòng hũ.
  - Viền kính, mép miệng, đáy: alpha **70–95%**.
  - Trang trí trên thân (nhãn, mặt thú, chữ): alpha **≤ 85%**, nằm đúng hộp cam.
- **back.png**
  - Thành trong phía sau: alpha **15–30%** (tô màu ám nhẹ theo bảng màu).
  - Nửa sau vành miệng: elip **mép trên**.
  - Mặt đáy bên trong: elip đặc hơn, alpha **60–90%**.
  - **Không có gì nằm ngoài silhouette hũ**, trừ trang trí lớp sau trong hộp tím.

### Elip miệng và đáy (góc nhìn hơi từ trên)
- **Miệng**: elip tâm nằm trên đường xanh, bề rộng = bề rộng miệng + 2× bề dày kính, chiều cao ≈ **0.022 × 1536 ≈ 34 px** mỗi nửa. **Nửa trên (phía sau) vẽ ở back.png, nửa dưới (phía trước) vẽ ở front.png.**
- **Đáy**: elip mặt đáy trong có tâm ở vạch xanh lục, nửa chiều cao ≈ **40 px**, vẽ ở back.png. Viền đáy ngoài (dày, sáng) vẽ ở front.png, ngay dưới vạch xanh lục.
- Riêng đáy nhọn (trái tim, kim cương), đáy tròn (quả châu, bình thuốc, ống nghiệm) và đáy cầu: không cần elip đáy, chỉ cần bóng tối dần về điểm thấp nhất.

## 3. Cách giao file (ChatGPT trả về)

Mỗi kiểu giao 3 file vào `ve-xong/hu/`:

```
ve-xong/hu/NN-<id>/front.png      1024×1536, lớp trước
ve-xong/hu/NN-<id>/back.png       1024×1536, lớp sau
ve-xong/hu/NN-<id>/preview.png    1024×1536, ghép back + front trên nền xám đậm #2A2A2A (chỉ để duyệt)
```

Rồi ghi 1 dòng cho kiểu đó vào `ve-xong/TRA-VE.md`.

**Cách vẽ cho khớp:**
1. Đính kèm `khung-mau/NN-<id>.png` → vẽ **front.png** bám sát silhouette xám và đường đỏ.
2. Đính kèm **chính front.png vừa vẽ + khung mẫu** → vẽ **back.png** trùng khít vị trí.
3. Nếu ChatGPT không xuất được 2 lớp tách rời: giao **1 ảnh hũ hoàn chỉnh** (`full.png`) + **1 ảnh chỉ phần kính phía trước** (`front.png`). Claude sẽ tự tách `back = full − front`.

> ✅ Hình học cả 46 kiểu đã được **mô phỏng vật lý Matter.js**: hũ cao 400 px và 700 px, 60 fps và 30 fps, nhiều lượt thả. Kết quả **0 quà xuyên thành kính** (`sim-ket-qua*.json`). Vì vậy giữ đúng hình dáng khung mẫu là quà sẽ rơi lọt và nằm gọn.
>
> Claude sẽ **đo lại thành trong từ ảnh thật** (kênh alpha) và cập nhật va chạm, nên lệch vài px vẫn xử lý được. Nhưng **không được đổi hình dáng hũ** so với khung mẫu.

---

## 4. Danh sách kiểu hũ

### 4.1 — 30 kiểu thường (01–30)
""")

seasonal_started = False
for s in d['skins']:
    if s.get('season') and not seasonal_started:
        seasonal_started = True
        L.append('### 4.2 — 16 kiểu THEO MÙA / DỊP LỄ (31–46)\n')
        L.append('App có thể **tự đổi hũ theo ngày** (gợi ý). Lịch dùng từng dịp:\n')
        L.append('| Mã dịp | Dịp | Thời gian dùng | Kiểu hũ |')
        L.append('|---|---|---|---|')
        for code, nm, when in SEASONS:
            ks = ', '.join(f"{x['no']:02d} {x['name']}" for x in d['skins'] if x.get('season') == code)
            L.append(f'| `{code}` | {nm} | {when} | {ks} |')
        L.append('\n> Hũ theo mùa nên **cùng chất lượng kính** với hũ thường. Trang trí mùa (hoa mai, bí, tuyết…) đặt ở **2 bên / phía sau**, KHÔNG che làn rơi quà và không che lòng hũ quá 15%.\n')
    sh = s['shape']
    no = s['no']
    entry_px = round(s['entryWidthW'] * W)
    L.append(f"### {no:02d}. {s['name']} — `{s['id']}`")
    L.append((f"**Dịp:** `{s['season']}`  ·  " if s.get('season') else '') + f"_{s['theme']}_  ·  khung mẫu: `khung-mau/{no:02d}-{s['id']}.png`\n")
    shape_desc = 'góc cạnh, nét thẳng' if s['sharp'] else 'đường cong mềm'
    L.append(f"- **Hình dáng:** {shape_desc}; đối xứng qua x = {px(s['cx'], W)} px." + (" (Thân lệch trái để chừa chỗ cho quai bên phải.)" if s['cx'] != 0.5 else ''))
    L.append(f"- **Miệng (mép trong):** y = **{px(sh['neckTopY'], H)} px**, từ x {px(sh['neckLeftX'], W)} → {px(sh['neckRightX'], W)} px (rộng {px(sh['neckRightX'] - sh['neckLeftX'], W)} px). Lối vào hẹp nhất rộng **{entry_px} px**.")
    L.append(f"- **Thân rộng nhất (mép trong):** x {px(sh['bodyLeftX'], W)} → {px(sh['bodyRightX'], W)} px, tại y ≈ {px(sh['shoulderY'], H)} px.")
    L.append(f"- **Đáy trong (điểm thấp nhất):** y = **{px(sh['bodyBottomY'], H)} px**.")
    L.append(f"- **Bảng màu:** {s['palette']}")
    L.append(f"- **front.png:** {s['front']}.")
    L.append(f"- **back.png:** {s['back']}.")
    if s['decor']:
        L.append("- **Trang trí (đúng hộp trong khung mẫu):**")
        for dd in s['decor']:
            b = dd['box']
            L.append(f"  - [{'TRƯỚC' if dd['layer'] == 'front' else 'SAU'}] {dd['label']} — hộp x {px(b[0], W)}→{px(b[2], W)}, y {px(b[1], H)}→{px(b[3], H)} px")
    pts = ', '.join(f"({px(x, W)},{px(y, H)})" for x, y in s['innerRight'][::max(1, len(s['innerRight']) // 10)])
    L.append(f"- **Toạ độ mép trong bên phải (px, trích):** {pts} … (bên trái đối xứng; đầy đủ ở `jar-skins.json`)")
    L.append(f"- **Prompt gợi ý:** \"Transparent PNG 1024x1536, empty glass container shaped exactly like the attached template silhouette, "
             f"{s['theme']}, glossy realistic glass, soft studio light from top-left, front layer only / back layer only, "
             f"no background, nothing cropped, keep 40px empty margin.\"\n")

L.append("""---

## 5. Kiểm tra trước khi giao (ChatGPT tự soát)
- [ ] Nền trong suốt thật (mở trên nền tối không thấy ô caro / viền trắng).
- [ ] 2 lớp cùng 1024×1536 và chồng khít nhau (kiểm bằng preview.png).
- [ ] Mép trong của kính trùng đường đỏ của khung mẫu.
- [ ] Làn rơi quà (phía trên miệng) trống hoàn toàn ở front.png.
- [ ] Lòng hũ ở front.png đủ trong suốt (alpha ≤ 12% ngoài các vệt phản quang).
- [ ] Không chi tiết nào chạm mép ảnh (lề ≥ 41 px ngang, ≥ 46 px dọc).
- [ ] Không chữ ký, watermark, chữ thừa (chỉ có chữ ở những kiểu yêu cầu: dược phẩm, chai sữa, gacha, túi lộc).
""")

open(os.path.join(OUT, 'BRIEF-HU.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(L))
print('ok', len(d['skins']))
