#!/usr/bin/env python3
"""Build bộ skin cho game Nhặt Lá từ ảnh gốc của hoạ sĩ.

Ảnh gốc nằm ngoài repo (mặc định Desktop\\Nhat la). Script này chuẩn hoá chúng về
đúng quy ước rồi ghi vào public/games/nhatla/skins/ — thứ duy nhất được commit.

    python tools/build-nhatla-skins.py                # build tất cả
    python tools/build-nhatla-skins.py --src "D:\\art" # đổi thư mục ảnh gốc
    python tools/build-nhatla-skins.py --only noel-tuyet

QUY ƯỚC (đọc kỹ trước khi làm bộ mới):

  skins/hat/<id>/     01.png … NN.png   ảnh VUÔNG, hạt rơi — ảnh gốc lấy từ --src
  skins/thung/<id>/   01.png            ĐÚNG MỘT ảnh thùng — bỏ thẳng vào đây rồi chạy script

Hai loại lấy ảnh gốc khác đường vì lý do thực tế: bộ hạt có hàng chục file nên để ngoài
Desktop cho dễ vẽ, còn bộ thùng chỉ một file nên đặt luôn vào thư mục đích, script chuẩn
hoá tại chỗ. Thêm bộ thùng mới = tạo thư mục, copy 1 file PNG tên 01.png, chạy script —
không phải khai báo gì trong file này (trừ tên hiển thị đẹp ở BIN_NAMES).

Ảnh hạt phải vuông vì engine định vị lá bằng `translate(x - size/2, y - size/2)`,
tức là nó đã coi mỗi hạt là một ô vuông size×size. Ảnh gốc lá 80×48 khiến tâm thật
của lá nằm lệch lên 0.2×size so với chỗ engine tưởng. Nhồi vào khung vuông (giữ
nguyên tỉ lệ, chèn viền trong suốt) là hết lệch mà lá nhìn vẫn y như cũ — bề ngang
vẫn phủ trọn khung nên kích thước hiển thị không đổi.

Bộ thùng KHÔNG cần ảnh thứ hai vẽ sáng hơn: hiệu ứng chớp lúc bỏ lá vào do CSS làm
(@keyframes nl-bin-receive trong overlay.html — phóng 1.13× + brightness 1.45 + quầng
sáng vàng). Bản đầu có ảnh 02 nhưng đo ra là vô ích, xem ghi chú ở BIN_CANVAS.
"""

import argparse
import json
import os
import re
import shutil
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Thiếu Pillow. Cài bằng: python -m pip install Pillow")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKINS_DIR = os.path.join(REPO, 'public', 'games', 'nhatla', 'skins')
BUNDLED = os.path.join(REPO, 'public', 'games', 'nhatla', 'assets')
DEFAULT_SRC = os.path.join(os.path.expanduser('~'), 'Desktop', 'Nhat la')

# baseSize = bề ngang hiển thị (px) ở mức Kích thước 100%. Mỗi bộ tự khai số của mình
# nên cùng một thanh trượt vẫn cho lá to, tuyết nhỏ — không cần code riêng cho từng bộ.
#
# target = cạnh khung vuông MONG MUỐN, nhưng script CHỈ THU NHỎ, không bao giờ phóng to:
# phóng 80px lên 128px không sinh thêm được chi tiết nào, chỉ làm file nặng gấp ba rồi
# trình duyệt vẫn phải nội suy y như cũ. Bộ nào ảnh gốc nhỏ hơn target thì giữ nguyên độ
# nét thật của nó và script báo để hoạ sĩ biết đường xuất lại.
HAT_SKINS = [
    {
        'id': 'la-mua-thu', 'name': 'Lá mùa thu', 'target': 128, 'baseSize': 110,
        'src': ['la'], 'match': r'^hp-la-\d+\.png$',
        # Bộ lá gốc có sẵn trong repo, nên máy nào không có Desktop\Nhat la vẫn build lại được.
        'bundled': ['la'],
    },
    {
        'id': 'noel-tuyet', 'name': 'Tuyết Noel', 'target': 64, 'baseSize': 44,
        'src': ['Noel', 'tuyet'], 'match': r'^tuyet_\d+\.png$',
    },
]

# Thùng rác chỉ cần ĐÚNG MỘT ảnh. Hiệu ứng chớp sáng lúc bỏ lá vào do CSS làm hoàn toàn
# (@keyframes nl-bin-receive: phóng 1.13× + brightness 1.45 + quầng sáng vàng), không phải
# do đổi sang một ảnh vẽ sáng hơn. Bản cũ có thêm ảnh 02 nhưng đo ra là vô ích: hình dáng
# lệch 0 pixel so với 01, thùng mặc định chỉ sáng hơn 9% (chìm nghỉm dưới 45% của CSS),
# còn hai bộ Noel lại TỐI hơn 20% nên chớp yếu hẳn so với bộ mặc định. Bỏ 02 vừa gọn vừa
# làm mọi bộ chớp giống nhau.
#
# Vì thế bộ thùng KHÔNG lấy ảnh từ Desktop mà nhận ảnh gốc đặt thẳng vào
# skins/thung/<id>/01.png rồi chuẩn hoá tại chỗ — thêm bộ mới là copy 1 file PNG vào thư
# mục mới, chạy script, xong. Script tự quét nên không phải khai báo gì ở đây.
BIN_CANVAS = (200, 231)   # khung chuẩn mọi bộ thùng, khớp bộ mặc định đang chạy
BIN_BASE_WIDTH = 260      # px hiển thị ở mức Kích thước 100%
BIN_FLASH_MS = 720        # khớp @keyframes nl-bin-receive trong overlay.html

# Tên hiển thị trong panel. Id nào không có ở đây thì lấy tên thư mục viết hoa chữ đầu,
# nên bỏ sót cũng không sao — chỉ là tên xấu hơn.
BIN_NAMES = {
    'mac-dinh': 'Thùng mặc định',
    'noel-cay-thong': 'Noel — Cây thông',
    'noel-keo-gay': 'Noel — Kẹo gậy',
    'noel-ong-gia-noel': 'Noel — Ông già Noel',
    'cong-nghe-xanh': 'Công nghệ xanh',
    'cong-nghiep-canh-bao': 'Công nghiệp cảnh báo',
    'graffiti': 'Graffiti',
    'sinh-thai': 'Sinh thái',
    'hoang-gia-tim-vang': 'Hoàng gia tím vàng',
    'arcade-retro': 'Arcade retro',
}


def fit_square(img, side):
    """Đưa ảnh vào khung vuông side×side, giữ tỉ lệ, chèn viền trong suốt."""
    img = img.convert('RGBA')
    w, h = img.size
    if max(w, h) != side:
        ratio = side / max(w, h)
        img = img.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.LANCZOS)
    w, h = img.size
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - w) // 2, (side - h) // 2))
    return canvas


def fit_canvas(img, size):
    """Đưa ảnh về đúng khung size, giữ tỉ lệ. Lệch <=8px thì chỉ chèn viền, không
    resample — thùng Noel 196×231 vào khung 200×231 nhờ vậy vẫn nét nguyên bản."""
    img = img.convert('RGBA')
    w, h = img.size
    tw, th = size
    if (w, h) != size:
        if abs(w - tw) > 8 or abs(h - th) > 8:
            ratio = min(tw / w, th / h)
            img = img.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.LANCZOS)
        w, h = img.size
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(img, ((tw - w) // 2, (th - h) // 2))
    return canvas


def save(img, path):
    img.save(path, 'PNG', optimize=True)
    return os.path.getsize(path)


def reset_dir(path):
    if os.path.isdir(path):
        shutil.rmtree(path)
    os.makedirs(path)


def build_hat(skin, src_root):
    src_dir = os.path.join(src_root, *skin['src'])
    if not os.path.isdir(src_dir) and skin.get('bundled'):
        src_dir = os.path.join(BUNDLED, *skin['bundled'])
    if not os.path.isdir(src_dir):
        return None, f"không thấy thư mục ảnh gốc: {src_dir}"
    pattern = re.compile(skin['match'], re.IGNORECASE)
    files = sorted((f for f in os.listdir(src_dir) if pattern.match(f)),
                   key=lambda f: [int(t) if t.isdigit() else t.lower()
                                  for t in re.split(r'(\d+)', f)])
    if not files:
        return None, f"không có ảnh nào khớp {skin['match']} trong {src_dir}"

    # Một bộ dùng chung một cạnh khung, lấy theo ảnh gốc to nhất nhưng không vượt target.
    widest = 0
    for name in files:
        with Image.open(os.path.join(src_dir, name)) as img:
            widest = max(widest, *img.size)
    side = min(skin['target'], widest)

    out_dir = os.path.join(SKINS_DIR, 'hat', skin['id'])
    reset_dir(out_dir)
    total_in = total_out = 0
    for index, name in enumerate(files, 1):
        src_path = os.path.join(src_dir, name)
        total_in += os.path.getsize(src_path)
        with Image.open(src_path) as img:
            total_out += save(fit_square(img, side), os.path.join(out_dir, f'{index:02d}.png'))

    manifest = {
        'id': skin['id'], 'name': skin['name'], 'kind': 'hat',
        'count': len(files), 'ext': 'png',
        'source': side, 'baseSize': skin['baseSize'],
    }
    # Ảnh gốc nhỏ hơn cỡ hiển thị = trình duyệt phải phóng lên = nhìn mờ. Không tự sửa
    # được ở đây, chỉ hoạ sĩ xuất lại ảnh to hơn mới hết.
    if side < skin['baseSize']:
        manifest['lowRes'] = True
    write_manifest(out_dir, manifest)
    return (manifest, total_in, total_out), None


def build_bin(skin, src_root):
    """Chuẩn hoá TẠI CHỖ: ảnh gốc chính là skins/thung/<id>/01.png. Không xoá thư mục như
    bộ hạt, vì xoá là mất luôn ảnh gốc."""
    out_dir = os.path.join(SKINS_DIR, 'thung', skin['id'])
    idle = os.path.join(out_dir, '01.png')
    if not os.path.isfile(idle):
        return None, f"thiếu ảnh: {idle}"

    total_in = os.path.getsize(idle)
    with Image.open(idle) as img:
        normalized = fit_canvas(img, BIN_CANVAS)
    total_out = save(normalized, idle)

    # Dọn ảnh 02 của bản cũ. Để lại thì chỉ tổ tốn chỗ và làm hoạ sĩ tưởng còn phải vẽ nó.
    stale = os.path.join(out_dir, '02.png')
    removed = os.path.isfile(stale)
    if removed:
        os.remove(stale)

    manifest = {
        'id': skin['id'], 'name': skin['name'], 'kind': 'thung',
        'count': 1, 'ext': 'png', 'source': list(BIN_CANVAS),
        'baseWidth': BIN_BASE_WIDTH, 'flashMs': BIN_FLASH_MS,
    }
    write_manifest(out_dir, manifest)
    return (manifest, total_in, total_out, removed), None


def discover_bin_skins():
    """Quét skins/thung/ thay vì khai báo tay: thả thư mục có 01.png là thành một bộ."""
    try:
        names = sorted(os.listdir(os.path.join(SKINS_DIR, 'thung')))
    except FileNotFoundError:
        return []
    skins = []
    for sid in names:
        if not os.path.isfile(os.path.join(SKINS_DIR, 'thung', sid, '01.png')):
            continue
        skins.append({'id': sid, 'name': BIN_NAMES.get(sid, sid.replace('-', ' ').capitalize())})
    return skins


def write_manifest(out_dir, manifest):
    with open(os.path.join(out_dir, 'skin.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')


def kb(n):
    return f"{n / 1024:.0f}KB"


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--src', default=DEFAULT_SRC, help=f'thư mục ảnh gốc (mặc định: {DEFAULT_SRC})')
    parser.add_argument('--only', action='append', default=[], help='chỉ build id này (lặp lại được)')
    args = parser.parse_args()

    # Console Windows mặc định cp1252, không in nổi tiếng Việt lẫn ✓/✗.
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    wanted = set(args.only)
    failures = []
    for kind, skins, builder in (('hat', HAT_SKINS, build_hat), ('thung', discover_bin_skins(), build_bin)):
        for skin in skins:
            if wanted and skin['id'] not in wanted:
                continue
            result, error = builder(skin, args.src)
            if error:
                failures.append(f"{kind}/{skin['id']}: {error}")
                print(f"  ✗ {kind}/{skin['id']:<22} {error}")
                continue
            manifest, total_in, total_out = result[:3]
            note = ''
            if len(result) > 3 and result[3]:
                note = '  · đã xoá 02.png thừa'
            elif manifest.get('lowRes'):
                note = (f"  ⚠ ảnh gốc {manifest['source']}px < cỡ hiển thị {manifest['baseSize']}px"
                        f" — xuất lại ở {skin['target']}px để hết mờ")
            print(f"  ✓ {kind}/{skin['id']:<22} {manifest['count']:>2} ảnh  {kb(total_in):>7} → {kb(total_out):>7}{note}")

    if failures:
        print(f"\n{len(failures)} bộ lỗi.")
        return 1
    print(f"\nXong. Ghi vào {SKINS_DIR}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
