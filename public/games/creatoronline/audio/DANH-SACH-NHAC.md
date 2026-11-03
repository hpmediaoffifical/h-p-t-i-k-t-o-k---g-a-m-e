# Danh sách nhạc nền cần thêm

Thả file vào **đúng thư mục này** (`assets/audio/`) với **đúng tên file** bên dưới. Không cần sửa code: lần sau mở game, phòng nào có file sẽ phát file đó, phòng nào chưa có vẫn dùng nhạc tổng hợp tự động.

- Định dạng: `.mp3` (khuyên dùng), `.ogg`, `.m4a`, `.wav` đều được nếu đổi đuôi tương ứng trong `assets/data/game-config.json` (trường `file`).
- Nên dùng bản **không lời** hoặc **beat**, độ dài 1–3 phút, **cắt vòng lặp liền mạch** (game phát lặp lại).
- Âm lượng khoảng -14 LUFS để các phòng đều nhau.
- Chỉ dùng nhạc bạn có quyền sử dụng (nhạc tự làm, nhạc mua bản quyền, hoặc kho nhạc miễn phí bản quyền ghi rõ cho phép dùng thương mại).
- Muốn khớp nhịp nhảy của idol với file nhạc: thêm `"bpm": 124` vào thể loại tương ứng trong `game-config.json`.

## Sân khấu nhóm (G1–G5)

| File | Thể loại | Mô tả nhạc cần tìm |
|---|---|---|
| `kpop.mp3` | K-Pop Dance | K-Pop dance 120–126 BPM, trống four-on-the-floor, synth sáng, bass bật nảy, điệp khúc hô theo được. Không khí concert idol. |
| `edm.mp3` | EDM Festival | EDM big-room 128 BPM, build-up rồi drop mạnh, supersaw, clap dày, có đoạn hô "Put your hands up". |
| `vpop.mp3` | V-Pop Remix | V-Pop remix 100–110 BPM, giai điệu dễ nhớ, beat house nhẹ, kiểu nhạc nhảy TikTok Việt. |
| `hiphop.mp3` | Hip-hop / Rap | Boom-bap 88–92 BPM, 808 trầm, snare đanh, hi-hat lắc, hợp nhảy freestyle/battle. |
| `tiktok.mp3` | Trend TikTok | Nhạc trend 110–120 BPM, vui nhộn, nhiều tiếng "pop", "whoosh", hợp nhảy đồng loạt. |

## Phòng LIVE đứng (N01–N10)

| File | Thể loại | Mô tả nhạc cần tìm |
|---|---|---|
| `talk.mp3` | Tâm sự đêm khuya | Lo-fi chill 75–80 BPM, piano điện, tiếng vinyl rè nhẹ. |
| `sale.mp3` | Bán hàng chốt đơn | Nhạc nền bán hàng 110 BPM, ukulele + vỗ tay, tươi vui. |
| `tarot.mp3` | Tarot huyền bí | Ambient 60 BPM, pad dày, chuông gió, tiếng vang, không trống. |
| `comedy.mp3` | Hài & kể chuyện | Nhạc hoạt hình 100 BPM, tuba/bassoon nhún nhảy, mõ gỗ. |
| `news.mp3` | Tin nóng 24h | Nhạc bản tin 120 BPM, synth dồn dập, tiếng tích tắc. |

## Phòng ngồi hát (S1–S5)

| File | Thể loại | Mô tả nhạc cần tìm |
|---|---|---|
| `ballad.mp3` | Ballad | Beat ballad karaoke 68–72 BPM, piano rải, strings nền, trống nhẹ. |
| `bolero.mp3` | Bolero | Beat bolero 64–68 BPM, guitar điện tremolo, nhịp bolero, maracas. |
| `acoustic.mp3` | Acoustic | Guitar mộc quạt chả 92–96 BPM, shaker, ấm áp kiểu cafe. |
| `rnb.mp3` | R&B Chill | R&B 82–86 BPM, Rhodes, búng tay, bass mượt, nhịp lắc. |

## Phòng game (P1–P5)

| File | Thể loại | Mô tả nhạc cần tìm |
|---|---|---|
| `racing.mp3` | Đua xe | 150 BPM, bass saw dồn 16 nốt, kèm tiếng động cơ rú, drift. |
| `battle.mp3` | Sinh tồn bắn súng | Hùng tráng 140 BPM, tom dồn, kèn đồng, tiếng súng xa. |
| `moba.mp3` | MOBA 5v5 | Orchestral 120 BPM, dây + timpani, cảm giác giao tranh. |
| `craft.mp3` | Xây dựng sandbox | Piano thưa 90 BPM, yên bình, tiếng chim. |
| `horror.mp3` | Kinh dị | Drone u ám 50 BPM, nhịp tim, cửa kẽo kẹt. |

## Sảnh chung

| File | Mô tả |
|---|---|
| `lobby.mp3` | Lounge jazz-pop 90 BPM, Rhodes + bass mềm, phát khi không đứng gần phòng nào. |

Tổng: **20 file** (19 thể loại + 1 sảnh). Nhiều phòng cùng thể loại sẽ dùng chung một file.
