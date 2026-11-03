# Tham khảo mã nguồn mở trên GitHub

Rà soát ngày 2026-11-02 bằng `gh search repos`, `gh search code`, `gh repo view` và `gh api`. Không clone hay chạy code nào. Số sao và ngày push lấy tại thời điểm rà soát.

## Kết luận

- Chưa có repo mã nguồn mở nào làm đúng ý tưởng này: thế giới xã hội 3D chibi, chủ đề nhà tù, chạy trên trình duyệt.
- Tìm code chính xác "Nhà Tù Online" và "nha tu online" không ra kết quả.
- Repo "Prison Life" của Roblox trên GitHub hầu hết là script hack, không dùng được.
- Hướng thực tế: ghép các phần từ nhiều nguồn (netcode, điều khiển nhân vật, bảng tên, AI lịch sinh hoạt).

## A. Game chủ đề nhà tù

| Repo | Sao | Công nghệ | License | Dùng được gì |
|---|---|---|---|---|
| [Troublez905/Inside-the-Walls](https://github.com/Troublez905/Inside-the-Walls) | 1 | Unity / C# | GPL-3.0 | Ý tưởng "một ngày trong tù", NPC giữ lịch sinh hoạt. Đang tiền sản xuất. |
| [sandoche/BreakingOut-website](https://github.com/sandoche/BreakingOut-website) | 6 | PHP (2007) | MIT | Ý tưởng chỉ số và kinh tế trong tù. Code cũ. |
| [o0-James-0o/webgl-prison-island](https://github.com/o0-James-0o/webgl-prison-island) | 1 | WebGL | Không có | Chỉ xem bố cục, không được chép code. |
| [srichs/prison-world](https://github.com/srichs/prison-world) | 0 | WebGL | MIT | Mô hình nhà tù đơn giản. Giá trị thấp. |

## B. Thế giới xã hội 3D và multiplayer trên trình duyệt

| Repo | Sao | Công nghệ | License | Dùng được gì |
|---|---|---|---|---|
| [colyseus/colyseus](https://github.com/colyseus/colyseus) | 7504 | TypeScript / Node | MIT | Server multiplayer theo phòng, nên dùng khi cần ~100 người. |
| [iErcann/NotBlox](https://github.com/iErcann/NotBlox) | 186 | Three.js + Rapier | MIT | Kiến trúc netcode, nội suy, nạp hoạt động bằng script. |
| [tech-leads-club/nj-mmo](https://github.com/tech-leads-club/nj-mmo) | 35 | Three.js + Colyseus + SQLite | MIT | Stack gần nhất với game này. |
| [JMRussas/cozy-creatures](https://github.com/JMRussas/cozy-creatures) | 0 | R3F + Socket.io | MIT | Phòng chủ đề, chỗ ngồi, chat có lọc từ, cửa hàng skin. |
| [wass08/r3f-sims-online-final](https://github.com/wass08/r3f-sims-online-final) | 45 | R3F + Socket.io | Không có | Chỉ đọc để học. |
| [openhotel/openhotel](https://github.com/openhotel/openhotel) | 117 | Deno + PixiJS | CC BY-NC-SA 4.0 | Mô hình phòng và bạn bè kiểu Habbo. Cấm thương mại. |
| [workadventure/workadventure](https://github.com/workadventure/workadventure) | 5905 | TypeScript, Phaser | AGPL-3.0 + Commons Clause | Chat theo khoảng cách, scripting bản đồ. Hạn chế bán. |
| [Quackster/Kepler](https://github.com/Quackster/Kepler) | 334 | Java | AGPL-3.0 | Mô hình dữ liệu Habbo. Tài sản gốc có bản quyền. |
| [solero/houdini](https://github.com/solero/houdini) | 429 | Python | MIT | Mô hình dữ liệu Club Penguin. Tài sản gốc có bản quyền. |

Đáng xem thêm: [orion3dgames/t5c](https://github.com/orion3dgames/t5c) (Babylon.js + Colyseus, MIT), [hyperfy-xyz/hyperfy](https://github.com/hyperfy-xyz/hyperfy) (GPL-3.0).

## C. Điều khiển nhân vật, bảng tên, AI lịch sinh hoạt

| Repo | Sao | License | Dùng được gì |
|---|---|---|---|
| [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl) | 811 | MIT | Điều khiển nhân vật dựa trên vật lý cho R3F. |
| [hh-hang/three-player-controller](https://github.com/hh-hang/three-player-controller) | 312 | MIT | Bản cho Three.js thuần. |
| [pmndrs/drei](https://github.com/pmndrs/drei) | 10113 | MIT | `Html`, `Billboard`, `Text` cho bảng tên. |
| [protectwise/troika](https://github.com/protectwise/troika) | 1985 | MIT | Chữ SDF sắc nét trong 3D. |
| [Mugen87/yuka](https://github.com/Mugen87/yuka) | 1461 | MIT | FSM, steering, navmesh cho NPC và quản giáo. |
| [a16z-infra/ai-town](https://github.com/a16z-infra/ai-town) | 10739 | MIT | NPC sống theo kế hoạch và trò chuyện. |

## D. Game web của người Việt cùng kiểu "X Online"

Tất cả đều không có license, nên chỉ đọc để học, không chép code.

- [giabao841991-droid/di-chua-online-3d.](https://github.com/giabao841991-droid/di-chua-online-3d.): Node + WebSocket, một phòng 3D chung, chọn nhân vật và trang phục. Gần thể loại nhất.
- [minhkieu702/pho-viet-online](https://github.com/minhkieu702/pho-viet-online): Three.js, phòng tối đa 8 người.
- [luyentm/pntt](https://github.com/luyentm/pntt): ARPG web chibi low-poly.
- [HoangTran0410/gamehub24](https://github.com/HoangTran0410/gamehub24): Socket.IO, phòng và chat.
