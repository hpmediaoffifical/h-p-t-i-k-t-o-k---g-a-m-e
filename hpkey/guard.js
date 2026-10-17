'use strict';
/**
 * HP KEY - LỚP BẢO VỆ chống "thu hồi oan". FILE LÕI — không sửa trong app.
 *
 * Vấn đề: watcher cũ coi MỌI phản hồi không phải {ok:true} là bị thu hồi, kể cả body rỗng /
 * HTML (hosting 502/503, trang bảo trì, Cloudflare chặn, wifi khách sạn) → app tự đóng giữa
 * lúc đang LIVE với thông báo "(revoked)".
 *
 * Cách làm: phân loại lỗi.
 *   HARD — server nói RÕ bằng mã trong core.HARD_CODES → thu hồi thật.
 *   SOFT — mọi thứ còn lại (mất mạng, body rỗng/HTML, 5xx, sai chữ ký token, mã lạ)
 *          → KHÔNG BAO GIỜ đóng app, chỉ cảnh báo; vẫn chạy bằng hạn offline đã lưu.
 * Và: phải HARD liên tiếp đủ số lần (mặc định 3, xác nhận lại nhanh sau 8 s) mới đóng app.
 */
const core = require('./core');
const cfg = require('./config');

let verifyFn = core.verifyKey;
function _setVerify(fn) { verifyFn = fn || core.verifyKey; }

function classify(r) {
  if (!r) return { kind: 'soft', code: 'no_result' };
  if (r.ok) return { kind: 'ok', code: '' };
  const code = String(r.error || 'unknown');
  if (r._offline || code === 'no_network') return { kind: 'soft', code };
  return { kind: core.HARD_CODES.has(code) ? 'hard' : 'soft', code };
}

const SOFT_VI = {
  revoked: 'hệ thống bản quyền trả về dữ liệu trống (server bận/bảo trì)',
  activate_failed: 'hệ thống bản quyền trả về dữ liệu trống (server bận/bảo trì)',
  no_result: 'hệ thống bản quyền không phản hồi',
  bad_token: 'chữ ký phản hồi chưa khớp (mạng bị chèn hoặc giờ máy lệch)',
  no_network: 'không kết nối được hệ thống bản quyền',
  rate_limited: 'hệ thống đang tạm chặn địa chỉ mạng này',
};
function msgVi(kind, code) {
  if (kind === 'ok') return '';
  if (kind === 'hard') return core.errVi(code);
  if (SOFT_VI[code]) return SOFT_VI[code];
  if (code.indexOf('exception:') === 0) return 'lỗi khi gọi hệ thống bản quyền';
  return 'hệ thống bản quyền báo lỗi lạ (' + code + ')';
}

/** Kiểm 1 lần + phân loại. Không bao giờ ném lỗi. */
async function verifyOnce(key) {
  let r;
  try { r = await verifyFn(key); }
  catch (e) { r = { ok: false, error: 'exception:' + (e && e.message || e) }; }
  const c = classify(r);
  return { ...c, raw: r, message: msgVi(c.kind, c.code) };
}

/**
 * Watcher an toàn.
 *  opts.getKey                 () => key đang dùng (hoặc chuỗi)
 *  opts.onRevoked(code, msg)   CHỈ khi HARD liên tiếp >= hardStrikes lần
 *  opts.onWarn(info)           lỗi mơ hồ: {code, message, softStreak} / đang xác nhận: {confirming:true, hardStreak}
 *  opts.onOk(payload, license) mỗi lần kiểm thành công (lưu token mới, cập nhật features…)
 *  opts.intervalSec            mặc định cfg.RECHECK_SECONDS (60), tối thiểu minIntervalSec (15)
 *  opts.confirmSec             chờ trước khi xác nhận lại lần HARD (8)
 * Trả về { state, stop }.
 */
function startWatch(opts) {
  const getKey = opts.getKey;
  const onRevoked = opts.onRevoked || (() => {});
  const onWarn = opts.onWarn || (() => {});
  const onOk = opts.onOk || (() => {});
  const minSec = opts.minIntervalSec === undefined ? 15 : Number(opts.minIntervalSec);
  const intervalSec = Math.max(minSec, Number(opts.intervalSec || cfg.RECHECK_SECONDS || 60));
  const confirmSec = opts.confirmSec === undefined ? 8 : Number(opts.confirmSec);
  const hardStrikes = Math.max(1, Number(opts.hardStrikes || 3));

  const state = { hardStreak: 0, softStreak: 0, lastOkAt: 0, lastCode: '', stopped: false };
  let timer = null;

  const arm = (sec) => {
    if (state.stopped) return;
    timer = setTimeout(tick, sec * 1000);
    if (timer.unref) timer.unref();
  };

  async function tick() {
    timer = null;
    if (state.stopped) return;
    const key = (typeof getKey === 'function' ? getKey() : getKey) || '';
    if (!key) return arm(intervalSec);

    const r = await verifyOnce(key);
    if (state.stopped) return;
    state.lastCode = r.code;

    if (r.kind === 'ok') {
      state.hardStreak = 0; state.softStreak = 0; state.lastOkAt = Date.now();
      try { onOk(r.raw.payload, r.raw.license, r.raw); } catch (_) {}
      return arm(intervalSec);
    }
    if (r.kind === 'soft') {
      state.hardStreak = 0;                  // lỗi mơ hồ xoá luôn chuỗi hard đang đếm
      state.softStreak++;
      if (state.softStreak === 2 || state.softStreak % 10 === 0) {   // cảnh báo thưa, khỏi phiền lúc LIVE
        try { onWarn({ code: r.code, message: r.message, softStreak: state.softStreak }); } catch (_) {}
      }
      return arm(intervalSec);
    }
    // HARD: xác nhận lại NHANH thay vì chờ hết chu kỳ, đủ hardStrikes lần mới kết luận.
    state.softStreak = 0;
    state.hardStreak++;
    if (state.hardStreak >= hardStrikes) {
      state.stopped = true;
      try { onRevoked(r.code, r.message); } catch (_) {}
      return;
    }
    try { onWarn({ code: r.code, message: r.message, hardStreak: state.hardStreak, confirming: true }); } catch (_) {}
    return arm(confirmSec);
  }

  arm(intervalSec);
  return {
    state,
    stop() { state.stopped = true; if (timer) clearTimeout(timer); timer = null; },
  };
}

module.exports = { startWatch, verifyOnce, classify, HARD_CODES: core.HARD_CODES, _setVerify };
