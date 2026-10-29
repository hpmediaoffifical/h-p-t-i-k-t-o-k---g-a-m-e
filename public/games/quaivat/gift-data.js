/* 🧟 Zombie Phá Nhà — bảng quà dùng chung cho game (game.js) và bảng quà OBS riêng (gifts.html).
   opt: true = chưa gắn sẵn tên quà TikTok → chỉ hiện trên bảng khi đã gán quà trong app. */
// Quà của người xem → bẫy / vật cản / đồng minh chống lại quái
export const VILLAINS = [
  { names: ['rose', 'hoa hồng'],                   action: 'rose',    emoji: '🌹', gift: 'Hoa hồng',  label: 'Khoai lăn', coins: 1 },
  { names: ['lollipop', 'kẹo mút'],               action: 'xbarrel', emoji: '🛢️', gift: 'Kẹo mút',   label: 'Thùng phình',     coins: 1 },
  { names: ['tiktok'],                             action: 'trap',    emoji: '🎵', gift: 'TikTok',    label: 'Bẫy kẹp',            coins: 1 },
  { names: ['gg'],                                 action: 'plant',   emoji: '🌱', gift: 'GG',        label: 'Cây bắn đậu',        coins: 1 },
  { names: ['ice cream cone', 'ice cream', 'kem'], action: 'slime',   emoji: '🍦', gift: 'Kem',       label: 'Keo dính',      coins: 1 },
  { names: ['finger heart', 'bắn tim'],            action: 'repair',  emoji: '🫰', gift: 'Bắn tim',   label: 'Sửa cửa',       coins: 5 },
  { names: ['perfume', 'nước hoa'],                action: 'fox',     emoji: '🦊', gift: 'Nước hoa',  label: 'Cáo đuổi',       coins: 20 },
  { names: ['doughnut', 'donut', 'bánh vòng'],     action: 'mine',    emoji: '💥', gift: 'Bánh vòng', label: 'Bẫy bật',      coins: 30 },
  { names: ['tiny diny', 'khủng long nhỏ'],        action: 'flower',  emoji: '🌸', gift: 'Tiny Diny', label: 'Hoa gió',   coins: 10 },
  { names: ['paper crane', 'hạc giấy', 'confetti', 'sunglasses', 'kính râm', 'hat and mustache'], action: 'lightning', emoji: '⚡', gift: 'Hạc giấy', label: 'Sấm sét', coins: 99 },
  { names: ['hand hearts', 'tay trái tim'],        action: 'balloon', emoji: '🎈', gift: 'Tay trái tim', label: 'Bóng bay',  coins: 100 },
  { names: ['corgi', 'money gun', 'galaxy', 'lion', 'universe', 'tiktok universe'], action: 'boulder', emoji: '🪨', gift: 'Corgi+', label: 'Đá lăn', coins: 299 },
  // bẫy mới: chưa gắn sẵn quà nào → gán trong app (hoặc quà lạ rơi vào theo giá xu)
  { names: [], opt: true, action: 'banana', emoji: '🍌', gift: 'Vỏ chuối',     label: 'Vỏ chuối', coins: 1 },
  { names: [], opt: true, action: 'net',    emoji: '🕸️', gift: 'Lưới',         label: 'Ném lưới',       coins: 5 },
  { names: [], opt: true, action: 'bees',   emoji: '🐝', gift: 'Đàn ong',      label: 'Đàn ong',    coins: 10 },
  { names: [], opt: true, action: 'crows',  emoji: '🐦', gift: 'Đàn quạ',      label: 'Đàn quạ',    coins: 20 },
  { names: [], opt: true, action: 'meteor', emoji: '☄️', gift: 'Thiên thạch',  label: 'Mưa thiên thạch',   coins: 199 },
  { names: [], opt: true, action: 'hand',   emoji: '🫳', gift: 'Bàn tay khổng lồ', label: 'Bàn tay khổng lồ',  coins: 499 },
  { names: [], opt: true, action: 'lose',   emoji: '💀', gift: 'THUA ngay',    label: 'THUA NGAY', coins: 0 },
  { names: [], opt: true, action: 'quake',  emoji: '🌋', gift: 'Động đất',     label: 'Động đất', coins: 999 },
];
// Quà hỗ trợ quái (streamer) — đổi tên quà tùy ý
export const HEROES = [
  { names: [], opt: true, action: 'win', emoji: '🏆', gift: 'WIN ngay', label: 'WIN NGAY', coins: 0 },
  { names: ['heart me'],                             action: 'shoes', emoji: '👟', gift: 'Heart Me',  label: 'Tăng tốc',  coins: 1 },
  { names: ['friendship necklace', 'vòng cổ'],       action: 'shield', emoji: '🚪', gift: 'Vòng cổ',  label: 'Khiên chắn', coins: 10 },
  { names: ['rosa', 'hoa hồng nhung'],               action: 'time',  emoji: '⏳', gift: 'Rosa',      label: '+20 giây', coins: 10 },
];
export const SOCIAL = [
  { emoji: '❤️', gift: 'Thả tim', label: 'Ném đá' },
  { emoji: '💬', gift: 'Bình luận', label: 'Ném dép' },
  { emoji: '➕', gift: 'Follow', label: 'Hàng rào' },
  { emoji: '↗️', gift: 'Chia sẻ', label: 'Pháo hẹn giờ' },
];
