# -*- coding: utf-8 -*-
"""Ảnh khung mẫu cho thẻ "Chào người xem vào phòng" (VIP Welcome).
Thẻ thật trong game: 640 x 150 px (toạ độ CSS joincard.css). Ảnh vẽ: canvas 1536 x 1024,
thẻ phóng S = 2.1 lần, gốc (OX, OY) = (110, 354) → thẻ chiếm x 110..1454, y 354..669 (khung avatar tràn trái tới x≈64).
Chạy: python art-requests/vipwelcome/_tools/vip_guides.py"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'khung-mau')
os.makedirs(OUT, exist_ok=True)
W, H = 1536, 1024
S, OX, OY = 2.1, 110, 354


def c(x, y):            # toạ độ thẻ (CSS px) → toạ độ canvas
    return (round(OX + x * S), round(OY + y * S))


def box(x0, y0, x1, y1):
    return [*c(x0, y0), *c(x1, y1)]


# Vùng trên thẻ 640x150 (khớp joincard.css)
ZONES = {
    'avatar':  dict(circle=(71, 75, 71), col=(80, 140, 255), label='AVATAR (code chèn ảnh) — để TRỐNG, tròn'),
    'frame':   dict(circle=(71, 75, 93), col=(160, 90, 255), label=''),
    'top':     dict(rect=(150, 4, 630, 38), col=(255, 170, 0), label='DẢI CHIP TRÊN: bậc · LV · FAN · "VÀO PHÒNG" (chữ do code)'),
    'body':    dict(rect=(92, 53, 640, 131), col=(255, 80, 80), label='THANH TÊN (nền thẻ chính)'),
    'name':    dict(rect=(164, 60, 460, 124), col=(220, 30, 30), label='TÊN NGƯỜI XEM — nền phẳng, tối vừa, KHÔNG họa tiết'),
    'xu':      dict(rect=(470, 66, 615, 118), col=(0, 160, 200), label='Ô SỐ XU (code)'),
    'sub':     dict(rect=(168, 131, 630, 149), col=(0, 150, 80), label='DÒNG PHỤ: @id · vai trò · ghé lần N (chữ nhỏ do code)'),
}


def font(n):
    for f in ('arial.ttf', 'segoeui.ttf'):
        try:
            return ImageFont.truetype(f, n)
        except Exception:
            pass
    return ImageFont.load_default()


def grid(d):
    for x in range(0, W + 1, 64):
        d.line([(x, 0), (x, H)], fill=(236, 236, 236))
    for y in range(0, H + 1, 64):
        d.line([(0, y), (W, y)], fill=(236, 236, 236))


def safe(d, m=62):
    d.rectangle([m, m, W - m, H - m], outline=(0, 170, 0), width=3)


def plate_guide():
    im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im, 'RGBA'); grid(d); safe(d)
    # vùng hiệu ứng / trang trí được phép tràn ra ngoài thẻ
    d.rectangle([62, 200, W - 62, 830], outline=(150, 150, 150), width=2)
    d.text((70, 205), 'vùng được phép có cánh/lửa/tia sáng tràn ra ngoài thẻ (vẫn trong lề xanh)', fill=(120, 120, 120), font=font(20))
    d.rectangle(box(0, 0, 640, 150), outline=(40, 40, 40), width=3)
    for k in ('body', 'top', 'name', 'xu', 'sub'):
        z = ZONES[k]; col = z['col']
        d.rectangle(box(*z['rect']), fill=col + (50,), outline=col + (255,), width=3)
        x0, y0 = c(z['rect'][0], z['rect'][1])
        d.text((x0 + 6, y0 + 4), z['label'], fill=col, font=font(19))
    for k in ('frame', 'avatar'):
        z = ZONES[k]; cx, cy, r = z['circle']; col = z['col']
        (X, Y), R = c(cx, cy), r * S
        d.ellipse([X - R, Y - R, X + R, Y + R], fill=col + (60,), outline=col + (255,), width=3)
    X, Y = c(71, 75)
    d.text((X - 95, Y - 10), 'AVATAR + KHUNG\n(file riêng frame.png)', fill=(60, 60, 160), font=font(18))
    d.text((70, 70), 'THẺ CHÀO — plate.png (1536×1024). Thẻ thật 640×150 px phóng ×2.1: x 110→1454, y 354→669', fill=(20, 20, 20), font=font(26))
    d.text((70, 950), 'đỏ/cam/xanh = chữ do CODE viết lên, art chỉ vẽ NỀN PHẲNG dễ đọc ở đó · tím/xanh dương = chỗ khung avatar (vẽ ở frame.png, không vẽ ở plate)', fill=(60, 60, 60), font=font(17))
    im.save(os.path.join(OUT, 'the-chao_plate.png'))


def frame_guide():
    im = Image.new('RGB', (1024, 1024), 'white'); d = ImageDraw.Draw(im, 'RGBA')
    for x in range(0, 1025, 64):
        d.line([(x, 0), (x, 1024)], fill=(236, 236, 236)); d.line([(0, x), (1024, x)], fill=(236, 236, 236))
    d.rectangle([62, 62, 962, 962], outline=(0, 170, 0), width=3)
    # khung thật: avatar 114px trong khung 186px → lỗ tròn = 61% bề rộng khung
    R_FRAME = 450; R_HOLE = round(R_FRAME * 114 / 186)
    d.ellipse([512 - R_FRAME, 512 - R_FRAME, 512 + R_FRAME, 512 + R_FRAME], fill=(160, 90, 255, 50), outline=(160, 90, 255), width=3)
    d.ellipse([512 - R_HOLE, 512 - R_HOLE, 512 + R_HOLE, 512 + R_HOLE], fill=(255, 255, 255, 255), outline=(80, 140, 255), width=4)
    d.text((512 - 160, 500), f'LỖ AVATAR trong suốt Ø{2 * R_HOLE}px', fill=(40, 90, 200), font=font(28))
    d.text((80, 80), f'frame.png 1024×1024 · khung trang trí trong Ø{2 * R_FRAME}px, tâm (512,512)', fill=(20, 20, 20), font=font(24))
    im.save(os.path.join(OUT, 'khung-avatar_frame.png'))
    return R_HOLE


if __name__ == '__main__':
    plate_guide()
    print('hole radius', frame_guide())
    for k, z in ZONES.items():
        if 'rect' in z:
            print(k, box(*z['rect']))
        else:
            print(k, c(z['circle'][0], z['circle'][1]), round(z['circle'][2] * S))
