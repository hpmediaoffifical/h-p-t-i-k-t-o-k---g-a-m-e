'use strict';
// 🐸 Chum Cóc — cắm que tre vào lỗ chum, một lỗ đụng chú cóc đang trốn: cóc nhảy vọt ra.
module.exports = Object.assign(require('./trap-board').makeTrapGame({ id: 'chumcoc', key: 'holes', lo: 8, hi: 30, dflt: 16 }), {
    name: 'Chum Cóc', icon: '🐸', unit: 'lỗ'
});
