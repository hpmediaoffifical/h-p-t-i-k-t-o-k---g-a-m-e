# VIP Welcome Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TTS đọc tên theo bậc, khách quen theo buổi, gộp thẻ khi đông, BXH ghé phòng (panel + OBS), phím tắt skip/clear.
**Architecture:** 3 module thuần mới trong `lib/vipwelcome/` (visits, batcher, tts-text) + nối dây server.js, overlay, board overlay mới, panel, electron-main hotkeys.
**Tech Stack:** Node/Express/socket.io, Electron globalShortcut, vanilla JS/CSS.
**Spec:** `docs/superpowers/specs/2026-10-13-vipwelcome-phase3-design.md`

## Global Constraints
- Giữ CRLF ở file public/*, server.js working copy CRLF (autocrlf); test `tests/*.test.js`.
- Mặc định: batch.belowTierLevel 25, groupMs 2500, windowMs 3000, tts.volume 90, hotkeys tắt, board.limit 10, scope 'month'.
- Không release; commit trên `feature/vipwelcome-phase3`.

## Review Focus
- Cùng roomId vào nhiều lần → visitNo không tăng (visits test `same room`).
- Kết nối lại giữa buổi (preserveSession) không mở buổi mới (server: startRoom idempotent theo roomId).
- Thẻ gộp chưa ack → các người trong nhóm không bị tính đã chào / ghé (ack thẻ gộp mới record).
- TTS lỗi mạng (Google 502) → overlay bỏ mục, hàng không kẹt (audio onerror → finish).
- Hotkey trùng phím đã đăng ký → register trả false, log, không crash.

---

### Task 1: tts-text
Create `lib/vipwelcome/tts-text.js` (`renderTts(template, ctx)`), test `tests/vipwelcome-tts-text.test.js`: điền biến, bỏ emoji, cắt 80, enigma → ''.

### Task 2: visits
Create `lib/vipwelcome/visits.js` theo spec; test `tests/vipwelcome-visits.test.js`: same room, streak +1 buổi kế, vắng 1 buổi → 1, tháng mới reset monthCount, top all/month, corrupt file, `__proto__`, peek không ghi, rekey.

### Task 3: batcher
Create `lib/vipwelcome/batcher.js`; test `tests/vipwelcome-batcher.test.js`: vắng không gộp, đông + bậc thấp gộp, priority ≥ threshold không gộp, due sau groupMs, nhóm mới sau flush, total vs members ≤ 3.

### Task 4: server wiring
server.js: config defaults/migrate (tier-match normalizeTier thêm tts, makeDefaultJoinCard thêm batch/showVisits/tts/hotkeys/board), startRoom ở connect, join pipeline (batch/visit/tts), cardShown ghi visits + board emit, trigger skip/clearAll, REST visits, route board, hotkey bridge call. `node --check`, npm test, giả lập.

### Task 5: overlay + board
overlay.html/joincard.css: chip visits, thẻ gộp, mục tts, skip. Mới: `public/games/vipwelcome/board.html` (+ style trong file). Preview verify.

### Task 6: panel + electron hotkeys
vipwelcome-panel.js/game.js/index.html/style.css: TTS fields + nghe thử, settings mới, tab 🏆 Ghé phòng. electron-main.js `applyVipwelcomeHotkeys`. Preview verify.

### Task 7: review toàn nhánh + sửa + commit
