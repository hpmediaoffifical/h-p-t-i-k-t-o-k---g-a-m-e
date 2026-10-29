// Ghi log thô các gói xếp hạng / giải đấu TikTok (bước 0 trước khi làm Thẻ Giải Đấu).
// Nghe sự kiện `decodedData` của connector (mọi method), chỉ GHI gói có tên Rank/League + phần
// leagueScoreInfoMap trong gói PK; method nào cũng được ĐẾM để biết TikTok gửi những gì.
// File: <dir>/<YYYY-MM-DD>.jsonl, mỗi dòng { ts, method, roomId?, repeatsBefore?, data }.
const fs = require('fs');
const path = require('path');

const RANK_RE = /rank|league/i;
function isRankMethod(method) { return RANK_RE.test(String(method || '')); }

function pad2(n) { return String(n).padStart(2, '0'); }
function dayKey(ms) { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function toJson(value) {
    return JSON.stringify(value, (key, v) => {
        if (typeof v === 'bigint') return v.toString();
        if (v && v.type === 'Buffer' && Array.isArray(v.data)) return 'base64:' + Buffer.from(v.data).toString('base64');
        if (v instanceof Uint8Array) return 'base64:' + Buffer.from(v).toString('base64');
        return v;
    });
}

// Gói PK chỉ giữ phần giải đấu (cả gói battle rất to và đã được xử lý ở chỗ khác).
function pickPayload(method, data) {
    if (isRankMethod(method)) return data;
    const map = data && data.leagueScoreInfoMap;
    if (map && typeof map === 'object' && Object.keys(map).length) return { battleId: data.battleId, leagueScoreInfoMap: map };
    return null;
}

function createRankLog({ dir, now = Date.now, maxBytesPerDay = 20 * 1024 * 1024, recentSize = 200 } = {}) {
    const methods = {};
    const lastByMethod = new Map();   // method → { json, repeats }
    const recentRows = [];
    let written = 0;
    let dropped = 0;
    const bytesByDay = {};

    function bytesSoFar(file, key) {
        if (bytesByDay[key] == null) { try { bytesByDay[key] = fs.statSync(file).size; } catch (e) { bytesByDay[key] = 0; } }
        return bytesByDay[key];
    }

    function record(method, data, meta = {}) {
        if (!method) return false;
        methods[method] = (methods[method] || 0) + 1;
        const payload = pickPayload(method, data);
        if (payload == null) return false;
        let json;
        try { json = toJson(payload); } catch (e) { dropped++; return false; }
        const last = lastByMethod.get(method);
        if (last && last.json === json) { last.repeats++; return false; }
        const ts = now();
        const row = { ts: new Date(ts).toISOString(), method };
        if (meta.roomId) row.roomId = String(meta.roomId);
        if (last && last.repeats) row.repeatsBefore = last.repeats;
        lastByMethod.set(method, { json, repeats: 0 });
        const line = toJson(row).slice(0, -1) + ',"data":' + json + '}\n';
        const key = dayKey(ts);
        const file = path.join(dir, key + '.jsonl');
        if (bytesSoFar(file, key) + Buffer.byteLength(line) > maxBytesPerDay) { dropped++; return false; }
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.appendFileSync(file, line);
        } catch (e) { dropped++; return false; }
        bytesByDay[key] += Buffer.byteLength(line);
        written++;
        recentRows.push(JSON.parse(line));
        if (recentRows.length > recentSize) recentRows.shift();
        return true;
    }

    function stats() { return { dir, written, dropped, methods: { ...methods } }; }
    function recent(n = 50) { return recentRows.slice(-Math.max(0, n)); }

    return { record, stats, recent };
}

module.exports = { createRankLog, isRankMethod };
