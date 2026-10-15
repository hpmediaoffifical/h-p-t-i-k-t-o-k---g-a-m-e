# -*- coding: utf-8 -*-
"""Đưa bộ hũ trong ve-xong/hu/ vào game.

- Nén front.png / back.png → WebP (giữ alpha) vào public/assets/thuytinh/hu/<id>/.
- Sinh public/games/thuytinh/jar-skins.js: hình học (shape + innerRight) của các kiểu CÓ ẢNH, lấy từ jar-skins.json.
Chạy lại mỗi khi có ảnh mới (vd ChatGPT vẽ xong): python art-requests/thuytinh/_tools/import_hu.py
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.dirname(HERE)
ROOT = os.path.dirname(os.path.dirname(ART))
SRC = os.path.join(ART, 've-xong', 'hu')
DST = os.path.join(ROOT, 'public', 'assets', 'thuytinh', 'hu')
OUT_JS = os.path.join(ROOT, 'public', 'games', 'thuytinh', 'jar-skins.js')

data = json.load(open(os.path.join(ART, 'jar-skins.json'), encoding='utf-8'))
skins = []
total = 0
for s in data['skins']:
    d = os.path.join(SRC, f"{s['no']:02d}-{s['id']}")
    front, back = os.path.join(d, 'front.png'), os.path.join(d, 'back.png')
    if not (os.path.exists(front) and os.path.exists(back)):
        continue
    od = os.path.join(DST, s['id'])
    os.makedirs(od, exist_ok=True)
    for name, path in (('front', front), ('back', back)):
        im = Image.open(path).convert('RGBA')
        assert im.size == (1024, 1536), (path, im.size)
        out = os.path.join(od, name + '.webp')
        im.save(out, 'WEBP', quality=88, method=4, alpha_quality=90)
        total += os.path.getsize(out)
    r4 = lambda v: round(v, 4)
    skins.append({
        'id': s['id'], 'no': s['no'], 'name': s['name'], 'season': s.get('season', ''), 'cx': s['cx'],
        'shape': {k: r4(v) for k, v in s['shape'].items()},
        'innerRight': [[r4(x), r4(y)] for x, y in s['innerRight']],
    })

js = """// AUTO-GENERATED bởi art-requests/thuytinh/_tools/import_hu.py — ĐỪNG sửa tay.
// Kiểu hũ (skin) cho Hũ Thủy Tinh: ảnh /assets/thuytinh/hu/<id>/front.webp + back.webp (1024×1536),
// shape = mốc cổ/thân/đáy (thay SHAPE mặc định), innerRight = thành TRONG bên phải từ mép miệng xuống
// tâm đáy (toạ độ 0–1 theo khung ảnh; bên trái đối xứng qua cx) → engine dựng tường va chạm theo đúng hình.
(function (root) {
    const SKINS = %s;
    const byId = {};
    SKINS.forEach(s => { byId[s.id] = s; s.front = '/assets/thuytinh/hu/' + s.id + '/front.webp'; s.back = '/assets/thuytinh/hu/' + s.id + '/back.webp'; });
    root.HpJarSkins = { SKINS, byId };
    if (typeof module === 'object' && module.exports) module.exports = root.HpJarSkins;
})(typeof self !== 'undefined' ? self : this);
""" % json.dumps(skins, ensure_ascii=False, separators=(',', ':'))
open(OUT_JS, 'w', encoding='utf-8', newline='\n').write(js)
print(f'{len(skins)} kiểu hũ, ảnh WebP tổng {total / 1e6:.1f} MB → {DST}')
