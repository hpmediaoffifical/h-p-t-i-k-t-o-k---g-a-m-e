# -*- coding: utf-8 -*-
"""Sinh catalog phụ kiện hũ: phu-kien.json + khung-mau-phu-kien/*.png + BRIEF-PHU-KIEN.md.

Phụ kiện KHÔNG neo theo bề ngang hũ (cũ: 80% jar width) mà theo MIỆNG hũ (hoặc THÂN hũ với cánh/hào quang),
vì miệng 46 kiểu hũ rộng 57%→82% bề ngang hũ. Code đọc mouth outer width của từng skin → scale = mouthW / 640.
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
TPL = os.path.join(OUT, 'khung-mau-phu-kien')
os.makedirs(TPL, exist_ok=True)
CW, CH = 1536, 1024
FONT = 'C:/Windows/Fonts/arial.ttf'
FONTB = 'C:/Windows/Fonts/arialbd.ttf'

# ===== 5 kiểu neo (toạ độ trên canvas 1536×1024) =====
MOUTH_L, MOUTH_R, MOUTH_Y = 448, 1088, 384          # mép NGOÀI miệng hũ chuẩn (rộng 640)
BODY_L, BODY_R, BODY_T, BODY_B = 368, 1168, 180, 900  # thân hũ chuẩn cho kiểu "than" (rộng 800)
SAFE = (64, 48, 1472, 976)

ANCHORS = {
    'co': {
        'ten': 'Ôm cổ hũ (nơ, dây chuyền, vòng hoa, khăn)',
        'neo': 'mouth', 'diem': [768, MOUTH_Y],
        'vung_truoc': [300, MOUTH_Y - 40, 1236, 760],
        'vung_sau': [300, MOUTH_Y - 60, 1236, 470],
        'cam': [MOUTH_L, 48, MOUTH_R, MOUTH_Y - 40],
        'luat': [
            'Lớp TRƯỚC nằm từ mép miệng trở xuống: dải ôm cổ y 384→470, nút/mặt dây/đuôi nơ rủ tối đa tới y 760.',
            'Chỉ được nhô lên trên mép miệng 40 px (vành ruy băng). Vùng đỏ phía trên miệng phải TRỐNG — đó là làn quà rơi.',
            'Lớp SAU (nếu có): nửa vòng dây phía sau cổ, cong lên theo elip miệng, y 324→470.',
        ],
    },
    'vanh': {
        'ten': 'Đội trên vành miệng (vương miện, tai, sừng, vòng lá)',
        'neo': 'mouth', 'diem': [768, MOUTH_Y],
        'vung_truoc': [200, 120, 1336, 520],
        'vung_sau': [300, 120, 1236, MOUTH_Y],
        'cam': [MOUTH_L + 40, 48, MOUTH_R - 40, MOUTH_Y - 30],
        'luat': [
            'Lớp TRƯỚC: đai trước ôm nửa dưới elip miệng (y 360→470) + phần nhô lên CHỈ ở 2 bên: x < 488 hoặc x > 1048.',
            'Lớp SAU: các chóp/tai/sừng phía sau vành, được nhô lên giữa (quà rơi ĐÈ LÊN lớp sau nên không che quà), cao tối đa tới y 120.',
            'Vùng đỏ = làn quà rơi: lớp TRƯỚC không được vẽ gì trong đó.',
        ],
    },
    'ngoi': {
        'ten': 'Thú/nhân vật ngồi trên vai miệng hũ (bên PHẢI; code tự lật khi muốn bên trái)',
        'neo': 'mouth', 'diem': [MOUTH_R, MOUTH_Y],
        'vung_truoc': [1010, 60, 1472, 600],
        'vung_sau': None,
        'cam': [MOUTH_L, 48, MOUTH_R - 70, MOUTH_Y],
        'luat': [
            'Mông/chân thú đặt đúng điểm neo (1088, 384) = góc phải vành miệng; thân ngồi lệch ra NGOÀI hũ.',
            'Không phần nào vượt qua x < 1018 phía trên miệng (tay vắt vào miệng tối đa 70 px).',
            'Đuôi/chân thả xuống mặt ngoài thân hũ tối đa tới y 600.',
            'Mặt nhìn hơi về phía TRÁI (vào hũ), ánh sáng từ trên-trái.',
        ],
    },
    'treo': {
        'ten': 'Treo trước thân hũ (đèn lồng, lì xì, huy chương, chuông)',
        'neo': 'mouth', 'diem': [768, MOUTH_Y],
        'vung_truoc': [520, MOUTH_Y - 30, 1016, 960],
        'vung_sau': None,
        'cam': [MOUTH_L, 48, MOUTH_R, MOUTH_Y - 30],
        'luat': [
            'Dây treo bắt đầu ở vành cổ (y 384→420), vật treo nằm giữa thân, đáy vật treo ≤ y 960.',
            'Vật treo rộng tối đa 496 px (x 520→1016) để không che quá nhiều quà trong hũ.',
            'Code cho lắc lư nhẹ quanh điểm buộc dây — điểm buộc ở (768, 400).',
        ],
    },
    'than': {
        'ten': 'Gắn theo THÂN hũ, nằm SAU hũ (cánh, hào quang)',
        'neo': 'body', 'diem': [768, (BODY_T + BODY_B) // 2],
        'vung_truoc': None,
        'vung_sau': [64, 48, 1472, 976],
        'cam': None,
        'luat': [
            'Chỉ có lớp SAU (nằm sau hũ và sau quà). Hình chữ nhật xám = thân hũ chuẩn rộng 800 px.',
            'Cánh: gốc cánh dính sát mép thân (x 368 / 1168) ở khoảng y 300→520, sải ra 2 bên.',
            'Hào quang: tâm vòng sáng ở tâm thân (768, 540).',
        ],
    },
}

# ===== Catalog: (mã, id, tên, kiểu neo, lớp, khung động, mùa, mô tả, bảng màu) =====
# lớp: 'T' = chỉ trước, 'TS' = trước + sau, 'S' = chỉ sau. khung = số khung ảnh động (1 = ảnh tĩnh).
C = [
    # ---- Ôm cổ ----
    ('B01', 'bow-pink', 'Nơ lụa hồng', 'co', 'T', 1, '', 'Nơ lụa satin bóng buộc quanh cổ: dải ruy băng ôm cổ, nút nơ to giữa phía trước dưới mép miệng, 2 cánh nơ phồng, 2 đuôi rủ chéo cắt chữ V', 'hồng #FF5D8F, sáng #FFB3CC, tối #B8326A'),
    ('B02', 'bow-blue', 'Nơ lụa xanh', 'co', 'T', 1, '', 'Như B01, xanh dương', 'xanh #3B82F6, sáng #9CC8FF, tối #1E3A8A'),
    ('B03', 'bow-white', 'Nơ trắng viền bạc', 'co', 'T', 1, '', 'Như B01, lụa trắng ngà có viền chỉ bạc', 'trắng ngà #FFF8EE, bạc #C9D1DC'),
    ('B04', 'bow-black', 'Nơ nhung đen', 'co', 'T', 1, '', 'Như B01, nhung đen mịn, viền chỉ bạc, nút nơ đính 1 viên pha lê', 'đen nhung #1A1A22, bạc #D8DEE6'),
    ('B10', 'bow-tartan', 'Nơ caro đỏ', 'co', 'T', 1, 'noel', 'Nơ vải dạ caro Scotland đỏ-xanh lá, viền vàng, đuôi tua rua', 'đỏ #C62828, xanh #1B5E20, vàng #F4C542'),
    ('B11', 'bow-pastel', 'Nơ cầu vồng pastel', 'co', 'T', 1, '', 'Nơ voan 2 lớp, lớp ngoài trong mờ, ruy băng chuyển màu pastel hồng→tím→xanh, đính hạt ngọc nhỏ', 'pastel #FFC4DD → #D8B4FE → #A5D8FF'),
    ('B06', 'flower-cherry', 'Vòng hoa anh đào', 'co', 'TS', 1, 'xuan', 'Vòng hoa anh đào quanh cổ, cụm hoa to ở 2 bên vai, giữa phía trước thưa và thấp, vài cánh rơi', 'hồng #FDA4AF, nhuỵ #F472B6, lá #65A30D'),
    ('B07', 'star-gold', 'Chuỗi sao vàng', 'co', 'TS', 1, '', 'Chuỗi sao vàng vắt quanh cổ, 1 ngôi sao to giữa phía trước DƯỚI mép miệng, đủ 5 cánh nguyên vẹn', 'vàng #FDE047 → #F59E0B, viền #78350F'),
    ('B09', 'gem-diamond', 'Dây chuyền kim cương', 'co', 'TS', 1, '', 'Dây chuyền bạch kim vắt quanh cổ, mặt dây là viên kim cương xanh giác cắt brilliant ở giữa, lấp lánh 4 cánh', 'kim cương #7DD3FC/#06B6D4, bạch kim #E5E7EB'),
    ('B14', 'pearl', 'Chuỗi ngọc trai', 'co', 'TS', 1, '', '2 vòng ngọc trai trắng ánh hồng vắt quanh cổ, vòng ngoài võng thấp hơn, khoá vàng nhỏ', 'ngọc #FFF7F0 ánh #F9D5E5, khoá #F4C542'),
    ('B15', 'fairy-lights', 'Dây đèn LED', 'co', 'TS', 2, 'noel', 'Dây đồng mảnh quấn 2 vòng quanh cổ, 10–12 bóng LED nhỏ. Khung 1: bóng sáng vàng ấm có quầng; khung 2: nửa số bóng (xen kẽ) tắt', 'đèn #FFE08A quầng #FFB84D, dây #8B6B3D'),
    ('B16', 'bunting', 'Dây cờ sinh nhật', 'co', 'TS', 1, '', 'Dây cờ tam giác nhiều màu võng quanh cổ (7 lá phía trước), chấm bi và kẻ sọc', 'đỏ #FF6B6B, vàng #FFD93D, xanh #4D96FF, lục #6BCB77'),
    ('B17', 'lei-hawaii', 'Vòng hoa Hawaii', 'co', 'TS', 1, 'he', 'Vòng hoa dâm bụt + sứ trắng dày dặn quanh cổ, hoa to nhất ở giữa phía trước', 'dâm bụt #FF4F79, sứ #FFF4D6 nhuỵ #FFC94D'),
    ('B12', 'scarf-knit', 'Khăn len mùa đông', 'co', 'TS', 1, 'dong', 'Khăn len đan quấn cổ hũ, 1 đầu khăn có tua rua rủ xuống bên phải, hoa văn bông tuyết', 'đỏ #D7263D, trắng #FFFFFF, vân #B81D31'),
    # ---- Đội vành ----
    ('B05', 'crown', 'Vương miện vàng', 'vanh', 'TS', 1, '', 'Vương miện vàng kim đeo như vòng quanh vành miệng, đính hồng ngọc + lam ngọc. Trước: đai + chóp 2 bên. Sau: các chóp phía sau (cao hơn, sau quà)', 'vàng #F4C542 → #B7791F, ngọc #E11D48 / #2563EB'),
    ('B18', 'tiara', 'Tiara bạc pha lê', 'vanh', 'TS', 1, '', 'Vương miện công chúa bạc, chóp giữa cao (ở lớp SAU), pha lê giọt nước lấp lánh', 'bạc #E5E7EB, pha lê #BAE6FD, hồng #F9A8D4'),
    ('B19', 'flower-crown', 'Vòng hoa đội đầu', 'vanh', 'TS', 1, 'xuan', 'Vòng hoa cúc, hồng nhỏ và baby trắng đặt trên vành miệng, 2 dải ruy băng rủ xuống bên trái', 'hồng #F9A8D4, cúc #FDE68A, lá #84CC16'),
    ('B20', 'cat-ears', 'Tai mèo', 'vanh', 'TS', 1, '', '2 tai mèo lông xù ở 2 góc vành (trái + phải), lòng tai hồng; nửa đai lông mảnh ôm vành phía sau', 'lông #F5E6D3, lòng tai #FFB3C7'),
    ('B21', 'bunny-ears', 'Tai thỏ', 'vanh', 'TS', 1, '', '2 tai thỏ dài dựng ở lớp SAU (tai trái hơi gập), đai cài tóc ôm vành; có nơ nhỏ ở lớp TRƯỚC góc phải', 'trắng #FFFFFF, lòng #FFC2D1'),
    ('B22', 'reindeer', 'Sừng tuần lộc', 'vanh', 'TS', 1, 'noel', '2 sừng tuần lộc nâu ở 2 góc vành + nhánh lá ô rô và quả đỏ ở chân sừng', 'sừng #8B5A2B, lá #15803D, quả #DC2626'),
    ('B08', 'leaves-christmas', 'Vòng lá Noel', 'vanh', 'TS', 1, 'noel', 'Vòng lá thông quấn quanh vành có quả châu đỏ, chuông vàng, nơ đỏ ở góc phải', 'thông #166534, châu #DC2626, chuông #F4C542'),
    ('B23', 'laurel', 'Vòng nguyệt quế vàng', 'vanh', 'TS', 1, '', 'Vòng lá nguyệt quế mạ vàng của nhà vô địch, 2 nhánh gặp nhau ở chính giữa phía trước dưới vành', 'vàng #F4C542 → #A16207'),
    ('B24', 'devil-horns', 'Sừng quỷ Halloween', 'vanh', 'TS', 1, 'halloween', '2 sừng quỷ đỏ bóng ở 2 góc vành, mạng nhện mảnh vắt nửa vành phía sau', 'đỏ #DC2626 → #7F1D1D, nhện #E5E7EB'),
    # ---- Ngồi vai ----
    ('B25', 'pet-cat', 'Mèo con vắt vai', 'ngoi', 'T', 3, '', 'Mèo cam mũm mĩm ngồi trên vai phải, 1 chân trước vắt vào trong miệng, đuôi thả xuống thân hũ. Khung 1 mở mắt, 2 nhắm nửa, 3 nhắm (chớp mắt)', 'cam #F6A04D, trắng #FFF4E6, má #FFB3B3'),
    ('B26', 'pet-bear', 'Gấu bông', 'ngoi', 'T', 3, '', 'Gấu bông nâu đeo nơ cổ đỏ ngồi vai phải, ôm vành bằng 2 tay. 3 khung chớp mắt', 'nâu #A47148, mõm #E9C9A3, nơ #E11D48'),
    ('B27', 'pet-penguin', 'Chim cánh cụt', 'ngoi', 'T', 3, 'dong', 'Cánh cụt con quàng khăn xanh ngồi vai phải, 1 cánh vẫy. Khung 1–3: cánh vẫy lên/giữa/xuống', 'đen #1F2937, bụng #F8FAFC, mỏ #F59E0B, khăn #38BDF8'),
    ('B28', 'pet-bunny', 'Thỏ trắng', 'ngoi', 'T', 3, 'trung-thu', 'Thỏ trắng ôm củ cà rốt ngồi vai phải, tai cụp 1 bên. 3 khung chớp mắt', 'trắng #FFFFFF, lòng tai #FFC2D1, cà rốt #FB923C'),
    ('B29', 'pet-shiba', 'Cún Shiba', 'ngoi', 'T', 3, '', 'Cún Shiba cười híp mắt ngồi vai phải, lưỡi thè. Khung 1–3: đuôi vẫy trái/giữa/phải', 'cam #E8A23B, trắng #FFF6E9'),
    ('B30', 'pet-duck', 'Vịt vàng', 'ngoi', 'T', 3, 'he', 'Vịt cao su vàng đeo kính bơi ngồi vai phải. Khung 1–3: lắc lư nghiêng -6° / 0° / +6° quanh điểm neo', 'vàng #FFD93D, mỏ #FF8C42'),
    ('B31', 'pet-pig', 'Heo con Tết', 'ngoi', 'T', 3, 'tet', 'Heo hồng mặc áo yếm đỏ thêu chữ Phúc, ôm thỏi vàng, ngồi vai phải. 3 khung chớp mắt', 'hồng #FFB6C1, yếm #D7263D, vàng #F4C542'),
    ('B32', 'pet-snowman', 'Người tuyết mini', 'ngoi', 'T', 1, 'noel', 'Người tuyết 2 tầng đội mũ len đỏ, quàng khăn, mũi cà rốt, ngồi vai phải', 'tuyết #F8FAFC bóng #CBD5E1, mũ #DC2626'),
    # ---- Treo trước thân ----
    ('B33', 'hang-lantern', 'Đèn lồng Trung Thu', 'treo', 'T', 2, 'trung-thu', 'Đèn lồng ông sao đỏ-vàng treo bằng dây đỏ có tua rua. Khung 1/2: ánh nến sáng/tối nhẹ (lung linh)', 'đỏ #DC2626, vàng #FACC15, nến #FFE08A'),
    ('B34', 'hang-lixi', 'Bao lì xì', 'treo', 'T', 1, 'tet', '2 bao lì xì đỏ chữ "Lộc" vàng + 1 dây pháo nhỏ treo chéo, nút thắt may mắn đỏ', 'đỏ #C8102E, vàng kim #F4C542'),
    ('B35', 'hang-medal', 'Huy chương TOP', 'treo', 'T', 1, '', 'Huy chương vàng dây xanh-đỏ, mặt huy chương in số "1" nổi và ngôi sao, viền răng cưa', 'vàng #F4C542 → #B7791F, dây #2563EB / #DC2626'),
    ('B36', 'hang-bells', 'Chuông Noel', 'treo', 'T', 1, 'noel', '2 chuông vàng buộc nơ đỏ và nhánh ô rô', 'chuông #F4C542, nơ #DC2626, lá #15803D'),
    ('B37', 'hang-hearts', 'Dây trái tim', 'treo', 'T', 1, 'valentine', '3 trái tim bóng (đỏ, hồng, trắng) treo so le bằng ruy băng mảnh', 'đỏ #E11D48, hồng #F472B6, trắng #FFF1F2'),
    ('B38', 'hang-pumpkin', 'Bí ngô mini', 'treo', 'T', 2, 'halloween', 'Bí ngô Jack-o-lantern nhỏ treo dây; khung 1/2: ánh lửa trong mắt sáng/tối', 'cam #F97316, lửa #FDE047, cuống #4D7C0F'),
    # ---- Sau thân ----
    ('B39', 'wings-angel', 'Cánh thiên thần', 'than', 'S', 4, '', 'Đôi cánh lông vũ trắng ánh vàng mọc 2 bên thân hũ. 4 khung vỗ cánh: khép → mở 1/3 → mở hết → mở 2/3 (gốc cánh KHÔNG đổi chỗ)', 'trắng #FFFFFF, bóng #E0E7FF, viền vàng #FDE68A'),
    ('B40', 'wings-devil', 'Cánh ác quỷ', 'than', 'S', 4, 'halloween', 'Cánh dơi đỏ thẫm có gân, 4 khung vỗ như B39', 'đỏ #7F1D1D → #DC2626, gân #450A0A'),
    ('B41', 'wings-butterfly', 'Cánh bướm', 'than', 'S', 4, 'xuan', 'Cánh bướm trong suốt ánh cầu vồng, 4 khung vỗ như B39', 'ánh #A5F3FC → #F0ABFC, viền #7C3AED'),
    ('B42', 'halo', 'Hào quang', 'than', 'S', 1, '', 'Vòng hào quang tia sáng vàng sau hũ (code tự xoay chậm), tâm sáng trong suốt để không làm loá quà', 'vàng #FDE68A alpha 70% → 0%'),
]

SEASON_NAME = {'': 'Quanh năm', 'tet': 'Tết', 'xuan': 'Mùa xuân', 'he': 'Mùa hè', 'trung-thu': 'Trung Thu',
               'halloween': 'Halloween', 'noel': 'Giáng sinh', 'dong': 'Mùa đông', 'valentine': 'Valentine'}
KIND_ORDER = ['co', 'vanh', 'ngoi', 'treo', 'than']
KIND_TITLE = {'co': '🎀 Ôm cổ hũ', 'vanh': '👑 Đội trên vành miệng', 'ngoi': '🐱 Ngồi trên vai hũ',
              'treo': '🏮 Treo trước thân', 'than': '🪽 Sau thân hũ'}


def files_of(code, pid, layer, frames):
    base = f'{code}_{pid}'
    out = []
    layers = {'T': ['truoc'], 'TS': ['truoc', 'sau'], 'S': ['sau']}[layer]
    for l in layers:
        if frames == 1:
            out.append(f'{base}_{l}.png')
        else:
            out += [f'{base}_{l}_{i}.png' for i in range(1, frames + 1)]
    return out


# ===== Khung mẫu =====
def font(sz, bold=False):
    return ImageFont.truetype(FONTB if bold else FONT, sz)


def draw_template(kind, a):
    base = Image.new('RGBA', (CW, CH), (32, 34, 40, 255))
    im = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # lưới 64 px
    for x in range(0, CW, 64):
        d.line([(x, 0), (x, CH)], fill=(255, 255, 255, 14))
    for y in range(0, CH, 64):
        d.line([(0, y), (CW, y)], fill=(255, 255, 255, 14))
    # lề an toàn
    d.rectangle(SAFE, outline=(255, 255, 255, 120), width=2)
    if a['neo'] == 'mouth':
        # hũ minh hoạ (Mason chuẩn): cổ + thân
        d.rounded_rectangle([MOUTH_L - 70, MOUTH_Y + 70, MOUTH_R + 70, CH + 200], 90, fill=(120, 150, 175, 60), outline=(170, 200, 225, 140), width=4)
        d.rectangle([MOUTH_L, MOUTH_Y, MOUTH_R, MOUTH_Y + 90], fill=(120, 150, 175, 70), outline=(170, 200, 225, 140), width=4)
        d.ellipse([MOUTH_L, MOUTH_Y - 34, MOUTH_R, MOUTH_Y + 34], outline=(80, 200, 255, 255), width=5)
        d.text((MOUTH_L - 300, MOUTH_Y - 18), 'MIỆNG HŨ y=384', font=font(26, True), fill=(80, 200, 255, 255))
    else:
        d.rounded_rectangle([BODY_L, BODY_T, BODY_R, BODY_B], 120, fill=(120, 150, 175, 70), outline=(170, 200, 225, 160), width=4)
        d.text((BODY_L + 20, BODY_B - 50), 'THÂN HŨ CHUẨN 800 px', font=font(26, True), fill=(170, 200, 225, 255))
    if a.get('cam'):
        x0, y0, x1, y1 = a['cam']
        d.rectangle([x0, y0, x1, y1], fill=(255, 40, 60, 70), outline=(255, 60, 80, 255), width=4)
        d.text((x0 + 12, y0 + 10), 'CẤM — làn quà rơi', font=font(30, True), fill=(255, 120, 130, 255))
        d.text((x0 + 12, y0 + 46), '(lớp trước để trống)', font=font(24), fill=(255, 150, 160, 255))
    if a.get('vung_sau'):
        x0, y0, x1, y1 = a['vung_sau']
        d.rectangle([x0, y0, x1, y1], outline=(180, 110, 255, 255), width=4)
        d.text((x0 + 10, y1 - 36), 'LỚP SAU', font=font(26, True), fill=(200, 150, 255, 255))
    if a.get('vung_truoc'):
        x0, y0, x1, y1 = a['vung_truoc']
        d.rectangle([x0, y0, x1, y1], outline=(255, 160, 40, 255), width=5)
        d.text((x1 - 190, y1 - 38), 'LỚP TRƯỚC', font=font(26, True), fill=(255, 180, 70, 255))
    px, py = a['diem']
    d.ellipse([px - 14, py - 14, px + 14, py + 14], fill=(60, 255, 120, 255), outline=(0, 0, 0, 255), width=3)
    d.text((px + 18, py + 10), f'NEO ({px},{py})', font=font(26, True), fill=(90, 255, 140, 255))
    out = Image.alpha_composite(base, im)
    d2 = ImageDraw.Draw(out)
    d2.rectangle([0, 984, CW, CH], fill=(10, 10, 14, 255))
    d2.text((16, 990), f'Khung mẫu kiểu "{kind}" · canvas 1536×1024 · ảnh giao phải nền TRONG SUỐT (khung này chỉ để căn)', font=font(24, True), fill=(255, 255, 255, 235))
    out.convert('RGB').save(os.path.join(TPL, f'{kind}.png'))


for k, a in ANCHORS.items():
    draw_template(k, a)

# ===== phu-kien.json (Claude dùng để tích hợp) =====
items = []
for code, pid, name, kind, layer, frames, season, desc, pal in C:
    items.append({'code': code, 'id': pid, 'name': name, 'kind': kind, 'layers': layer, 'frames': frames,
                  'season': season, 'files': files_of(code, pid, layer, frames)})
json.dump({'meta': {'canvas': [CW, CH], 'mouth': {'left': MOUTH_L, 'right': MOUTH_R, 'y': MOUTH_Y},
                    'body': {'left': BODY_L, 'right': BODY_R, 'top': BODY_T, 'bottom': BODY_B},
                    'anchors': {k: {'neo': v['neo'], 'diem': v['diem']} for k, v in ANCHORS.items()},
                    'note': 'scale = (mép ngoài miệng hũ thật) / 640 với neo mouth; = bề ngang thân thật / 800 với neo body'},
           'items': items}, open(os.path.join(OUT, 'phu-kien.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ===== BRIEF-PHU-KIEN.md =====
L = []
total_files = sum(len(files_of(c[0], c[1], c[4], c[5])) for c in C)
L.append(f"""# 🎀 Hũ Thủy Tinh — {len(C)} phụ kiện trang trí hũ ({total_files} file PNG)

> File đặt vẽ cho ChatGPT. Đọc **Quy tắc chung** ở `../README.md` trước.
> Mỗi phụ kiện thuộc 1 trong **5 kiểu neo**. Mỗi kiểu có **1 khung mẫu** trong `khung-mau-phu-kien/<kiểu>.png`.
> **Luôn đính kèm khung mẫu đúng kiểu khi yêu cầu vẽ.**
> Bản này **thay thế mục TT-B01…B09 trong `BRIEF.md`**. 9 phụ kiện cũ được vẽ lại với cùng mã.

## 1. Vì sao phải theo khung mẫu

- Game có **46 kiểu hũ**. Miệng hũ rộng từ 57% đến 82% bề ngang hũ, có hũ miệng cao, có hũ miệng thấp.
- Code **không** dán phụ kiện theo bề ngang hũ, mà **căn đúng mép miệng** của từng kiểu hũ:
  - Phụ kiện có `scale = bề rộng miệng thật ÷ 640`.
  - Điểm neo xanh lá trên khung mẫu trùng tâm (hoặc góc) miệng hũ thật.
- Vì vậy chỉ cần vẽ **1 lần**, phụ kiện sẽ vừa khít cả 46 kiểu hũ.
- Nếu vẽ lệch khỏi đường miệng xanh, phụ kiện sẽ lơ lửng hoặc lún vào hũ.

## 2. Thông số chung

| Mục | Giá trị |
|---|---|
| Canvas | **1536 × 1024 px** (ngang), **PNG RGBA nền trong suốt thật** |
| Lề an toàn | Mọi pixel có màu (glow, lấp lánh, tua rua) nằm trong **x 64→1472, y 48→976** |
| Đường miệng chuẩn | Elip miệng hũ: mép ngoài **x 448→1088**, tâm **y = 384**, nửa cao 34 px (đường xanh dương trên khung mẫu) |
| Thân chuẩn (kiểu `than`) | Hình chữ nhật bo góc **x 368→1168, y 180→900** |
| Phong cách | **2.5D bóng bẩy kiểu sticker game mobile cao cấp**: khối tròn, viền sáng mép trên-trái, bóng mềm phía dưới-phải, highlight trắng nhỏ. Không viền đen dày, không phẳng kiểu clipart |
| Ánh sáng | Từ **trên-trái**, giống hũ |
| Bóng đổ | **Không** vẽ bóng đổ lên nền. Được vẽ bóng tiếp xúc rất nhẹ (alpha ≤ 25%) ngay dưới dây/nơ nơi chạm kính |
| Màu | Bão hoà vừa phải. Phải nổi trên cả hũ trong suốt lẫn nền LIVE tối |

### 2 lớp ảnh
```
z5  _truoc.png  ← LỚP TRƯỚC: đè lên kính và lên quà (nơ, đai trước, thú ngồi, vật treo)
z4  hũ front.png
z3  quà rơi
z2  hũ back.png
z1  _sau.png    ← LỚP SAU: nằm sau quà (nửa vòng sau cổ, chóp vương miện phía sau, tai, cánh, hào quang)
```
- Lớp trước và lớp sau **cùng canvas, chồng khít nhau**.
- Vùng **đỏ "CẤM"** trên khung mẫu là làn quà rơi. **Lớp trước không được có pixel nào trong đó.**
- Lớp sau được phép nằm trong vùng đỏ, vì quà rơi đè lên trên lớp sau.

### Ảnh động
- **Mọi khung giữ nguyên canvas, nguyên điểm neo, nguyên kích thước.** Chỉ phần chuyển động được đổi (mắt, đuôi, cánh, ánh đèn).
- Nên xin ChatGPT **từng khung một** trong cùng cuộc trò chuyện: "giữ y nguyên, chỉ đổi sang khung 2/3".
- Code tự lo nhịp (chớp mắt 3–5 giây/lần, cánh 6 khung/giây, đèn 2 khung/giây). Code cũng tự lắc lư nhẹ cho vật treo và nơ, nên **không cần vẽ khung lắc**.

## 3. 5 kiểu neo
""")
for k in KIND_ORDER:
    a = ANCHORS[k]
    L.append(f"### `{k}` — {a['ten']}")
    L.append(f"Khung mẫu: `khung-mau-phu-kien/{k}.png` · điểm neo **({a['diem'][0]}, {a['diem'][1]})**" +
             (" = tâm miệng hũ" if k in ('co', 'vanh', 'treo') else ' = góc phải vành miệng' if k == 'ngoi' else ' = tâm thân hũ'))
    if a.get('vung_truoc'):
        L.append(f"- Vùng lớp TRƯỚC (khung cam): x {a['vung_truoc'][0]}→{a['vung_truoc'][2]}, y {a['vung_truoc'][1]}→{a['vung_truoc'][3]}")
    if a.get('vung_sau'):
        L.append(f"- Vùng lớp SAU (khung tím): x {a['vung_sau'][0]}→{a['vung_sau'][2]}, y {a['vung_sau'][1]}→{a['vung_sau'][3]}")
    for r in a['luat']:
        L.append(f"- {r}")
    L.append('')

L.append("## 4. Danh sách phụ kiện\n")
L.append("Ký hiệu lớp: **T** = chỉ lớp trước · **T+S** = trước + sau · **S** = chỉ lớp sau. **Khung** = số ảnh động (1 = ảnh tĩnh).\n")
for k in KIND_ORDER:
    rows = [c for c in C if c[3] == k]
    L.append(f"### {KIND_TITLE[k]} ({len(rows)})\n")
    for code, pid, name, kind, layer, frames, season, desc, pal in rows:
        lay = {'T': 'T', 'TS': 'T+S', 'S': 'S'}[layer]
        L.append(f"#### {code} · {name} — `{pid}`")
        L.append(f"- **Kiểu neo:** `{kind}` · **Lớp:** {lay} · **Khung:** {frames} · **Dịp:** {SEASON_NAME[season]}")
        L.append(f"- **Mô tả:** {desc}.")
        L.append(f"- **Bảng màu:** {pal}")
        L.append(f"- **File giao:** " + ', '.join(f'`{f}`' for f in files_of(code, pid, layer, frames)))
        L.append(f"- **Prompt gợi ý:** \"Transparent PNG 1536x1024, {name} accessory for a glass jar, placed exactly on the attached template (anchor point, mouth ellipse, forbidden red zone kept EMPTY), glossy 2.5D mobile-game sticker style, light from top-left, no background, no drop shadow, nothing cropped, keep 64px empty margin. Layer: {'front' if 'T' in layer else 'back'}" + (" (then back layer separately)" if layer == 'TS' else '') + ".\"")
        L.append('')

L.append("""## 5. Gợi ý ghép bộ theo mùa (code tự gợi ý khi đổi kiểu hũ)

| Dịp | Hũ | Phụ kiện hợp |
|---|---|---|
| Tết | 31 bánh chưng · 32 mai vàng · 33 lì xì · 28 túi lộc | B34 Bao lì xì · B31 Heo con · B05 Vương miện |
| Valentine | 34 kẹo tim · 06 trái tim | B37 Dây trái tim · B01 Nơ hồng · B21 Tai thỏ |
| Xuân | 36 anh đào · 35 bình hoa | B06 Vòng anh đào · B19 Vòng hoa đội đầu · B41 Cánh bướm |
| Hè | 37 dưa hấu · 38 trái dừa · 39 biển | B17 Vòng Hawaii · B30 Vịt vàng |
| Trung Thu | 40 mặt trăng · 41 hộp bánh · 07 đèn lồng | B33 Đèn lồng · B28 Thỏ trắng |
| Halloween | 43 vạc · 08 bí ngô | B38 Bí ngô mini · B24 Sừng quỷ · B40 Cánh ác quỷ |
| Noel / Đông | 21 châu Noel · 44 người tuyết · 45 ca cao · 09 cầu tuyết | B08 Vòng lá · B22 Sừng tuần lộc · B15 Dây đèn · B36 Chuông · B12 Khăn len · B27 Cánh cụt · B32 Người tuyết |
| Sang chảnh | 16 cúp · 23 kim cương · 30 vương miện · 17 ly pha lê | B05 · B18 Tiara · B09 Kim cương · B23 Nguyệt quế · B35 Huy chương · B39 Cánh thiên thần · B42 Hào quang |

## 6. Giao file

- Bỏ tất cả vào `ve-xong/phu-kien/`, **đúng tên file** ở mục 4.
- Ghi vào `ve-xong/TRA-VE.md` 1 dòng mỗi phụ kiện: mã, số file, điểm neo đo lại (px), ghi chú.
- **Đợt 1 nên vẽ trước 12 phụ kiện:** B01, B05, B06, B07, B09, B15, B20, B25, B26, B33, B34, B39.

## 7. ChatGPT tự soát trước khi giao
- [ ] Canvas đúng **1536×1024**, nền trong suốt thật (không ô caro giả).
- [ ] Lớp trước **không có pixel nào** trong vùng đỏ "CẤM".
- [ ] Phụ kiện bám đúng elip miệng xanh, không lơ lửng phía trên, không lún xuống.
- [ ] Không chi tiết nào chạm lề an toàn (cánh, tua rua, lấp lánh).
- [ ] Ảnh động: các khung chồng lên nhau khớp tuyệt đối, chỉ phần động thay đổi.
- [ ] Lớp trước và lớp sau ghép lại thành 1 vật liền mạch (vòng dây phía sau nối đúng 2 đầu với vòng phía trước).
""")
open(os.path.join(OUT, 'BRIEF-PHU-KIEN.md'), 'w', encoding='utf-8').write('\n'.join(L))
print(len(C), 'phụ kiện,', total_files, 'file')
