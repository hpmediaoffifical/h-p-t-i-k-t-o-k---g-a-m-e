# 🏢 Creator Online (`creatoronline`) — thiết kế bản LIVE

Ngày: 03/11/2026 · Nhánh: `tuongtac/creator-online` · Trạng thái: spec đã chốt, chờ làm GĐ1.

Đã qua 2 vòng soát của agent Game Studios: `systems-designer` (luật chơi, con số) và `lead-programmer` (đối chiếu code app). Các lỗi chặn đã sửa vào spec.

Nguồn:
- Đề xuất 5 agent Game Studios: `docs/superpowers/plans/2026-11-03-creator-online-de-xuat.md`
- Khảo sát chung: `docs/superpowers/plans/2026-11-03-game-tuong-tac-khao-sat.md`
- Ý tưởng gốc: `CREATOR ONLINE/docs/Y-TUONG-CREATOR-ONLINE.md`
- Nhóm menu: `docs/superpowers/specs/2026-11-02-game-tuong-tac-design.md`

## 1. Ý tưởng

Tòa nhà LIVE chibi 3D gồm 25 phòng, giữ nguyên thế giới của bản chạy riêng:
- 5 sân khấu nhóm **G1–G5**: VITAMIN B, VENUS STAR, LOLLIPOP, BONITA GIRL, BLACKSWAN
- 10 phòng đứng **N01–N10**
- 5 phòng hát **S1–S5**
- 5 phòng game **P1–P5**

Bản chạy riêng cho **một người tự đi bằng WASD và tiêu ví xu**. Bản LIVE đổi thành:
- **Người xem là fan.** Mỗi người xem là một chibi mang tên + avatar TikTok, thuộc một trong 5 **fan club** (một club ứng với một nhóm G1–G5).
- **Streamer là đạo diễn tòa nhà**, không có nhân vật. Camera tự cắt cảnh theo sự kiện.
- **Quà TikTok thật thay cho ví xu.** Quà rẻ nhất cũng được lên sân khấu; quà to chiếm sóng cả tòa nhà.
- **PK giữa các nhóm** là động lực tặng quà chính.

**Khác Nhà Tù:** Nhà Tù chỉ có 1 người lên sóng mỗi lúc và có luật phạt (biệt giam, cướp ngôi). Creator Online cho **nhiều người lên sân khấu cùng lúc**, thi đấu theo đội, không có luật phạt, và vai bị chiếm thì xếp hàng chứ không cướp.

## 2. Quyết định đã chốt (03/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Người xem đứng phe nào trong PK | Theo **fan club đã chọn** bằng bình luận `1`–`5` |
| 2 | Hoa hồng làm gì | **Quà bất kỳ, kể cả Hoa hồng, → fan lên sân khấu nhóm mình** (móc quà đầu tiên) |
| 3 | Cấp fan | **Giữ trọn đời theo TikTok ID**, lưu ở server của app |
| 4 | Lật kèo PK | **Chỉ bằng tim miễn phí**: tim của bên đang thua tính gấp đôi trong lúc nước rút. Không có quà Boost |
| 5 | Quà giả của NPC | **Tắt hẳn** trong bản LIVE. NPC chỉ là đám đông vô danh và nhân vật cư dân |
| 6 | Nhịp PK | **Mỗi 5 phút**, streamer chỉnh được 2–15 phút (0 = tắt PK tự động) |

## 3. Người xem vào game

- **Vào tòa nhà:** bình luận, thả tim hoặc follow thì fan đi vào. Quà cũng cho vào (nếu chưa vào thì vào trước, xử lý quà sau). Sự kiện "vào phòng LIVE" (join) chỉ tăng bộ đếm, không sinh nhân vật.
- **Chọn club:**
  - Bình luận **chỉ gồm** `1`–`5` (hoặc `g1`–`g5`) thì vào club tương ứng. "5 sao", "1 tim nè" không phải mã.
  - Đổi club tối đa 1 lần mỗi `coClubSwitchSec` (60 giây). Club tự xếp không tính là đã chọn, nên không bắt đầu thời gian chờ.
  - Fan đang ở một trong 2 phe PK bị khoá phe tới hết trận.
  - Chưa chọn bao giờ → overlay tự xếp vào club đang có ít fan hoạt động nhất (đang PK thì vào phe PK ít fan hơn), hiện chip "→ ③ LOLLIPOP · gõ 1–5 để đổi". Club tự xếp không được lưu.
  - Club đã chọn và thời gian chờ đổi club do server quyết định và nhớ trọn đời (mục 11). Overlay đổi club khi nhận `creatoronline:fan`, không tự đổi.
- **Ngoại hình:**
  - Đồ theo hash tên như cũ (`lookFromName`, npc.js:155), cộng **một điểm nhấn màu của club** (lightstick + viền áo).
  - Không mặc đồng phục nhóm: G2–G5 là nhóm nữ, fan nam mặc đồng phục nữ sẽ trông kỳ.
- **Chỗ đứng:** fan đứng ở khu khán giả trước sân khấu club mình, vẫy lightstick theo nhịp.
- **Fan và chibi là hai thứ riêng:**
  - Club, điểm PK, top fan và cấp fan tính theo `fanKey` (mục 11), dù người đó có chibi trong tòa nhà hay không.
  - Quà và tim của người bị đẩy ra hoặc chưa được sinh nhân vật vẫn được tính.
- **Dân số:**
  - Trần `coMaxViewers` (mặc định 40, khoảng 5–120; ở chất lượng thấp tối đa 80). NPC đám đông `coNpcCount` (20) bớt dần khi người xem vào.
  - Tòa nhà đầy thì đẩy người theo `pickEvictee` / `SwapBudget` (chép `population.js` của Nhà Tù). Không đẩy:
    - người đang trên sân khấu
    - người giữ vai
    - chủ phòng
    - người đang chờ sân / phòng / vai
    - người có cảnh quay đang chờ
    - người tặng quà trong 5 phút qua
  - **Người tặng quà luôn được vào.** Không đẩy được ai thì vượt trần tạm, tối đa `coMaxViewers + 20`, và không vượt trần cứng của mục 16 (160 thường / 100 thấp).
  - Khi đầy, bình luận / thả tim / follow không sinh nhân vật mới (vẫn tính như trên).
  - Im lặng `coViewerIdleMin` (30) phút thì rời tòa nhà.
- **Nhãn tên** (theo LabelLayer của Nhà Tù):
  - Cỡ tối thiểu 34 px; 50 px cho người đang được quay.
  - Tối đa 8 nhãn mỗi khung, 5 nhãn ở cảnh rộng.
  - Ưu tiên: người đang được quay → người tặng quà trong 60 giây qua (top 3 có avatar) → người vừa bình luận (giữ 10 giây) → NPC (chỉ ở cảnh gần, cỡ 0,7×).
  - Chồng nhau thì ẩn nhãn ưu tiên thấp. Tên cắt ở 12 ký tự. Biểu tượng cấp fan đứng trước tên.

## 4. Quà

### 4.1 Ba lớp phản hồi

Mỗi quà được tính theo **tổng xu = `coinValue × repeatCount`**:
- Server chỉ gửi 1 sự kiện khi combo kết thúc (server.js:3796–3805). `repeatCount` là tổng cả combo (`normalizeGiftRepeatCount`, server.js:4590).
- `coinValue` lấy từ bảng quà trước, rồi tới `diamondCount`. Quà lạ không có giá thì tính 1 xu: có thể xếp bậc thấp hơn thực tế, không bao giờ cao hơn.

| Lớp | Luôn có? | Nội dung |
|---|---|---|
| A — cá nhân | Có, không xếp hàng, hiện trong ≤ 2 giây sau khi combo kết thúc | Fan lên sân khấu club (mục 5), một dòng trong ô quà trên HUD (ảnh quà thật + tên), quà bay lên sân, cộng điểm PK nếu club đang PK |
| B — phòng | Theo hành động | Hiệu ứng tại sân/phòng (pháo giấy, khói, đèn…), hàng chờ riêng mỗi phòng: 1 hiệu ứng mỗi 1,5 giây, tối đa 6 chờ, trùng thì gộp |
| C — tòa nhà | Bậc 5 trở lên, vé, vai | Cảnh quay của đạo diễn (mục 12), một hàng chờ chung |

Cùng một người tặng liên tục thì cập nhật dòng cũ trên HUD (x5 → x10) và gộp hiệu ứng, mỗi người tối đa 1 lần nhảy lên sân khấu mỗi 1,5 giây.

### 4.2 Bậc xu và hành động mặc định

**Chọn hành động:**
- Quà đã gán trong `coGiftMap` thì chạy hành động đã gán. Hành động được quyết định lúc quà tới: streamer đổi bảng gán giữa buổi thì quà đang xếp hàng vẫn giữ hành động cũ.
- Quà đã gán mà tổng xu ≥ 299 thì chạy **thêm** hiệu ứng của bậc tương ứng (5–7). Ví dụ Đũa thần PK x10 = 1.000 xu → vai Quản lý + Tâm điểm.
- Vé / vai tặng xN chỉ tính 1 lần + gia hạn, không lấy N phòng / N vai.
- Một quà bị gán cho 2 hành động: chạy hành động đứng trước theo thứ tự `gala > spotlight > pkStart > manager > tech > mc > ticket > confetti > genre`. Panel cảnh báo khi gán trùng.
- Quà chưa gán thì chạy hành động của bậc nếu `coTierFallback` bật (mặc định bật).

**Mỗi người chỉ một chỗ:**
- Thứ tự ưu tiên: vai > phòng > sân khấu. Người đang chờ vé hoặc vai thì đứng trên sân khấu trong lúc chờ.
- Hành động nào không đưa fan đi chỗ khác thì fan **luôn** được lên sân khấu.
- Sân, hàng chờ sân đều đầy thì fan đứng hàng đầu khu khán giả với lightstick vàng (quyết định 2 vẫn được giữ: quà nào cũng có chỗ đứng nổi bật).

| Bậc | Tổng xu | Hành động mặc định |
|---|---|---|
| 1 | 1–4 | Lên sân khấu |
| 2 | 5–29 | Lên sân khấu + 1 hiệu ứng ngẫu nhiên tại sân (pháo giấy / khói / chớp) + MC NPC gọi tên |
| 3 | 30–98 | 🎟️ Phòng mang tên (mục 6). Mọi hàng chờ phòng đều đầy thì về bậc 2 |
| 4 | 99–298 | Người đang giữ vai → gia hạn vai đó. Còn lại: vai còn trống của club theo thứ tự MC → Kỹ thuật → Quản lý; hết chỗ thì vào hàng ngắn nhất; hàng đầy thì về bậc 2 |
| 5 | 299–999 | **Quà lớn:** banner + pháo hoa, cảnh quay 15 giây; mở PK nếu đang không có (mục 9) |
| 6 | 1.000–9.999 | **Tâm điểm:** cả tòa nhà đổi sang màu đèn của club, fan NPC kéo về sân đó, cảnh quay 30 giây; mở PK nếu đang không có |
| 7 | ≥ 10.000 | **Gala:** biển tòa nhà hiện tên người tặng, cả 5 nhóm nhảy chung trên sân club người tặng, cảnh quay 60 giây; mở PK sau Gala nếu đang không có |

### 4.3 Bộ quà gợi ý (`data.json → suggestedGiftMap`, mặc định của `coGiftMap`)

Mã quà lấy từ kho quà của app ngày 03/11/2026. Streamer đổi được trong panel; quà không có ở khu vực của họ thì gán quà khác.

| Hành động | Quà (id, xu) | Ghi chú |
|---|---|---|
| `genre` — đổi thể loại nhạc của sân/phòng mình | DJ Vinyl (51281, 10) | Lần lượt qua các thể loại cùng loại phòng |
| `ticket` — 🎟️ phòng mang tên | Vé hành trình (15063, 10) | Gán riêng nên rẻ hơn bậc 3, để nhiều người có phòng |
| `mc` — 🎙️ MC | Giai điệu nở hoa (170507, 99) | |
| `tech` — 🎛️ Kỹ thuật | Bom kẹo (985644, 99) | |
| `manager` — 📋 Quản lý | Đũa thần PK (14046, 100) | Quản lý được gọi PK |
| `confetti` — mưa pháo giấy cả sân | Pháo giấy tuyệt đẹp (7121, 100) | |
| `pkStart` — PK ngay cho club mình | Tiến lên! (130787, 299) | Bậc 5 + mở PK |
| `spotlight` — tâm điểm | Thiên hà (11046, 1000) | Bậc 6 |
| `gala` — Gala | Sư tử (6369, 29999) | Bậc 7 (quà ≥ 10.000 chưa gán cũng ra Gala) |

Hoa hồng (5655) cố ý để trống: rơi vào bậc 1, tức là lên sân khấu.

**Bảng chú giải trên overlay** (`coShowGiftLegend`) tối đa 6 dòng:
1. 🌹 Quà bất kỳ → lên sân khấu
2. 🎟️ Vé hành trình → phòng LIVE mang tên bạn
3. 🎙️🎛️📋 Giai điệu nở hoa / Bom kẹo / Đũa thần PK → MC / Kỹ thuật / Quản lý
4. 🎵 DJ Vinyl → đổi nhạc · 🎉 Pháo giấy tuyệt đẹp → mưa pháo giấy
5. ⚔️ Tiến lên! → PK ngay
6. 🌌 Thiên hà → cả tòa nhà về nhóm bạn

Bảng tự sinh từ `coGiftMap`, không viết cứng.

### 4.4 Luật chống kẹt

- **Trần cảnh quay:**
  - Mỗi người tặng tối đa `coCamMaxPer5Min` (90) giây cảnh quay trong mỗi 5 phút (cửa sổ trượt).
  - Vượt trần thì **chỉ mất cú cắt cảnh**: hiệu ứng lớp A/B và hiệu ứng toàn tòa nhà của bậc 6–7 vẫn chạy.
  - Gala (bậc 7) không bị trần này, và giây của Gala không tính vào trần.
- **Giới hạn giữ chỗ:** không vai, phòng hay cảnh quay nào bị giữ quá 300 giây liên tục bởi cùng một người.
- **Nhiều Gala:**
  - Mỗi Gala dài 60 giây. Có Gala khác đang chờ thì Gala hiện tại rút còn 30 giây.
  - Hai Gala của cùng người liền nhau thì gộp, tối đa 90 giây.

### 4.5 Quà trùng với game khác

GĐ1: panel cảnh báo "⚠ quà này cũng gán ở Nhà Tù / Zombie (đang bật)" bằng cách đọc config các game Tương Tác khác. Mỗi game cần một hàm lấy danh sách quà riêng vì cấu trúc bảng gán khác nhau (ví dụ `qvGiftMap` không có `coins`). Cơ chế giành quà giữa các game (giống `camClaims`) để sang GĐ2.

## 5. Lên sân khấu

- Mỗi sân có `coStageSlots` = 12 chỗ khách: 6 chỗ idol (NPC idol tạm lùi ra hai bên cánh gà) + 6 chỗ hàng trước.
- **Thời gian trên sân** = `clamp(coStageBaseSec + coStagePerCoinSec × (xu − 1), coStageBaseSec, coStageMaxSec)`, tức 12 + 3 × (xu − 1) giây, trần 120 giây.
  - Ví dụ: 1 xu = 12 giây · 5 xu = 24 giây · 10 xu = 39 giây · từ 37 xu trở lên = 120 giây.
  - Người đang trên sân tặng thêm thì cộng giờ, vẫn trong trần.
- **Sân đầy:** người mới thay người còn ít giờ nhất, nhưng người bị thay phải đã đứng ít nhất 8 giây (bằng độ dài tối thiểu của một cảnh quay, để ai cũng kịp lên hình). Không thay được ai thì xếp hàng (tối đa 10). Hàng đầy thì đứng hàng đầu khán giả với lightstick vàng (mục 4.2).
- Khách trên sân nhảy đồng bộ với nhóm, nhãn tên to hơn, màn LED chạy "💃 <tên> lên sân khấu".

## 6. Phòng mang tên (🎟️ vé)

Dùng lại `SeatHouse` (logic/seats.js) với `coRoomHoldSec` (60) và `coRoomQueueMax` (6).

- **Mua vé:**
  - Người mua được một phòng đơn chưa có chủ là người xem, chọn ngẫu nhiên.
  - Hết phòng thì xếp hàng ở phòng có hàng ngắn nhất. Hàng chờ đứng cạnh cửa phòng.
- **Khi có chủ:**
  - Biển phòng đổi thành **"Phòng <tên>"**, chibi của người mua thay NPC làm streamer.
  - Bình luận của chủ phòng (đã lọc, mục 10) hiện trên TV phòng và trong bong bóng.
  - Đạo diễn quay phòng đó 30 giây.
  - Giữ chắc 60 giây đầu. Sau đó có người chờ thì nhường; không ai chờ thì giữ tới khi rời tòa nhà, nhưng tối đa 300 giây liên tục (mục 4.4).
  - Chủ phòng mua vé nữa thì được giữ chắc thêm 60 giây, không lấy phòng thứ hai.
  - Chủ phòng rời tòa nhà thì phòng chuyển cho người chờ kế tiếp, không ai chờ thì về NPC cư dân.
- **Phòng không có chủ là người xem** vẫn do **NPC cư dân** phát sóng như bản cũ. Không còn chữ "PHÒNG TRỐNG". Biển ghi `<tên NPC> · <thể loại>` và dòng phụ "🎟️ <quà vé> → phòng mang tên bạn".
- **Bỏ hẳn** việc NPC "tặng vé giành phòng" (`seatSim.seed(…, 0.85)`, `NpcSeatSim`): đó là người xem giả.

## 7. Vai trong nhóm: MC, Kỹ thuật, Quản lý

Mỗi sân có 3 vai. Vai thuộc **sân club của người tặng**.

- **Thời gian:** `coRoleSec` (180). Giữ chắc `coRoleLockSec` (45) giây đầu. Người đang giữ tặng lại thì cộng 90 giây, trần `coRoleMaxSec` (300); có người đang chờ thì không được cộng.
- **Người khác tặng cùng vai:** vào hàng chờ, **không cướp**. Mỗi vai chỉ có 1 chỗ chờ. Hàng đầy thì quà về bậc 2.
- **Có người chờ:** người đang giữ vai còn tối đa 60 giây nữa (nhưng không trước khi hết 45 giây giữ chắc). Người chờ vì vậy đợi không quá 60 giây, giống phòng.
- **Người giữ vai hoặc người chờ rời tòa nhà:** vai chuyển cho người chờ, hoặc trả về NPC.
- Khi nhận vai, đạo diễn quay sân đó 20 giây, cận người giữ vai.

**Mã bình luận** chỉ có tác dụng với người đang giữ vai:
- So khớp không dấu, viết thường, và **cả câu bình luận phải đúng bằng mã**: `^(phao|khoi|laser|den|chop)$` cho Kỹ thuật, `^(pk [1-5]|them|bot|do)$` cho Quản lý.
- Câu thường như "đó", "đèn đẹp quá", "khỏi nha" không bị hiểu là lệnh.

| Vai | Người giữ vai làm gì | Khi im lặng |
|---|---|---|
| 🎙️ MC | Mọi bình luận được MC NPC nói (bong bóng) và chạy trên dòng LED "🎙️ <tên>: …" | MC NPC tự đọc 1 bình luận thật của khán giả mỗi khoảng 20 giây |
| 🎛️ Kỹ thuật | `phao` pháo giấy · `khoi` khói · `laser` · `den` đổi màu đèn · `chop` chớp đèn. Mỗi lệnh cách nhau 3 giây | Im lặng 10 giây thì tự bắn 1 hiệu ứng ngẫu nhiên mỗi 8 giây |
| 📋 Quản lý | `pk 3` gọi PK với club 3 (luật mở PK ở mục 9; gọi chính club mình thì bỏ qua, hiện chip "chọn club khác") · `them` / `bot` thêm hoặc bớt idol (tổng thành viên 5–9) · `do` đổi trang phục idol. Mỗi lệnh cách nhau 3 giây | Không tự làm gì |

Nhịp chớp đèn và laser luôn dưới 3 lần mỗi giây.

## 8. Sự kiện lớn (bậc 5–7)

- **Quà lớn (bậc 5):**
  - Banner (120, 600, 800, 260) gồm avatar 160 px, tên 72–90 px và ảnh quà.
  - Pháo hoa + đám đông reo.
  - Idol quay về phía người tặng; chibi người tặng được nhãn vàng và đèn rọi 30 giây.
- **Tâm điểm (bậc 6):** như bậc 5, cộng thêm:
  - đèn cả tòa nhà đổi màu club trong 30 giây
  - fan NPC và fan người xem ở cảnh đó kéo về sân club người tặng
  - màn LED mọi sân hiện "🌌 <tên> → <nhóm>"
- **Gala (bậc 7):**
  - Biển tòa nhà hiện tên người tặng.
  - Idol cả 5 nhóm lên sân club người tặng nhảy chung 60 giây.
  - Cảnh mở toàn tòa nhà 3 giây rồi vào sân.
  - Đang có PK thì đồng hồ PK tạm dừng trong lúc Gala; quà và tim trong lúc dừng vẫn tính điểm.

## 9. PK giữa các nhóm

- **Toàn tòa nhà chỉ có 1 PK** tại một thời điểm.
- **Thời gian chờ:** trận mới phải cách trận trước ít nhất 60 giây. Trận nào kết thúc cũng đặt lại đồng hồ PK tự động. Nút trong panel / lệnh `pk` bỏ qua thời gian chờ.
- **Tự động:** mỗi `coPkEveryMin` (5) phút.
  - Ghép 2 club có nhiều fan hoạt động nhất (hoạt động = có tương tác trong 3 phút qua). Bỏ cách chọn ngẫu nhiên ở main.js:1940.
  - **Không ghép lại cặp vừa đấu.** Nếu cặp mạnh nhất trùng trận trước thì lấy club hoạt động thứ ba thay cho club thứ hai.
  - Có dưới 2 club hoạt động thì bỏ qua, thử lại sau 60 giây.
- **Mở bằng quà hoặc lệnh:**
  - Quà `pkStart` hoặc bậc 5–7 khi đang không có PK, hoặc Quản lý bình luận `pk N`.
  - Đối thủ: với `pk N` là club N; với quà là club hoạt động nhiều nhất khác club người tặng, không có thì club đông fan nhất. PK vẫn chạy dù đối thủ chưa có ai; HUD mời "gõ N để vào phe".
  - Quà mở PK đến trong thời gian chờ: hiệu ứng bậc 5 chạy ngay, PK tự mở khi hết chờ, chip "⚔️ PK sau 0:42".
- **Thời lượng:** `coPkSec` (90, khoảng 60–300) giây; `coPkFinalSec` (30) giây cuối là **nước rút**. `coPkFinalSec` không quá nửa `coPkSec`.
- **Điểm mỗi bên** = `10 × xu + 10 × √L`:
  - `xu`: tổng xu fan của club đó tặng trong trận.
  - `L`: số tim có trọng số. Mỗi tim tính 1; tim đến trong lúc nước rút **khi bên đó đang thua** tính 2. Xét "đang thua" tại lúc mỗi đợt tim tới.
  - Tim có thể lật trận sát nút nhưng không thắng nổi quà to: 10.000 tim = 1.000 điểm = 100 xu; 50.000 tim ≈ 2.236 điểm ≈ 224 xu, vẫn thua một quà 299 xu.
- **HUD:**
  - Điểm hiện số nguyên `⌊điểm⌋`.
  - "cần X xu để lật kèo", với `X = ⌊chênh lệch / 10⌋ + 1`.
  - Trong nước rút, bên đang thua có chip "❤ ×2" để người xem thấy tim đang được nhân đôi.
- **Kết thúc:**
  - Bên nhiều điểm hơn thắng. Hoà điểm thì bên có nhiều người tặng khác nhau hơn thắng; vẫn hoà thì hoà.
  - MVP (người tặng nhiều nhất bên thắng) đội vương miện, tên lên LED sân đó `coMvpMin` (10) phút.
  - Club thắng +1 trận thắng trên bảng xếp hạng buổi LIVE. Idol bên thua nhảy phạt 10 giây.
  - Không có thưởng xu nào: bỏ `earn()` trong `endPk` (main.js:796–799).
- **Fan của club không PK:** quà vẫn chạy lớp A/B nhưng không tính điểm. HUD nhắc "PK: ① vs ③ — gõ 1 hoặc 3 để vào phe".
- **Cảnh quay khi PK:** xen kẽ 2 sân, mỗi sân 8 giây. Trong lúc PK, cảnh PK đứng ngay dưới bậc 5 (mục 12): chỉ bậc 5 trở lên được cắt ngang. Cảnh vé và vai chờ PK xong, trừ khi chúng thuộc một trong 2 sân đang PK.

## 10. Bình luận, thả tim, follow

- **Bình luận:**
  - Bình luận không phải mã → bong bóng trên đầu fan (tối đa 3 bong bóng mỗi khung, mỗi bong bóng tối đa 2 dòng, cỡ 36 px) và một dòng trên bảng bình luận của sân club (`pushComment`, rooms.js:43).
  - Bình luận mã `1`–`5` → chip "✓ <tên> → ③" ở sân đó.
  - Lần đầu bình luận trong buổi → NPC chủ sân/phòng chào tên (mỗi sân tối đa 1 lời chào mỗi 5 giây, gộp tên).
- **Thả tim:**
  - TikTok gửi tim theo đợt nên cộng dồn mỗi người mỗi 2 giây → tim bay từ chibi kèm chip "+15 ❤ <tên>", một tiếng tick có giới hạn nhịp.
  - Cả tòa nhà mỗi `coLikeMilestone` (300) tim → sóng tim ở cảnh đang quay + MC cảm ơn người thả nhiều nhất đợt đó.
  - Mốc tim **không bao giờ** cho vai, phòng hay cảnh quay.
- **Follow / chia sẻ:** vào tòa nhà + chip "đã follow ❤". MC cảm ơn tối đa 1 lần mỗi 10 giây, gộp tên.
- **Lọc chữ** (`logic/textfilter.js`):
  - Chữ người xem lên màn LED, TV phòng hay miệng MC thì phải qua bộ lọc.
  - Danh sách từ cấm mặc định + `coBadWords` (streamer tự thêm, cách nhau bằng dấu phẩy). So khớp không dấu; từ bị cấm thay bằng `***`.
  - Giới hạn 60 ký tự.

## 11. Cấp fan trọn đời và club (server)

Lưu ở server thay vì localStorage. Lý do: nguồn OBS và cửa sổ game là 2 trình duyệt khác nhau; nếu overlay tự cộng thì 2 nguồn sẽ cộng trùng. **Server là nơi quyết định `club` và thời gian chờ đổi club.** Overlay chỉ hiện theo `creatoronline:fan`.

- **Khoá người xem:**
  - Một hàm duy nhất `fanKey(d) = d.userId || lower(d.uniqueId)`, dùng y hệt ở server và overlay.
  - Hiện `like` và `social` chỉ gửi `uniqueId, nickname` (server.js:3878, 3892). **Phải thêm `userId` + `profilePicture`** vào hai broadcast này. Đây là thay đổi cộng thêm, không làm hỏng game khác.
  - Không thêm thì fan vào bằng thả tim / follow sẽ lệch khoá với bộ đếm và không có avatar.
  - `chat` và `gift` đã có đủ (server.js:3780–3787, `emitGift`).
- **`lib/creatoronline-fans.js`** (CommonJS, logic thuần, test `tests/creatoronline-fans.test.js`):
  - Lưu `{ [fanKey]: { name, xu, club, clubAt, lastSeen } }`.
  - Ghi vào `<DATA_DIR>/creatoronline-fans.json` theo kiểu nguyên tử (ghi file tạm rồi đổi tên), debounce 30 giây.
  - Mọi đường thoát app phải ghi ngay (`app.exit` không bắn `before-quit`).
  - Chỉ bỏ mục **dưới 100 xu** không gặp quá 180 ngày. Fan đã có cấp (từ Fan cứng trở lên) giữ vĩnh viễn, đúng quyết định 3.
  - Có `parseClubCode` riêng, nhỏ. Test `import()` `public/games/creatoronline/js/logic/codes.js` theo file URL rồi so 2 bộ phân tích trên cùng bộ mẫu. Không `require()` file ESM lúc chạy.
- **Khi nào ghi:** chỉ khi game bật **và đang có overlay Creator Online kết nối**, để không lưu dữ liệu người xem của streamer chưa từng dùng game.
  - Overlay gửi `creatoronline:hello` khi kết nối; server cho socket đó vào phòng `co-overlay`.
  - Ghi khi phòng `co-overlay` có ít nhất 1 socket và `appConfig.games.creatoronline.enabled !== false`.
- **Dữ liệu vào** (chạy đúng 1 lần mỗi sự kiện, không lặp theo số overlay):
  - **Quà:** móc trong `emitGift` ngay trước `io.emit('gift')` (server.js:4889) → cộng `xu`. Bỏ qua quà thử (`g.source === 'test'`) và người xem giả (khoá bắt đầu bằng `sim`/`test_`).
  - **Bình luận:** móc ngay sau `broadcast('chat')` (server.js:3787). Gặp mã club thì đổi `club`, nếu đã qua `coClubSwitchSec` kể từ `clubAt`.
  - **Club tự xếp** (người chưa chọn bao giờ) do overlay tự tính để hiện, **không lưu**.
- **Dữ liệu ra:**
  - Khi ghi đang bật, server gắn `coFan: { club, xu, rank }` (giá trị **trước** khi cộng quà này) vào sự kiện `gift` và `chat` nó phát ra. Người xem quay lại tặng quà ngay thì overlay vẫn biết club đã lưu, không tính nhầm phe trong lúc chờ `/fans`.
  - Chỉ khi `xu` hoặc `club` đổi: `io.emit('creatoronline:fan', { id, xu, rank, club })`. Không phát lại khi chỉ `lastSeen` đổi.
  - `GET /api/creatoronline/fans?ids=a,b`: overlay gọi gộp mỗi 1 giây khi có fan mới vào.
  - `GET /api/creatoronline/fans/top?n=20`: panel.
  - `POST /api/creatoronline/fans/reset`: panel, có xác nhận.
- **Cấp** theo `fanRanks` có sẵn, tính bằng xu thật trọn đời: Fan mới 0 · Fan cứng 100 · Fan VIP 500 · Đại gia 2.000 · Thần tài 10.000. Biểu tượng cấp (từ Fan cứng trở lên) đứng trước tên.

**Một nơi phát duy nhất.** Mỗi overlay tự mô phỏng PK, vai, phòng và đạo diễn từ cùng luồng sự kiện. Vì vậy streamer chỉ dùng **một** trong hai: nguồn trình duyệt OBS **hoặc** cửa sổ game. Mở cả hai thì hai bên chạy độc lập và có thể lệch nhau; panel ghi rõ điều này.

**Buổi LIVE** bắt đầu khi app nối vào một phòng TikTok mới: sự kiện `status {connected: true, roomId}` (server.js:3736) mang `roomId` khác lần trước. Lệnh panel `reset` cũng mở buổi mới. Sang buổi mới thì xoá PK, vai, phòng, khách trên sân và top fan buổi; cấp fan trọn đời không bị ảnh hưởng.

Để tải lại trang (ví dụ đổi chất lượng, OBS làm mới nguồn) không làm mất trận PK đang chạy:
- Trạng thái buổi LIVE (PK, vai, phòng, khách trên sân, hàng cảnh quay, top fan buổi, `roomId`) lưu localStorage mỗi 2 giây, kèm mốc giờ.
- Lúc nạp trang thì khôi phục nếu bản lưu chưa quá 5 phút và cùng `roomId`.
- Đổi cài đặt áp ngay qua `gameConfig`, không tải lại trang. Riêng đổi chất lượng thì tải lại.

## 12. Đạo diễn camera (`logic/director.js`, thay cho camera bám người chơi)

**Hàng cảnh quay**, ưu tiên từ cao xuống:

| Cảnh | Nguồn | Độ dài |
|---|---|---|
| Gala | bậc 7 | 60 giây (mở 3 giây toàn tòa nhà) |
| Tâm điểm | bậc 6 | 30 giây |
| Quà lớn / mở PK | bậc 5, `pkStart` | 15 giây |
| PK *(chỉ khi đang PK; lúc đó đứng ở đây)* | đang PK | xen kẽ 2 sân, mỗi sân 8 giây |
| Phòng mới có chủ | vé | 30 giây |
| Vai mới | vai | 20 giây |
| Vòng rảnh | không có gì | xem dưới |

**Luật:**
- Mỗi cảnh chạy tối thiểu 8 giây trước khi bị cảnh khác thay.
- Cảnh ưu tiên cao hơn cắt ngang sau mốc 8 giây đó. Cảnh ngang hoặc thấp hơn thì xếp hàng (tối đa 6).
- Chỉ gộp cảnh **cùng người tặng và cùng mục tiêu** (cùng sân / phòng): khi đó cộng giờ vào cảnh đang chờ, không thêm cảnh mới.
- Cảnh chờ quá 45 giây, hoặc mục tiêu đã mất (người rời đi, vai / phòng đã chuyển), thì bỏ.
- Hàng đầy thì bỏ cảnh, chỉ còn lớp A/B.
- Quà nhỏ không cắt cảnh; quà ở sân đang quay thì bay qua khung.
- Cảnh bậc 5 trở lên được cắt tới trong ≤ 0,5 giây nếu cảnh hiện tại đã qua mốc 8 giây.

**Vòng rảnh:**
- sân club có hoạt động gần nhất, tầm trung, 8 giây
- cận một khách trên sân hoặc idol, 5 giây
- phòng có chủ là người xem (không có thì bỏ qua), 6 giây
- bảng xếp hạng, 4 giây
- sang club kế tiếp
- Khoảng mỗi 2 phút chèn một cảnh "lát sàn" 3 giây làm chuyển cảnh.

**Khung dọc:**
- `fov` 60 khi khung dọc (aspect < 1), 50 khi khung ngang.
- Đầu nhân vật chính ở khoảng y 560–650, chân ≥ y 1040 trên khung 1920.

**Bố cục cảnh có sẵn:**

| Cảnh | Bố cục |
|---|---|
| Sân nhóm | Từ phía khán giả, góc 20–25°, cách khoảng 19 m. LED ở trên, idol và fan ở dưới |
| Phòng hát / phòng đứng | Từ hành lang, cách 5–8 m |
| Phòng game | Chếch sau vai streamer để thấy TV trận đấu |
| Lát sàn | Cột 17 × 30 m nhìn nghiêng 60–70°, ví dụ 1 sân G cùng các phòng trước nó |
| Toàn tòa nhà | Chỉ làm cảnh mở 2–3 giây |

Camera không bao giờ ở sau biển neon cửa phòng (biển che nửa khung khi đứng ở hành lang): tính sẵn điểm đặt camera cho từng cảnh, không dùng orbit + raycast.

**Âm nhạc:** trộn theo **phòng đang được quay** (thay `mixAudio` theo vị trí người chơi, main.js:1955).

## 13. HUD khung 1080 × 1920

Đơn vị gốc giống Nhà Tù: `font-size: calc(min(100vw, 56.25vh) / 24)`, tức 45 px ở bề ngang 1080. Cỡ chữ tối thiểu ở bề ngang 1080: chip 30 px · thân 38–44 px · tên 46–52 px · tiêu đề 72–110 px. Chữ trắng hoặc vàng, đậm 800–900, viền tối 4–6 px hoặc nền ≥ 0,85.

**Vùng tránh** (thuộc giao diện TikTok; ước lượng, phải đối chiếu bằng ảnh chụp điện thoại từ buổi LIVE thử):
- y < 230
- x > 930 (y 230–1500)
- x 0–780, y 1040–1740
- y > 1740

Giữ chữ trong khoảng x 120–920.

| Ô | (x, y, rộng, cao) | Nội dung |
|---|---|---|
| Tên phòng / thể loại | (120, 240, 800, 96) | "G2 · VENUS STAR" 56 px + chip thể loại 34 px |
| Thanh PK (thay ô trên khi PK) | (120, 240, 800, 180) | Dòng 1: tên 2 nhóm 40 px + đồng hồ 44 px. Dòng 2: điểm 52 px + thanh 28 px. Dòng 3: "cần X xu để lật kèo" / chip "❤ ×2" 30 px + avatar top 3 mỗi bên. Phân biệt bằng tên + vị trí, không chỉ bằng màu |
| Người đang được quay | (120, 432, 520, 132) | Avatar 112 px viền vàng, tên 50 px, "<vai/phòng> · 0:18" 32 px + thanh thời gian |
| Ô quà / chú giải | (660, 432, 260, 300) | Có quà trong 20 giây qua: 3 dòng quà mới nhất. Rảnh: xoay vòng **từng mục** của bảng chú giải (mỗi mục 4 giây, ảnh quà + 1 dòng) ↔ top 3 fan buổi LIVE (6 giây). Ẩn khi đang có banner |
| Hướng dẫn | (120, 940, 800, 84) | 1 dòng 38 px, xoay 3 câu mỗi 6 giây: "💬 Gõ 1–5 chọn nhóm" · "🌹 Quà bất kỳ → lên sân khấu" · "🎟️ <quà vé> → phòng mang tên bạn". Dòng tiêu đề màn LED lặp lại câu đang hiện |
| Vùng cảnh 3D chính | y 500–1040 | — |
| Banner quà lớn | (120, 600, 800, 260) | Xuống dòng / cắt `…`, không `nowrap` |

Gỡ ô chat bên trái (vùng đó là bình luận của TikTok) và mọi dòng "Hệ thống: …".

**Chữ trong cảnh:**
- Màn LED dùng canvas 1024 × 440 (bản cũ 512 × 220); biển phòng tăng gấp đôi tương tự.
- Bảng bình luận, màn máy tính, tên bài karaoke và dòng chữ chạy quá nhỏ ở khoảng cách quay dọc. Nội dung quan trọng của chúng đã có trên HUD.

## 14. Âm thanh

- Tạo `AudioContext` ngay khi tải trang (OBS cho tự phát), không chờ cú click.
- `coSound` (hiệu ứng) và `coMusic` (nhạc tự tổng hợp theo thể loại, file mp3 trong `assets/audio/` nếu có).
- `coMusicVol` (0,35): nhạc nhỏ dưới giọng streamer.
- Giới hạn số tiếng cùng lúc (tối đa 8 tiếng hiệu ứng).

## 15. Gỡ khỏi bản LIVE, chế độ thử

**Không có trong overlay LIVE:**
- **Giao diện người chơi:** màn hình bắt đầu, WASD / chuột / cảm ứng, ví xu, hồ sơ, cửa hàng, tủ đồ, vòng quay, thưởng xem live.
- **Mini game:** bắt nhịp F, đố vui, đoán bài, dự đoán TOP 1 (sang GĐ2 dưới dạng mini show bình luận A/B/C).
- **Mạng LAN:** `net.js`, `server/server.mjs`, `Choi-game.bat`.
- **Hoạt động giả:**
  - NPC tặng quà (main.js:1873–1879)
  - NPC bình luận dưới tên người xem (main.js:1862–1872)
  - số người xem tự trôi (main.js:1855–1861)
  - NPC giành phòng
  - số 👁/❤ bịa trên biển phòng
- **Số trên biển phòng (thay thế):**
  - sân nhóm: "👥 <số fan club> · ❤ <tim buổi này>"
  - phòng có chủ: "❤ <tim của chủ phòng>"

**`?demo=1`** (nút "🧪 Bản đi dạo" trong panel mở cửa sổ riêng, không dùng cho OBS):
- Giữ vòng chơi cũ để streamer xem thử và để test: WASD, ví chỉ trong bộ nhớ, NPC tặng quà, `__creator`.
- Code ví / cửa hàng / hồ sơ chỉ còn ở nhánh demo.

**Các tham số URL khác:**
- `?win=1`: cửa sổ Edge/Chrome `--app` như Nhà Tù (mất app quá 4 giây thì tự đóng).
- `?q=low`: chất lượng thấp.
- `?debug=1`: bộ đếm.

## 16. Hiệu năng và chất lượng

| | Thường (`high`) | Thấp (`?q=low`) |
|---|---|---|
| Số điểm ảnh tối đa | 2,2 MP | 1,0 MP |
| Antialias | bật | tắt |
| Bóng | 2048 PCFSoft | 1024 PCF hoặc chỉ bóng tròn |
| Trần NPC + người xem | 160 | 100 (hàng chờ phòng tối đa 3) |
| TV trực tiếp (`coLiveTv`) | 10 fps | tắt |
| Trần nhãn | 8 / khung | 5 / khung |
| FPS | 60 | 30 |
| Đèn quét | chuyển động | đứng yên |

**Bắt buộc trong GĐ1:**
- chặn `dt` trong khoảng `[0, 0.05]` (main.js:2163)
- LabelLayer thay CSS2DRenderer
- `disposeCharacter` khi gỡ nhân vật (vòng bóng + lightstick đang rò, character.js:104/176)
- `room.fans` khoá theo userId, chỉ giữ top 50
- canvas: tắt mipmap, làm mới tối đa 4 lần mỗi giây, bỏ `shadowBlur`
- tường và sàn tĩnh không đổ bóng
- cache mảng nhân vật thay vì `concat` mỗi khung
- chỉ gọi `audio.mix` khi giá trị đổi
- trần pháo giấy và số `setTimeout` của `giftFx`

**GĐ2:**
- nhân vật 1 SkinnedMesh + bóng thay thế như Nhà Tù (khoảng 22 → 3 lệnh vẽ mỗi nhân vật)
- lưới không gian cho tách va chạm
- LOD

**`?debug=1`** hiện:
- `renderer.info` (calls, triangles, geometries, textures, programs)
- thời gian khung trung bình / p95
- số nhân vật đang vẽ, số nhãn
- số lần tải canvas mỗi giây
- heap JS lấy mẫu mỗi phút

**Đạt khi:** `renderer.info.memory` đứng yên qua soak test 1 giờ với luồng sự kiện giả `__creator.sim` (có ở `?demo=1` và ở bản LIVE khi có `?debug=1`; người xem giả có khoá bắt đầu bằng `sim` nên không vào bộ đếm fan).

## 17. Kỹ thuật

### 17.1 Thư mục `public/games/creatoronline/`

```
overlay.html            import map /games/quaivat/vendor/ (r160), font Nunito tự host (fonts/, OFL)
data.json               từ game-config.json: bỏ ví/shop/giá; thêm suggestedGiftMap, actions, hud.joinLines
creatoronline-panel.js
fonts/
js/
  game.js               vào chính: socket.io, chế độ LIVE / demo, vòng lặp
  world.js screens.js character.js npc.js effects.js audio.js   (chuyển từ bản riêng)
  labels.js             LabelLayer chép từ Nhà Tù
  director-cam.js       đặt camera theo cảnh của director.js
  hud.js                HUD 9:16 (mục 13)
  demo.js               vòng chơi cũ (WASD, ví trong bộ nhớ) — chỉ nạp khi ?demo=1
  logic/                thuần, có test
    rooms.js seats.js physics.js rng.js format.js     (có sẵn)
    population.js       chép từ Nhà Tù
    codes.js            mã bình luận: club 1–5, lệnh vai
    textfilter.js       lọc từ cấm
    events.js           gift / chat / like / social → ý định (bậc, map, lớp A/B/C)
    stage.js            12 chỗ khách / sân
    roles.js            vai MC / Kỹ thuật / Quản lý, hàng chờ, giữ chắc
    pk.js               điểm, nước rút, lật kèo, hoà, ghép cặp
    director.js         hàng cảnh quay, trần mỗi người, vòng rảnh
```

Ghi chú:
- **Three.js:**
  - Vendor r160 (`public/games/quaivat/vendor/addons/`) có `BufferGeometryUtils` và `SkeletonUtils` nhưng **không có thư mục `renderers/`**, mà code hiện tại import `CSS2DRenderer` ở 2 file.
  - Bước 1 chép `CSS2DRenderer.js` của bản r160 vào `vendor/addons/renderers/` (cộng thêm, không ảnh hưởng game khác) để `?demo=1` chạy được ngay.
  - Bản LIVE dùng LabelLayer từ bước 4; khi đó chỉ còn bản demo dùng `CSS2DRenderer`.
  - Nên so ảnh chụp `CapsuleGeometry` và bóng giữa r170 và r160.
- **Phụ thuộc Nhà Tù:**
  - Bản Nhà Tù mới (`population.js`, LabelLayer, nhân vật gộp, `disposeCharacter`) **chưa commit** trên `tuongtac/nhatu`.
  - **Chép file, không gộp nhánh**: `tuongtac/nhatu` cũng sửa `server.js`, `index.html` và `app.js`, những file mà spec này cũng sửa.
  - Chép sau khi phiên Nhà Tù commit; đầu file chép ghi mã commit nguồn.

### 17.2 Server (`server.js`)

- **Khai báo game:**
  - `GAMES.creatoronline`: `overlayPath: '/overlay/creatoronline'`, `defaultConfig` ở 17.3, `coGiftMap: creatorOnlineSuggestedGiftMap()` (đọc `data.json` giống `nhatuSuggestedGiftMap`).
  - `registry.js` bỏ `soon: true` khi vòng chơi LIVE đã chạy (cuối bước 5), không bỏ sớm hơn.
  - `/config` (server.js:5909) gộp nông `{...prev, ...incoming}` nên khoá `co*` được giữ. Riêng `coGiftMap` bị thay nguyên khối mỗi lần lưu.
- **Sửa server có sẵn:** thêm `userId` + `profilePicture` vào broadcast `like` (server.js:3878) và `social` (server.js:3892) — mục 11.
- **Route:**
  - `GET /overlay/creatoronline` → `overlay.html`
  - `POST /api/creatoronline/window/open`: chép route của Nhà Tù, giữ cờ chống ngừng vẽ, thêm tham số `?demo=1` cho Bản đi dạo
  - `/api/creatoronline/fans*` (mục 11)
- **Bộ đếm fan:** theo mục 11.
  - `creatorFans.onGift` trong `emitGift`, `creatorFans.onChat` sau `broadcast('chat')`.
  - Gắn `coFan` vào `gift` / `chat` khi ghi đang bật.
  - Phát `io.emit('creatoronline:fan', …)`.
  - Phòng socket `co-overlay` nhận `creatoronline:hello`.
- **Lệnh panel** qua route chung có sẵn `POST /api/games/creatoronline/cmd` (server.js:6761, phát `gameCmd {gameId, cmd, payload, seq}`). Body dạng `{ cmd, payload }` như Nhà Tù:
  - `{cmd:'test', payload:{kind: gift|comment|like|follow, coins?, giftId?, text?, name?}}`
  - `{cmd:'pk', payload:{a, b}}`, `{cmd:'skip'}` (bỏ cảnh hiện tại), `{cmd:'cut', payload:{target}}`, `{cmd:'reset'}`
- Route `/api/creatoronline/*` không đụng `/api/games/:id/*`.

### 17.3 Config `co*`

| Khoá | Mặc định | Ý nghĩa |
|---|---|---|
| `enabled` | true | |
| `coQuality` | `'high'` | `high` \| `low` (overlay tự tải lại `?q=low`) |
| `coMaxViewers` | 40 | 5–120 |
| `coNpcCount` | 20 | đám đông NPC khi vắng |
| `coViewerIdleMin` | 30 | |
| `coClubSwitchSec` | 60 | |
| `coStageBaseSec` / `coStagePerCoinSec` / `coStageMaxSec` | 12 / 3 / 120 | |
| `coStageSlots` | 12 | |
| `coRoomHoldSec` / `coRoomQueueMax` | 60 / 6 | |
| `coRoleSec` / `coRoleLockSec` / `coRoleMaxSec` | 180 / 45 / 300 | |
| `coPkEveryMin` | 5 | 2–15, 0 = tắt PK tự động |
| `coPkSec` / `coPkFinalSec` | 90 / 30 | `coPkSec` 60–300; `coPkFinalSec` ≤ `coPkSec / 2` |
| `coMvpMin` | 10 | |
| `coCamMaxPer5Min` | 90 | giây cảnh quay mỗi người mỗi 5 phút |
| `coTierFallback` | true | quà chưa gán chạy theo bậc xu |
| `coLikeMilestone` | 300 | |
| `coSound` / `coMusic` / `coMusicVol` | true / true / 0.35 | |
| `coLiveTv` | true | |
| `coShowGiftLegend` / `coShowJoinHint` | true / true | |
| `coBadWords` | `''` | |
| `coGiftMap` | bộ gợi ý | `{ [action]: [{ giftId, giftName, giftImage, coins }] }` |

`coMaxViewers` bị chặn ở 80 khi chất lượng thấp.

**Thông số phụ** (không hiện trong panel), đặt trong `data.json → tuning` để test và chỉnh một chỗ:

| Khoá | Giá trị | Mục |
|---|---|---|
| `stageQueueMax` / `stageMinStandSec` / `stageReGiftGapSec` | 10 / 8 / 1,5 | 4.1, 5 |
| `roleQueueMax` / `roleExtendSec` / `roleYieldSec` | 1 / 90 / 60 | 7 |
| `pkCooldownSec` / `pkRetrySec` / `activeWindowSec` | 60 / 60 / 180 | 9 |
| `gifterProtectSec` / `overflowViewers` | 300 / 20 | 3 |
| `galaSec` / `galaShortSec` / `galaMergeMaxSec` | 60 / 30 / 90 | 4.4 |
| `shotMinSec` / `shotQueueMax` / `shotStaleSec` | 8 / 6 / 45 | 12 |
| `roomFxGapSec` / `roomFxQueueMax` | 1,5 / 6 | 4.1 |
| `mcReadEverySec` / `techIdleSec` / `techAutoEverySec` / `cmdGapSec` | 20 / 10 / 8 / 3 | 7 |
| `fanKeepDays` / `fanKeepMinXu` | 180 / 100 | 11 |
| `sessionSaveSec` / `sessionRestoreMaxSec` | 2 / 300 | 11 |

### 17.4 Panel (`view-creatoronline`)

- **Liên kết:** copy link OBS (tự thêm `?q=low` khi chất lượng thấp), 🎮 Mở cửa sổ game, 🧪 Bản đi dạo.
- **Gán quà:** bảng gán quà giống Nhà Tù, nút "🎁 Dùng bộ quà gợi ý", cảnh báo quà trùng (mục 4.5).
- **Cài đặt:**
  - PK: nhịp, thời lượng, ⚔️ Mở PK ngay
  - dân số
  - chất lượng
  - âm thanh
  - TV trực tiếp
  - từ cấm
- **Nút thử:**
  - 🧪 quà 1 / 10 / 99 / 299 / 1.000 / 30.000 xu
  - bình luận `1`
  - thả tim
  - follow
- **Hỗ trợ buổi LIVE:**
  - "📌 Câu ghim": sinh câu hướng dẫn để streamer ghim bình luận TikTok
  - 🏆 Top 20 fan trọn đời + làm mới
- Ghi rõ trong panel: chỉ dùng nguồn OBS **hoặc** cửa sổ game, không dùng cả hai (mục 11).
- Gắn vào app theo đúng cách Nhà Tù đang làm:
  - nhánh mở game ở app.js:964 gọi `window.HpCreatorOnlinePanel?.open(socket)`
  - `<section id="view-creatoronline">` gần index.html:1796, thẻ script gần index.html:3058
  - CSS `.creatoronline-*` trong `style.css`
  - Game tự vào nhóm 🎮 qua `TT_CHILD_GAMES`.
  - Kiểm `applyLicenseLocks` để game mới khoá KEY giống Nhà Tù.

### 17.5 Test

- **Chuyển từ bản riêng:** `tests/creatoronline-{rooms,seats,physics}.test.mjs`.
- **Mới:** `tests/creatoronline-{codes,textfilter,events,stage,roles,pk,director,population}.test.mjs`. Kiểm:
  - bậc xu và hành động gán; quà gán ≥ 299 xu chạy thêm hiệu ứng bậc; gán trùng theo thứ tự ưu tiên
  - mưa quà x99 không vượt trần
  - mỗi người một chỗ (vai > phòng > sân); vé → `seats.claim`; mua vé lần 2 chỉ gia hạn
  - vai xếp hàng, không cướp; người giữ vai nhường sau tối đa 60 giây khi có người chờ
  - mã bình luận phải khớp cả câu ("đèn đẹp", "5 sao" không phải mã)
  - công thức PK, nước rút, "đang thua" theo từng đợt tim, hoà, `X = ⌊chênh/10⌋ + 1`, không ghép lại cặp vừa đấu, chỉ 1 PK
  - trần cảnh quay mỗi người, cảnh tối thiểu 8 giây, cảnh chờ quá 45 giây bị bỏ, Gala rút còn 30 giây khi có Gala chờ
  - không đẩy người được bảo vệ; người tặng quà vượt trần tạm tới `coMaxViewers + 20`
- **Server:** `tests/creatoronline-fans.test.js`, trong đó có bài so bộ phân tích mã club của server với `logic/codes.js`.
- `tests/app-smoke.test.js` phải qua.

## 18. Giai đoạn

### GĐ1: bản LIVE đầu tiên (commit nhỏ, theo thứ tự)

Cỡ việc: S nhỏ · M vừa · L lớn · XL rất lớn.

| Bước | Việc | Cỡ | Thử thế nào / điều kiện xong |
|---|---|---|---|
| 1 | **Chuyển code:** vendor r160 + chép `CSS2DRenderer.js` r160, font tự host, chặn `dt`, chuyển test | M | Mở `/games/creatoronline/overlay.html?demo=1` chạy như bản riêng; test cũ qua |
| 2 | **Gắn vào app:** `GAMES` + route + `data.json`; view + panel khung (link OBS, chất lượng, nút thử). Chưa bỏ `soon` | M | `app-smoke` qua; nút thử chỉ có tác dụng từ bước 4 |
| 3 | **Server:** bộ đếm fan + `userId`/`profilePicture` cho `like`/`social` + phòng `co-overlay` + API + top fan trong panel | S–M | `tests/creatoronline-fans.test.js` |
| 4 | **Logic thuần + test:** codes, textfilter, events, stage, roles, pk, director, population | L | Test viết trước code |
| 5a | **Overlay — người xem:** socket.io (`gameConfig`, `overlay:reload`, `gameDisabled/Enabled`, `gift`, `chat`, `like`, `social`, `gameCmd`, `creatoronline:fan`), người xem + club, LabelLayer, gỡ hoạt động giả | M | Nút thử trong panel; điều kiện xong: LabelLayer thay CSS2DRenderer, `disposeCharacter` |
| 5b | **Overlay — HUD 9:16** | M | Ảnh chụp 1080×1920 |
| 5c | **Overlay — đạo diễn camera** | M | `?debug=1` hiện cảnh đang quay |
| 5d | **Overlay — âm thanh theo cảnh** | S | |
| 6a | **Quà:** lên sân khấu + bậc 1–2 | M | Điều kiện xong: `room.fans` khoá theo `fanKey`, trần pháo giấy / `giftFx` |
| 6b | **Phòng mang tên + vé** | M | |
| 6c | **Vai + lệnh bình luận** | M | |
| 6d | **Sự kiện lớn bậc 5–7** | M | |
| 6e | **PK + lưu trạng thái buổi LIVE** (localStorage, mục 11); xong thì bỏ `soon: true` | M | |
| 7 | **Hiệu năng:** các mục còn lại của mục 16, `?q=low`, `?debug=1` | M | Soak test 1 giờ: `renderer.info.memory` đứng yên |
| 8 | **Hoàn thiện:** panel đủ (bảng gán quà, cảnh báo trùng, câu ghim), đoạn mô tả trong CLAUDE.md, thử OBS thật + một buổi LIVE thử (chụp ảnh điện thoại để chỉnh vùng an toàn) | L | Phần lớn là thời gian thử thật |

### GĐ2

- **PK:** PK chia đôi màn hình (2 khung 9:8, gắn với chất lượng); chung kết cuối giờ (:55); giờ vàng 3 phút điểm ×2.
- **Mini show trong phòng của chủ phòng** (bình luận A/B/C): đố vui (phòng đứng), dự đoán TOP 1 (phòng game), đoán bài (phòng hát). Đúng được điểm bảng xếp hạng.
- **Thử thách sân khấu** khi chỉ có 1 club hoạt động.
- **Phím tắt đạo diễn** qua relay `creatoronline:key`: cắt sân 1–5, mở PK, bỏ cảnh.
- **Quà:** sự kiện "tick" cho từng nhịp combo (chỉ hiện hình); giành quà giữa các game Tương Tác.
- **Hiệu năng:** nhân vật SkinnedMesh gộp, lưới không gian, LOD.
- **HUD gọn** khi streamer vào PK hoặc multi-guest thật của TikTok.

### GĐ3

- Vòng quay **chỉ làm phần thưởng trang trí cho MVP PK**, không bao giờ để quà → giải ngẫu nhiên.
- Mốc tim lớn của cả tòa nhà → 5 nhóm cùng nhảy một điệu tại sân của mình. Không cắt cảnh và không phải Gala, vì mốc tim không bao giờ cho cảnh quay (mục 10).
- Ô hình-trong-hình quay fan của người tặng (dùng lại render target TV trực tiếp).
- Đại sứ phòng (top fan tuần lên biển).

## 19. Rủi ro và việc cần kiểm

- **Mã quà:** quà khác nhau theo khu vực. Mã trong bộ gợi ý lấy từ kho quà máy dev; panel phải cho đổi dễ.
- **Vùng an toàn** là ước lượng; chỉnh theo ảnh chụp điện thoại thật.
- **Âm thanh trong OBS:** kiểm tra tự phát trong nguồn trình duyệt OBS và trong cửa sổ `--app`.
- **Quá tải cơ chế:** bảng chú giải chỉ 6 dòng. Vai, phòng và PK được giải thích bằng cảnh quay chứ không bằng chữ.
- **Dữ liệu cá nhân:** bộ đếm fan lưu TikTok ID + tên + xu trên máy streamer; có nút làm mới trong panel.
- **Quy định TikTok:** không có quà nào đổi lấy giải ngẫu nhiên.
