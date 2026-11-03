/* 🛵 Đường Về Quê — tuyến Mũi Cà Mau → Cột cờ Lũng Cú (Hà Giang) qua đủ 34 tỉnh, thành sau sắp xếp
 * (Nghị quyết 202/2025/QH15: 28 tỉnh + 6 thành phố). `old` = các tỉnh cũ đã gộp vào, hiện trên biển chào để người xem
 * quê ở tỉnh cũ vẫn thấy tên quê mình. `biome` quyết định cảnh vẽ (game.js), `lm` = kiểu công trình mốc vẽ riêng.
 * Thứ tự đi từ Nam ra Bắc; mỗi tỉnh chiếm 1/34 quãng đường.
 *   delta    miệt vườn sông nước (dừa, ghe xuồng, nhà sàn ven sông)
 *   fields   đồng bằng lúa
 *   city     thành phố
 *   highland cao nguyên (thông, cà phê, đất đỏ bazan, nhà rông)
 *   coast    biển (cát, phi lao, thuyền, hải đăng)
 *   heritage cố đô (thành quách, sen, đèn lồng)
 *   karst    núi đá vôi (tháp đá, sông, thuyền nan)
 *   mountain núi cao (ruộng bậc thang, nhà sàn, hoa mận / đào)
 */
export const ROUTE = [
  { name: 'Cà Mau',      old: ['Bạc Liêu'],                     lm: 'mui',        biome: 'delta',    landmark: 'Mũi Cà Mau',              icon: '🚩' },
  { name: 'Cần Thơ',     old: ['Sóc Trăng', 'Hậu Giang'],       lm: 'market',     biome: 'delta',    landmark: 'Chợ nổi Cái Răng',        icon: '🛶' },
  { name: 'An Giang',    old: ['Kiên Giang'],                   lm: 'hill',       biome: 'delta',    landmark: 'Núi Sam · Phú Quốc',      icon: '🏝️' },
  { name: 'Đồng Tháp',   old: ['Tiền Giang'],                   lm: 'lotus',      biome: 'delta',    landmark: 'Đồng sen Tháp Mười',      icon: '🪷' },
  { name: 'Vĩnh Long',   old: ['Bến Tre', 'Trà Vinh'],          lm: 'coconut',    biome: 'delta',    landmark: 'Xứ dừa Bến Tre',          icon: '🥥' },
  { name: 'Tây Ninh',    old: ['Long An'],                      lm: 'hill',       biome: 'fields',   landmark: 'Núi Bà Đen',              icon: '⛰️' },
  { name: 'TP. Hồ Chí Minh', old: ['Bình Dương', 'Bà Rịa – Vũng Tàu'], lm: 'tower81', biome: 'city', landmark: 'Landmark 81 · Chợ Bến Thành', icon: '🏙️' },
  { name: 'Đồng Nai',    old: ['Bình Phước'],                   lm: 'forest',     biome: 'highland', landmark: 'Rừng Nam Cát Tiên',       icon: '🌳' },
  { name: 'Lâm Đồng',    old: ['Đắk Nông', 'Bình Thuận'],       lm: 'pine',       biome: 'highland', landmark: 'Đà Lạt · Hồ Xuân Hương',  icon: '🌲' },
  { name: 'Khánh Hòa',   old: ['Ninh Thuận'],                   lm: 'lighthouse', biome: 'coast',    landmark: 'Biển Nha Trang',          icon: '🏖️' },
  { name: 'Đắk Lắk',     old: ['Phú Yên'],                      lm: 'nharong',    biome: 'highland', landmark: 'Cà phê Buôn Ma Thuột',    icon: '☕' },
  { name: 'Gia Lai',     old: ['Bình Định'],                    lm: 'nharong',    biome: 'highland', landmark: 'Biển Hồ Pleiku',          icon: '🏞️' },
  { name: 'Quảng Ngãi',  old: ['Kon Tum'],                      lm: 'lighthouse', biome: 'coast',    landmark: 'Đảo Lý Sơn',              icon: '🧄' },
  { name: 'Đà Nẵng',     old: ['Quảng Nam'],                    lm: 'bridge',     biome: 'city',     landmark: 'Cầu Rồng · Hội An',       icon: '🐉' },
  { name: 'Huế',         old: [],                               lm: 'gate',       biome: 'heritage', landmark: 'Đại Nội · sông Hương',    icon: '🏯' },
  { name: 'Quảng Trị',   old: ['Quảng Bình'],                   lm: 'cave',       biome: 'karst',    landmark: 'Phong Nha – Kẻ Bàng',     icon: '🦇' },
  { name: 'Hà Tĩnh',     old: [],                               lm: 'none',       biome: 'fields',   landmark: 'Ngã ba Đồng Lộc',         icon: '🌾' },
  { name: 'Nghệ An',     old: [],                               lm: 'none',       biome: 'fields',   landmark: 'Làng Sen quê Bác',        icon: '🪷' },
  { name: 'Thanh Hóa',   old: [],                               lm: 'lighthouse', biome: 'coast',    landmark: 'Biển Sầm Sơn',            icon: '🏖️' },
  { name: 'Ninh Bình',   old: ['Hà Nam', 'Nam Định'],           lm: 'none',       biome: 'karst',    landmark: 'Tràng An',                icon: '🛶' },
  { name: 'Hưng Yên',    old: ['Thái Bình'],                    lm: 'none',       biome: 'fields',   landmark: 'Nhãn lồng · Phố Hiến',    icon: '🌾' },
  { name: 'Hải Phòng',   old: ['Hải Dương'],                    lm: 'port',       biome: 'city',     landmark: 'Cảng Hải Phòng',          icon: '⚓' },
  { name: 'Quảng Ninh',  old: [],                               lm: 'bay',        biome: 'karst',    landmark: 'Vịnh Hạ Long',            icon: '⛵' },
  { name: 'Bắc Ninh',    old: ['Bắc Giang'],                    lm: 'none',       biome: 'fields',   landmark: 'Quan họ · vải thiều',     icon: '🎶' },
  { name: 'Hà Nội',      old: [],                               lm: 'lake',       biome: 'city',     landmark: 'Hồ Gươm · Tháp Rùa',      icon: '🐢' },
  { name: 'Phú Thọ',     old: ['Vĩnh Phúc', 'Hòa Bình'],        lm: 'temple',     biome: 'mountain', landmark: 'Đền Hùng',                icon: '🛕' },
  { name: 'Sơn La',      old: [],                               lm: 'none',       biome: 'mountain', landmark: 'Cao nguyên Mộc Châu',     icon: '🌸' },
  { name: 'Điện Biên',   old: [],                               lm: 'none',       biome: 'mountain', landmark: 'Đồi A1 · Mường Thanh',    icon: '🎖️' },
  { name: 'Lai Châu',    old: [],                               lm: 'none',       biome: 'mountain', landmark: 'Đèo Ô Quy Hồ',            icon: '🏔️' },
  { name: 'Lào Cai',     old: ['Yên Bái'],                      lm: 'terrace',    biome: 'mountain', landmark: 'Sa Pa · Fansipan',        icon: '⛰️' },
  { name: 'Thái Nguyên', old: ['Bắc Kạn'],                      lm: 'tea',        biome: 'mountain', landmark: 'Đồi chè Tân Cương',       icon: '🍵' },
  { name: 'Lạng Sơn',    old: [],                               lm: 'none',       biome: 'mountain', landmark: 'Núi Mẫu Sơn',             icon: '🏔️' },
  { name: 'Cao Bằng',    old: [],                               lm: 'waterfall',  biome: 'karst',    landmark: 'Thác Bản Giốc',           icon: '💦' },
  { name: 'Tuyên Quang', old: ['Hà Giang'],                     lm: 'flagtower',  biome: 'karst',    landmark: 'Cột cờ Lũng Cú · Hà Giang', icon: '🚩' },
];

export const BIOMES = ['delta', 'fields', 'city', 'highland', 'coast', 'heritage', 'karst', 'mountain'];

/** Chỉ số tỉnh ở mét m (âm = còn ở Cà Mau, quá đích = Hà Giang). */
export function provinceIndex(m, goal) {
  const k = Math.floor((Math.max(0, m) / Math.max(1, goal)) * ROUTE.length);
  return Math.max(0, Math.min(ROUTE.length - 1, k));
}
export function provinceAt(m, goal) { return ROUTE[provinceIndex(m, goal)]; }
/** Mét bắt đầu của tỉnh thứ i. */
export function provinceStart(i, goal) { return (i / ROUTE.length) * goal; }
/** Phần quãng đường [from, to) của các tỉnh có tên trong danh sách — dùng đặt tình huống đúng nơi. */
export function rangesOf(names) {
  return ROUTE.map((p, i) => (names.includes(p.name) ? [i / ROUTE.length, (i + 1) / ROUTE.length] : null)).filter(Boolean);
}

/**
 * Cảnh theo TỈNH CŨ (63 tỉnh trước sắp xếp 2025): mỗi tỉnh mới chia đều quãng của nó cho các tỉnh cũ đã gộp vào,
 * theo thứ tự xe đi từ Nam ra Bắc. biome = kiểu cảnh nền (màu + lớp giữa + đồ ven đường: city = thành phố,
 * delta / fields = thôn quê, coast = biển, highland / mountain / karst = núi, heritage = cố đô); feats = nét đặc trưng
 * vẽ chen vào lớp giữa (game.js FEAT), sign = điều người xem quê đó nhận ra ngay (biển chào nhỏ).
 */
export const PARTS = {
  'Cà Mau': [
    { name: 'Cà Mau', biome: 'delta', feats: ['mangrove', 'mangrove', 'fishboats'], sign: 'Rừng đước Năm Căn' },
    { name: 'Bạc Liêu', biome: 'coast', feats: ['wind', 'salt', 'mansion'], sign: 'Cánh đồng điện gió' },
  ],
  'Cần Thơ': [
    { name: 'Sóc Trăng', biome: 'delta', feats: ['khmer', 'rice', 'palmyra'], sign: 'Chùa Dơi · đua ghe ngo' },
    { name: 'Hậu Giang', biome: 'delta', feats: ['rice', 'coconut', 'floating'], sign: 'Chợ nổi Ngã Bảy' },
    { name: 'Cần Thơ', biome: 'delta', feats: ['floating', 'bridge', 'fruit'], sign: 'Chợ nổi Cái Răng' },
  ],
  'An Giang': [
    { name: 'Kiên Giang', biome: 'coast', feats: ['island', 'fishboats', 'beach'], sign: 'Đảo ngọc Phú Quốc' },
    { name: 'An Giang', biome: 'delta', feats: ['palmyra', 'hill', 'khmer'], sign: 'Thốt nốt · Núi Sam' },
  ],
  'Đồng Tháp': [
    { name: 'Đồng Tháp', biome: 'delta', feats: ['lotus', 'lotus', 'rice'], sign: 'Đồng sen Tháp Mười' },
    { name: 'Tiền Giang', biome: 'delta', feats: ['fruit', 'floating', 'coconut'], sign: 'Vườn trái cây Cái Bè' },
  ],
  'Vĩnh Long': [
    { name: 'Trà Vinh', biome: 'delta', feats: ['khmer', 'coconut', 'rice'], sign: 'Ao Bà Om' },
    { name: 'Vĩnh Long', biome: 'delta', feats: ['kiln', 'fruit', 'kiln'], sign: 'Lò gạch Mang Thít' },
    { name: 'Bến Tre', biome: 'delta', feats: ['coconut', 'coconut', 'fruit'], sign: 'Xứ dừa' },
  ],
  'Tây Ninh': [
    { name: 'Long An', biome: 'fields', feats: ['dragonfruit', 'rice', 'village'], sign: 'Thanh long Châu Thành' },
    { name: 'Tây Ninh', biome: 'fields', feats: ['hill', 'caodai', 'rubber'], sign: 'Núi Bà Đen · Tòa Thánh' },
  ],
  'TP. Hồ Chí Minh': [
    { name: 'TP. Hồ Chí Minh', biome: 'city', feats: ['tower81', 'market', 'skyline', 'skyline'], sign: 'Landmark 81 · Bến Thành' },
    { name: 'Bình Dương', biome: 'city', feats: ['factory', 'skyline', 'factory'], sign: 'Khu công nghiệp' },
    { name: 'Bà Rịa – Vũng Tàu', biome: 'coast', feats: ['lighthouse', 'beach', 'oilrig'], sign: 'Biển Vũng Tàu' },
  ],
  'Đồng Nai': [
    { name: 'Đồng Nai', biome: 'highland', feats: ['forest', 'rubber', 'factory'], sign: 'Rừng Nam Cát Tiên' },
    { name: 'Bình Phước', biome: 'highland', feats: ['rubber', 'cashew', 'pepper'], sign: 'Điều · cao su' },
  ],
  'Lâm Đồng': [
    { name: 'Bình Thuận', biome: 'coast', feats: ['dunes', 'dragonfruit', 'chamtower'], sign: 'Đồi cát Mũi Né' },
    { name: 'Đắk Nông', biome: 'highland', feats: ['coffee', 'pepper', 'waterfall'], sign: 'Thác Dray Sáp' },
    { name: 'Lâm Đồng', biome: 'highland', feats: ['pine', 'greenhouse', 'lake'], sign: 'Đà Lạt ngàn hoa' },
  ],
  'Khánh Hòa': [
    { name: 'Ninh Thuận', biome: 'coast', feats: ['grape', 'chamtower', 'wind', 'sheep'], sign: 'Nho · cừu · tháp Chăm' },
    { name: 'Khánh Hòa', biome: 'coast', feats: ['resort', 'island', 'chamtower'], sign: 'Nha Trang · Tháp Bà' },
  ],
  'Đắk Lắk': [
    { name: 'Phú Yên', biome: 'coast', feats: ['lighthouse', 'fishboats', 'beach'], sign: 'Hoa vàng trên cỏ xanh' },
    { name: 'Đắk Lắk', biome: 'highland', feats: ['coffee', 'elephant', 'nharong'], sign: 'Cà phê Buôn Ma Thuột' },
  ],
  'Gia Lai': [
    { name: 'Bình Định', biome: 'coast', feats: ['chamtower', 'fishboats', 'beach'], sign: 'Đất võ · tháp Chăm' },
    { name: 'Gia Lai', biome: 'highland', feats: ['nharong', 'coffee', 'lake'], sign: 'Biển Hồ Pleiku' },
  ],
  'Quảng Ngãi': [
    { name: 'Kon Tum', biome: 'highland', feats: ['woodchurch', 'nharong', 'pine'], sign: 'Nhà thờ Gỗ' },
    { name: 'Quảng Ngãi', biome: 'coast', feats: ['garlic', 'island', 'lighthouse'], sign: 'Tỏi Lý Sơn' },
  ],
  'Đà Nẵng': [
    { name: 'Quảng Nam', biome: 'heritage', feats: ['oldtown', 'oldtown', 'chamtower'], sign: 'Phố cổ Hội An' },
    { name: 'Đà Nẵng', biome: 'city', feats: ['bridge', 'skyline', 'beach'], sign: 'Cầu Rồng · biển Mỹ Khê' },
  ],
  'Huế': [
    { name: 'Huế', biome: 'heritage', feats: ['citadel', 'pagoda', 'dragonboat'], sign: 'Đại Nội · chùa Thiên Mụ' },
  ],
  'Quảng Trị': [
    { name: 'Quảng Trị', biome: 'fields', feats: ['rice', 'bridge', 'village'], sign: 'Cầu Hiền Lương' },
    { name: 'Quảng Bình', biome: 'karst', feats: ['cave', 'dunes', 'karst'], sign: 'Phong Nha – Kẻ Bàng' },
  ],
  'Hà Tĩnh': [{ name: 'Hà Tĩnh', biome: 'fields', feats: ['rice', 'village', 'beach'], sign: 'Ngã ba Đồng Lộc' }],
  'Nghệ An': [{ name: 'Nghệ An', biome: 'fields', feats: ['lotus', 'village', 'tea'], sign: 'Làng Sen quê Bác' }],
  'Thanh Hóa': [{ name: 'Thanh Hóa', biome: 'coast', feats: ['beach', 'rice', 'citadel'], sign: 'Sầm Sơn · thành nhà Hồ' }],
  'Ninh Bình': [
    { name: 'Ninh Bình', biome: 'karst', feats: ['karst', 'pagoda', 'rowboat'], sign: 'Tràng An · Bái Đính' },
    { name: 'Nam Định', biome: 'fields', feats: ['church', 'rice', 'temple'], sign: 'Nhà thờ · Phủ Dầy' },
    { name: 'Hà Nam', biome: 'fields', feats: ['pagoda', 'village', 'rice'], sign: 'Chùa Tam Chúc' },
  ],
  'Hưng Yên': [
    { name: 'Thái Bình', biome: 'fields', feats: ['rice', 'church', 'village'], sign: 'Quê lúa' },
    { name: 'Hưng Yên', biome: 'fields', feats: ['longan', 'temple', 'village'], sign: 'Nhãn lồng · Phố Hiến' },
  ],
  'Hải Phòng': [
    { name: 'Hải Dương', biome: 'fields', feats: ['lychee', 'village', 'temple'], sign: 'Vải Thanh Hà' },
    { name: 'Hải Phòng', biome: 'city', feats: ['port', 'flamboyant', 'factory'], sign: 'Thành phố hoa phượng đỏ' },
  ],
  'Quảng Ninh': [{ name: 'Quảng Ninh', biome: 'karst', feats: ['junk', 'island', 'karst'], sign: 'Vịnh Hạ Long' }],
  'Bắc Ninh': [
    { name: 'Bắc Ninh', biome: 'fields', feats: ['temple', 'factory', 'quanho'], sign: 'Quan họ · KCN' },
    { name: 'Bắc Giang', biome: 'fields', feats: ['lychee', 'lychee', 'village'], sign: 'Vải thiều Lục Ngạn' },
  ],
  'Hà Nội': [{ name: 'Hà Nội', biome: 'city', feats: ['turtletower', 'onepillar', 'longbien', 'tubehouse'], sign: 'Hồ Gươm · cầu Long Biên' }],
  'Phú Thọ': [
    { name: 'Vĩnh Phúc', biome: 'fields', feats: ['factory', 'hill', 'village'], sign: 'Tam Đảo' },
    { name: 'Phú Thọ', biome: 'mountain', feats: ['temple', 'tea', 'hill'], sign: 'Đền Hùng' },
    { name: 'Hòa Bình', biome: 'mountain', feats: ['dam', 'stilt', 'lake'], sign: 'Thủy điện Hòa Bình' },
  ],
  'Sơn La': [{ name: 'Sơn La', biome: 'mountain', feats: ['tea', 'cows', 'plum'], sign: 'Mộc Châu' }],
  'Điện Biên': [{ name: 'Điện Biên', biome: 'mountain', feats: ['rice', 'stilt', 'flaghill'], sign: 'Đồi A1 · cánh đồng Mường Thanh' }],
  'Lai Châu': [{ name: 'Lai Châu', biome: 'mountain', feats: ['terrace', 'clouds', 'stilt'], sign: 'Đèo Ô Quy Hồ' }],
  'Lào Cai': [
    { name: 'Yên Bái', biome: 'mountain', feats: ['terrace', 'terrace', 'stilt'], sign: 'Ruộng bậc thang Mù Cang Chải' },
    { name: 'Lào Cai', biome: 'mountain', feats: ['cablecar', 'terrace', 'plum'], sign: 'Sa Pa · Fansipan' },
  ],
  'Thái Nguyên': [
    { name: 'Thái Nguyên', biome: 'mountain', feats: ['tea', 'tea', 'factory'], sign: 'Chè Tân Cương' },
    { name: 'Bắc Kạn', biome: 'mountain', feats: ['lake', 'stilt', 'rowboat'], sign: 'Hồ Ba Bể' },
  ],
  'Lạng Sơn': [{ name: 'Lạng Sơn', biome: 'mountain', feats: ['peach', 'pine', 'karst'], sign: 'Hoa đào · Mẫu Sơn' }],
  'Cao Bằng': [{ name: 'Cao Bằng', biome: 'karst', feats: ['waterfall', 'karst', 'rice'], sign: 'Thác Bản Giốc' }],
  'Tuyên Quang': [
    { name: 'Tuyên Quang', biome: 'karst', feats: ['temple', 'karst', 'stilt'], sign: 'Đình Tân Trào' },
    { name: 'Hà Giang', biome: 'karst', feats: ['buckwheat', 'terrace', 'karst'], sign: 'Hoa tam giác mạch · Mã Pí Lèng' },
  ],
};
/** Đoạn tỉnh cũ ở mét m: { part, pi (tỉnh mới), k (thứ tự trong tỉnh), n (số đoạn), from (mét bắt đầu đoạn) }. */
export function partAt(m, goal) {
  const pi = provinceIndex(m, goal), parts = PARTS[ROUTE[pi].name], seg = goal / ROUTE.length;
  const f = Math.max(0, Math.min(0.99999, (Math.max(0, m) - pi * seg) / seg)), k = Math.floor(f * parts.length);
  return { part: parts[k], pi, k, n: parts.length, from: pi * seg + (k / parts.length) * seg };
}

// ---- 🏠 quà "Xuống xe": người tặng bình luận tên tỉnh hoặc BIỂN SỐ XE (gõ nhanh, khỏi lo dấu) → tới đúng tỉnh cũ đó thì xuống ----
/** Biển số xe theo 63 tỉnh cũ (đầu số đăng ký xe). */
export const PLATES = {
  'Cao Bằng': [11], 'Lạng Sơn': [12], 'Quảng Ninh': [14], 'Hải Phòng': [15, 16], 'Thái Bình': [17], 'Nam Định': [18], 'Phú Thọ': [19],
  'Thái Nguyên': [20], 'Yên Bái': [21], 'Tuyên Quang': [22], 'Hà Giang': [23], 'Lào Cai': [24], 'Lai Châu': [25], 'Sơn La': [26],
  'Điện Biên': [27], 'Hòa Bình': [28], 'Hà Nội': [29, 30, 31, 32, 33, 40], 'Hải Dương': [34], 'Ninh Bình': [35], 'Thanh Hóa': [36],
  'Nghệ An': [37], 'Hà Tĩnh': [38], 'Đồng Nai': [39, 60], 'TP. Hồ Chí Minh': [41, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59], 'Đà Nẵng': [43],
  'Đắk Lắk': [47], 'Đắk Nông': [48], 'Lâm Đồng': [49], 'Bình Dương': [61], 'Long An': [62], 'Tiền Giang': [63], 'Vĩnh Long': [64],
  'Cần Thơ': [65], 'Đồng Tháp': [66], 'An Giang': [67], 'Kiên Giang': [68], 'Cà Mau': [69], 'Tây Ninh': [70], 'Bến Tre': [71],
  'Bà Rịa – Vũng Tàu': [72], 'Quảng Bình': [73], 'Quảng Trị': [74], 'Huế': [75], 'Quảng Ngãi': [76], 'Bình Định': [77], 'Phú Yên': [78],
  'Khánh Hòa': [79], 'Gia Lai': [81], 'Kon Tum': [82], 'Sóc Trăng': [83], 'Trà Vinh': [84], 'Ninh Thuận': [85], 'Bình Thuận': [86],
  'Vĩnh Phúc': [88], 'Hưng Yên': [89], 'Hà Nam': [90], 'Quảng Nam': [92], 'Bình Phước': [93], 'Bạc Liêu': [94], 'Hậu Giang': [95],
  'Bắc Kạn': [97], 'Bắc Giang': [98], 'Bắc Ninh': [99],
};
/** Tên quen gọi → tỉnh cũ. */
const PLACE_ALIAS = {
  'sai gon': 'TP. Hồ Chí Minh', 'sg': 'TP. Hồ Chí Minh', 'hcm': 'TP. Hồ Chí Minh', 'tp hcm': 'TP. Hồ Chí Minh', 'tphcm': 'TP. Hồ Chí Minh', 'ho chi minh': 'TP. Hồ Chí Minh',
  'vung tau': 'Bà Rịa – Vũng Tàu', 'ba ria': 'Bà Rịa – Vũng Tàu', 'brvt': 'Bà Rịa – Vũng Tàu', 'thua thien hue': 'Huế', 'da lat': 'Lâm Đồng',
  'nha trang': 'Khánh Hòa', 'phu quoc': 'Kiên Giang', 'buon ma thuot': 'Đắk Lắk', 'bmt': 'Đắk Lắk', 'pleiku': 'Gia Lai', 'sa pa': 'Lào Cai',
  'sapa': 'Lào Cai', 'ha long': 'Quảng Ninh', 'hoi an': 'Quảng Nam', 'quy nhon': 'Bình Định', 'phan thiet': 'Bình Thuận', 'mui ne': 'Bình Thuận',
  'phan rang': 'Ninh Thuận', 'chau doc': 'An Giang', 'my tho': 'Tiền Giang', 'tuy hoa': 'Phú Yên', 'dong hoi': 'Quảng Bình', 'vinh': 'Nghệ An',
  'moc chau': 'Sơn La', 'tam dao': 'Vĩnh Phúc', 'ha noi': 'Hà Nội', 'hn': 'Hà Nội', 'hp': 'Hải Phòng', 'dn': 'Đà Nẵng', 'ct': 'Cần Thơ',
};
export function placeKey(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
}
const OLD_NAMES = Object.values(PARTS).flat().map(p => p.name);
const BY_KEY = new Map(OLD_NAMES.map(n => [placeKey(n), n]));
/** Bình luận → tỉnh cũ muốn xuống: biển số (2 chữ số), tên tỉnh cũ / mới (có hoặc không dấu), tên quen. null = không hiểu. */
export function findPlace(text) {
  const t = placeKey(text);
  if (!t) return null;
  const num = t.match(/^(?:[a-z ]*?)(\d{2})(?: [a-z ]*)?$/);
  if (num) {
    const p = Number(num[1]);
    for (const [name, list] of Object.entries(PLATES)) if (list.includes(p)) return { name, plate: p };
    return null;
  }
  const has = k => (` ${t} `).includes(` ${k} `);
  const cands = [...BY_KEY.keys(), ...Object.keys(PLACE_ALIAS)].sort((a, b) => b.length - a.length);   // tên dài trước: "quang nam" trước "nam"
  for (const k of cands) if (has(k)) { const name = BY_KEY.get(k) || PLACE_ALIAS[k]; return { name, plate: (PLATES[name] || [])[0] || null }; }
  return null;
}
/** Quãng [from, from+len) mét của tỉnh cũ trên đường dài goal. */
export function partRange(name, goal) {
  const seg = goal / ROUTE.length;
  for (let pi = 0; pi < ROUTE.length; pi++) {
    const parts = PARTS[ROUTE[pi].name], k = parts.findIndex(p => p.name === name);
    if (k >= 0) return { pi, k, from: (pi + k / parts.length) * seg, len: seg / parts.length, province: ROUTE[pi].name };
  }
  return null;
}
