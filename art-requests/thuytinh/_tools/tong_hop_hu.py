# -*- coding: utf-8 -*-
"""Tổng hợp 46 kiểu hũ: ảnh ghép khung mẫu (tong-hop-hu.png) + TONG-HOP-HU.md."""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
d = json.load(open(os.path.join(OUT, 'jar-skins.json'), encoding='utf-8'))
skins = d['skins']
F = lambda sz: ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', sz)

COLS, TW, TH, LAB = 8, 220, 330, 46
rows = (len(skins) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * TW, rows * (TH + LAB) + 70), (24, 26, 32))
dr = ImageDraw.Draw(sheet)
dr.text((16, 18), f'Hũ Thủy Tinh — {len(skins)} kiểu hũ (01–30 thường · 31–46 theo mùa) · khung mẫu', font=F(28), fill=(255, 255, 255))
for i, s in enumerate(skins):
    p = os.path.join(OUT, 'khung-mau', f"{s['no']:02d}-{s['id']}.png")
    x, y = (i % COLS) * TW, 70 + (i // COLS) * (TH + LAB)
    if os.path.exists(p):
        im = Image.open(p).convert('RGB')
        im.thumbnail((TW - 10, TH - 6))
        sheet.paste(im, (x + (TW - im.width) // 2, y + 3))
    col = (255, 200, 90) if s.get('season') else (230, 236, 245)
    dr.text((x + 8, y + TH), f"{s['no']:02d} {s['name']}"[:24], font=F(17), fill=col)
sheet.save(os.path.join(OUT, 'tong-hop-hu.png'))

SEASON = {'tet': 'Tết', 'valentine': 'Valentine', 'phu-nu': '8/3 · 20/10', 'xuan': 'Xuân', 'he': 'Hè',
          'quoc-khanh': 'Quốc khánh', 'trung-thu': 'Trung Thu', 'thu': 'Thu', 'halloween': 'Halloween',
          'noel': 'Noel', 'dong': 'Đông'}
L = [f"""# 🫙 Tổng hợp {len(skins)} kiểu hũ đã thiết kế

> Ảnh ghép toàn bộ: `tong-hop-hu.png`. Từng khung mẫu ở `khung-mau/NN-<id>.png`. Đơn đặt vẽ chi tiết ở `BRIEF-HU.md`. Số liệu gốc ở `jar-skins.json`.
> Hình học cả {len(skins)} kiểu đã được mô phỏng vật lý: **0 quà xuyên thành** (`sim-ket-qua*.json`).

| Nhóm | Số kiểu |
|---|---|
| Thường (01–30) | {sum(1 for s in skins if not s.get('season'))} |
| Theo mùa / dịp lễ (31–46) | {sum(1 for s in skins if s.get('season'))} |

- **Miệng hũ** = bề rộng mép trong miệng hũ, tính theo % bề ngang khung.
- **Miệng/thân**: tỉ lệ miệng so với thân. Số nhỏ là hũ miệng hẹp bụng to, dễ chứa nhiều quà. Số 1.00 là hũ thẳng đứng.
- **Kiểu trang trí**: những chi tiết vẽ thêm, đã có hộp vị trí riêng trong khung mẫu.

| # | Tên | id | Dịp | Dáng | Miệng hũ | Miệng/thân | Gợi ý dùng |
|---|---|---|---|---|---|---|---|"""]
for s in skins:
    sh = s['shape']
    mw = sh['neckRightX'] - sh['neckLeftX']
    bw = sh['bodyRightX'] - sh['bodyLeftX']
    deco = '; '.join(x.get('desc', x.get('name', '')) if isinstance(x, dict) else str(x) for x in s.get('decor', []))[:70]
    L.append(f"| {s['no']:02d} | {s['name']} | `{s['id']}` | {SEASON.get(s.get('season', ''), 'Quanh năm')} | "
             f"{'góc cạnh' if s['sharp'] else 'cong mềm'} | {mw * 100:.0f}% | {mw / bw:.2f} | {s['theme']} |")
L.append("""
## Cách chọn nhanh
- **Phòng nhiều quà nhỏ:** hũ bụng to, miệng/thân ≤ 0.70: 05 bánh quy bầu, 06 trái tim, 13 heo đất, 18 mèo, 19 gấu, 28 túi lộc.
- **Phòng sang chảnh / đua TOP:** 16 cúp vàng, 17 ly pha lê, 23 kim cương, 30 vương miện.
- **Hũ vui, gây cười:** 13 heo đất, 24 xô đá, 25 bóng đèn, 26 máy gacha, 29 ống nghiệm.
- **Theo mùa:** app có thể tự đổi theo lịch. Xem cột Dịp và khoảng ngày ở `BRIEF-HU.md` mục 4.2.
- **Phụ kiện hợp từng hũ:** xem `BRIEF-PHU-KIEN.md` mục 5.
""")
open(os.path.join(OUT, 'TONG-HOP-HU.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('ok', sheet.size)
