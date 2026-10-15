# -*- coding: utf-8 -*-
"""Sinh hình học 30 kiểu hũ Hũ Thủy Tinh: thành trong (va chạm), viền ngoài, miệng, đáy.
Xuất: ../jar-skins.json + ảnh khung mẫu ../khung-mau/NN-<id>.png (1024x1536) + _tong-hop.png.
Toạ độ chuẩn hoá: x theo bề rộng 1024, y theo chiều cao 1536 (khung PNG hũ hiện tại).
Chạy: python art-requests/thuytinh/_tools/jar_skins.py"""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 1536
T_GLASS = 0.024               # độ dày kính (theo W) ≈ 25px
SAFE_X, SAFE_Y = 0.04, 0.03   # lề an toàn trong suốt (41px ngang, 46px dọc)
MIN_MOUTH_HW = 0.28           # nửa bề rộng lối vào tối thiểu (lối vào >= 56% W)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)


def arc(cx, cy, rpx, a0, a1, n=14):
    """Cung tròn tâm (cx,cy) chuẩn hoá, bán kính px, góc độ (0 = phải, 90 = xuống)."""
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        pts.append(((cx * W + rpx * math.cos(a)) / W, (cy * H + rpx * math.sin(a)) / H))
    return pts


def sphere(cy, rpx, mouth_hw, neck=0.025, floor_hw=None, cx=0.5):
    """Bầu cầu có cổ ngắn: miệng ở đỉnh cầu; đáy tròn hoặc cắt phẳng tại floor_hw."""
    mx = mouth_hw * W
    dy = -math.sqrt(rpx * rpx - mx * mx)
    my = (cy * H + dy) / H
    a0 = math.degrees(math.atan2(dy, mx))
    if floor_hw is None:
        a1 = 90
    else:
        fx = floor_hw * W
        a1 = math.degrees(math.atan2(math.sqrt(rpx * rpx - fx * fx), fx))
    pts = ([(cx + mouth_hw, my - neck)] if neck > 0 else []) + arc(cx, cy, rpx, a0, a1, 22)
    if floor_hw is not None:
        pts.append((cx, pts[-1][1]))
    return pts


def catmull(pts, n=6):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(pts[-1])
    return out


def mirror(pts, cx):
    return [(2 * cx - x, y) for x, y in pts]


# ---------------------------------------------------------------------------
# Mỗi kiểu: điểm thành TRONG bên PHẢI, từ mép miệng trên xuống tới tâm đáy (x = cx).
# smooth=True → nội suy Catmull-Rom (thân cong); False → giữ góc cạnh.
# decor: (x0,y0,x1,y1,layer,label) — layer 'front' (đè lên quà) | 'back' (sau quà).
# Lớp front KHÔNG được nằm trong làn rơi quà (cột miệng, phía trên miệng).
# ---------------------------------------------------------------------------
S = []


def skin(id, name, theme, pts, smooth=True, cx=0.5, decor=(), palette='', front='', back='', season=''):
    S.append(dict(id=id, name=name, theme=theme, pts=pts, smooth=smooth, cx=cx, decor=list(decor), season=season,
                  palette=palette, front=front, back=back))


skin('mason-co-dien', 'Hũ Mason cổ điển', 'Bản chuẩn, nâng cấp từ hũ hiện tại (giữ đúng hình học cũ)',
     [(0.85, 0.195), (0.85, 0.232), (0.905, 0.262), (0.92, 0.31), (0.92, 0.84), (0.905, 0.885), (0.86, 0.9), (0.5, 0.9)],
     palette='kính trong #E8F4FF, viền sáng #FFFFFF, bóng #9FB7C9',
     front='ren xoáy 2 vòng ở cổ, 2 vệt phản quang dọc thân trái/phải, viền đáy dày 2 lớp',
     back='nửa sau miệng (elip), mặt trong thành sau rất mờ, mặt đáy trong (elip) có vân kính')

skin('mat-ong-luc-giac', 'Hũ mật ong lục giác', 'Hũ lục giác cạnh vát, ánh hổ phách',
     [(0.80, 0.20), (0.80, 0.235), (0.90, 0.285), (0.90, 0.855), (0.80, 0.9), (0.5, 0.9)], smooth=False,
     decor=[(0.06, 0.38, 0.22, 0.52, 'front', 'giọt mật chảy từ vai trái'),
            (0.84, 0.17, 0.95, 0.25, 'front', 'con ong nhỏ đậu vai phải')],
     palette='hổ phách #F7B733 → #E08E0B, kính #FFF6D6',
     front='3 mặt lục giác thấy được (giữa sáng, 2 bên tối hơn), cạnh vát sáng, giọt mật ở vai, ong nhỏ',
     back='mặt trong tô vàng mật 12% alpha, đáy trong lục giác')

skin('be-ca-tron', 'Bể cá tròn', 'Bể cá cầu miệng loe, đặt trên đế',
     sphere(0.50, 420, 0.30, neck=0.03, floor_hw=0.13),
     decor=[(0.30, 0.70, 0.70, 0.76, 'back', 'sỏi màu + rong biển thấp phía sau đáy'),
            (0.28, 0.765, 0.72, 0.84, 'front', 'đế tròn gỗ sáng dưới bể')],
     palette='nước biển #7FD6FF 10%, viền #DFF6FF, rong #3BB273',
     front='mép loe dày ở miệng, phản quang cong theo cầu, đế gỗ',
     back='mặt sau cầu xanh nước nhạt, 3 bọt khí, sỏi + rong phía sau')

skin('duoc-pham', 'Hũ dược phẩm cổ', 'Apothecary vai tròn, nhãn cổ điển',
     [(0.78, 0.17), (0.78, 0.215), (0.84, 0.24), (0.885, 0.29), (0.89, 0.86), (0.87, 0.9), (0.5, 0.905)],
     decor=[(0.30, 0.55, 0.70, 0.66, 'front', 'nhãn giấy cổ "HP GIFTS", alpha 85%')],
     palette='kính hơi xanh lục #D9F2E6, nhãn #F3E5C0 viền #7A4E2D',
     front='nhãn giấy giữa thân, viền vai bo, gờ cổ dày',
     back='đáy trong dày, mặt sau xanh lục 8%')

skin('banh-quy-bau', 'Hũ bánh quy bầu', 'Thùng bầu tròn kiểu cookie jar',
     [(0.80, 0.20), (0.80, 0.232), (0.87, 0.28), (0.91, 0.40), (0.92, 0.55), (0.91, 0.70), (0.87, 0.83), (0.82, 0.885), (0.5, 0.895)],
     decor=[(0.06, 0.30, 0.20, 0.42, 'front', 'bánh quy socola dán vai trái'),
            (0.80, 0.70, 0.94, 0.82, 'front', 'bánh quy cắn dở dán thân phải')],
     palette='kính ấm #FFF1E0, nâu bánh #C68642, socola #5B3A29',
     front='2 vòng gờ ngang mảnh ở 1/3 và 2/3 thân, bánh quy dán 2 bên mép',
     back='mặt sau ánh kem nhạt')

skin('trai-tim', 'Hũ trái tim', 'Thân trái tim, cổ ngắn giữa 2 thuỳ, đáy nhọn',
     [(0.78, 0.18), (0.78, 0.235), (0.83, 0.215), (0.89, 0.225), (0.925, 0.27), (0.93, 0.34), (0.91, 0.43),
      (0.86, 0.54), (0.78, 0.65), (0.68, 0.76), (0.58, 0.85), (0.5, 0.905)],
     palette='hồng #FF5D8F → #FFB3C9, kính #FFE3EC',
     front='2 thuỳ tim bóng, viền hồng đậm, 3 tim nhỏ lấp lánh ở thuỳ phải',
     back='mặt sau hồng 10%, đáy chữ V hội tụ giữa')

skin('den-long', 'Hũ đèn lồng', 'Đèn lồng Hội An bằng kính, vành + đáy gỗ đỏ',
     [(0.76, 0.17), (0.76, 0.22), (0.84, 0.25), (0.90, 0.33), (0.925, 0.45), (0.925, 0.60), (0.90, 0.72), (0.84, 0.80),
      (0.76, 0.83), (0.5, 0.835)],
     decor=[(0.22, 0.82, 0.78, 0.865, 'front', 'vành đáy gỗ đỏ son'),
            (0.46, 0.865, 0.54, 0.965, 'front', 'tua rua đỏ treo dưới đáy'),
            (0.20, 0.155, 0.80, 0.18, 'back', 'vành miệng gỗ đỏ (nửa sau)')],
     palette='đỏ son #C0392B, vàng kim #F4C542, kính ấm #FFE8D0',
     front='nan dọc mảnh vàng kim chia 6 múi, vành gỗ miệng + đáy, tua rua',
     back='múi kính sau ánh cam nhạt như đèn đang sáng')

skin('bi-ngo', 'Hũ bí ngô', 'Bí ngô Halloween thấp, rộng',
     [(0.76, 0.30), (0.76, 0.34), (0.84, 0.36), (0.90, 0.42), (0.93, 0.52), (0.93, 0.64), (0.90, 0.74), (0.84, 0.81),
      (0.74, 0.845), (0.5, 0.855)],
     decor=[(0.78, 0.20, 0.93, 0.30, 'front', 'cuống bí cong + 1 lá, bên phải miệng')],
     palette='cam #FF8C1A → #E05A00, cuống #6B8E23',
     front='5 múi bí (gân dọc cong), mặt cười khắc mờ 15% ở nửa trên, cuống bên phải miệng',
     back='mặt sau cam 12%')

skin('qua-cau-tuyet', 'Quả cầu tuyết', 'Snow globe mở miệng trên, đế gỗ',
     sphere(0.45, 400, 0.28, neck=0.025, floor_hw=0.25),
     decor=[(0.18, 0.66, 0.82, 0.93, 'front', 'đế gỗ nâu bo tròn + ruy băng đỏ'),
            (0.30, 0.60, 0.70, 0.655, 'back', 'nền tuyết + 2 cây thông nhỏ phía sau')],
     palette='kính #EAF6FF, tuyết #FFFFFF, gỗ #8B5A2B, ruy băng #D7263D',
     front='phản quang tròn lớn trên trái, 5-8 hạt tuyết tĩnh, đế gỗ',
     back='nền tuyết + cây thông mờ phía sau đáy')

skin('ho-lo', 'Hồ lô', 'Bầu hồ lô 2 bầu, eo rộng',
     [(0.78, 0.12), (0.78, 0.16), (0.82, 0.20), (0.85, 0.27), (0.84, 0.34), (0.785, 0.40), (0.86, 0.47), (0.92, 0.58),
      (0.92, 0.72), (0.87, 0.83), (0.78, 0.89), (0.5, 0.91)],
     decor=[(0.70, 0.38, 0.86, 0.47, 'front', 'dây buộc đỏ ở eo + tua rua ngắn bên phải')],
     palette='kính vàng ngọc #FFF4C2, dây đỏ #C0392B',
     front='dây đỏ quấn eo, phản quang 2 bầu', back='ánh vàng nhạt')

skin('binh-amphora', 'Bình Hy Lạp hai quai', 'Amphora kính 2 quai, chân đế',
     [(0.79, 0.16), (0.78, 0.21), (0.78, 0.25), (0.86, 0.31), (0.905, 0.42), (0.90, 0.56), (0.85, 0.70), (0.76, 0.81),
      (0.68, 0.86), (0.5, 0.865)],
     decor=[(0.86, 0.20, 0.955, 0.36, 'front', 'quai phải (vòng kính cổ → vai)'),
            (0.045, 0.20, 0.14, 0.36, 'front', 'quai trái'),
            (0.33, 0.875, 0.67, 0.955, 'front', 'chân đế kính')],
     palette='kính ngọc lam #CFF5EE, hoa văn vàng #D4AF37',
     front='dải hoa văn chữ Hy Lạp vàng mảnh ở vai, 2 quai, chân đế', back='mặt sau lam nhạt')

skin('chai-sua', 'Chai sữa cổ điển', 'Bình sữa thủy tinh miệng rộng',
     [(0.78, 0.14), (0.78, 0.18), (0.785, 0.22), (0.83, 0.27), (0.875, 0.34), (0.89, 0.42), (0.89, 0.87), (0.87, 0.9), (0.5, 0.9)],
     decor=[(0.30, 0.56, 0.70, 0.68, 'front', 'logo in xanh "HP MILK" + bò sữa nhỏ')],
     palette='trắng sữa kính #F7FBFF, chữ #2D6CDF',
     front='gờ miệng dày, logo in xanh giữa thân, vạch đo bên trái', back='mặt sau trắng sữa 6%')

skin('heo-dat', 'Heo đất thủy tinh', 'Thân heo tròn, miệng khe rộng trên lưng',
     [(0.76, 0.25), (0.76, 0.29), (0.85, 0.30), (0.91, 0.37), (0.925, 0.48), (0.925, 0.60), (0.90, 0.70), (0.83, 0.77),
      (0.72, 0.80), (0.5, 0.81)],
     decor=[(0.07, 0.17, 0.23, 0.31, 'front', 'tai trái'), (0.77, 0.17, 0.93, 0.31, 'front', 'tai phải'),
            (0.40, 0.55, 0.60, 0.66, 'front', 'mũi heo 2 lỗ, alpha 60%'),
            (0.16, 0.79, 0.32, 0.92, 'front', 'chân trước trái'), (0.68, 0.79, 0.84, 0.92, 'front', 'chân trước phải'),
            (0.92, 0.50, 0.955, 0.60, 'front', 'đuôi xoắn')],
     palette='hồng phấn #FFB6C8, đậm #F06292',
     front='tai, mũi, 2 chân trước rõ, mắt nhắm cười trên mũi, đuôi xoắn', back='mặt sau hồng 12%')

skin('hop-kinh', 'Hộp kính vuông', 'Hộp kính mở nắp, khung kim loại',
     [(0.87, 0.24), (0.87, 0.88), (0.5, 0.88)], smooth=False,
     palette='kính #F0F8FF, khung bạc #B8C2CC hoặc vàng #D4AF37',
     front='khung 4 cạnh trước + nẹp góc, mặt trên mở thấy hình bình hành',
     back='2 cạnh khung sau mảnh hơn, mặt đáy trong')

skin('coc-bia', 'Cốc bia có quai', 'Vại bia kính dày, quai phải, bọt tràn mép trái',
     [(0.77, 0.16), (0.76, 0.86), (0.74, 0.89), (0.45, 0.89)], smooth=False, cx=0.45,
     decor=[(0.80, 0.28, 0.955, 0.74, 'front', 'quai cốc bên phải'),
            (0.05, 0.13, 0.15, 0.24, 'front', 'bọt bia tràn mép TRÁI')],
     palette='hổ phách #F2A900 alpha 10%, bọt #FFFFFF',
     front='6 rãnh dọc mặt cốc, quai dày, bọt tràn mép', back='ánh bia vàng nhạt nửa dưới')

skin('cup-vang', 'Cúp vô địch', 'Cúp kính viền vàng, chân + đế',
     [(0.85, 0.12), (0.84, 0.18), (0.82, 0.30), (0.76, 0.42), (0.66, 0.50), (0.5, 0.53)],
     decor=[(0.875, 0.16, 0.96, 0.38, 'front', 'quai phải vàng'), (0.04, 0.16, 0.125, 0.38, 'front', 'quai trái vàng'),
            (0.40, 0.55, 0.60, 0.80, 'front', 'thân cúp vàng'), (0.22, 0.80, 0.78, 0.95, 'front', 'đế 2 tầng + bảng tên')],
     palette='vàng #F4C542 → #B8860B, kính #FFF9E0',
     front='viền miệng vàng, 2 quai, chân + đế vàng, ngôi sao khắc', back='lòng cúp vàng nhạt 10%')

skin('ly-pha-le', 'Ly pha lê', 'Ly vang khổng lồ, chân cao',
     [(0.83, 0.14), (0.85, 0.25), (0.84, 0.36), (0.78, 0.47), (0.66, 0.54), (0.5, 0.56)],
     decor=[(0.46, 0.58, 0.54, 0.85, 'front', 'chân ly mảnh'), (0.25, 0.85, 0.75, 0.93, 'front', 'đế ly elip')],
     palette='pha lê #F5FBFF, cạnh cắt ánh cầu vồng nhẹ',
     front='vân cắt pha lê dải dưới bầu, chân + đế', back='lòng ly rất trong')

skin('hu-meo', 'Hũ mèo', 'Hũ tròn tai mèo, mặt mèo nhỏ trên vai',
     [(0.78, 0.21), (0.78, 0.245), (0.88, 0.27), (0.915, 0.33), (0.92, 0.80), (0.88, 0.88), (0.80, 0.9), (0.5, 0.9)],
     decor=[(0.06, 0.10, 0.21, 0.25, 'front', 'tai mèo trái'), (0.79, 0.10, 0.94, 0.25, 'front', 'tai mèo phải'),
            (0.36, 0.28, 0.64, 0.36, 'front', 'mắt + mũi + ria, alpha 70%'),
            (0.90, 0.55, 0.96, 0.85, 'front', 'đuôi cong ôm thân phải')],
     palette='kem #FFF3E0, cam mèo #F5A25D, hồng tai #FF9EB5',
     front='tai, mặt mèo cười ở vai, đuôi, 2 chân trước ở đáy', back='mặt sau kem nhạt')

skin('hu-gau', 'Hũ gấu', 'Gấu bông tròn',
     [(0.78, 0.20), (0.78, 0.24), (0.86, 0.26), (0.91, 0.32), (0.93, 0.45), (0.93, 0.70), (0.90, 0.81), (0.82, 0.88), (0.5, 0.895)],
     decor=[(0.06, 0.12, 0.22, 0.26, 'front', 'tai gấu trái'), (0.78, 0.12, 0.94, 0.26, 'front', 'tai gấu phải'),
            (0.38, 0.27, 0.62, 0.35, 'front', 'mặt gấu (mắt, mõm)'),
            (0.08, 0.80, 0.24, 0.92, 'front', 'bàn chân trái'), (0.76, 0.80, 0.92, 0.92, 'front', 'bàn chân phải')],
     palette='nâu mật #C68B59, kem #F5DEB3',
     front='tai, mặt, 2 bàn chân có đệm thịt, nơ cổ đỏ', back='nâu nhạt 8%')

skin('binh-men-lam', 'Bình Tết men lam', 'Ginger jar bằng kính, hoa văn lam + nơ đỏ',
     [(0.76, 0.18), (0.76, 0.22), (0.86, 0.25), (0.92, 0.33), (0.93, 0.45), (0.90, 0.62), (0.84, 0.78), (0.78, 0.86), (0.5, 0.87)],
     decor=[(0.77, 0.15, 0.95, 0.30, 'front', 'nơ đỏ Tết ở vai phải'), (0.24, 0.87, 0.76, 0.93, 'front', 'chân đế lam')],
     palette='lam #1F4E9C, trắng #FFFFFF, đỏ #D7263D, vàng #F4C542',
     front='hoa văn mây + sen men lam mảnh (alpha 55%) ở vai và chân, nơ đỏ', back='men trắng xanh 6%')

skin('qua-chau-noel', 'Quả châu Noel', 'Quả châu cầu, chóp kim loại + móc treo',
     sphere(0.52, 420, 0.28, neck=0.035),
     decor=[(0.46, 0.20, 0.54, 0.27, 'back', 'móc treo bạc (phía sau)'),
            (0.20, 0.27, 0.80, 0.30, 'back', 'vành chóp bạc (nửa sau)'),
            (0.20, 0.29, 0.80, 0.325, 'front', 'vành chóp bạc (nửa trước)')],
     palette='đỏ #D7263D hoặc xanh #1B998B, bạc #C0C0C0, tuyết #FFFFFF',
     front='chóp bạc khía, dải băng ngang có bông tuyết, phản quang tròn', back='mặt sau đỏ 12%')

skin('binh-thuoc', 'Bình thuốc phép', 'Bình cầu cổ rộng, ánh tím phép thuật',
     [(0.78, 0.10)] + sphere(0.635, 410, 0.28, neck=0.0),
     decor=[(0.06, 0.08, 0.20, 0.22, 'front', 'nút bần nằm nghiêng ngoài miệng trái'),
            (0.25, 0.80, 0.75, 0.88, 'back', 'chất lỏng tím phát sáng mờ dưới đáy')],
     palette='tím #8E44AD → #D980FA, phát sáng #F5D0FF',
     front='gờ miệng dày, vạch chia, ký tự phù chú mảnh', back='ánh tím dưới đáy 18% + bong bóng')

skin('kim-cuong', 'Hũ kim cương', 'Viên kim cương giác cắt: mặt bàn rộng, đáy nhọn',
     [(0.82, 0.20), (0.82, 0.24), (0.93, 0.32), (0.5, 0.92)], smooth=False,
     palette='pha lê #E6F7FF, ánh cầu vồng #B388FF / #80DEEA',
     front='vạch giác cắt tam giác toả từ đáy nhọn, ánh khúc xạ cầu vồng ở cạnh', back='giác cắt mặt sau mờ')

skin('xo-da', 'Xô đá', 'Xô đá kính miệng loe, đai bạc',
     [(0.90, 0.24), (0.90, 0.27), (0.84, 0.88), (0.5, 0.88)], smooth=False,
     decor=[(0.88, 0.40, 0.96, 0.50, 'front', 'tay cầm vòng phải'), (0.04, 0.40, 0.12, 0.50, 'front', 'tay cầm vòng trái')],
     palette='kính băng #DDF3FF, bạc #B8C2CC, giọt nước #FFFFFF',
     front='giọt nước đọng, đai bạc miệng + đáy, 2 tay cầm', back='ánh băng xanh')

skin('bong-den', 'Bóng đèn ý tưởng', 'Bóng đèn đứng, đui xoáy ở dưới',
     [(0.78, 0.165)] + catmull([(0.78, 0.19), (0.88, 0.25), (0.92, 0.36), (0.89, 0.48), (0.80, 0.58), (0.72, 0.66), (0.70, 0.76)], 5)[1:] + [(0.5, 0.76)],
     smooth=False,
     decor=[(0.29, 0.765, 0.71, 0.90, 'front', 'đui đèn xoáy bạc + chân đồng'),
            (0.40, 0.64, 0.60, 0.74, 'back', 'dây tóc vàng mờ (phía sau)')],
     palette='kính ấm #FFFBE6, phát sáng #FFE066, đui #A0A0A0',
     front='đui xoáy 4 ren, phản quang cong, tia sáng nhỏ ngoài viền', back='quầng vàng ấm 10%')

skin('may-gacha', 'Máy gacha', 'Cầu kính trên thân máy gacha đỏ',
     sphere(0.36, 400, 0.28, neck=0.025, floor_hw=0.22),
     decor=[(0.12, 0.585, 0.88, 0.95, 'front', 'thân máy đỏ: núm vặn, khe nhả, chữ GACHA')],
     palette='đỏ #E53935, bạc #CFD8DC, kính #F2FBFF',
     front='thân máy dưới cầu, đai kim loại nối cầu-thân, phản quang', back='mặt sau cầu trong')

skin('hu-may', 'Hũ đám mây', 'Hũ pastel viền mây gợn',
     [(0.78, 0.20), (0.78, 0.24), (0.86, 0.26), (0.90, 0.31), (0.885, 0.37), (0.92, 0.43), (0.90, 0.50), (0.93, 0.57),
      (0.91, 0.64), (0.93, 0.71), (0.89, 0.79), (0.84, 0.85), (0.75, 0.875), (0.5, 0.88)],
     palette='xanh trời #A0D8FF, hồng #FFC7E1, trắng #FFFFFF',
     front='viền gợn mây, cầu vồng nhỏ ở vai trái, 3 ngôi sao nhỏ', back='gradient xanh → hồng 10%')

skin('tui-loc', 'Túi lộc Tết', 'Túi gấm thắt dây, thân phình đáy',
     [(0.78, 0.18), (0.78, 0.24), (0.82, 0.28), (0.89, 0.38), (0.93, 0.54), (0.93, 0.70), (0.90, 0.82), (0.83, 0.89), (0.5, 0.91)],
     decor=[(0.18, 0.225, 0.82, 0.26, 'front', 'dây rút vàng quanh cổ'),
            (0.80, 0.22, 0.94, 0.36, 'front', 'nút thắt + 2 đầu dây tua'),
            (0.36, 0.52, 0.64, 0.66, 'front', 'chữ 福 vàng, alpha 70%')],
     palette='đỏ gấm #C62828, vàng #FFD54F',
     front='vân gấm mờ, dây rút, chữ Phúc', back='đỏ 12%')

skin('ong-nghiem', 'Ống nghiệm khổng lồ', 'Ống dài đáy tròn — "cột quà" cao',
     [(0.80, 0.07), (0.80, 0.10)] + arc(0.5, 0.72, 307, 0, 90, 10), smooth=False,
     decor=[(0.22, 0.30, 0.30, 0.80, 'front', 'vạch chia in trên kính, sát thành trái')],
     palette='kính #F2FAFF, vạch #2D6CDF',
     front='miệng loe nhẹ, vạch chia, phản quang dọc dài', back='rất trong')

skin('vuong-mien', 'Hũ vương miện', 'Thân mason, vành miệng là vương miện',
     [(0.82, 0.21), (0.82, 0.245), (0.90, 0.27), (0.92, 0.32), (0.92, 0.84), (0.90, 0.885), (0.86, 0.9), (0.5, 0.9)],
     decor=[(0.30, 0.10, 0.70, 0.21, 'back', 'chóp vương miện phía sau'),
            (0.10, 0.10, 0.195, 0.21, 'front', 'chóp trước trái'), (0.805, 0.10, 0.90, 0.21, 'front', 'chóp trước phải'),
            (0.13, 0.205, 0.87, 0.25, 'front', 'đai vương miện có ngọc')],
     palette='vàng #F4C542, ngọc đỏ #E53935, ngọc xanh #1E88E5',
     front='đai vàng có ngọc quanh cổ; chóp trước chỉ ở 2 bên, KHÔNG che giữa miệng', back='chóp sau giữa')


import sys as _sys
_sys.path.insert(0, HERE)
from jar_skins_seasonal import register as _reg_seasonal
_reg_seasonal(skin, arc, sphere)

# ---------------------------------------------------------------------------
def build(sk):
    pts = sk['pts']
    inner = catmull(pts, 6) if sk['smooth'] else list(pts)
    clean = [inner[0]]
    for p in inner[1:]:
        if abs(p[0] - clean[-1][0]) * W + abs(p[1] - clean[-1][1]) * H > 3:
            clean.append(p)
    if clean[-1] != inner[-1]:
        clean.append(inner[-1])
    inner = clean
    cx = sk['cx']
    # nội suy cong có thể làm lối vào hụt — ép mọi điểm phía trên chỗ rộng nhất >= lối vào tối thiểu
    imax0 = max(range(len(inner)), key=lambda i: inner[i][0])
    inner = [(max(x, cx + MIN_MOUTH_HW + 0.004), y) if i <= imax0 else (x, y) for i, (x, y) in enumerate(inner)]
    xs = [p[0] for p in inner]
    ys = [p[1] for p in inner]
    mouth = inner[0]
    imax = max(range(len(inner)), key=lambda i: inner[i][0])
    shape = {
        'neckTopY': round(mouth[1], 4),
        'neckLeftX': round(2 * cx - mouth[0], 4), 'neckRightX': round(mouth[0], 4),
        'bodyLeftX': round(2 * cx - max(xs), 4), 'bodyRightX': round(max(xs), 4),
        'bodyTopY': round(min(ys), 4), 'bodyBottomY': round(max(ys), 4),
        'shoulderY': round(inner[imax][1], 4),
    }
    # lối vào hẹp nhất (từ miệng tới chỗ rộng nhất) — quà phải lọt qua
    entry_hw = min(p[0] - cx for p in inner[:imax + 1])
    P = [(x * W, y * H) for x, y in inner]
    t = T_GLASS * W
    outer = []
    for i, (x, y) in enumerate(P):
        a = P[max(i - 1, 0)]
        b = P[min(i + 1, len(P) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        nx, ny = dy / L, -dx / L
        outer.append(((x + nx * t) / W, (y + ny * t) / H))
    if abs(inner[-1][0] - cx) < 1e-9:
        outer[-1] = (cx, inner[-1][1] + t / H)
    outer[0] = (mouth[0] + T_GLASS + 0.018, mouth[1] - 0.012)   # môi miệng loe
    return inner, outer, shape, entry_hw


def check(sk, inner, outer, shape, entry_hw):
    errs = []
    cx = sk['cx']
    if entry_hw < MIN_MOUTH_HW - 1e-6:
        errs.append(f'lối vào hẹp {entry_hw * 2:.3f}W < {MIN_MOUTH_HW * 2:.2f}W')
    allx = [p[0] for p in outer] + [2 * cx - p[0] for p in outer]
    ally = [p[1] for p in outer]
    for d in sk['decor']:
        allx += [d[0], d[2]]
        ally += [d[1], d[3]]
    if min(allx) < SAFE_X - 1e-6 or max(allx) > 1 - SAFE_X + 1e-6:
        errs.append(f'tràn lề ngang x[{min(allx):.3f},{max(allx):.3f}]')
    if min(ally) < SAFE_Y - 1e-6 or max(ally) > 1 - SAFE_Y + 1e-6:
        errs.append(f'tràn lề dọc y[{min(ally):.3f},{max(ally):.3f}]')
    L, R, top = shape['neckLeftX'] + 0.02, shape['neckRightX'] - 0.02, shape['neckTopY']
    for d in sk['decor']:
        if d[4] == 'front' and d[1] < top - 0.005 and d[0] < R and d[2] > L:
            errs.append(f'trang trí lớp trước "{d[5]}" đè làn rơi quà')
    return errs


def font(sz):
    for f in ('arial.ttf', 'segoeui.ttf'):
        try:
            return ImageFont.truetype(f, sz)
        except Exception:
            pass
    return ImageFont.load_default()


def guide(sk, inner, outer, shape, path):
    im = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(im, 'RGBA')
    for gx in range(0, W + 1, 64):
        d.line([(gx, 0), (gx, H)], fill=(236, 236, 236, 255))
    for gy in range(0, H + 1, 64):
        d.line([(0, gy), (W, gy)], fill=(236, 236, 236, 255))
    cx = sk['cx']

    def px(pts):
        return [(x * W, y * H) for x, y in pts]
    sil = px(outer) + px(mirror(outer, cx))[::-1]
    cav = px(inner) + px(mirror(inner, cx))[::-1]
    for dco in sk['decor']:
        col = (255, 150, 0, 70) if dco[4] == 'front' else (150, 90, 255, 60)
        d.rectangle([dco[0] * W, dco[1] * H, dco[2] * W, dco[3] * H], fill=col, outline=col[:3] + (255,), width=3)
    d.polygon(sil, fill=(150, 175, 200, 255))
    d.polygon(cav, fill=(225, 240, 255, 255))
    d.line(px(inner), fill=(230, 30, 30, 255), width=5)
    d.line(px(mirror(inner, cx)), fill=(230, 30, 30, 255), width=5)
    my = shape['neckTopY'] * H
    L, R = shape['neckLeftX'] * W, shape['neckRightX'] * W
    for x0 in range(int(L), int(R), 24):
        d.line([(x0, my), (min(x0 + 12, R), my)], fill=(20, 90, 230, 255), width=5)
    d.rectangle([L + 20, 0, R - 20, my - 4], outline=(20, 90, 230, 160), width=2)
    fy = shape['bodyBottomY'] * H
    d.line([(cx * W - 60, fy), (cx * W + 60, fy)], fill=(0, 160, 80, 255), width=4)
    sx, sy = SAFE_X * W, SAFE_Y * H
    d.rectangle([sx, sy, W - sx, H - sy], outline=(0, 170, 0, 255), width=3)
    d.text((sx + 8, sy + 6), f"{sk['name']}  [{sk['id']}]", fill=(20, 20, 20, 255), font=font(34))
    d.text(((L + R) / 2 - 80, max(sy + 50, my - 40)), 'LÀN RƠI QUÀ', fill=(20, 90, 230, 255), font=font(22))
    for dco in sk['decor']:
        d.text((dco[0] * W + 4, dco[1] * H + 2), dco[5][:40], fill=(120, 60, 0, 255) if dco[4] == 'front' else (80, 40, 160, 255), font=font(18))
    d.text((sx + 8, H - sy - 30), 'đỏ = mặt trong thành kính (va chạm) · xanh = miệng · lục = lề an toàn · cam = trang trí lớp TRƯỚC · tím = lớp SAU',
           fill=(60, 60, 60, 255), font=font(16))
    im.save(path)


def main():
    gdir = os.path.join(OUT, 'khung-mau')
    os.makedirs(gdir, exist_ok=True)
    out, bad, thumbs = [], 0, []
    for i, sk in enumerate(S, 1):
        inner, outer, shape, entry_hw = build(sk)
        errs = check(sk, inner, outer, shape, entry_hw)
        if errs:
            bad += 1
            print('LOI', sk['id'], errs)
        gp = os.path.join(gdir, f"{i:02d}-{sk['id']}.png")
        guide(sk, inner, outer, shape, gp)
        thumbs.append(gp)

        def r4(pts):
            return [[round(x, 4), round(y, 4)] for x, y in pts]
        out.append(dict(no=i, id=sk['id'], name=sk['name'], theme=sk['theme'], cx=sk['cx'], shape=shape,
                        entryWidthW=round(2 * entry_hw, 3), sharp=not sk['smooth'],
                        innerRight=r4(inner), outerRight=r4(outer),
                        decor=[dict(box=[round(v, 3) for v in dd[:4]], layer=dd[4], label=dd[5]) for dd in sk['decor']],
                        palette=sk['palette'], front=sk['front'], back=sk['back'], season=sk['season']))
    meta = dict(canvas=[W, H], glassThicknessW=T_GLASS, safeMargin=[SAFE_X, SAFE_Y], minEntryWidthW=2 * MIN_MOUTH_HW,
                note='innerRight: thành TRONG bên phải từ mép miệng xuống tâm đáy (x = cx); bên trái đối xứng qua cx. '
                     'Toạ độ chuẩn hoá theo khung 1024x1536.')
    with open(os.path.join(OUT, 'jar-skins.json'), 'w', encoding='utf-8') as f:
        json.dump(dict(meta=meta, skins=out), f, ensure_ascii=False, indent=1)
    cols, tw, th = 6, 256, 384
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new('RGB', (cols * tw, rows * th), 'white')
    for k, p in enumerate(thumbs):
        sheet.paste(Image.open(p).convert('RGB').resize((tw, th)), ((k % cols) * tw, (k // cols) * th))
    sheet.save(os.path.join(gdir, '_tong-hop.png'))
    print('skins', len(S), 'loi', bad)


if __name__ == '__main__':
    main()
