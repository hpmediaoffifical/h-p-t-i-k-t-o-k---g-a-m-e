// Mô phỏng vật lý Matter.js cho mọi kiểu hũ trong ../jar-skins.json:
// dựng tường theo thành trong (polyline), thả quà như dropOne() của game, đếm quà lọt ra ngoài.
// Chạy: node art-requests/thuytinh/_tools/sim_jars.js
const path = require('path');
const fs = require('fs');
const Matter = require(path.resolve(__dirname, '../../../node_modules/matter-js'));
const { Engine, Bodies, Body, Composite } = Matter;

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../jar-skins.json'), 'utf8'));
const CW = 1080, CH = 1920;
const SMART = process.env.SPAWN === 'smart';
const T = +(process.env.WALL_T || 60), FLOOR_T = 80;   // tường dày nằm hẳn phía NGOÀI nét kính → không ảnh hưởng hình, chống xuyên

// dựng tường thành trong — hình chữ nhật mỏng nằm NGOÀI đường thành (mặt trong trùng nét vẽ)
function buildJarWalls(skin, r) {
    const P = (p) => ({ x: r.x + r.w * p[0], y: r.y + r.h * p[1] });
    const right = skin.innerRight.map(P);
    const left = skin.innerRight.map(p => P([2 * skin.cx - p[0], p[1]]));
    const walls = [];
    for (const side of [right, left]) {
        const sgn = side === right ? 1 : -1;
        for (let i = 0; i < side.length - 1; i++) {
            const a = side[i], b = side[i + 1];
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
            if (len < 0.5) continue;
            // pháp tuyến ra ngoài: bên phải (dy,-dx), bên trái ngược lại
            let nx = dy / len * sgn, ny = -dx / len * sgn;
            const floorish = ny > 0.7;
            const th = floorish ? FLOOR_T : T;
            const cx = (a.x + b.x) / 2 + nx * th / 2, cy = (a.y + b.y) / 2 + ny * th / 2;
            walls.push(Bodies.rectangle(cx, cy, len + T, th, { isStatic: true, angle: Math.atan2(dy, dx), friction: 0.6, restitution: 0.1 }));
        }
    }
    return { walls, right, left };
}

function pointInPoly(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function simulate(skin, { jarH = 400, delta = 1000 / 60, seed = 1, maxGift = 220 } = {}) {
    const rand = rng(seed);
    const w = jarH * 1024 / 1536;
    const r = { x: CW * 0.6457 - w / 2, y: CH * 0.62 - jarH / 2, w, h: jarH };
    const engine = Engine.create();
    engine.gravity.y = 1.4;
    const { walls, right, left } = buildJarWalls(skin, r);
    const world = [
        Bodies.rectangle(CW / 2, CH + 200, CW + 200, 400, { isStatic: true }),
        Bodies.rectangle(-100, CH / 2, 200, CH + 400, { isStatic: true }),
        Bodies.rectangle(CW + 100, CH / 2, 200, CH + 400, { isStatic: true }),
    ];
    Composite.add(engine.world, walls.concat(world));
    const cavity = right.concat(left.slice().reverse());
    const mouthY = r.y + r.h * skin.shape.neckTopY;
    const nl = r.x + r.w * skin.shape.neckLeftX + 8, nr = r.x + r.w * skin.shape.neckRightX - 8;
    const entryPx = r.w * skin.entryWidthW;
    const szMax = Math.min(maxGift, Math.floor(entryPx * (SMART ? 0.75 : 0.9)));
    const bodies = [];
    let area = 0;
    for (let i = 0, j = cavity.length - 1; i < cavity.length; j = i++) area += (cavity[j].x + cavity[i].x) * (cavity[j].y - cavity[i].y);
    area = Math.abs(area / 2);
    let fill = 0, leaks = 0, dips = 0;
    const wasIn = new Map();
    const everIn = new Set();
    const step = () => {
        Engine.update(engine, delta);
        for (const b of bodies) {
            const inn = pointInPoly(b.position, cavity);
            if (wasIn.get(b) && !inn && b.position.y > mouthY + b.circleRadius) {
                dips++; b._exitBelow = true; if (process.env.DBG) console.log('XUYÊN TƯỜNG', skin.id, jarH, Math.round(b.circleRadius * 2), Math.round(b.position.x - r.x), Math.round(b.position.y - r.y));
            }
            wasIn.set(b, inn);
            if (inn) everIn.add(b);
            if (!b._cross && b.position.y + b.circleRadius > mouthY - 2) b._cross = { x: Math.round(b.position.x - (nl + nr) / 2), vx: +b.velocity.x.toFixed(1), n: bodies.length, hit: b._hit || '' };
        }
    };
    const stepsPerDrop = Math.round(220 / delta);
    let dropped = 0;
    for (let k = 0; k < 400; k++) {
        // ngừng khi đống quà đã chạm miệng
        const settled = bodies.filter(b => b.speed < 0.6 && pointInPoly(b.position, cavity));
        const topY = settled.reduce((m, b) => Math.min(m, b.position.y - b.circleRadius), Infinity);
        if (topY < mouthY + 10 || bodies.some(b => b.speed < 0.6 && b.position.y < mouthY) || fill > area * 0.5) break;
        const sz = Math.round(40 + (szMax - 40) * Math.pow(rand(), 2.2));
        const margin = (nr - nl) * 0.12;
        const t = (rand() + rand()) / 2;
        let x = nl + margin + t * (nr - nl - 2 * margin);
        if (SMART) {   // đề xuất: tâm quà luôn nằm trong lối vào trừ bán kính quà
            const cxm = (nl + nr) / 2, half = Math.max(0, entryPx / 2 - sz / 2 - 6);
            x = cxm + (t * 2 - 1) * half;
        }
        const y = mouthY - sz - 220 - rand() * 80;
        const b = Bodies.circle(x, y, sz / 2, { restitution: 0.4, friction: 0.05, density: 0.002 });
        Body.setVelocity(b, { x: (rand() - 0.5) * 3, y: rand() * 2 + 1 });
        Composite.add(engine.world, b);
        b._fillAtDrop = fill / area; b._sz = sz;
        bodies.push(b);
        dropped++;
        fill += Math.PI * sz * sz / 4;
        for (let s = 0; s < stepsPerDrop; s++) step();
    }
    for (let s = 0; s < Math.round(4000 / delta); s++) step();
    let inside = 0, heap = 0, escaped = 0, neverIn = 0;
    for (const b of bodies) {
        const p = b.position;
        if (pointInPoly(p, cavity)) inside++;
        else if (p.y < mouthY + 4 && p.x > r.x && p.x < r.x + r.w) heap++;   // chất đống trên miệng (hũ đầy)
        else { escaped++; if (b._exitBelow) { leaks++; if (process.env.DBG3) console.log('LEAK', skin.id, jarH, delta.toFixed(1), b._sz, Math.round((p.x - r.x)/r.w*1000)/1000, Math.round((p.y - r.y)/r.h*1000)/1000, JSON.stringify(b._cross)); } if (!everIn.has(b)) { neverIn++; if (process.env.DBG2) console.log('nảy', skin.id, jarH, 'sz', b._sz, 'fill', b._fillAtDrop.toFixed(2), 'half', Math.round(entryPx/2), JSON.stringify(b._cross)); } }
    }
    return { dropped, inside, heap, escaped, neverIn, leaks, dips, szMax, entryPx: Math.round(entryPx) };
}

const rows = [];
let bad = 0;
for (const skin of data.skins) {
    const res = [];
    for (const [jarH, delta] of [[400, 1000 / 60], [400, 1000 / 30], [700, 1000 / 60]]) {
        for (const seed of (process.env.SEEDS || '1,2').split(',').map(Number)) res.push(simulate(skin, { jarH, delta, seed }));
    }
    const esc = res.reduce((a, b) => a + b.escaped, 0);
    const leak = res.reduce((a, b) => a + b.leaks, 0);
    const nin = res.reduce((a, b) => a + b.neverIn, 0);
    const dip = res.reduce((a, b) => a + b.dips, 0);
    const drop = res.reduce((a, b) => a + b.dropped, 0);
    const ins = res.reduce((a, b) => a + b.inside, 0);
    if (leak) bad++;
    rows.push({ no: skin.no, id: skin.id, entry400: res[0].entryPx, szMax400: res[0].szMax, dropped: drop, inside: ins, heap: drop - ins - esc, rimBounce: nin, overflowTop: esc - nin - leak, leaks: leak, tempDip: dip });
}
console.table(rows);
console.log('rimBounce = quà đập mép miệng nảy ra (chưa từng vào); overflowTop = vào rồi văng qua miệng; leaks = vào rồi kết thúc NGOÀI hũ dưới miệng (xuyên kính); tempDip = lún tạm qua nét kính rồi bật lại');
console.log('chế độ thả:', SMART ? 'smart (đề xuất)' : 'như game hiện tại', '· tường dày', T, 'px');
console.log(bad ? `CÓ ${bad} kiểu bị xuyên tường` : `OK: 0 quà xuyên thành kính ở cả ${data.skins.length} kiểu (mỗi kiểu: hũ 400px/700px × 60fps/30fps × các seed)`);
fs.writeFileSync(path.join(__dirname, SMART ? '../sim-ket-qua-smart.json' : '../sim-ket-qua.json'), JSON.stringify(rows, null, 1));
