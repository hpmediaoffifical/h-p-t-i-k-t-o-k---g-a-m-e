# -*- coding: utf-8 -*-
"""Sinh khung mẫu cho art-requests/thuytinh/trang-tri/BRIEF-TRANG-TRI.md.

Canvas vuông 2048×2048, hũ thủy tinh MẶC ĐỊNH (1024×1536) đặt ở (512, 256). Vùng cấm đo thẳng
từ alpha của public/assets/thuytinh/ben-ngoai/jar-glass.png nên khớp đúng hũ trong game.

    python art-requests/thuytinh/_tools/khung_trang_tri.py

Ra art-requests/thuytinh/trang-tri/khung-mau/:
    khung-trang-tri.png   ảnh hướng dẫn (hũ + vùng màu + nhãn) — đưa cho người vẽ xem
    hu-dat-san.png        chỉ cái hũ trên nền trong suốt, đúng chỗ — để canh khi vẽ
    mat-na-truoc.png      trắng = lớp TRƯỚC được vẽ, đen = cấm (code dùng để kiểm/xoá)
    mat-na-sau.png        trắng = lớp SAU được vẽ, đen = cấm
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'art-requests', 'thuytinh', 'trang-tri', 'khung-mau')
GLASS = os.path.join(ROOT, 'public', 'assets', 'thuytinh', 'ben-ngoai', 'jar-glass.png')
BOTTOM = os.path.join(ROOT, 'public', 'assets', 'thuytinh', 'jar-bottom.png')

CANVAS = 2048
OX, OY = 512, 256            # góc trên-trái khung hũ 1024×1536 trong canvas
# Mốc đo từ alpha jar-glass.png (toạ độ khung hũ): miệng hở y 186–232, ren cổ y 234–386, thân tới 1464
MOUTH_Y0, NECK_Y0, NECK_Y1 = 183, 234, 386
LANE_X0, LANE_X1 = 99, 887   # bề ngang miệng (mép ngoài vành)


def fill_outside(mask):
    """mask bool (True = nét) → bool vùng ngoài nối với mép ảnh (loang 4 hướng)."""
    h, w = mask.shape
    out = np.zeros_like(mask)
    stack = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    while stack:
        y, x = stack.pop()
        if out[y, x] or mask[y, x]:
            continue
        # quét cả đoạn ngang cho nhanh
        x0 = x
        while x0 > 0 and not out[y, x0 - 1] and not mask[y, x0 - 1]:
            x0 -= 1
        x1 = x
        while x1 < w - 1 and not out[y, x1 + 1] and not mask[y, x1 + 1]:
            x1 += 1
        out[y, x0:x1 + 1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < h:
                row_m, row_o = mask[ny, x0:x1 + 1], out[ny, x0:x1 + 1]
                for i in np.where(~row_m & ~row_o)[0]:
                    stack.append((ny, x0 + int(i)))
    return out


def main():
    sys.stdout.reconfigure(encoding='utf-8')                   # console Windows cp1252 không in được tiếng Việt
    os.makedirs(OUT, exist_ok=True)
    glass = Image.open(GLASS).convert('RGBA')
    bottom = Image.open(BOTTOM).convert('RGBA')
    a = np.array(glass.getchannel('A'))
    H, W = a.shape

    stroke = a > 40
    silhouette = ~fill_outside(stroke)                       # cả hũ (nét + lòng)
    # lòng kính trong = phần trong suốt bên trong hũ, nối với tâm thân
    clear = (a <= 60) & silhouette
    # loang từ tâm thân trong vùng clear
    inner = np.zeros_like(clear)
    stack = [(900, 512)]
    while stack:
        y, x = stack.pop()
        if inner[y, x] or not clear[y, x]:
            continue
        x0 = x
        while x0 > 0 and clear[y, x0 - 1] and not inner[y, x0 - 1]:
            x0 -= 1
        x1 = x
        while x1 < W - 1 and clear[y, x1 + 1] and not inner[y, x1 + 1]:
            x1 += 1
        inner[y, x0:x1 + 1] = True
        for ny in (y - 1, y + 1):
            if 0 <= ny < H:
                seg = clear[ny, x0:x1 + 1] & ~inner[ny, x0:x1 + 1]
                for i in np.where(seg)[0]:
                    stack.append((ny, x0 + int(i)))
    assert not inner[0, 0] and not inner[H - 1, 0], 'lòng kính loang ra ngoài — kiểm lại ngưỡng alpha'

    # lỗ miệng nhìn từ trên (elip trong suốt phía trên ren cổ) — nhìn xuyên qua được nên cũng là "kính".
    # Mép sau của vành mờ (alpha < 40) nên loang không khép được: lấp theo bề ngang từng hàng.
    for y in range(MOUTH_Y0 - 8, NECK_Y0):
        xs = np.where(a[y] > 10)[0]
        if len(xs):
            silhouette[y, xs.min():xs.max() + 1] = True
            inner[y, xs.min():xs.max() + 1] |= a[y, xs.min():xs.max() + 1] <= 60
    rim = silhouette & ~inner                                 # viền kính + vành miệng + ren cổ
    neck = np.zeros_like(rim)
    neck[NECK_Y0:NECK_Y1, :] = True
    neck &= silhouette                                         # cổ hũ: lớp trước được quấn nơ / vòng cổ

    # ---- đặt vào canvas ----
    def place(m):
        c = np.zeros((CANVAS, CANVAS), bool)
        c[OY:OY + H, OX:OX + W] = m
        return c
    C_inner, C_rim, C_neck, C_sil = place(inner), place(rim), place(neck), place(silhouette)
    C_lane = np.zeros((CANVAS, CANVAS), bool)
    C_lane[0:OY + NECK_Y0, OX + LANE_X0:OX + LANE_X1] = True   # làn rơi quà từ đỉnh canvas xuống tới ren cổ
    C_lane &= ~C_neck

    forbid_front = C_inner | (C_rim & ~C_neck) | C_lane
    forbid_back = C_inner
    Image.fromarray(np.where(forbid_front, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'mat-na-truoc.png'))
    Image.fromarray(np.where(forbid_back, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'mat-na-sau.png'))

    jar = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    jar.alpha_composite(bottom, (OX, OY))
    jar.alpha_composite(glass, (OX, OY))
    jar.save(os.path.join(OUT, 'hu-dat-san.png'))

    # ---- ảnh hướng dẫn ----
    guide = Image.new('RGBA', (CANVAS, CANVAS), (34, 36, 46, 255))
    d = ImageDraw.Draw(guide)
    for i in range(0, CANVAS, 128):                            # lưới mờ 128px
        d.line([(i, 0), (i, CANVAS)], fill=(48, 51, 64, 255), width=1)
        d.line([(0, i), (CANVAS, i)], fill=(48, 51, 64, 255), width=1)

    def tint(mask, rgba):
        layer = np.zeros((CANVAS, CANVAS, 4), np.uint8)
        layer[mask] = rgba
        guide.alpha_composite(Image.fromarray(layer, 'RGBA'))

    # vùng trang trí được phép (xanh nhạt) = ngoài hũ, ngoài làn rơi
    tint(~C_sil & ~C_lane, (70, 190, 120, 38))
    guide.alpha_composite(jar)
    tint(C_lane, (235, 60, 60, 70))
    yy, xx = np.mgrid[0:CANVAS, 0:CANVAS]
    tint(C_lane & (((xx - yy) // 24) % 2 == 0), (235, 60, 60, 60))   # sọc chéo cho làn rơi
    tint(C_inner, (235, 60, 60, 105))
    tint(C_rim & ~C_neck, (255, 150, 40, 150))
    tint(C_neck, (255, 215, 60, 150))

    # vạch đáy hũ + vùng đế
    by = OY + 1464
    d.line([(0, by), (CANVAS, by)], fill=(120, 200, 255, 255), width=4)
    d.line([(0, by + 300), (CANVAS, by + 300)], fill=(120, 200, 255, 140), width=3)

    def font(sz, bold=True):
        for f in (('segoeuib.ttf' if bold else 'segoeui.ttf'), 'arialbd.ttf', 'arial.ttf'):
            try:
                return ImageFont.truetype(os.path.join('C:/Windows/Fonts', f), sz)
            except OSError:
                continue
        return ImageFont.load_default()

    def label(xy, text, fill, sz=40, anchor='mm'):
        d.text(xy, text, font=font(sz), fill=fill, anchor=anchor, stroke_width=4, stroke_fill=(20, 20, 26, 255))

    label((CANVAS // 2, 120), 'LÀN RƠI QUÀ', (255, 120, 120, 255), 54)
    label((CANVAS // 2, 180), 'lớp TRƯỚC: cấm  ·  lớp SAU: được', (255, 200, 200, 255), 34)
    label((CANVAS // 2, OY + 310), 'CỔ HŨ — lớp trước được quấn nơ / vòng cổ', (255, 225, 110, 255), 34)
    label((CANVAS // 2, OY + 820), 'VÙNG KÍNH', (255, 140, 140, 255), 76)
    label((CANVAS // 2, OY + 900), 'CẤM VẼ — cả 2 lớp', (255, 190, 190, 255), 44)
    label((CANVAS // 2, OY + 960), '(người xem phải thấy quà trong hũ)', (255, 210, 210, 255), 32)
    label((OX + 30, OY + 1180), 'VIỀN KÍNH', (255, 175, 80, 255), 32, 'lm')
    label((OX + 30, OY + 1222), 'trước: cấm', (255, 200, 140, 255), 26, 'lm')
    label((OX + 30, OY + 1256), 'sau: được chạm', (255, 200, 140, 255), 26, 'lm')
    label((280, 900), 'TRANG TRÍ', (130, 230, 160, 255), 46)
    label((280, 955), 'tự do', (170, 240, 190, 255), 34)
    label((CANVAS - 280, 900), 'TRANG TRÍ', (130, 230, 160, 255), 46)
    label((CANVAS - 280, 955), 'tự do', (170, 240, 190, 255), 34)
    label((CANVAS // 2, by - 26), 'ĐÁY HŨ  y = %d' % by, (150, 215, 255, 255), 30)
    label((CANVAS // 2, by + 150), 'ĐẾ / BỆ ĐỠ  (tối đa 300px dưới đáy hũ)', (150, 215, 255, 255), 36)
    for v in range(0, CANVAS + 1, 256):                        # số toạ độ ở mép
        label((v if v < CANVAS else CANVAS - 30, 2048 - 22), str(v), (150, 155, 175, 255), 24)
        label((30, v if v > 0 else 24), str(v), (150, 155, 175, 255), 24, 'lm')
    guide.convert('RGB').save(os.path.join(OUT, 'khung-trang-tri.png'), optimize=True)

    tot = CANVAS * CANVAS
    print('OK', OUT)
    print('  lòng kính %.1f%% · viền %.1f%% · cổ %.1f%% · làn rơi %.1f%% canvas' % (
        100 * C_inner.sum() / tot, 100 * (C_rim & ~C_neck).sum() / tot, 100 * C_neck.sum() / tot, 100 * C_lane.sum() / tot))
    ys, xs = np.where(C_sil)
    print('  hũ trong canvas: x %d–%d, y %d–%d' % (xs.min(), xs.max(), ys.min(), ys.max()))


if __name__ == '__main__':
    main()
