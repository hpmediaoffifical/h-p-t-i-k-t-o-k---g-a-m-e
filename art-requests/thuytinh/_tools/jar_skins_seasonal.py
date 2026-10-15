# -*- coding: utf-8 -*-
"""Hũ THEO MÙA / DỊP LỄ (31+). Nạp bởi jar_skins.py: register(skin, arc, sphere).
season = mã dịp để gợi ý tự đổi hũ theo ngày (xem bảng lịch trong BRIEF-HU-30-KIEU.md)."""


def register(skin, arc, sphere):
    skin('tet-banh-chung', 'Hũ bánh chưng', 'Hộp kính vuông gói lá dong, buộc lạt tre',
         [(0.85, 0.22), (0.85, 0.88), (0.5, 0.88)], smooth=False, season='tet',
         decor=[(0.30, 0.225, 0.36, 0.90, 'front', 'lạt tre dọc trái (dải mảnh)'), (0.64, 0.225, 0.70, 0.90, 'front', 'lạt tre dọc phải (dải mảnh)'),
                (0.87, 0.10, 0.96, 0.24, 'front', 'nút lạt buộc + lá dong vểnh bên phải')],
         palette='lá dong #2E7D32 → #66BB6A, lạt tre #C8A165, kính ám xanh lá',
         front='mép kính viền lá dong xanh 4 cạnh, 2 dải lạt tre dọc mảnh (alpha 85%), nút lạt ở góc phải trên',
         back='mặt trong ám xanh lá 12%, đáy vuông')

    skin('tet-mai-vang', 'Bình mai vàng', 'Bình kính dáng ginger jar, cành mai vàng nở rộ',
         [(0.78, 0.18), (0.78, 0.22), (0.86, 0.25), (0.92, 0.33), (0.93, 0.45), (0.90, 0.62), (0.84, 0.78), (0.78, 0.86), (0.5, 0.87)], season='tet',
         decor=[(0.80, 0.06, 0.96, 0.32, 'front', 'cành mai vàng vươn lên bên phải miệng'), (0.04, 0.40, 0.16, 0.60, 'front', 'vài bông mai rơi bám thân trái'),
                (0.24, 0.87, 0.76, 0.93, 'front', 'chân đế gỗ đỏ')],
         palette='vàng mai #FFD600, đỏ Tết #D32F2F, kính ấm #FFF8E1',
         front='cành mai nâu sẫm có 8-12 bông vàng 5 cánh, chân đế gỗ son', back='ánh vàng ấm 10%')

    skin('tet-li-xi', 'Hũ lì xì', 'Hũ kính đỏ bo vai, cắm phong bao lì xì',
         [(0.79, 0.20), (0.79, 0.24), (0.87, 0.27), (0.90, 0.32), (0.90, 0.86), (0.87, 0.9), (0.5, 0.9)], season='tet',
         decor=[(0.04, 0.08, 0.20, 0.30, 'front', '2 phong bao lì xì cắm nghiêng bên trái'), (0.80, 0.08, 0.96, 0.30, 'front', '1 phong bao + dây pháo nhỏ bên phải'),
                (0.36, 0.52, 0.64, 0.64, 'front', 'chữ "LỘC" vàng kim, alpha 70%')],
         palette='đỏ #C62828, vàng kim #FFC107',
         front='hoa văn mây vàng mảnh ở vai, chữ LỘC, phong bao 2 bên', back='đỏ 12%')

    skin('valentine-keo-tim', 'Hũ kẹo Valentine', 'Hũ bầu hồng, ruy băng, bóng bay tim',
         [(0.80, 0.20), (0.80, 0.232), (0.87, 0.28), (0.91, 0.40), (0.92, 0.55), (0.91, 0.70), (0.87, 0.83), (0.82, 0.885), (0.5, 0.895)], season='valentine',
         decor=[(0.04, 0.04, 0.20, 0.26, 'back', '2 bóng bay trái tim buộc dây vào vai trái (sau quà)'),
                (0.80, 0.24, 0.96, 0.40, 'front', 'nơ ruy băng đỏ ở vai phải'), (0.30, 0.58, 0.70, 0.70, 'front', 'nhãn tim "LOVE", alpha 75%')],
         palette='hồng #FF4F8B, đỏ #E53935, trắng',
         front='ruy băng đỏ quấn ngang thân, tim nhỏ lấp lánh', back='hồng 10%')

    skin('8-3-binh-hoa', 'Bình hoa 8/3 · 20/10', 'Bình kính eo thon, bó hoa hồng + tulip 2 bên miệng',
         [(0.79, 0.20), (0.79, 0.26), (0.84, 0.33), (0.91, 0.45), (0.92, 0.58), (0.88, 0.74), (0.80, 0.84), (0.68, 0.88), (0.5, 0.885)], season='phu-nu',
         decor=[(0.04, 0.04, 0.20, 0.36, 'front', 'cụm hoa hồng đỏ + lá vươn ra bên trái'), (0.80, 0.04, 0.96, 0.36, 'front', 'cụm tulip hồng + baby trắng bên phải'),
                (0.20, 0.34, 0.80, 0.40, 'front', 'nơ lụa hồng quanh eo')],
         palette='hồng #F06292, đỏ hồng #E91E63, xanh lá #43A047',
         front='nơ lụa ở eo, hoa chỉ ở 2 bên (giữa miệng trống)', back='hồng phấn 8%')

    skin('xuan-anh-dao', 'Hũ hoa anh đào', 'Mason pastel, cành anh đào quấn quanh',
         [(0.84, 0.195), (0.84, 0.232), (0.90, 0.262), (0.915, 0.31), (0.915, 0.84), (0.90, 0.885), (0.86, 0.9), (0.5, 0.9)], season='xuan',
         decor=[(0.04, 0.22, 0.30, 0.70, 'front', 'cành anh đào uốn từ vai trái xuống thân'), (0.70, 0.60, 0.96, 0.85, 'front', 'cánh hoa rơi bám thân phải')],
         palette='hồng anh đào #F8BBD0, nâu cành #6D4C41, kính #FFF5F8',
         front='cành + hoa 5 cánh hồng nhạt, alpha 85%', back='hồng nhạt 6%')

    skin('he-dua-hau', 'Bát dưa hấu', 'Nửa quả dưa hấu khoét làm bát, nhìn chính diện',
         [(0.91, 0.38)] + arc(0.5, 0.40, 420, 0, 90, 14), smooth=False, season='he',
         decor=[(0.05, 0.22, 0.20, 0.37, 'back', 'miếng dưa hấu nhỏ dựng sau mép trái'), (0.36, 0.70, 0.64, 0.80, 'front', 'đế tròn kính')],
         palette='vỏ xanh sọc #2E7D32/#81C784, ruột đỏ #FF5252 (chỉ ở mép), hạt đen',
         front='vỏ dưa sọc là thành kính (alpha thấp ở giữa), viền ruột đỏ ở miệng', back='lòng bát đỏ hồng 15%')

    skin('he-trai-dua', 'Trái dừa', 'Quả dừa xanh cầu, ống hút + ô giấy',
         sphere(0.52, 420, 0.29, neck=0.03), season='he',
         decor=[(0.80, 0.04, 0.96, 0.30, 'front', 'ô giấy nhiệt đới + ống hút sọc cắm bên phải'), (0.04, 0.20, 0.20, 0.34, 'front', 'lát chanh vàng gắn mép trái')],
         palette='vỏ dừa xanh #7CB342, cơm dừa trắng ở mép, ô giấy hồng-vàng',
         front='vỏ dừa xanh bóng làm kính, mép miệng trắng cơm dừa', back='nước dừa trong 8%')

    skin('he-bien', 'Hũ biển xanh', 'Hũ loe đáy, cát + vỏ sò, sao biển',
         [(0.80, 0.22), (0.80, 0.25), (0.90, 0.86), (0.5, 0.86)], smooth=False, season='he',
         decor=[(0.22, 0.80, 0.78, 0.86, 'back', 'lớp cát + vỏ sò dưới đáy (sau quà)'), (0.78, 0.66, 0.96, 0.82, 'front', 'sao biển cam bám góc phải'),
                (0.04, 0.12, 0.17, 0.26, 'front', 'phao bơi nhỏ treo mép trái')],
         palette='xanh biển #4FC3F7, cát #FFE0B2, sao biển #FF8A65',
         front='sóng nước xanh mảnh ở vai, sao biển, phao', back='gradient xanh biển 12% + cát')

    skin('trung-thu-mat-trang', 'Hũ mặt trăng', 'Cầu trăng vàng phát sáng, thỏ ngọc + đèn lồng',
         sphere(0.50, 430, 0.29, neck=0.03), season='trung-thu',
         decor=[(0.04, 0.70, 0.24, 0.92, 'front', 'thỏ ngọc ngồi cạnh đáy trái'), (0.80, 0.06, 0.96, 0.30, 'front', 'đèn lồng đỏ nhỏ treo cành bên phải'),
                (0.30, 0.78, 0.70, 0.84, 'front', 'mây vàng đỡ đáy')],
         palette='vàng trăng #FFE082 → #FFB300, đỏ #E53935, trắng thỏ',
         front='vân miệng núi lửa mờ 10%, viền sáng vàng', back='quầng vàng 15%')

    skin('trung-thu-hop-banh', 'Hộp bánh Trung Thu', 'Hộp tròn thấp, hoa văn bánh nướng',
         [(0.90, 0.36), (0.90, 0.40), (0.92, 0.44), (0.92, 0.80), (0.90, 0.84), (0.5, 0.84)], season='trung-thu',
         decor=[(0.30, 0.55, 0.70, 0.72, 'front', 'hoa văn bánh nướng in nổi vàng nâu, alpha 70%'), (0.05, 0.22, 0.24, 0.36, 'back', 'chiếc bánh nướng dựng sau mép trái'),
                (0.76, 0.20, 0.95, 0.36, 'back', 'ấm trà gốm nhỏ phía sau bên phải')],
         palette='nâu bánh #A1662F, vàng #F9A825, đỏ hộp #B71C1C',
         front='viền hộp đỏ hoa văn vàng, mặt kính trong', back='ánh vàng nâu 10%')

    skin('thu-la-phong', 'Hũ lá phong', 'Hũ hổ phách, lá phong đỏ cam bám thân',
         [(0.79, 0.16), (0.79, 0.21), (0.79, 0.25), (0.86, 0.31), (0.905, 0.42), (0.90, 0.56), (0.85, 0.70), (0.76, 0.81), (0.68, 0.86), (0.5, 0.865)], season='thu',
         decor=[(0.04, 0.30, 0.18, 0.46, 'front', 'lá phong đỏ bám thân trái'), (0.82, 0.50, 0.96, 0.66, 'front', 'lá phong cam bám thân phải'),
                (0.33, 0.87, 0.67, 0.955, 'front', 'đế gỗ')],
         palette='hổ phách #FFB74D, đỏ #D84315, cam #FB8C00',
         front='lá phong 2 bên, gân lá rõ', back='hổ phách 12%')

    skin('halloween-vac', 'Vạc phù thủy', 'Vạc gang 3 chân, khói xanh, dơi bay',
         [(0.86, 0.34), (0.84, 0.37), (0.90, 0.44), (0.93, 0.52), (0.91, 0.64), (0.82, 0.74), (0.66, 0.785), (0.5, 0.79)], season='halloween',
         decor=[(0.18, 0.79, 0.82, 0.90, 'front', '3 chân vạc (trái, giữa, phải)'), (0.04, 0.12, 0.13, 0.30, 'front', '2 con dơi bay bên trái'),
                (0.87, 0.14, 0.96, 0.32, 'front', 'mũ phù thủy tựa mép phải'), (0.22, 0.20, 0.78, 0.33, 'back', 'khói xanh lá cuộn sau miệng (mờ, sau quà)')],
         palette='gang đen tím #37474F, xanh độc #76FF03, cam #FF6D00',
         front='vạc gang (lòng alpha ≤ 35%), viền miệng dày', back='ánh xanh độc 15% + bọt')

    skin('noel-nguoi-tuyet', 'Người tuyết', 'Hai bầu tuyết chồng nhau, khăn đỏ, mũi cà rốt',
         [(0.79, 0.14), (0.79, 0.17), (0.83, 0.22), (0.84, 0.29), (0.79, 0.36), (0.88, 0.44), (0.93, 0.58), (0.92, 0.74), (0.86, 0.85), (0.5, 0.89)], season='noel',
         decor=[(0.04, 0.03, 0.20, 0.16, 'front', 'mũ chóp đen + nhánh nhựa ruồi đặt cạnh trái'), (0.36, 0.20, 0.64, 0.29, 'front', 'mắt than + mũi cà rốt ở bầu trên'),
                (0.18, 0.33, 0.84, 0.40, 'front', 'khăn len đỏ quấn eo, đuôi khăn rủ phải'), (0.46, 0.48, 0.54, 0.72, 'front', '3 cúc than dọc thân')],
         palette='tuyết trắng #FFFFFF / bóng #CFD8DC, đỏ #D32F2F, cam #FF7043',
         front='kính trắng sữa mờ (lòng ≤ 15%), khăn, mắt, cúc', back='tuyết xanh nhạt 8%')

    skin('dong-ca-cao', 'Cốc ca cao nóng', 'Cốc có quai, kem + marshmallow, hơi nóng',
         [(0.78, 0.26), (0.78, 0.85), (0.75, 0.885), (0.45, 0.89)], smooth=False, cx=0.45, season='dong',
         decor=[(0.81, 0.36, 0.955, 0.74, 'front', 'quai cốc bên phải'), (0.05, 0.20, 0.10, 0.34, 'front', 'kem tươi + marshmallow tràn mép trái'),
                (0.20, 0.04, 0.70, 0.22, 'back', '3 sợi hơi nóng uốn lượn (sau quà)')],
         palette='nâu ca cao #6D4C41, kem #FFF8E1, đỏ cốc #C62828 sọc trắng',
         front='cốc sọc đỏ trắng (alpha thấp ở lòng), quai dày', back='nâu ca cao 15% nửa dưới')

    skin('quoc-khanh', 'Hũ Quốc khánh 2/9', 'Mason ám đỏ, ngôi sao vàng, cờ nhỏ',
         [(0.85, 0.195), (0.85, 0.232), (0.905, 0.262), (0.92, 0.31), (0.92, 0.84), (0.905, 0.885), (0.86, 0.9), (0.5, 0.9)], season='quoc-khanh',
         decor=[(0.36, 0.48, 0.64, 0.66, 'front', 'ngôi sao vàng 5 cánh, alpha 70%'), (0.89, 0.06, 0.96, 0.30, 'front', 'lá cờ nhỏ cắm bên phải')],
         palette='đỏ #DA251D, vàng #FFCD00',
         front='kính ám đỏ nhẹ, sao vàng giữa thân, viền vàng', back='đỏ 10%')
