'use strict';
// 🎲 Bộ Trò Chơi Theo Lượt — danh sách trò. Thêm trò mới: 1 file theo hợp đồng ở spec §3 + 1 dòng ở đây.
const GAME_LIST = [require('./hama'), require('./chumcoc'), require('./thaptre'), require('./latcap')];
const GAMES_BY_ID = Object.fromEntries(GAME_LIST.map(g => [g.id, g]));
module.exports = { GAME_LIST, GAMES_BY_ID };
