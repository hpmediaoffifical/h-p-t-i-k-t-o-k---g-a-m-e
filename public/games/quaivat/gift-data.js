/* 🧟 Zombie Phá Nhà — bảng quà dùng chung cho game (game.js) và bảng quà OBS riêng (gifts.html).
   opt: true = chưa gắn sẵn tên quà TikTok → chỉ hiện trên bảng khi đã gán quà trong app. */
// Quà của người xem → bẫy / vật cản / đồng minh chống lại quái
export const VILLAINS = [
  { names: ['rose', 'hoa hồng'],                   action: 'rose',    emoji: '🌹', gift: 'Hoa hồng',  label: 'Khoai lăn / thùng gỗ', coins: 1 },
  { names: ['lollipop', 'kẹo mút'],               action: 'xbarrel', emoji: '🛢️', gift: 'Kẹo mút',   label: 'Thùng thuốc nổ',     coins: 1 },
  { names: ['tiktok'],                             action: 'trap',    emoji: '🎵', gift: 'TikTok',    label: 'Bẫy kẹp',            coins: 1 },
  { names: ['gg'],                                 action: 'plant',   emoji: '🌱', gift: 'GG',        label: 'Cây bắn đậu',        coins: 1 },
  { names: ['ice cream cone', 'ice cream', 'kem'], action: 'slime',   emoji: '🍦', gift: 'Kem',       label: 'Vũng keo dính',      coins: 1 },
  { names: ['finger heart', 'bắn tim'],            action: 'repair',  emoji: '🫰', gift: 'Bắn tim',   label: 'Sửa cửa +150',       coins: 5 },
  { names: ['perfume', 'nước hoa'],                action: 'fox',     emoji: '🦊', gift: 'Nước hoa',  label: 'Cáo cắn quái',       coins: 20 },
  { names: ['doughnut', 'donut', 'bánh vòng'],     action: 'mine',    emoji: '💥', gift: 'Bánh vòng', label: 'Chôn 3 mìn đất',      coins: 30 },
  { names: ['tiny diny', 'khủng long nhỏ'],        action: 'flower',  emoji: '🌸', gift: 'Tiny Diny', label: 'Hoa gió thổi lùi',   coins: 10 },
  { names: ['paper crane', 'hạc giấy', 'confetti', 'sunglasses', 'kính râm', 'hat and mustache'], action: 'lightning', emoji: '⚡', gift: 'Hạc giấy', label: 'Sét đánh cháy đen', coins: 99 },
  { names: ['hand hearts', 'tay trái tim'],        action: 'balloon', emoji: '🎈', gift: 'Tay trái tim', label: 'Bóng bay kéo về',  coins: 100 },
  { names: ['corgi', 'money gun', 'galaxy', 'lion', 'universe', 'tiktok universe'], action: 'boulder', emoji: '🪨', gift: 'Corgi+', label: 'Tảng đá khổng lồ', coins: 299 },
  // bẫy mới: chưa gắn sẵn quà nào → gán trong app (hoặc quà lạ rơi vào theo giá xu)
  { names: [], opt: true, action: 'banana', emoji: '🍌', gift: 'Vỏ chuối',     label: 'Trượt ngã lộn ngược', coins: 1 },
  { names: [], opt: true, action: 'net',    emoji: '🕸️', gift: 'Lưới',         label: 'Trói 2.5 giây',       coins: 5 },
  { names: [], opt: true, action: 'bees',   emoji: '🐝', gift: 'Đàn ong',      label: 'Ong bay ra chích',    coins: 10 },
  { names: [], opt: true, action: 'crows',  emoji: '🐦', gift: 'Đàn quạ',      label: 'Quạ lao xuống mổ',    coins: 20 },
  { names: [], opt: true, action: 'meteor', emoji: '☄️', gift: 'Thiên thạch',  label: 'Mưa 5 thiên thạch',   coins: 199 },
  { names: [], opt: true, action: 'hand',   emoji: '🫳', gift: 'Bàn tay khổng lồ', label: 'Tóm ném về mốc',  coins: 499 },
  { names: [], opt: true, action: 'lose',   emoji: '💀', gift: 'THUA ngay',    label: 'Zombie chết tại chỗ, về xuất phát', coins: 0 },
  { names: [], opt: true, action: 'quake',  emoji: '🌋', gift: 'Động đất',     label: 'THẢM HỌA: đẩy lùi + chắn đường', coins: 999 },
];
// Quà hỗ trợ quái (streamer) — đổi tên quà tùy ý
export const HEROES = [
  { names: [], opt: true, action: 'win', emoji: '🏆', gift: 'WIN ngay', label: 'Vào nhà ăn não luôn', coins: 0 },
  { names: ['heart me'],                             action: 'shoes', emoji: '👟', gift: 'Heart Me',  label: 'Giày tốc độ',  coins: 1 },
  { names: ['friendship necklace', 'vòng cổ'],       action: 'shield', emoji: '🚪', gift: 'Vòng cổ',  label: 'Khiên cửa (chặn 8 đòn)', coins: 10 },
  { names: ['rosa', 'hoa hồng nhung'],               action: 'time',  emoji: '⏳', gift: 'Rosa',      label: '+20 giây cho quái', coins: 10 },
];
export const SOCIAL = [
  { emoji: '❤️', gift: 'Thả tim', label: 'Ném sỏi' },
  { emoji: '💬', gift: 'Bình luận', label: 'Ném dép' },
  { emoji: '➕', gift: 'Follow', label: 'Hàng rào gỗ' },
  { emoji: '↗️', gift: 'Chia sẻ', label: 'Bom hẹn giờ' },
];
