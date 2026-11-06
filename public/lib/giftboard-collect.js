/* 📋 Bảng Quà Tổng — đọc quà → hành động của MỌI game từ config (dùng chung: bảng quà + nhãn "đang dùng ở" trong bộ chọn quà).
 * collect(ctx) → [{ key, gameId, source, giftId, generic, giftName, image, diamond, label, tag }]
 *   ctx: { games: {id: {config}}, catalog: {giftId: {name,image,diamond}}, timerCfg, obsCfg, camData, ttData, hideBirdGifts }
 * Nhặt Lá cần window.HpGame.nhatla (nạp /games/nhatla/game.js trước).
 */
(function (root) {
  'use strict';
  const TT_IDS = new Set(['quaivat', 'nhatu', 'pokemon', 'creatoronline', 'duongveque']);
  const THUYTINH_LABELS = {
    thief: 'Trộm', joinPolice: 'Gia nhập CS', osin: 'Osin nhặt quà', ufo: 'UFO hút quà', shape: 'Tạo hình', megaboom: 'Megaboom',
    pourOut: 'Dốc ngược hũ', gravflip: 'Đảo trọng lực', shake: 'Rung hũ', rain: 'Mưa quà', magnet: 'Nam châm', crackJar: 'Nứt hũ',
    stealJar: 'Trộm cả hũ', combo: 'Combo', clear: 'Xoá hết hũ', kickJar: 'OSIN đá hũ', throwJar: 'OSIN ném hũ', spinJar: 'OSIN xoay hũ',
    osinKickOut: 'OSIN đá tung quà', zigzagLuck: 'Zikzak may mắn', wind: 'Thả diều Avatar Gió', dragonFire: 'Rồng phun lửa'
  };
  const THUYTINH_SKIP = new Set(['tilt', 'fireworks', 'tornado', 'geyser', 'slow']);
  const TRONGCAY_LISTS = [
    { key: 'activateGifts', label: 'Chọn cây của mình', tag: () => '🌳' },
    { key: 'specificGifts', label: 'Cây cao lên', tag: g => '+' + (g.growth ?? 8) + '%' },
    { key: 'waterGifts', label: 'Tưới nước', tag: g => '💧' + (g.water ?? 8) },
    { key: 'sunGifts', label: 'Nắng', tag: g => '☀️' + (g.sun ?? 20) },
    { key: 'cutGifts', label: 'Cắt cây', tag: g => '✂️' + (g.cut ?? 12) + '%' },
    { key: 'butterflyGifts', label: 'Thả bướm', tag: () => '🦋' },
    { key: 'beeGifts', label: 'Ong hái trái', tag: g => '🐝' + (g.bees ?? 1) },
    { key: 'caterpillarGifts', label: 'Thả sâu phá cây', tag: g => '🐛' + (g.count ?? 1) },
    { key: 'sprayGifts', label: 'Phun thuốc sâu', tag: g => (g.protectSeconds ?? 30) + 's' },
    { key: 'dragonGifts', label: 'Rồng lửa thiêu vườn', tag: () => '🐉' },
    { key: 'deactivateGifts', label: 'Khoá cây', tag: () => '🔒' },
    { key: 'birdGifts', label: 'Chim bay khi cây cao', tag: () => '🦅' }
  ];
  const fmtSec = s => { s = Math.round(Number(s) || 0); if (s < 60) return s + 's'; const m = Math.floor(s / 60), r = s % 60; return r ? `${m}p${r}s` : `${m}p`; };
  const prettyHotkey = h => String(h || '').replace(/^effect_/, '').replace(/_trigger$/, '').replace(/_/g, ' ');

  function collect(ctx) {
    ctx = ctx || {};
    const games = ctx.games || {}, catalog = ctx.catalog || {}, timerCfg = ctx.timerCfg || null, obsCfg = ctx.obsCfg || null;
    const camData = ctx.camData || null, ttData = ctx.ttData || null;
    const cfg = { rules: { hideBirdGifts: ctx.hideBirdGifts !== false } };
      const out = [];
      const push = (gameId, source, giftId, item, label, tag) => {
        giftId = String(giftId || '').trim();
        if (!giftId || !label) return;
        const c = catalog[giftId] || {};
        out.push({
          key: `${gameId}|${source}|${giftId}`, gameId, source, giftId, generic: false,
          giftName: String(item?.giftName || item?.name || c.name || ('#' + giftId)),
          image: String(item?.giftImage || item?.image || c.image || ''),
          diamond: Number(item?.diamond) || Number(c.diamond) || 0,
          label: String(label).trim(), tag: String(tag || '').trim()
        });
      };
      const generic = (gameId, label) => out.push({ key: `${gameId}|generic|*`, gameId, source: 'generic', giftId: '', generic: true, giftName: 'Mọi quà', image: '', diamond: 0, label, tag: '' });
      const gc = id => games[id]?.config || {};

      { const c = gc('thuytinh'); const items = c.badges?.items || {};
        for (const [gid, action] of Object.entries(c.triggers || {})) {
          if (THUYTINH_SKIP.has(action)) continue;
          const it = items[gid] || {}; if (it.enabled === false) continue;
          push('thuytinh', 'trigger', gid, {}, it.customLabel || THUYTINH_LABELS[action] || action, '');
        } }
      { const c = gc('caro');
        if (c.registration?.giftId) push('caro', 'reg', c.registration.giftId, {}, 'Đăng ký đấu Caro', c.registration.minCount > 1 ? '×' + c.registration.minCount : '');
        const m = c.undo?.mode || 'idol';
        if (c.undo?.giftId && (m === 'gift' || m === 'both')) push('caro', 'undo', c.undo.giftId, {}, 'Hoàn nước Caro', ''); }
      { const c = gc('votecomment');
        if (c.countingMode !== 'comments') for (const r of c.rows || []) if (r?.giftId) push('votecomment', 'row:' + r.id, r.giftId, r, 'Vote: ' + (r.label || r.keyword || ''), r.keyword ? '“' + r.keyword + '”' : ''); }
      { const c = gc('nhietdo');
        for (const g of c.specificGifts || []) push('nhietdo', 'heat', g.giftId, g, g.customLabel || 'Tăng nhiệt', '+' + (g.degrees ?? 0) + '°');
        for (const g of c.coolingGifts || []) push('nhietdo', 'cool', g.giftId, g, g.customLabel || 'Hạ nhiệt', '−' + (g.degrees ?? 0) + '°');
        if (c.heatMode === 'perCoin') generic('nhietdo', `Mọi quà: +${c.perCoinDegrees ?? 0.1}° mỗi xu`);
        else if (c.heatMode === 'perGift') generic('nhietdo', `Mọi quà: +${c.perGiftDegrees ?? 5}°`); }
      { const c = gc('bancung');
        for (const g of c.shotGifts || []) push('bancung', 'shot', g.giftId, g, g.customLabel || 'Bắn cung', g.shots > 1 ? '×' + g.shots : '🏹');
        for (const g of c.healGifts || []) push('bancung', 'heal', g.giftId, g, g.customLabel || 'Hồi máu', '+' + (g.healHearts ?? 1) + '♥');
        for (const g of c.reviveGifts || []) push('bancung', 'revive', g.giftId, g, g.customLabel || 'Hồi sinh', '✨');
        for (const g of c.shieldGifts || []) push('bancung', 'shield', g.giftId, g, g.customLabel || 'Giáp chắn', (g.durationSec ?? 5) + 's');
        if (c.freeFireEnabled) generic('bancung', `Mọi quà: bắn cung (${c.freeFireKcPerHeart ?? 100} xu = 1♥)`); }
      { const c = gc('trongcay');
        for (const L of TRONGCAY_LISTS) {
          if (L.key === 'birdGifts' && cfg.rules.hideBirdGifts) continue;
          if (L.key === 'specificGifts' && c.growthMode && c.growthMode !== 'specificGifts') continue;
          for (const g of c[L.key] || []) push('trongcay', L.key, g.giftId, g, g.customLabel || L.label, L.tag(g || {}));
        }
        if (c.growthMode === 'perCoin') generic('trongcay', `Mọi quà: cây cao +${c.perCoinGrowth ?? 2}% mỗi xu`);
        else if (c.growthMode === 'perGift') generic('trongcay', `Mọi quà: cây cao +${c.perGiftGrowth ?? 5}%`); }
      { const nl = ctx.nhatla || (root && root.HpGame && root.HpGame.nhatla); const c = gc('nhatla');
        if (nl && Object.keys(c).length) {
          let norm = null;
          try { norm = nl.normalizeConfig(JSON.parse(JSON.stringify(c))); } catch (e) { norm = null; }
          if (norm) {
            for (const e of nl.giftBoardEntries(norm)) push('nhatla', e.key, e.giftId, { giftName: e.giftName, giftImage: e.image, diamond: e.diamond }, e.label, '');
            const cpl = Number(norm.coinsPerLeaf) || 0;
            if (cpl > 0) generic('nhatla', cpl === 1 ? 'Mọi quà: 1 xu = 1 lá' : `Mọi quà: ${cpl} xu = 1 lá`);
          }
        } }
      { const t = timerCfg;
        if (t) {
          if (t.mode === 'fixed') for (const f of t.fixed || []) push('timer', 'fixed', f.giftId, f, (f.action === 'sub' ? 'Trừ' : 'Cộng') + ' thời gian', (f.action === 'sub' ? '−' : '+') + fmtSec(f.seconds));
          else if (t.mode === 'ratio') {
            const r = t.ratio || {}; const tg = `${r.coins ?? 1} xu = ${fmtSec(r.secs ?? 1)}`;
            for (const g of r.addList || []) push('timer', 'ratioAdd', g.giftId, g, 'Cộng thời gian', '+' + tg);
            for (const g of r.subList || []) push('timer', 'ratioSub', g.giftId, g, 'Trừ thời gian', '−' + tg);
          } else if (t.mode === 'side') {
            if (t.side?.addGift?.giftId) push('timer', 'sideAdd', t.side.addGift.giftId, t.side.addGift, 'Chọn phe CỘNG giờ', '');
            if (t.side?.subGift?.giftId) push('timer', 'sideSub', t.side.subGift.giftId, t.side.subGift, 'Chọn phe TRỪ giờ', '');
          }
          if (t.triggers?.enabled !== false) for (const tr of t.triggers?.list || []) if (tr?.enabled !== false && tr.gift?.giftId) push('timer', 'trg:' + tr.id, tr.gift.giftId, tr.gift, tr.name || 'Kích hoạt đếm ngược', fmtSec(tr.durationSec));
        } }
      // 🎥 Game Camera (trừ Bắn Cung — đã đọc ở trên): server dựng sẵn nhãn. Mục không có giftId = dòng "mọi quà/theo xu".
      const srvLists = [['touchplay', camData], ['chemtraicay', camData], ['dapmuoi', camData], ['dacau', camData], ['body', camData],
        ...[...TT_IDS].map(id => [id, ttData])];
      for (const [id, src] of srvLists) {
        if (!src || !src.games) continue;
        (src.games[id] || []).forEach((g, i) => {
          if (!g) return;
          if (g.giftId) push(id, 'cam' + i, g.giftId, { giftName: g.name, giftImage: g.image, diamond: g.diamonds }, g.label, '');
          else out.push({ key: `${id}|generic|${i}`, gameId: id, source: 'generic', giftId: '', generic: true, giftName: g.name || 'Mọi quà', image: '', diamond: 0,
            label: `${g.emoji ? g.emoji + ' ' : ''}${g.name ? g.name + ': ' : ''}${g.label || ''}`.trim(), tag: '' });
        });
      }
      { if (obsCfg && obsCfg.enabled !== false) {
          const dis = new Set(obsCfg.groupsDisabled || []);
          for (const m of obsCfg.mapping || []) {
            if (!m?.giftId || !(m.scene || m.hotkey) || m.enabled === false || dis.has(String(m.group || ''))) continue;
            push('obsEffects', 'map:' + m.id, m.giftId, m, m.actionName || m.scene || prettyHotkey(m.hotkey), '');
          } } }
      return out;
  }
  const api = { collect, THUYTINH_LABELS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HpGiftboardCollect = api;
})(typeof window !== 'undefined' ? window : this);
