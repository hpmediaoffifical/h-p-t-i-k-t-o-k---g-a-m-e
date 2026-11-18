'use strict';
// 🐐 Dê Núi — cắm que tre vào các hốc của mỏm đá núi, một hốc đụng chú dê núi (con giáp năm Đinh Mùi 2027) đang trốn: dê nhảy vọt lên đỉnh.
// (id giữ 'chumcoc' — tên cũ Cóc Trốn Chum — để không đổi cấu hình / link OBS)
module.exports = Object.assign(require('./trap-board').makeTrapGame({ id: 'chumcoc', key: 'holes', lo: 8, hi: 30, dflt: 16 }), {
    name: 'Dê Núi', icon: '🐐', unit: 'hốc'
});
