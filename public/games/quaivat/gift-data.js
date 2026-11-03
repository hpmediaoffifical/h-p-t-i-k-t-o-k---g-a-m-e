/* 🧟 Zombie Phá Nhà — bảng quà dùng chung cho game (game.js) và bảng quà OBS riêng (gifts.html).
   Mỗi hành động gắn sẵn 1 quà TikTok THẬT: `ids` = giftId TikTok (ổn định, khớp trước), `names` = tên (Anh + Việt, chữ thường)
   để khớp khi sự kiện không có id. Ảnh quà lấy từ danh sách quà của app (/api/gifts) theo id.
   coins = giá quà (xu) — quà đắt hơn giá này thì chạy đủ theo xu thật (logic.js giftRuns).
   opt: true = không gắn sẵn (WIN/THUA ngay) → chỉ hiện khi streamer gán trong app. */
// Quà của người xem → bẫy / vật cản / đồng minh chống lại zombie
export const VILLAINS = [
  { ids: [5655],  names: ['rose', 'hoa hồng'],                               action: 'rose',      emoji: '🌹', gift: 'Hoa hồng',      label: 'Khoai lăn',       coins: 1 },
  { ids: [6788],  names: ['que phát sáng', 'glow stick', 'lollipop', 'kẹo mút'], action: 'xbarrel', emoji: '🛢️', gift: 'Que phát sáng', label: 'Thùng phình',     coins: 1 },
  { ids: [5269],  names: ['tiktok'],                                         action: 'trap',      emoji: '🎵', gift: 'TikTok',        label: 'Bẫy kẹp',         coins: 1 },
  { ids: [6064],  names: ['gg'],                                             action: 'plant',     emoji: '🌱', gift: 'GG',            label: 'Cây bắn đậu',     coins: 1 },
  { ids: [5827],  names: ['kem ốc quế', 'ice cream cone', 'ice cream', 'kem'], action: 'slime',   emoji: '🍦', gift: 'Kem ốc quế',    label: 'Keo dính',        coins: 1 },
  { ids: [9340],  names: ['bánh sinh nhật', 'birthday cake'],                action: 'barrel',    emoji: '🪵', gift: 'Bánh sinh nhật', label: 'Thùng gỗ',       coins: 1 },
  { ids: [15232], names: ['đỉnh', 'top'],                                    action: 'banana',    emoji: '🍌', gift: 'Đỉnh',          label: 'Vỏ chuối',        coins: 1 },
  { ids: [7412],  names: ['bing chilling'],                                 action: 'icepea',    emoji: '🧊', gift: 'Bing Chilling', label: 'Đậu băng',        coins: 5 },
  { ids: [10961], names: ['quả đào', 'peach'],                               action: 'jackfruit', emoji: '🍈', gift: 'Quả đào',       label: 'Trái mít chắn',   coins: 5 },
  { ids: [6890],  names: ['yêu bạn', 'i love you'],                         action: 'cabbage',   emoji: '🥬', gift: 'Yêu bạn',       label: 'Bắp cải ném',     coins: 1 },
  { ids: [19438], names: ['pop'],                                            action: 'mushroom',  emoji: '🍄', gift: 'Pop',           label: 'Nấm phun khói',   coins: 1 },
  { ids: [19445], names: ['xướng tên'],                                      action: 'sunflower', emoji: '🌻', gift: 'Xướng tên',     label: 'Hoa hướng dương', coins: 5 },
  { ids: [19447], names: ['phản ứng quá lố'],                                action: 'garlic',    emoji: '🧄', gift: 'Phản ứng quá lố', label: 'Tỏi',           coins: 5 },
  { ids: [1137734], names: ["i'm yours"],                                    action: 'cactus',    emoji: '🌵', gift: "I'm Yours",     label: 'Xương rồng gai',  coins: 10 },
  { ids: [5487],  names: ['bắn tim', 'finger heart'],                        action: 'repair',    emoji: '🫰', gift: 'Bắn tim',       label: 'Sửa cửa',         coins: 5 },
  { ids: [8635],  names: ['ok'],                                             action: 'net',       emoji: '🕸️', gift: 'OK',            label: 'Ném lưới',        coins: 5 },
  { ids: [9875],  names: ['cỏ bốn lá', 'four-leaf clover', 'tiny diny', 'khủng long nhỏ'], action: 'flower', emoji: '🌸', gift: 'Cỏ bốn lá', label: 'Hoa gió', coins: 10 },
  { ids: [8825],  names: ['chú heo may mắn', 'lucky pig'],                   action: 'mystery',   emoji: '🎁', gift: 'Chú heo may mắn', label: 'Túi mù',        coins: 10 },
  { ids: [10138], names: ['cà phê phin', 'vietnamese coffee'],               action: 'bees',      emoji: '🐝', gift: 'Cà phê phin',   label: 'Đàn ong',         coins: 10 },
  { ids: [19443], names: ['hoan hô!', 'hoan hô', 'cheer you up'],            action: 'crows',     emoji: '🐦', gift: 'Hoan hô!',      label: 'Đàn quạ',         coins: 15 },
  { ids: [17465], names: ['little kisses', 'nụ hôn nhỏ'],                  action: 'dog',       emoji: '🐕', gift: 'little kisses', label: 'Chó giữ nhà',     coins: 20 },
  { ids: [5658],  names: ['nước hoa', 'perfume'],                            action: 'fox',       emoji: '🦊', gift: 'Nước hoa',      label: 'Cáo đuổi',        coins: 20 },
  { ids: [5879],  names: ['bánh vòng', 'doughnut', 'donut'],                 action: 'mine',      emoji: '🍩', gift: 'Bánh vòng',     label: 'Bẫy bật',         coins: 30 },
  { ids: [17044], names: ['takoyaki'],                                      action: 'squash',    emoji: '🎃', gift: 'Takoyaki',      label: 'Bí đỏ đè',        coins: 88 },
  { ids: [5659],  names: ['hạc giấy', 'paper crane', 'sunglasses', 'kính râm'], action: 'lightning', emoji: '⚡', gift: 'Hạc giấy', label: 'Sấm sét', coins: 99 },
  { ids: [5585],  names: ['pháo hoa giấy', 'confetti'],                     action: 'chili',     emoji: '🌶️', gift: 'Pháo hoa giấy', label: 'Ớt hiểm',         coins: 100 },
  { ids: [6766],  names: ['bó hoa', 'bouquet'],                              action: 'chomper',   emoji: '🪴', gift: 'Bó hoa',        label: 'Cây nắp ấm',      coins: 100 },
  { ids: [13464], names: ['sao đêm', 'night star'],                          action: 'meteor',    emoji: '☄️', gift: 'Sao đêm',       label: 'Mưa thiên thạch', coins: 199 },
  { ids: [6267],  names: ['chó corgi', 'corgi', 'money gun', 'súng bắn tiền', 'galaxy', 'thiên hà', 'lion', 'universe', 'tiktok universe'], action: 'boulder', emoji: '🪨', gift: 'Chó Corgi', label: 'Đá lăn', coins: 299 },
  { ids: [5731],  names: ['san hô', 'coral'],                                action: 'hand',      emoji: '🫳', gift: 'San hô',        label: 'Bàn tay khổng lồ', coins: 499 },
  { ids: [5978],  names: ['tàu hỏa', 'train'],                               action: 'quake',     emoji: '🌋', gift: 'Tàu hỏa',       label: 'Động đất',        coins: 899 },
  { names: [], opt: true, action: 'lose', emoji: '💀', gift: 'THUA ngay', label: 'THUA NGAY', coins: 0 },
];
// Quà giúp zombie (fan của streamer)
export const HEROES = [
  { ids: [7934],  names: ['thả tim cho tôi', 'heart me'],                    action: 'shoes',     emoji: '👟', gift: 'Thả tim cho tôi', label: 'Tăng tốc',      coins: 1 },
  { ids: [544253], names: ['nhìn là mê'],                                  action: 'pug',       emoji: '🐶', gift: 'Nhìn là mê',    label: 'Cún gỡ bẫy',      coins: 10 },
  { ids: [9947],  names: ['vòng cổ tình bạn', 'friendship necklace', 'vòng cổ'], action: 'shield', emoji: '🚪', gift: 'Vòng cổ tình bạn', label: 'Khiên chắn',   coins: 10 },
  { ids: [8913],  names: ['rosa', 'hoa hồng nhung'],                         action: 'time',      emoji: '⏳', gift: 'Rosa',          label: '+20 giây',        coins: 10 },
  { ids: [19448], names: ['chuyển động chậm', 'slow motion'],               action: 'vault',     emoji: '🤸', gift: 'Chuyển động chậm', label: 'Nhảy sào',     coins: 10 },
  { ids: [231958], names: ['mind blown'],                                   action: 'icecart',   emoji: '🧊', gift: 'Mind Blown',    label: 'Xe đá bào',       coins: 10 },
  { ids: [51281], names: ['dj vinyl'],                                       action: 'outfit',    emoji: '👕', gift: 'DJ Vinyl',      label: 'Đổi đồ',          coins: 10 },
  { ids: [13087], names: ['kẹo cao su thổi bong bóng', 'bubble gum'],        action: 'thrower',   emoji: '🦍', gift: 'Kẹo cao su thổi bong bóng', label: 'Khổng lồ ném', coins: 99 },
  { ids: [17666], names: ['gia đình', 'family'],                             action: 'minions',   emoji: '🧟', gift: 'Gia đình',      label: 'Zombie con',      coins: 90 },
  { ids: [6097],  names: ['vương miện nhỏ', 'mini crown'],                   action: 'armor',     emoji: '🛡️', gift: 'Vương miện nhỏ', label: 'Giáp vàng',     coins: 99 },
  { ids: [6104],  names: ['mũ lưỡi trai', 'cap'],                           action: 'digger',    emoji: '⛏️', gift: 'Mũ lưỡi trai',  label: 'Đào hầm',         coins: 99 },
  { ids: [12316], names: ['hộp quà bóng bay', 'balloon gift box', 'hand hearts', 'tay trái tim'], action: 'balloon', emoji: '🎈', gift: 'Hộp quà bóng bay', label: 'Bóng bay cứu', coins: 100 },
  { ids: [6007],  names: ['găng tay đấm bốc', 'boxing gloves'],              action: 'fist',      emoji: '👊', gift: 'Găng tay đấm bốc', label: 'Nắm đấm vàng', coins: 299 },
  { ids: [15064], names: ['mũ đua xe', 'racing helmet'],                     action: 'dozer',     emoji: '🚜', gift: 'Mũ đua xe',     label: 'Xe ủi',           coins: 500 },
  { names: [], opt: true, action: 'win', emoji: '🏆', gift: 'WIN ngay', label: 'WIN NGAY', coins: 0 },
];
export const SOCIAL = [
  { emoji: '❤️', gift: 'Thả tim', label: 'Ném đá' },
  { emoji: '💬', gift: 'Bình luận', label: 'Ném dép' },
  { emoji: '➕', gift: 'Follow', label: 'Hàng rào' },
  { emoji: '↗️', gift: 'Chia sẻ', label: 'Pháo hẹn giờ' },
];
