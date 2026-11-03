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
