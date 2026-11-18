'use strict';
// 🦛 Hà Mã Đau Răng — ấn từng chiếc răng, một chiếc là răng đau: ấn trúng thì hà mã ngoạm.
module.exports = Object.assign(require('./trap-board').makeTrapGame({ id: 'hama', key: 'teeth', lo: 6, hi: 16, dflt: 10 }), {
    name: 'Hà Mã Đau Răng', icon: '🦛', unit: 'răng'
});
