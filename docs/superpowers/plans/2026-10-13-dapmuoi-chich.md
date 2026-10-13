# Đập Muỗi GĐ2 (muỗi chích + kem) — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Muỗi bay lâu tìm người đậu rồi chích, nốt sưng bám mặt/cổ/vai 30 s, hành động Kem chống muỗi đẩy muỗi và xoa nốt.

**Architecture:** Khung đầu/thân từ pose tách thành `public/lib/body-frames.mjs` (thuần, ESM, test node). Engine thêm trạng thái seek/landed + hành động cream. Module nốt `bumps.js` thuần (UMD). Overlay nối: pose → frames → điểm đậu → engine; bite → bumps; vẽ.

**Tech Stack:** như GĐ1. **Spec:** `docs/superpowers/specs/2026-10-13-dapmuoi-chich-design.md`.

## Global Constraints
- Như plan GĐ1 (LF/CRLF, không đụng feed, route riêng, panel chỉ gửi).
- Không refactor Bắn Cung; chỉ chép công thức khung đầu/thân sang lib mới.
- Không thêm model AI.

## Review Focus
1. Mất người giữa lúc muỗi đang đậu → không chích ảo, không nốt lơ lửng (T2 test "không người thì dừng đếm", T3 test "không frames thì list rỗng").
2. Combo kem ×N cộng dồn trần 120 s, không nhân số nốt chữa (T2).
3. Config cũ không có `bite` → mặc định bật (T2 normalizeConfig).
4. Đập trúng con đang đậu: +2, không tính nốt (T2).
5. Người quay nghiêng mất 1 tai → khung đầu dự phòng từ mắt (T1).

---

### Task 1: `public/lib/body-frames.mjs` + `tests/body-frames.test.mjs`
Produces: `bodyFrames(pose, prev, opts)` → `{ seen, head:{O,u,v,width}|null, torso:{O,u,v}|null, shoulderW, pts }` (pts = 33 điểm đã EMA 0.6; `prev` = kết quả lần trước hoặc null); `toStage(mark, frames)`, `toLocal(x, y, frame, frames)`; `biteSpots(frames, zones)` → 7 điểm `{x,y,frame,a,b,zone}` theo bảng a,b: forehead (0,-0.45) head; cheekL (-0.35,0.15) head; cheekR (0.35,0.15) head; chin (0,0.5) head; neck (0,0.95) head; shoulderL (-0.4,0.05) torso; shoulderR (0.4,0.05) torso.
Tests: pose giả 33 điểm (tai 7/8, mắt 2/5, mũi 0, vai 11/12, hông 23/24, v=1) → head.O = giữa tai, |u| = width = khoảng cách tai; toStage(toLocal(p)) ≈ p (sai số < 1e-6); mất tai phải (v=0.1) → dùng mắt, head vẫn có; không pose → seen false; biteSpots có 7 điểm, zones tắt cheeks → 5 điểm; EMA: gọi 2 lần pose nhảy 100px → điểm thứ 2 ở giữa (0.6).

### Task 2: Engine — seek/landed/bite, cream, config bite, +2
Produces: config `bite: { enabled, afterSec 20, landSec 1.2, bumpSec 30, maxBumps 12, maxLanded 3, zones{…} }`; `ACTION_TYPES` += 'cream' (preset 🩹 "Kem chống muỗi", limits seconds [1,120], default 30); defaultActions 5 cái; `setBiteSpots(spots)`, `setPersonSeen(seen)`; mosquito `{ age, spot:{x,y,frame,a,b,zone}|null, landedMs }`, state `seek|landed`; `cream(seconds)`, `creamMs`, `bites`; events `landed {id,x,y,zone}`, `bite {id,x,y,frame,a,b,zone}`, `repel {n}`, `cream {ms}`; `applyAction` type cream; hit() coi seek/landed như fly, giết con landed/seek → score +2, event kill có `caught:true`; `snapshot()` thêm `creamMs, bites, landed` (số con đang đậu).
Luật: afterSec thực tế = afterSec × (0.7 + 0.6·rng) × (smart ? 0.6 : 1); chỉ seek khi personSeen && creamMs<=0 && landed < maxLanded && spots.length; seek: bay tới spot với tốc độ speed×1.2, tới ≤25px → landed; landed: vị trí = spot hiện tại (engine cập nhật từ setBiteSpots theo zone), landedMs += dt chỉ khi personSeen; ≥ landSec → bite event, state fly, age 0, slowUntil 5 s (speedMul×0.7); mất người: seek → fly; cream: seek/landed → fly với vận tốc ngược hướng mặt 1400 px/s 350 ms (dùng dodge) + event repel; đích bay khi creamMs>0 tránh mặt (không chọn face target).
Tests: như spec §4 + trần maxLanded + cream cộng dồn trần 120 s + normalizeConfig({}) có bite mặc định + bite.enabled false → không seek.

### Task 3: `public/games/dapmuoi/bumps.js` + test
Produces (UMD, `HpGame.dapmuoiBumps`): `createBumps(cfg)` → `add(mark, now)` (mark {frame,a,b,zone}), `setConfig`, `tick(now)` (xoá hết hạn, trần maxBumps xoá cũ nhất), `startHeal(now)` / `stopHeal()`, `heal(now)` → đang xoa `{bump, progress}`|null (0.5 s giữa các nốt, xoa 0.8 s rồi xoá nốt), `list(frames)` → `[{x,y,alpha,scale,zone,healing,progress}]` (không frames → []), `count()`.
Tests: add 3 → count 3; sau bumpSec+1 → 0; alpha ở 80% tuổi < 1; 13 nốt → 12; heal: t=0 bắt đầu nốt cũ nhất, t=800 xoá, t=1300 bắt đầu nốt kế; list không frames → [].

### Task 4: Overlay
- Mỗi khung: `frames = bodyFrames(tracker.pose, frames)`; `engine.setPersonSeen(frames.seen)`; `engine.setBiteSpots(biteSpots(frames, cfg.bite.zones))`.
- Vẽ: con `landed` vẽ tại spot (engine đã cập nhật), cánh đứng (không flap), bụng phồng theo landedMs/landSec (scale y 1→1.25 phần bụng: đơn giản scale cả con 1→1.15 + đỏ dần mắt); con `seek` vẽ bình thường.
- Bumps: `bumps.add` khi event bite; vẽ `bumps.list(frames)` bằng gradient đỏ (sprite `not-muoi-can.svg` nếu nạp được) đường kính 46×(head.width/220), alpha; "Ái!" label; âm "tít".
- Cream: khi `creamMs>0` → `bumps.startHeal`; vẽ tuýp `kem-chong-muoi.svg` cạnh nốt đang xoa, xoay tròn r=18px theo progress, vệt trắng alpha; viền xanh ngọc 1 s lúc bật; HUD chip "🩹 Kem Ns", "🩸 Bị chích N".
- SVG tạm: `kem-chong-muoi.svg` (200×320), `not-muoi-can.svg` (120×120) — user đè sau.
- Kiểm chứng OBS thật: chờ 20 s không vỗ → đậu → nốt; gửi cream → xoa mất.

### Task 5: Panel + mặc định hành động
- Tab Muỗi: thẻ "🩸 MUỖI CHÍCH": bật/tắt, afterSec 5–120, landSec 0.3–5, bumpSec 5–120, maxBumps 1–30, maxLanded 1–10, 5 checkbox vùng.
- Tab Quà: nút "+ 🩹 Kem chống muỗi" tự có nhờ ACTION_TYPES; PARAM_LABELS/TYPE_HINT thêm cream.
- Kiểm chứng: lưu config bite; Gửi thử Kem.

### Task 6: Hoàn tất
- `npm test`, commit từng task, cập nhật CLAUDE.md dòng dapmuoi (thêm chích/kem), memory.
