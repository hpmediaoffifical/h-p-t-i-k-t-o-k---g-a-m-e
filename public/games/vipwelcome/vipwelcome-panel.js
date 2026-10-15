/* ============================================================
   HP VIP Welcome — Panel controller (app side)
   ============================================================
   - Tab "Người chỉ định": list rules cho từng TikTok ID (join/gift)
   - Tab "Tất cả user": global rules (any user) với min level/diamond
   - Tab "Cài đặt": display + queue + cooldown
   - Tab "Hàng đợi": current queue + log gần nhất

   Server là authoritative — mọi rule check + queue đều ở server.
   Panel chỉ edit config, upload media, test rule, hiển thị log.
   ============================================================ */
(function () {
    'use strict';

    let socket = null;
    let cfg = null;
    let initialized = false;
    let pendingSave = null;
    let currentTab = 'overview';

    // Các loại trigger TikTok event mà user-rule có thể chọn
    const TRIGGER_DEFS = [
        { id: 'join',     emoji: '🚪', label: 'Vào phòng' },
        { id: 'like',     emoji: '❤️', label: 'Táp tim' },
        { id: 'follow',   emoji: '➕', label: 'Follow LIVE' },
        { id: 'share',    emoji: '📤', label: 'Share LIVE' },
        { id: 'comment',  emoji: '💬', label: 'Comment' },
        { id: 'envelope', emoji: '🧧', label: 'Gửi bao lì xì' },
        { id: 'subscribe', emoji: '⭐', label: 'Đăng ký kênh (Sub)' },
        { id: 'gift',     emoji: '🚀', label: 'Lên cấp (gift)' }
    ];
    function triggerLabel(id) {
        const t = TRIGGER_DEFS.find(x => x.id === id);
        return t ? `${t.emoji} ${t.label}` : id;
    }
    // Icon cho hàng đợi / log theo eventType (gift giữ 🎁 như cũ, subscribe → ⭐, join → 🚪)
    function eventIcon(eventType) {
        if (eventType === 'gift') return '🎁';
        const t = TRIGGER_DEFS.find(x => x.id === eventType);
        return t ? t.emoji : '🚪';
    }

    // 12 phong cách lời chúc — phải khớp với class style-* trong overlay.html
    const LABEL_STYLE_DEFS = [
        { id: 'goldpink', label: 'Vàng - Hồng', emoji: '🌟' },
        { id: 'royal',    label: 'Hoàng gia',   emoji: '👑' },
        { id: 'neon',     label: 'Neon Cyan',   emoji: '💎' },
        { id: 'fire',     label: 'Lửa',         emoji: '🔥' },
        { id: 'luxury',   label: 'Sang trọng',  emoji: '✨' },
        { id: 'pastel',   label: 'Pastel',      emoji: '🌸' },
        { id: 'emerald',  label: 'Ngọc lục bảo',emoji: '🍃' },
        { id: 'ocean',    label: 'Đại dương',   emoji: '🌊' },
        { id: 'vietnam',  label: 'Việt Nam',    emoji: '⭐' },
        { id: 'rainbow',  label: 'Cầu vồng',    emoji: '🌈' },
        { id: 'glass',    label: 'Kính mờ',     emoji: '🪟' },
        { id: 'cyber',    label: 'Cyber Punk',  emoji: '🤖' }
    ];

    // Các rule "Tất cả user" của 1 profile: key trong profile, host card trong index.html,
    // ruleType gửi lên /trigger, nhãn hiển thị. Thêm rule global mới = thêm 1 dòng ở đây
    // (+ default trong game.js newProfile + <div id=host> trong index.html).
    // (Vào phòng cho mọi người đã chuyển sang tab "Bậc vào phòng" — profile.joinTiers.)
    const GLOBAL_KINDS = {
        gift:     { key: 'globalGift',      host: '#vw-global-gift-card',      ruleType: 'globalGift',      emoji: '🚀', title: 'Lên cấp',            testLabel: 'Tất cả lên cấp',      ph: 'VD: Chúc mừng {nickname} lên cấp {level}!' },
        subscribe: { key: 'globalSubscribe', host: '#vw-global-subscribe-card', ruleType: 'globalSubscribe', emoji: '⭐', title: 'Đăng ký kênh (Sub)', testLabel: 'Tất cả đăng ký kênh', ph: 'VD: Cảm ơn {nickname} đã đăng ký kênh! {sub}' }
    };

    const $ = (sel, ctx = document) => ctx.querySelector(sel);

    window.HpVipWelcomePanel = {
        async open(sharedSocket) {
            socket = sharedSocket || window.io();
            if (!initialized) await init();
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            $('#view-vipwelcome')?.classList.add('active');
            render();
            fetchQueueSnapshot();
            startStatusPoll();
        }
    };

    // Poll user-rule status periodically — hiển thị countdown / ready trên rule card
    let statusPollTimer = null;
    async function pollUserStatus() {
        try {
            const view = document.querySelector('#view-vipwelcome');
            const usersPane = document.querySelector('.vw-pane.active[data-vw-pane="users"]');
            // Chỉ poll khi đang ở tab Người chỉ định để tiết kiệm
            if (!view?.classList.contains('active') || !usersPane) return;
            const r = await fetch('/api/games/vipwelcome/user-status');
            const j = await r.json();
            for (const ruleId of Object.keys(j.statuses || {})) {
                const s = j.statuses[ruleId];
                const el = document.querySelector(`[data-vw-rule-status="${ruleId}"]`);
                if (!el) continue;
                let text = '';
                let cls = 'vw-rule-status';
                if (s.detectedButNotPlayed) {
                    // Đã vào phòng nhưng overlay chưa hiện thẻ — OBS chưa mở link / nhóm tắt / rule tắt.
                    text = j.overlays > 0
                        ? '⚠ Đã vào phòng nhưng KHÔNG hiện được! Kiểm tra: nhóm (profile) có BẬT? rule có ✓? trigger = "Vào phòng"?'
                        : '⚠ Đã vào phòng nhưng chưa có overlay OBS nào mở — thêm link OBS vào Browser Source.';
                    cls += ' status-error';
                } else if (s.status === 'idle') {
                    text = '⏳ Chưa thấy vào phòng trong phiên — sẵn sàng chào khi vào';
                    cls += ' status-idle';
                } else if (s.status === 'detected') {
                    text = `👁 Vừa vào phòng ${s.secondsSinceSignal}s trước — đang chờ overlay hiện thẻ`;
                    cls += ' status-inroom';
                } else if (s.status === 'welcomed') {
                    text = `✅ Đã chào ${s.secondsSinceWelcome}s trước · vào phòng ${s.joinCount} lần — vào lại sẽ chào tiếp`;
                    cls += ' status-ready';
                }
                el.className = cls;
                const textEl = el.querySelector('.vw-rule-status-text');
                if (textEl) textEl.textContent = text;
                else el.textContent = text;
                // Fire count badge
                const fcEl = document.querySelector(`[data-vw-rule-firecount="${ruleId}"]`);
                if (fcEl) {
                    if (s.fireCount > 0) {
                        fcEl.hidden = false;
                        fcEl.textContent = `🔥 ${s.fireCount}`;
                    } else {
                        fcEl.hidden = true;
                    }
                }
            }
        } catch (e) { /* ignore */ }
    }
    function startStatusPoll() {
        if (statusPollTimer) return;
        pollUserStatus();
        statusPollTimer = setInterval(pollUserStatus, 2000);
    }

    async function init() {
        try {
            const r = await fetch('/api/games/vipwelcome/config');
            cfg = await r.json();
        } catch (e) {
            cfg = window.HpGame.vipwelcome.defaultConfig();
        }
        // Đồng bộ defaults nếu config thiếu field (vd: bản app cũ)
        const def = window.HpGame.vipwelcome.defaultConfig();
        cfg = deepMerge(def, cfg || {});
        // Migrate inline: nếu config từ server vẫn ở schema cũ (không có profiles) thì wrap.
        if (!Array.isArray(cfg.profiles) || cfg.profiles.length === 0) {
            const p = window.HpGame.vipwelcome.newProfile('Nhóm mặc định');
            if (Array.isArray(cfg.userRules)) p.userRules = cfg.userRules;
            if (cfg.globalJoin) Object.assign(p.globalJoin, cfg.globalJoin);
            if (cfg.globalGift) Object.assign(p.globalGift, cfg.globalGift);
            if (cfg.globalSubscribe) Object.assign(p.globalSubscribe, cfg.globalSubscribe);
            cfg.profiles = [p];
            cfg.activeProfileId = p.id;
            delete cfg.userRules; delete cfg.globalJoin; delete cfg.globalGift; delete cfg.globalSubscribe;
        }
        // deepMerge ở trên KHÔNG đi vào mảng profiles → profile cũ (thiếu globalSubscribe hoặc các
        // field lọc TOP/Fan/Sub/Follow) được fill default tại đây, không ghi đè giá trị đã có.
        for (const p of cfg.profiles) normalizeProfile(p);
        // Ensure activeProfileId valid
        const ids = cfg.profiles.map(p => p.id);
        if (!ids.includes(cfg.activeProfileId)) cfg.activeProfileId = cfg.profiles[0].id;

        wireOverlayCopy();
        wireTabs();
        wireToolbar();
        wireQueueButtons();
        wireProfileBar();

        // Socket listeners — log trigger realtime
        if (socket) {
            socket.on('gameConfig', ({ gameId, config }) => {
                if (gameId !== 'vipwelcome' || !config || !cfg) return;
                cfg.enabled = config.enabled !== false;
                syncPowerBtn();
            });
            socket.on('vipwelcome:log', (entry) => addLogLine(entry));
            socket.on('vipwelcome:logCleared', () => {
                const log = $('#vw-log');
                if (log) log.innerHTML = '<div class="vw-empty">Chưa có log nào.</div>';
            });
            socket.on('vipwelcome:queue', (data) => {
                const el = $('#vipwelcome-queue-size');
                if (el) el.textContent = data?.size ?? 0;
            });
        }

        initialized = true;
    }

    // === Custom prompt modal — Electron block window.prompt(), tự build modal đơn giản ===
    function vwPrompt(title, defaultValue) {
        return new Promise((resolve) => {
            // Tạo overlay + card lần đầu, reuse cho lần sau
            let overlay = document.getElementById('vw-prompt-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'vw-prompt-overlay';
                overlay.className = 'vw-prompt-overlay';
                overlay.innerHTML = `
                    <div class="vw-prompt-card">
                        <div class="vw-prompt-title" id="vw-prompt-title"></div>
                        <input type="text" id="vw-prompt-input" class="vw-prompt-input" autocomplete="off" spellcheck="false" />
                        <div class="vw-prompt-actions">
                            <button class="ghost" id="vw-prompt-cancel">Huỷ</button>
                            <button class="primary" id="vw-prompt-ok">OK</button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);
            }
            const titleEl = overlay.querySelector('#vw-prompt-title');
            const inputEl = overlay.querySelector('#vw-prompt-input');
            const okBtn = overlay.querySelector('#vw-prompt-ok');
            const cancelBtn = overlay.querySelector('#vw-prompt-cancel');
            titleEl.textContent = title || 'Nhập giá trị:';
            inputEl.value = defaultValue == null ? '' : String(defaultValue);
            overlay.classList.add('show');
            setTimeout(() => { inputEl.focus(); inputEl.select(); }, 30);
            function cleanup(val) {
                overlay.classList.remove('show');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                inputEl.removeEventListener('keydown', onKey);
                overlay.removeEventListener('click', onBackdrop);
                resolve(val);
            }
            function onOk() { cleanup(inputEl.value.trim() || null); }
            function onCancel() { cleanup(null); }
            function onKey(e) {
                if (e.key === 'Enter') { e.preventDefault(); onOk(); }
                else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
            }
            function onBackdrop(e) { if (e.target === overlay) onCancel(); }
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            inputEl.addEventListener('keydown', onKey);
            overlay.addEventListener('click', onBackdrop);
        });
    }

    // === Profile helpers ===
    function activeProfile() {
        if (!cfg || !Array.isArray(cfg.profiles)) return null;
        return cfg.profiles.find(p => p.id === cfg.activeProfileId) || cfg.profiles[0] || null;
    }

    // Collapse state persisted in localStorage (per-app, không cần đẩy server)
    function getProfileBarCollapsed() {
        try { return localStorage.getItem('vw-profile-bar-collapsed') === '1'; } catch (e) { return false; }
    }
    function setProfileBarCollapsed(v) {
        try { localStorage.setItem('vw-profile-bar-collapsed', v ? '1' : '0'); } catch (e) {}
        applyProfileBarCollapsed();
    }
    function applyProfileBarCollapsed() {
        const bar = document.getElementById('vw-profile-bar');
        const btn = document.getElementById('vw-profile-collapse');
        if (!bar || !btn) return;
        const collapsed = getProfileBarCollapsed();
        bar.classList.toggle('collapsed', collapsed);
        btn.textContent = collapsed ? '▶' : '▼';
        btn.title = collapsed ? 'Mở rộng thanh nhóm' : 'Thu gọn thanh nhóm';
        const nameEl = document.getElementById('vw-profile-active-name');
        if (nameEl) {
            if (collapsed) {
                const p = activeProfile();
                nameEl.textContent = p ? `▸ ${p.name}` : '';
                nameEl.hidden = false;
            } else {
                nameEl.hidden = true;
            }
        }
    }

    function wireProfileBar() {
        $('#vw-profile-collapse')?.addEventListener('click', () => {
            setProfileBarCollapsed(!getProfileBarCollapsed());
        });
        applyProfileBarCollapsed();
        $('#vw-btn-new-profile')?.addEventListener('click', async () => {
            const name = await vwPrompt('Tên nhóm hồ sơ mới:', `Nhóm ${(cfg.profiles?.length || 0) + 1}`);
            if (!name) return;
            const p = window.HpGame.vipwelcome.newProfile(name);
            cfg.profiles.push(p);
            cfg.activeProfileId = p.id;
            await persistConfig();
            render();
            flashOk(`Đã tạo nhóm "${p.name}"`);
        });
        $('#vw-btn-rename-profile')?.addEventListener('click', async () => {
            const p = activeProfile(); if (!p) return;
            const name = await vwPrompt('Tên nhóm mới:', p.name);
            if (!name || name === p.name) return;
            p.name = name;
            await persistConfig();
            renderProfileChips();
            renderGlobalTab();
            renderUserRulesTab();
            flashOk('Đã đổi tên nhóm');
        });
        $('#vw-btn-clone-profile')?.addEventListener('click', async () => {
            const src = activeProfile(); if (!src) return;
            const clone = JSON.parse(JSON.stringify(src));
            clone.id = window.HpGame.vipwelcome.newProfileId();
            clone.name = src.name + ' (bản sao)';
            // Đổi id cho mỗi userRule để cooldown không đè
            for (const r of (clone.userRules || [])) r.id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            cfg.profiles.push(clone);
            cfg.activeProfileId = clone.id;
            await persistConfig();
            render();
            flashOk(`Đã nhân bản → "${clone.name}"`);
        });
        // Export profile to JSON file
        $('#vw-btn-export-profile')?.addEventListener('click', () => {
            const p = activeProfile(); if (!p) return;
            // Snapshot — cloning để không expose id thực tế (sẽ regenerate khi import)
            const exportObj = {
                _hpExport: 'vipwelcome-profile',
                _version: 1,
                _exportedAt: new Date().toISOString(),
                profile: JSON.parse(JSON.stringify(p))
            };
            // Strip ID — sẽ regenerate khi import
            delete exportObj.profile.id;
            for (const r of (exportObj.profile.userRules || [])) delete r.id;
            const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const safeName = (p.name || 'nhom').replace(/[^\w\-]+/g, '_').slice(0, 40);
            a.download = `vipwelcome-${safeName}-${Date.now().toString(36)}.json`;
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
            flashOk(`Đã xuất nhóm "${p.name}" — file đang tải xuống`);
        });
        // Import profile from JSON
        $('#vw-btn-import-profile')?.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'application/json,.json'; inp.style.display = 'none';
            document.body.appendChild(inp);
            inp.onchange = async () => {
                const f = inp.files?.[0]; inp.remove();
                if (!f) return;
                try {
                    const txt = await f.text();
                    const obj = JSON.parse(txt);
                    if (!obj || obj._hpExport !== 'vipwelcome-profile' || !obj.profile) {
                        flashWarn('File không phải dạng VIP Welcome profile hợp lệ');
                        return;
                    }
                    const imported = obj.profile;
                    // Regenerate IDs
                    imported.id = window.HpGame.vipwelcome.newProfileId();
                    imported.name = (imported.name || 'Nhóm import') + ' (import)';
                    if (Array.isArray(imported.userRules)) {
                        for (const r of imported.userRules) r.id = window.HpGame.vipwelcome.newRuleId();
                    }
                    normalizeProfile(imported);   // file export từ bản cũ có thể thiếu globalSubscribe / field lọc mới
                    cfg.profiles = cfg.profiles || [];
                    cfg.profiles.push(imported);
                    cfg.activeProfileId = imported.id;
                    await persistConfig();
                    render();
                    flashOk(`Đã import nhóm "${imported.name}" — ${(imported.userRules || []).length} user rule`);
                } catch (e) {
                    flashWarn('Lỗi import: ' + e.message);
                }
            };
            inp.click();
        });
        $('#vw-btn-delete-profile')?.addEventListener('click', async () => {
            const p = activeProfile(); if (!p) return;
            if (cfg.profiles.length <= 1) {
                flashWarn('Cần ít nhất 1 nhóm — không thể xoá nhóm cuối cùng');
                return;
            }
            const ok = await (window.hpConfirm ? window.hpConfirm({
                icon: '🗑', tone: 'danger',
                title: 'Xoá nhóm hồ sơ',
                body: `Xoá nhóm <b>"${escapeHtml(p.name)}"</b>?<br><span style="color:#8b93a8">Mọi rule + cài đặt trong nhóm này sẽ MẤT vĩnh viễn.</span>`,
                okLabel: 'Xoá nhóm', cancelLabel: 'Huỷ'
            }) : Promise.resolve(confirm(`Xoá nhóm "${p.name}"?`)));
            if (!ok) return;
            cfg.profiles = cfg.profiles.filter(x => x.id !== p.id);
            cfg.activeProfileId = cfg.profiles[0].id;
            await persistConfig();
            render();
            flashOk('Đã xoá nhóm');
        });
    }

    function renderProfileChips() {
        const host = $('#vw-profile-chips');
        if (!host) return;
        // Update collapsed-mode active-name display
        applyProfileBarCollapsed();
        const profiles = cfg.profiles || [];
        host.innerHTML = profiles.map(p => {
            const isActive = p.id === cfg.activeProfileId;
            return `<div class="vw-profile-chip${isActive ? ' active' : ''}${p.enabled ? ' on' : ' off'}" data-vw-profile-id="${p.id}" title="${p.enabled ? 'Đang BẬT' : 'Đang TẮT'} — bấm vào ô để chọn nhóm. Bấm checkbox để bật/tắt.">
                <label class="vw-profile-toggle" title="Bật / Tắt nhóm này (không cần chọn để bật)">
                    <input type="checkbox" data-vw-profile-enabled ${p.enabled ? 'checked' : ''} />
                </label>
                <span class="vw-profile-name">${escapeHtml(p.name)}</span>
                <span class="vw-profile-count" title="Số rule cá nhân + số rule chung (gồm bậc vào phòng đang bật)">${(p.userRules?.length || 0)}+${(p.joinTiers || []).filter(t => t.enabled !== false).length + (p.globalGift?.enabled ? 1 : 0) + (p.globalSubscribe?.enabled ? 1 : 0)}</span>
            </div>`;
        }).join('');
        // Wire chips — toàn chip clickable để chọn nhóm (hit area lớn).
        // Checkbox dùng stopPropagation để toggle độc lập, không trigger chọn.
        host.querySelectorAll('.vw-profile-chip').forEach(chip => {
            const pid = chip.dataset.vwProfileId;
            // Click bất kỳ đâu trong chip → pick (trừ click vào checkbox/label toggle)
            chip.addEventListener('click', async (e) => {
                // Defensive: skip nếu click vào input checkbox HOẶC label toggle
                if (e.target.matches?.('[data-vw-profile-enabled]')) return;
                if (e.target.closest?.('.vw-profile-toggle')) return;
                if (cfg.activeProfileId === pid) return;
                cfg.activeProfileId = pid;
                await persistConfig();
                render();
            });
            const cb = chip.querySelector('[data-vw-profile-enabled]');
            if (cb) {
                cb.addEventListener('click', (e) => { e.stopPropagation(); });
                cb.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const p = cfg.profiles.find(x => x.id === pid); if (!p) return;
                    p.enabled = !!e.target.checked;
                    await persistConfig();
                    renderProfileChips();
                });
            }
            const toggleLabel = chip.querySelector('.vw-profile-toggle');
            toggleLabel?.addEventListener('click', (e) => { e.stopPropagation(); });
        });
    }

    function deepMerge(base, patch) {
        const out = { ...base };
        for (const k of Object.keys(patch || {})) {
            const v = patch[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                out[k] = deepMerge(base[k] || {}, v);
            } else if (v !== undefined) out[k] = v;
        }
        return out;
    }

    // Fill field thiếu cho 1 profile (config cũ trên đĩa / import JSON cũ) — giữ nguyên giá trị đã có.
    function normalizeProfile(p) {
        if (!p || typeof p !== 'object') return p;
        const pdef = window.HpGame.vipwelcome.newProfile('');
        for (const K of Object.values(GLOBAL_KINDS)) p[K.key] = deepMerge(pdef[K.key], p[K.key] || {});
        if (!Array.isArray(p.userRules)) p.userRules = [];
        if (!Array.isArray(p.joinTiers)) p.joinTiers = window.HpGame.vipwelcome.defaultTiers();
        p.joinTiers = p.joinTiers.map(t => window.HpGame.vipwelcome.newTier(t));
        return p;
    }

    // Dữ liệu user giả cho nút TEST — gửi kèm cờ TOP/Fan/Sub/Follow/diamond để server (khi hỗ trợ)
    // render được {rank} {fans} {sub} {mod} {diamond}. Cờ bật theo điều kiện rule đang tick để test luôn qua lọc.
    function fakeTestUserFields(g, kind) {
        return {
            isTopUser: !!g?.requireTopUser,
            topUserNo: g?.requireTopUser ? 1 : 0,
            fansLevel: Number(g?.minFansLevel) || 0,
            isSubscriber: kind === 'subscribe' || !!g?.requireSubscriber,
            isFollowing: !!g?.requireFollowing,
            diamondCount: 99
        };
    }

    function wireTabs() {
        const tabs = document.querySelectorAll('#view-vipwelcome .vw-tab');
        tabs.forEach(t => {
            t.addEventListener('click', () => {
                tabs.forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                currentTab = t.dataset.vwTab;
                document.querySelectorAll('#view-vipwelcome .vw-pane').forEach(p => {
                    p.classList.toggle('active', p.dataset.vwPane === currentTab);
                });
                if (currentTab === 'stats') { fetchQueueSnapshot(); fetchLedger(); fetchVisits(); }
                if (currentTab === 'overview') renderOverviewTab();
            });
        });
    }

    // Đồng bộ giao diện nút power theo cfg.enabled (BẬT = xanh "ĐANG CHẠY").
    function syncPowerBtn() {
        const btn = $('#vipwelcome-power');
        if (!btn) return;
        const on = cfg && cfg.enabled !== false;
        btn.classList.toggle('on', on);
        btn.classList.toggle('off', !on);
        const ico = btn.querySelector('.hp-power-ico');
        const txt = btn.querySelector('.hp-power-text');
        if (ico) ico.textContent = on ? '▶' : '⏹';
        if (txt) txt.textContent = on ? 'ĐANG CHẠY' : 'ĐÃ TẮT';
        btn.title = on
            ? 'Đang chạy — bấm để TẮT (dừng ngay video đang phát + xoá hàng đợi + không nhận sự kiện mới)'
            : 'Đã tắt — bấm để BẬT lại';
    }

    function wireToolbar() {
        // Công tắc BẬT/TẮT gộp: 1 nút vừa là trạng thái vừa dừng ngay khi tắt.
        $('#vipwelcome-power')?.addEventListener('click', async () => {
            const turningOff = (cfg.enabled !== false); // đang chạy → bấm để tắt
            cfg.enabled = !turningOff;
            syncPowerBtn();
            await persistConfig();
            if (turningOff) {
                // Tắt = dừng phát + xoá hàng đợi ngay (server reset playback state).
                await fetch('/api/games/vipwelcome/trigger', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'stop' })
                });
            }
        });
    }

    function wireOverlayCopy() {
        const inp = $('#vipwelcome-overlay-url');
        const url = (window.buildOverlayURL ? window.buildOverlayURL('/overlay/vipwelcome') : (location.origin + '/overlay/vipwelcome'));
        if (inp) inp.value = url;
        $('#vipwelcome-btn-copy')?.addEventListener('click', async () => {
            const ok = window.hpCopyText ? await window.hpCopyText(url) : false;
            if (ok) flashOk('✓ Đã copy link OBS');
            else flashWarn('Copy thất bại — link: ' + url);
        });
        $('#vipwelcome-btn-reload')?.addEventListener('click', async () => {
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'reloadOverlay' })
            });
            flashOk('Đã gửi lệnh reload — mọi overlay OBS sẽ refresh trong 1s');
        });
    }

    function wireQueueButtons() {
        $('#vipwelcome-btn-clear-queue')?.addEventListener('click', async () => {
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clearQueue' })
            });
            fetchQueueSnapshot();
            flashOk('Đã xoá hàng đợi');
        });
        $('#vipwelcome-btn-clear-log')?.addEventListener('click', async () => {
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'clearLog' })
            });
            const log = $('#vw-log');
            if (log) log.innerHTML = '<div class="vw-empty">Chưa có log nào.</div>';
            flashOk('Đã xoá log');
        });
        $('#vipwelcome-btn-reset-cooldown')?.addEventListener('click', async () => {
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'resetCooldown' })
            });
            flashOk('Đã reset cooldown tất cả user');
        });
        $('#vipwelcome-btn-reset-session')?.addEventListener('click', async () => {
            if (!confirm('Reset toàn bộ session state? Tất cả user đã fire trong phiên này sẽ được fire lại nếu họ tiếp tục tương tác.')) return;
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'resetSession' })
            });
            flashOk('Đã reset phiên — user sẽ fire lại khi có tương tác mới');
        });
    }

    function render() {
        if (!cfg) return;
        syncPowerBtn();
        renderProfileChips();
        renderOverviewTab();
        renderUserRulesTab();
        renderTiersTab();
        renderGlobalTab();
        renderSettingsTab();
        renderLedgerShell();
        renderVisitsShell();
    }

    // ============================================================
    // TAB 1: USER RULES
    // ============================================================
    function renderUserRulesTab() {
        const host = $('#vw-user-rules-list');
        if (!host) return;
        const profile = activeProfile();
        const rules = (profile?.userRules) || [];
        if (rules.length === 0) {
            host.innerHTML = `<div class="vw-empty">Nhóm <b>"${escapeHtml(profile?.name || '')}"</b> chưa có user. Bấm "➕ Thêm user" để cài hiệu ứng cho 1 TikTok ID cụ thể.</div>`;
        } else {
            host.innerHTML = rules.map(r => renderUserRuleCard(r)).join('');
            wireUserRuleCards();
        }
        // Re-wire buttons mỗi lần render
        // Gắn 1 lần (cờ _vwWired) — {once:true} cũ làm nút "Test all" chết sau lần bấm đầu tiên.
        const addBtn = $('#vw-btn-add-user-rule');
        if (addBtn && !addBtn._vwWired) { addBtn._vwWired = true; addBtn.addEventListener('click', addUserRule); }
        const testBtn = $('#vw-btn-test-all');
        if (testBtn && !testBtn._vwWired) { testBtn._vwWired = true; testBtn.addEventListener('click', testAllRules); }
        // Search filter — keep state across re-renders via input itself
        const searchEl = $('#vw-rule-search');
        if (searchEl && !searchEl._vwWired) {
            searchEl._vwWired = true;
            searchEl.addEventListener('input', () => applyRuleSearchFilter(searchEl.value));
        }
        if (searchEl?.value) applyRuleSearchFilter(searchEl.value);
    }

    function applyRuleSearchFilter(query) {
        const q = String(query || '').toLowerCase().trim();
        const cards = document.querySelectorAll('#vw-user-rules-list .vw-rule-card');
        let hidden = 0;
        cards.forEach(card => {
            const ruleId = card.dataset.vwRule;
            const p = activeProfile();
            const rule = (p?.userRules || []).find(r => r.id === ruleId);
            if (!rule) return;
            const haystack = (
                (rule.uniqueId || '') + ' ' +
                (rule.message || '') + ' ' +
                (rule.mediaName || '') + ' ' +
                (rule.trigger || '')
            ).toLowerCase();
            const match = !q || haystack.includes(q);
            card.style.display = match ? '' : 'none';
            if (!match) hidden++;
        });
    }

    async function testAllRules() {
        const profile = activeProfile();
        if (!profile) return flashWarn('Không có nhóm');
        const items = [];
        for (const r of (profile.userRules || [])) {
            // Vào phòng: thẻ hiện được cả khi không có media
            if (r.enabled !== false && (r.mediaUrl || r.trigger === 'join')) {
                items.push({ kind: 'user', ruleId: r.id, label: '@' + r.uniqueId });
            }
        }
        for (const [kindId, K] of Object.entries(GLOBAL_KINDS)) {
            const g = profile[K.key];
            if (g?.enabled && g?.mediaUrl) items.push({ kind: K.ruleType, kindId, label: K.testLabel });
        }
        if (items.length === 0) return flashWarn('Không có rule nào ENABLED + có media để test');
        flashOk(`Test ${items.length} rule lần lượt...`);
        const gapMs = Math.max(800, (cfg.queue?.perItemMinMs || 200) + 600);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const payload = it.kind === 'user'
                ? { profileId: cfg.activeProfileId, ruleType: 'user', ruleId: it.ruleId, uniqueId: 'tester', nickname: 'Test', level: 99 }
                : { profileId: cfg.activeProfileId, ruleType: it.kind, uniqueId: 'tester', nickname: 'Test', level: 99, giftName: 'Quà thử',
                    ...fakeTestUserFields(profile[GLOBAL_KINDS[it.kindId]?.key], it.kindId) };
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'test', payload })
            });
            if (i < items.length - 1) await new Promise(r => setTimeout(r, gapMs));
        }
        flashOk(`Xong — đã fire ${items.length} rule`);
    }

    function renderUserRuleCard(r) {
        const hasFile = !!r.mediaUrl;
        const fileName = r.mediaName || (r.mediaUrl ? r.mediaUrl.split('/').pop() : '');
        const typeBadge = hasFile ? (r.mediaType === 'video' ? '🎞 VIDEO' : (r.mediaType === 'audio' ? '🔊 ÂM' : '📄')) : '';
        const triggerDef = TRIGGER_DEFS.find(t => t.id === r.trigger) || TRIGGER_DEFS[0];
        const isJoin = (r.trigger || 'join') === 'join';
        const ruleStyleOptions = ['<option value="">— Theo phong cách nhóm —</option>']
            .concat(LABEL_STYLE_DEFS.map(s => `<option value="${s.id}" ${r.labelStyle === s.id ? 'selected' : ''}>${s.emoji} ${escapeHtml(s.label)}</option>`));
        return `<div class="vw-rule-card${r.enabled === false ? ' disabled' : ''}${hasFile ? ' has-file' : ''}" data-vw-rule="${r.id}">
            <div class="vw-rule-status" data-vw-rule-status="${r.id}">
                <span class="vw-rule-status-text">⏳ Đang chờ user...</span>
                <span class="vw-rule-fire-count" data-vw-rule-firecount="${r.id}" title="Số lần fire trong phiên này" hidden>🔥 0</span>
            </div>
            <div class="vw-rule-head">
                <span class="vw-rule-emoji">${triggerDef.emoji}</span>
                <input type="text" class="vw-rule-uid" placeholder="@tiktok_id" data-vw-uid value="${escapeHtml(r.uniqueId || '')}" />
                <select data-vw-trigger class="vw-rule-trigger">
                    ${TRIGGER_DEFS.map(t => `<option value="${t.id}" ${r.trigger === t.id ? 'selected' : ''}>${t.emoji} ${escapeHtml(t.label)}</option>`).join('')}
                </select>
                <label class="vw-rule-toggle" title="Bật / Tắt rule"><input type="checkbox" data-vw-toggle ${r.enabled === false ? '' : 'checked'} /></label>
                <button class="ghost mini" data-vw-clone title="Sao chép rule này">📋</button>
                <button class="ghost mini danger" data-vw-delete title="Xoá rule">🗑</button>
            </div>
            <div class="vw-rule-file" title="${escapeHtml(fileName)}">
                ${hasFile
                    ? `<span class="vw-file-badge">${typeBadge}</span><span class="vw-file-name">${escapeHtml(fileName)}</span>`
                    : '<span class="vw-file-empty">Chưa chọn file — bấm "📁 Chọn" hoặc kéo thả file vào đây</span>'
                }
            </div>
            <div class="vw-rule-row">
                <label class="vw-inline">🔊 <input type="range" min="0" max="100" step="5" value="${r.volume ?? 100}" data-vw-volume />
                    <span data-vw-volume-v>${r.volume ?? 100}%</span>
                </label>
            </div>
            ${isJoin ? `<div class="vw-rule-row vw-join-row">
                <label class="vw-inline" title="Nhãn trên thẻ (vd HÀO KIỆT). Để trống = theo bậc người đó đạt">🏷 Danh hiệu
                    <input type="text" maxlength="18" placeholder="Theo bậc" data-vw-title value="${escapeHtml(r.title || '')}" />
                </label>
                <label class="vw-inline">🎨 Skin thẻ
                    <select data-vw-skin>
                        <option value="">— Theo bậc —</option>
                        ${skinOptions(r.skin)}
                    </select>
                </label>
                <label class="vw-inline" title="0 = lần nào vào phòng cũng chào">⏱ Cooldown vào lại (giây)
                    <input type="number" min="0" step="10" data-vw-cooldown value="${Number(r.rejoinCooldownSec) || 0}" />
                </label>
            </div>
            ${ttsRowHtml(r.tts, 'Chào mừng {tên} vào phòng!')}
            <div class="vw-hint">Thẻ hiện cả khi không có file — file video/âm thanh là tuỳ chọn.</div>` : `
            <div class="vw-rule-row">
                <label class="vw-inline vw-msg-row">💬 Lời chúc:
                    <input type="text" placeholder="VD: Chào {nickname} đã ghé phòng!" data-vw-message value="${escapeHtml(r.message || '')}" />
                </label>
            </div>
            <div class="vw-rule-row">
                <label class="vw-inline">🎨 Phong cách
                    <select data-vw-rule-style>
                        ${ruleStyleOptions.join('')}
                    </select>
                </label>
            </div>`}
            <div class="vw-rule-actions">
                <button class="ghost small" data-vw-pick>📁 Chọn file</button>
                <button class="primary small" data-vw-test ${hasFile || isJoin ? '' : 'disabled'}>▶ TEST</button>
                <button class="danger small" data-vw-clear-file ${hasFile ? '' : 'disabled'}>🗑 Xoá file</button>
            </div>
        </div>`;
    }

    function wireUserRuleCards() {
        document.querySelectorAll('#vw-user-rules-list .vw-rule-card').forEach(card => {
            const ruleId = card.dataset.vwRule;
            const getRule = () => {
                const p = activeProfile();
                return (p?.userRules || []).find(r => r.id === ruleId);
            };

            // Drag & drop
            card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', async (e) => {
                e.preventDefault(); card.classList.remove('drag-over');
                const file = e.dataTransfer?.files?.[0];
                if (file) await uploadFileToRule(ruleId, file);
            });

            card.querySelector('[data-vw-uid]')?.addEventListener('input', (e) => {
                const r = getRule(); if (!r) return;
                r.uniqueId = e.target.value.replace(/^@/, '').trim();
                delete r.userId;   // đổi sang người khác → bỏ userId đã học của người cũ
                schedulePersist();
            });
            card.querySelector('[data-vw-trigger]')?.addEventListener('change', (e) => {
                const r = getRule(); if (!r) return;
                r.trigger = e.target.value;
                renderUserRulesTab();
            });
            card.querySelector('[data-vw-toggle]')?.addEventListener('change', (e) => {
                const r = getRule(); if (!r) return;
                r.enabled = !!e.target.checked;
                card.classList.toggle('disabled', !r.enabled);
                schedulePersist();
            });
            card.querySelector('[data-vw-delete]')?.addEventListener('click', async () => {
                const r = getRule(); if (!r) return;
                const ok = await (window.hpConfirm ? window.hpConfirm({
                    icon: '🗑', tone: 'danger',
                    title: 'Xoá rule',
                    body: `Xoá rule cho <b>@${escapeHtml(r.uniqueId || '(chưa đặt ID)')}</b>?<br><span style="color:#8b93a8">Hành động này không thể hoàn tác.</span>`,
                    okLabel: 'Xoá', cancelLabel: 'Huỷ'
                }) : Promise.resolve(confirm(`Xoá rule cho @${r.uniqueId || '(chưa đặt ID)'}?`)));
                if (!ok) return;
                const p = activeProfile(); if (!p) return;
                p.userRules = (p.userRules || []).filter(x => x.id !== ruleId);
                renderUserRulesTab();
                renderProfileChips();
                persistConfig();
            });
            // Sao chép rule
            card.querySelector('[data-vw-clone]')?.addEventListener('click', () => {
                const r = getRule(); if (!r) return;
                const p = activeProfile(); if (!p) return;
                const clone = JSON.parse(JSON.stringify(r));
                clone.id = window.HpGame.vipwelcome.newRuleId();
                clone.uniqueId = '';   // đợi user điền ID mới
                p.userRules.push(clone);
                renderUserRulesTab();
                renderProfileChips();
                persistConfig();
                flashOk('Đã sao chép — điền TikTok ID mới cho bản sao');
            });
            // Sub-style per rule (override profile default)
            card.querySelector('[data-vw-rule-style]')?.addEventListener('change', (e) => {
                const r = getRule(); if (!r) return;
                r.labelStyle = e.target.value || '';
                schedulePersist();
            });
            card.querySelector('[data-vw-pick]')?.addEventListener('click', () => pickFileForRule(ruleId));
            card.querySelector('[data-vw-clear-file]')?.addEventListener('click', () => {
                const r = getRule(); if (!r || !r.mediaUrl) return;
                if (!confirm(`Xoá file "${r.mediaName || ''}" khỏi rule này?`)) return;
                r.mediaUrl = ''; r.mediaName = ''; r.mediaType = '';
                renderUserRulesTab(); persistConfig();
            });
            card.querySelector('[data-vw-title]')?.addEventListener('input', (e) => {
                const r = getRule(); if (!r) return;
                r.title = e.target.value.trim();
                schedulePersist();
            });
            card.querySelector('[data-vw-skin]')?.addEventListener('change', (e) => {
                const r = getRule(); if (!r) return;
                r.skin = e.target.value || '';
                schedulePersist();
            });
            card.querySelector('[data-vw-cooldown]')?.addEventListener('input', (e) => {
                const r = getRule(); if (!r) return;
                r.rejoinCooldownSec = Math.max(0, parseInt(e.target.value, 10) || 0);
                schedulePersist();
            });
            wireTtsRow(card, getRule, 'Chào mừng {tên} vào phòng!');
            card.querySelector('[data-vw-test]')?.addEventListener('click', async () => {
                const r = getRule(); if (!r) return;
                if (!r.mediaUrl && r.trigger !== 'join') { flashWarn('Chưa chọn file'); return; }
                await persistConfig().catch(() => {});   // thử đúng skin/danh hiệu vừa sửa
                await fetch('/api/games/vipwelcome/trigger', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'test', payload: {
                            profileId: cfg.activeProfileId,
                            ruleType: 'user', ruleId,
                            uniqueId: r.uniqueId || 'tester',
                            nickname: r.uniqueId || 'Người Thử',
                            level: Math.max(r.minLevel || 30, 30),
                            giftName: 'Quà thử'
                        }
                    })
                });
                flashOk('Đã test');
            });
            const vol = card.querySelector('[data-vw-volume]');
            const volV = card.querySelector('[data-vw-volume-v]');
            vol?.addEventListener('input', () => {
                const r = getRule(); if (!r) return;
                r.volume = +vol.value;
                if (volV) volV.textContent = vol.value + '%';
                schedulePersist();
            });
            card.querySelector('[data-vw-message]')?.addEventListener('input', (e) => {
                const r = getRule(); if (!r) return;
                r.message = e.target.value;
                schedulePersist();
            });
        });
    }

    function addUserRule() {
        const p = activeProfile();
        if (!p) { flashWarn('Chưa có nhóm — bấm "➕ Tạo nhóm" trước'); return; }
        const r = window.HpGame.vipwelcome.newUserRule();
        p.userRules = p.userRules || [];
        p.userRules.push(r);
        renderUserRulesTab();
        renderProfileChips();
        persistConfig();
    }

    function pickFileForRule(ruleId) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,.mp4,.webm,.mp3,.wav,.ogg,.m4a';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = async () => {
            const f = inp.files?.[0]; inp.remove();
            if (!f) return;
            await uploadFileToRule(ruleId, f);
        };
        inp.click();
    }

    async function uploadFileToRule(ruleId, file) {
        const p = activeProfile(); if (!p) return;
        const r = (p.userRules || []).find(x => x.id === ruleId);
        if (!r) return;
        await uploadFileToTarget(file, (meta) => {
            r.mediaUrl = meta.url;
            r.mediaName = file.name;
            r.mediaType = meta.type;
        }, () => renderUserRulesTab());
    }

    // ============================================================
    // TAB: BẬC VÀO PHÒNG (thẻ thông tin theo LV hoặc FAN LV)
    // ============================================================
    function skinOptions(selected) {
        return window.HpGame.vipwelcome.SKIN_DEFS
            .map(s => `<option value="${s.id}" ${selected === s.id ? 'selected' : ''}>${s.emoji} ${escapeHtml(s.label)}</option>`).join('');
    }

    function mediaBadge(src) {
        if (!src.mediaUrl) return '<span class="vw-file-empty">Chưa có video/âm thanh — chỉ hiện thẻ</span>';
        const name = src.mediaName || src.mediaUrl.split('/').pop();
        return `<span class="vw-file-badge">${src.mediaType === 'video' ? '🎞 VIDEO' : '🔊 ÂM'}</span><span class="vw-file-name">${escapeHtml(name)}</span>`;
    }

    // ===== Đọc tên (TTS) — dùng chung cho bậc và luật @id "Vào phòng" =====
    const TTS_SAMPLE = { 'tên': 'Davina', nickname: 'Davina', 'bậc': 'Hào kiệt', lv: '23', fan: '3', 'lần': '12' };
    function ttsRowHtml(tts, defTemplate) {
        const on = !!tts?.enabled;
        return `<div class="vw-rule-row vw-tts-row">
                <label class="vw-inline" title="Đọc câu này bằng giọng Google sau video/âm thanh của người đó"><input type="checkbox" data-tts-on ${on ? 'checked' : ''} /> 🗣 Đọc tên</label>
                <input type="text" class="vw-tts-template" maxlength="120" data-tts-template value="${escapeHtml(tts?.template || defTemplate)}" placeholder="${escapeHtml(defTemplate)}" />
                <button class="ghost mini" data-tts-listen title="Nghe thử với tên mẫu Davina">▶ Nghe</button>
            </div>
            <div class="vw-hint">Biến: {tên} {bậc} {lv} {fan} {lần} — emoji trong tên tự bỏ, người ẩn danh không đọc.</div>`;
    }
    function wireTtsRow(container, getTarget, defTemplate) {
        const ensure = () => { const o = getTarget(); if (!o) return null; o.tts = o.tts || { enabled: false, template: defTemplate }; return o.tts; };
        container.querySelector('[data-tts-on]')?.addEventListener('change', (e) => { const t = ensure(); if (!t) return; t.enabled = !!e.target.checked; schedulePersist(); });
        container.querySelector('[data-tts-template]')?.addEventListener('input', (e) => { const t = ensure(); if (!t) return; t.template = e.target.value; schedulePersist(); });
        container.querySelector('[data-tts-listen]')?.addEventListener('click', () => {
            const tpl = container.querySelector('[data-tts-template]')?.value || defTemplate;
            const text = tpl.replace(/\{(tên|nickname|bậc|lv|fan|lần)\}/g, (m, k) => TTS_SAMPLE[k] || '').replace(/\s+/g, ' ').trim().slice(0, 80);
            if (!text) return flashWarn('Câu đọc trống');
            const rawVol = Number(cfg.joinCard?.tts?.volume);
            const vol = Math.max(0, Math.min(1, (Number.isFinite(rawVol) ? rawVol : 90) / 100));   // 0 = tắt tiếng thật
            const a = new Audio('/api/live-translate/tts?lang=vi&text=' + encodeURIComponent(text));
            a.volume = vol;
            a.play().catch(() => flashWarn('Không phát được giọng đọc (mạng?)'));
        });
    }

    function renderTierCard(t) {
        return `<div class="vw-tier-card skin-${escapeHtml(t.skin)}${t.enabled === false ? ' disabled' : ''}" data-vw-tier="${t.id}">
            <div class="vw-tier-head">
                <span class="vw-tier-swatch skin-${escapeHtml(t.skin)}"></span>
                <input type="text" class="vw-tier-name" maxlength="18" data-t-name value="${escapeHtml(t.name)}" title="Tên bậc = danh hiệu in trên thẻ" />
                <label class="vw-inline">LV ≥ <input type="number" min="0" max="99" data-t-minlevel value="${t.minLevel || 0}" /></label>
                <span class="vw-tier-or">hoặc</span>
                <label class="vw-inline">FAN ≥ <input type="number" min="0" max="99" data-t-minfans value="${t.minFans || 0}" /></label>
                <label class="vw-rule-toggle" title="Bật / Tắt bậc"><input type="checkbox" data-t-enabled ${t.enabled === false ? '' : 'checked'} /></label>
                <button class="ghost mini danger" data-t-delete title="Xoá bậc">🗑</button>
            </div>
            <div class="vw-rule-row">
                <label class="vw-inline">🎨 Skin <select data-t-skin>${skinOptions(t.skin)}</select></label>
                <label class="vw-inline" title="Ảnh PNG trong suốt đè lên khung avatar mặc định">🖼 Khung avatar
                    <button class="ghost mini" data-t-frame>${t.frameUrl ? '🔁 Đổi' : '📁 Chọn PNG'}</button>
                    ${t.frameUrl ? '<button class="ghost mini danger" data-t-frame-clear title="Bỏ khung PNG">✕</button>' : ''}
                </label>
                <label class="vw-inline" title="0 = lần nào vào phòng cũng chào">⏱ Cooldown vào lại (giây) <input type="number" min="0" step="10" data-t-cooldown value="${t.rejoinCooldownSec || 0}" /></label>
            </div>
            <div class="vw-rule-file">${mediaBadge(t)}</div>
            <div class="vw-rule-row">
                <label class="vw-inline">🔊 <input type="range" min="0" max="100" step="5" value="${t.volume ?? 100}" data-t-volume /> <span data-t-volume-v>${t.volume ?? 100}%</span></label>
            </div>
            ${ttsRowHtml(t.tts, '{bậc} {tên} đã tới phòng!')}
            <div class="vw-rule-actions">
                <button class="ghost small" data-t-pick>📁 Video / âm thanh</button>
                <button class="danger small" data-t-clear ${t.mediaUrl ? '' : 'disabled'}>🗑 Xoá file</button>
                <button class="primary small" data-t-test>▶ Thử</button>
            </div>
        </div>`;
    }

    // ============================================================
    // TAB 0: TỔNG QUAN — ai được chào (lọc cấp), thang bậc, người chỉ định, link OBS
    // ============================================================
    // Khoảng cấp thực tế của từng bậc ĐANG BẬT (bậc i: từ minLevel_i tới minLevel_(i+1) − 1, bậc cuối tới cấp 50 —
    // cấp cao nhất TikTok), cắt theo bộ lọc "từ cấp X trở lên".
    const TIKTOK_MAX_LV = 50;
    function tierLadder(profile, gate) {
        const tiers = (profile?.joinTiers || []).filter(t => t.enabled !== false).slice().sort((a, b) => (a.minLevel || 0) - (b.minLevel || 0));
        const gOn = !!gate?.enabled, gMin = gOn ? (gate.minLevel || 0) : 0;
        return tiers.map((t, i) => {
            const from0 = t.minLevel || 0;
            const nxt = tiers.slice(i + 1).find(x => (x.minLevel || 0) > from0);
            const to = nxt ? nxt.minLevel - 1 : Math.max(from0, TIKTOK_MAX_LV);
            const from = Math.max(from0, gMin);
            const blocked = to < from;
            // FAN của bậc chỉ còn tác dụng khi qua được bộ lọc: lọc tắt → theo bậc; lọc bật → cần cả "Fan club từ cấp"
            const tf = t.minFans || 0;
            const fans = !tf ? 0 : (!gOn ? tf : (gate.minFans ? Math.max(tf, gate.minFans) : 0));
            return { t, from, to, blocked, fans };
        });
    }
    function rangeText(from, to) { return from >= to ? `LV ${from}` : `LV ${from} – ${to}`; }

    function renderOverviewTab() {
        const host = $('#vw-overview-pane');
        if (!host || !cfg) return;
        cfg.joinCard = cfg.joinCard || window.HpGame.vipwelcome.defaultJoinCard();
        const jc = cfg.joinCard;
        const g = jc.gate = Object.assign({ enabled: false, minLevel: 20, minFans: 0 }, jc.gate || {});
        delete g.maxLevel;
        const profile = activeProfile();
        const ladder = tierLadder(profile, g);
        const rules = (profile?.userRules || []).filter(r => (r.trigger || 'join') === 'join');
        const url = $('#vipwelcome-overlay-url')?.value || (location.origin + '/overlay/vipwelcome');
        const lowest = ladder.find(x => !x.blocked);
        const SCALE = TIKTOK_MAX_LV;   // thước 0–50
        const pct = (lv) => Math.max(0, Math.min(100, lv / SCALE * 100));
        const winFrom = g.enabled ? g.minLevel : (lowest ? lowest.from : 0);
        const winTo = SCALE;
        host.innerHTML = `
        <div class="vw-ov">
            <section class="vw-ov-card vw-ov-gate${g.enabled ? ' on' : ''}">
                <div class="vw-ov-head">
                    <div>
                        <div class="vw-ov-title">🛡 Ai được chào?</div>
                        <div class="vw-ov-sub">Lọc theo <b>cấp TikTok</b> để phòng đông không bị spam thẻ chào. Người <b>chỉ định theo ID</b> luôn được chào.</div>
                    </div>
                    <label class="vw-switch" title="Bật / tắt lọc cấp"><input type="checkbox" id="vw-gate-on" ${g.enabled ? 'checked' : ''} /><span></span></label>
                </div>
                <div class="vw-ov-range">
                    <span>Chào người xem từ cấp</span>
                    <input type="number" min="0" max="50" id="vw-gate-min" value="${g.minLevel}" ${g.enabled ? '' : 'disabled'} />
                    <span>trở lên</span>
                    <span class="vw-ov-muted">(cấp TikTok 1–50 · từ cấp 25 TikTok tự có hiệu ứng vào phòng)</span>
                </div>
                <div class="vw-ov-presets">
                    <span class="vw-ov-muted">Nhanh:</span>
                    ${[10, 15, 20, 25, 30].map(n => `<button class="ghost mini" data-gate-preset="${n}" ${g.enabled ? '' : 'disabled'}>Từ LV ${n}</button>`).join('')}
                </div>
                <div class="vw-ov-range">
                    <span>Fan club từ cấp</span>
                    <input type="number" min="0" max="99" id="vw-gate-fans" value="${g.minFans || 0}" ${g.enabled ? '' : 'disabled'} />
                    <span class="vw-ov-muted">cũng được chào dù cấp thấp (0 = không xét)</span>
                </div>
                <div class="vw-ov-ruler" title="Vùng sáng = cấp được chào">
                    <div class="vw-ov-win" style="left:${pct(winFrom)}%;right:${100 - pct(winTo)}%"></div>
                    ${ladder.map(x => `<i class="vw-ov-tick skin-${escapeHtml(x.t.skin)}" style="left:${pct(x.t.minLevel || 0)}%" title="${escapeHtml(x.t.name)} — LV ${x.t.minLevel || 0}"></i>`).join('')}
                    ${[0, 10, 20, 25, 30, 40, 50].map(n => `<b style="left:${pct(n)}%">${n}</b>`).join('')}
                </div>
                <div class="vw-ov-verdict">${g.enabled
                    ? `✅ Đang chào <b>LV ${g.minLevel} trở lên</b>${g.minFans ? ` hoặc <b>FAN ≥ ${g.minFans}</b>` : ''} · người dưới LV ${g.minLevel} sẽ không hiện thẻ`
                    : `⚠ Đang <b>tắt lọc</b> — chào mọi người khớp bậc đang bật${lowest ? ` (thấp nhất <b>LV ${lowest.from}</b>)` : ''}. Phòng đông nên bật lọc.`}</div>
            </section>

            <section class="vw-ov-card">
                <div class="vw-ov-head">
                    <div>
                        <div class="vw-ov-title">🏅 Theo cấp độ <span class="vw-ov-muted">· nhóm "${escapeHtml(profile?.name || '')}"</span></div>
                        <div class="vw-ov-sub">Mỗi bậc một màu thẻ + <b>video webm</b> riêng (tuỳ chọn). Người xem nhận bậc cao nhất họ đạt.</div>
                    </div>
                    <button class="ghost small" data-goto="tiers">✏ Sửa bậc</button>
                </div>
                <div class="vw-ov-ladder">
                    ${ladder.length ? ladder.slice().reverse().map(x => `
                    <div class="vw-ov-row skin-${escapeHtml(x.t.skin)}${x.blocked ? ' blocked' : ''}">
                        <span class="vw-tier-swatch skin-${escapeHtml(x.t.skin)}"></span>
                        <span class="vw-ov-name">${escapeHtml(x.t.name)}</span>
                        <span class="vw-ov-lv">${x.blocked ? (x.fans ? `<i>chỉ FAN ≥ ${x.fans}</i>` : 'bị lọc') : rangeText(x.from, x.to) + (x.fans ? ` <i>hoặc FAN ≥ ${x.fans}</i>` : '')}</span>
                        <span class="vw-ov-media ${x.t.mediaUrl ? 'has' : ''}">${x.t.mediaUrl ? (x.t.mediaType === 'video' ? '🎞 Video' : '🔊 Âm thanh') : '— chỉ thẻ'}</span>
                        <span class="vw-ov-tts" title="Đọc tên">${x.t.tts?.enabled ? '🗣' : ''}</span>
                        <button class="ghost mini" data-ov-try="${x.t.id}" ${x.blocked ? 'disabled' : ''} title="Giả lập 1 người bậc này vào phòng (xem trên link OBS)">▶ Thử</button>
                    </div>`).join('') : '<div class="vw-empty">Chưa bật bậc nào — sang tab 🏅 Theo cấp độ để bật.</div>'}
                </div>
            </section>

            <section class="vw-ov-card">
                <div class="vw-ov-head">
                    <div>
                        <div class="vw-ov-title">👤 Theo ID TikTok <span class="vw-ov-muted">· ${rules.length} người</span></div>
                        <div class="vw-ov-sub">Chào riêng người bạn chọn: danh hiệu, màu thẻ, <b>video webm</b> riêng. Không bị lọc cấp.</div>
                    </div>
                    <button class="primary small" data-goto="users" data-add-user>➕ Thêm ID</button>
                </div>
                <div class="vw-ov-ids">${rules.length ? rules.slice(0, 18).map(r => `<span class="vw-ov-id${r.enabled === false ? ' off' : ''}">@${escapeHtml(r.uniqueId || '?')}${r.mediaUrl ? ' <i>🎞</i>' : ''}</span>`).join('') + (rules.length > 18 ? `<span class="vw-ov-muted">+${rules.length - 18}</span>` : '')
                    : '<span class="vw-ov-muted">Chưa có ai — thêm ID TikTok của khách quen, mod, người tặng nhiều…</span>'}</div>
            </section>

            <section class="vw-ov-card vw-ov-obs">
                <div class="vw-ov-title">📺 Link OBS <span class="vw-ov-muted">· 1 link cho tất cả: thanh chào + video webm + lời chúc</span></div>
                <div class="vw-ov-url">
                    <input type="text" readonly value="${escapeHtml(url)}" />
                    <button class="primary small" data-ov-copy>📋 Copy</button>
                    <button class="ghost small" data-ov-open>↗ Mở xem</button>
                </div>
                <ol class="vw-ov-steps">
                    <li>OBS → <b>+ Nguồn → Browser</b> → dán link, kích thước <b>1080 × 1920</b>.</li>
                    <li>Bật nút <b>ĐANG CHẠY</b> ở góc trên rồi bấm <b>▶ Thử</b> một bậc để xem.</li>
                    <li>Thanh chào nằm sát mép trên khu bình luận — chỉnh ở tab <b>🎨 Hiển thị &amp; cài đặt</b>.</li>
                </ol>
            </section>
        </div>`;

        const setGate = (fn) => { fn(cfg.joinCard.gate); schedulePersist(); };
        const lv = (v) => Math.max(0, Math.min(99, parseInt(v, 10) || 0));
        $('#vw-gate-on')?.addEventListener('change', (e) => { setGate(gg => { gg.enabled = !!e.target.checked; }); renderOverviewTab(); });
        $('#vw-gate-min')?.addEventListener('change', (e) => { setGate(gg => { gg.minLevel = Math.min(TIKTOK_MAX_LV, lv(e.target.value)); }); renderOverviewTab(); });
        $('#vw-gate-fans')?.addEventListener('change', (e) => { setGate(gg => { gg.minFans = lv(e.target.value); }); renderOverviewTab(); });
        host.querySelectorAll('[data-gate-preset]').forEach(b => b.addEventListener('click', () => {
            setGate(gg => { gg.minLevel = +b.dataset.gatePreset; });
            renderOverviewTab();
        }));
        host.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => {
            document.querySelector(`#view-vipwelcome .vw-tab[data-vw-tab="${b.dataset.goto}"]`)?.click();
            if (b.hasAttribute('data-add-user')) $('#vw-btn-add-user-rule')?.click();
        }));
        host.querySelectorAll('[data-ov-try]').forEach(b => b.addEventListener('click', async () => {
            const x = ladder.find(y => y.t.id === b.dataset.ovTry);
            if (!x) return;
            if (cfg.enabled === false) flashWarn('Game đang TẮT — bật nút ĐANG CHẠY ở góc trên để thẻ hiện trên OBS');
            await persistConfig().catch(() => {});
            simulateJoin({ mode: 'one', level: x.from, fansLevel: 0, nickname: 'Thử ' + x.t.name, source: 'member' });
        }));
        host.querySelector('[data-ov-copy]')?.addEventListener('click', async () => {
            const ok = window.hpCopyText ? await window.hpCopyText(url) : false;
            if (ok) flashOk('✓ Đã copy link OBS'); else flashWarn('Copy thất bại — link: ' + url);
        });
        host.querySelector('[data-ov-open]')?.addEventListener('click', () => {
            window.open(url, 'hp-vw-preview', 'width=420,height=760,resizable=yes');   // khung dọc như màn điện thoại
        });
    }

    function renderTiersTab() {
        const host = $('#vw-tiers-pane');
        if (!host) return;
        const profile = activeProfile();
        if (!profile) { host.innerHTML = ''; return; }
        const tiers = profile.joinTiers || [];
        const sim = host._sim || { level: 23, fansLevel: 3, nickname: 'Davina', source: 'member', mod: false, sub: false, top: 0, friend: false, enigma: false };
        host._sim = sim;
        host.innerHTML = `
            <div class="vw-pane-head">
                <div class="vw-pane-hint">Mỗi bậc khớp khi <b>LV ≥ x HOẶC FAN LV ≥ y</b> (0 = không xét; cả hai 0 = mọi người). Người xem nhận bậc cao nhất họ đạt; người chỉ định (tab 👤) luôn được ưu tiên. Nhóm <b>"${escapeHtml(profile.name || '')}"</b>.
                    ${cfg.joinCard?.gate?.enabled ? `<br>🛡 Đang <b>lọc cấp</b>: chỉ chào <b>LV ${cfg.joinCard.gate.minLevel || 0} trở lên</b>${cfg.joinCard.gate.minFans ? ` hoặc FAN ≥ ${cfg.joinCard.gate.minFans}` : ''} — đổi ở tab 🏠 Tổng quan.` : ''}</div>
                <button id="vw-btn-add-tier" class="primary small">➕ Thêm bậc</button>
            </div>
            <div class="vw-tier-list">${tiers.map(renderTierCard).join('') || '<div class="vw-empty">Chưa có bậc nào.</div>'}</div>
            <div class="vw-setting-block vw-sim">
                <div class="vw-setting-title">🧪 Giả lập người vào phòng <span class="vw-hint">(đi đúng đường như LIVE thật — mở link OBS để xem)</span></div>
                <div class="vw-rule-row">
                    <label class="vw-inline">Tên <input type="text" id="vw-sim-nick" value="${escapeHtml(sim.nickname)}" /></label>
                    <label class="vw-inline">LV <input type="number" min="0" max="99" id="vw-sim-lv" value="${sim.level}" /></label>
                    <label class="vw-inline">FAN <input type="number" min="0" max="99" id="vw-sim-fan" value="${sim.fansLevel}" /></label>
                    <label class="vw-inline">Nguồn
                        <select id="vw-sim-source">
                            <option value="member" ${sim.source === 'member' ? 'selected' : ''}>Member</option>
                            <option value="barrage-grade" ${sim.source === 'barrage-grade' ? 'selected' : ''}>Banner theo cấp</option>
                            <option value="barrage-fans" ${sim.source === 'barrage-fans' ? 'selected' : ''}>Banner fan club</option>
                        </select>
                    </label>
                </div>
                <div class="vw-rule-row">
                    <label class="vw-inline"><input type="checkbox" id="vw-sim-mod" ${sim.mod ? 'checked' : ''} /> MOD</label>
                    <label class="vw-inline"><input type="checkbox" id="vw-sim-sub" ${sim.sub ? 'checked' : ''} /> SUB</label>
                    <label class="vw-inline"><input type="checkbox" id="vw-sim-friend" ${sim.friend ? 'checked' : ''} /> Bạn bè</label>
                    <label class="vw-inline">TOP <input type="number" min="0" max="3" id="vw-sim-top" value="${sim.top}" /></label>
                    <label class="vw-inline"><input type="checkbox" id="vw-sim-enigma" ${sim.enigma ? 'checked' : ''} /> Ẩn danh</label>
                </div>
                <div class="vw-rule-actions">
                    <button class="primary small" data-sim="one">🚪 1 người vào</button>
                    <button class="ghost small" data-sim="burst">👥 10 người cùng lúc</button>
                    <button class="ghost small" data-sim="rejoin">🔁 Vào → ra → vào lại</button>
                </div>
            </div>`;
        const readSim = () => {
            sim.nickname = $('#vw-sim-nick').value || 'Người thử';
            sim.level = Math.max(0, parseInt($('#vw-sim-lv').value, 10) || 0);
            sim.fansLevel = Math.max(0, parseInt($('#vw-sim-fan').value, 10) || 0);
            sim.source = $('#vw-sim-source').value;
            sim.mod = $('#vw-sim-mod').checked; sim.sub = $('#vw-sim-sub').checked; sim.friend = $('#vw-sim-friend').checked;
            sim.top = Math.max(0, Math.min(3, parseInt($('#vw-sim-top').value, 10) || 0));
            sim.enigma = $('#vw-sim-enigma').checked;
        };
        host.querySelectorAll('[data-sim]').forEach(btn => btn.addEventListener('click', async () => {
            readSim();
            await persistConfig().catch(() => {});
            const r = await simulateJoin({
                mode: btn.dataset.sim, level: sim.level, fansLevel: sim.fansLevel, nickname: sim.nickname, source: sim.source,
                isModerator: sim.mod, isSubscriber: sim.sub, isFriend: sim.friend, topUserNo: sim.top, enigma: sim.enigma
            });
            if (r?.expect) flashOk('Kỳ vọng: ' + r.expect);
        }));
        $('#vw-btn-add-tier')?.addEventListener('click', () => {
            profile.joinTiers.push(window.HpGame.vipwelcome.newTier({ name: 'Bậc mới', minLevel: 10 }));
            renderTiersTab(); persistConfig();
        });
        host.querySelectorAll('.vw-tier-card').forEach(card => wireTierCard(card, profile));
    }

    async function simulateJoin(body) {
        try {
            const r = await fetch('/api/games/vipwelcome/simulate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            const j = await r.json();
            if (!j.ok) flashWarn('Giả lập lỗi'); else if (!j.expect) flashOk('Đã giả lập — xem overlay OBS');
            return j;
        } catch (e) { flashWarn('Giả lập lỗi: ' + e.message); return null; }
    }

    function wireTierCard(card, profile) {
        const id = card.dataset.vwTier;
        const getTier = () => (profile.joinTiers || []).find(t => t.id === id);
        const num = (v) => Math.max(0, parseInt(v, 10) || 0);
        wireTtsRow(card, getTier, '{bậc} {tên} đã tới phòng!');
        card.querySelector('[data-t-name]')?.addEventListener('input', (e) => { const t = getTier(); if (!t) return; t.name = e.target.value.trim() || 'Bậc'; schedulePersist(); });
        card.querySelector('[data-t-minlevel]')?.addEventListener('input', (e) => { const t = getTier(); if (!t) return; t.minLevel = num(e.target.value); schedulePersist(); });
        card.querySelector('[data-t-minfans]')?.addEventListener('input', (e) => { const t = getTier(); if (!t) return; t.minFans = num(e.target.value); schedulePersist(); });
        card.querySelector('[data-t-cooldown]')?.addEventListener('input', (e) => { const t = getTier(); if (!t) return; t.rejoinCooldownSec = num(e.target.value); schedulePersist(); });
        card.querySelector('[data-t-enabled]')?.addEventListener('change', (e) => {
            const t = getTier(); if (!t) return;
            t.enabled = !!e.target.checked; card.classList.toggle('disabled', !t.enabled); schedulePersist();
        });
        card.querySelector('[data-t-skin]')?.addEventListener('change', (e) => { const t = getTier(); if (!t) return; t.skin = e.target.value; renderTiersTab(); schedulePersist(); });
        const vol = card.querySelector('[data-t-volume]');
        vol?.addEventListener('input', () => {
            const t = getTier(); if (!t) return;
            t.volume = +vol.value; card.querySelector('[data-t-volume-v]').textContent = vol.value + '%'; schedulePersist();
        });
        card.querySelector('[data-t-delete]')?.addEventListener('click', async () => {
            const t = getTier(); if (!t) return;
            const ok = await (window.hpConfirm ? window.hpConfirm({
                icon: '🗑', tone: 'danger', title: 'Xoá bậc',
                body: `Xoá bậc <b>${escapeHtml(t.name)}</b>?`, okLabel: 'Xoá', cancelLabel: 'Huỷ'
            }) : Promise.resolve(confirm(`Xoá bậc ${t.name}?`)));
            if (!ok) return;
            profile.joinTiers = profile.joinTiers.filter(x => x.id !== id);
            renderTiersTab(); persistConfig();
        });
        card.querySelector('[data-t-pick]')?.addEventListener('click', () => pickFile('media', (f) => uploadFileToTarget(f, (meta) => {
            const t = getTier(); if (!t) return;
            t.mediaUrl = meta.url; t.mediaName = f.name; t.mediaType = meta.type;
        }, renderTiersTab)));
        card.querySelector('[data-t-clear]')?.addEventListener('click', () => {
            const t = getTier(); if (!t || !t.mediaUrl) return;
            t.mediaUrl = ''; t.mediaName = ''; t.mediaType = '';
            renderTiersTab(); persistConfig();
        });
        card.querySelector('[data-t-frame]')?.addEventListener('click', () => pickFile('image', (f) => uploadFileToTarget(f, (meta) => {
            const t = getTier(); if (!t) return;
            t.frameUrl = meta.url;
        }, renderTiersTab, { image: true })));
        card.querySelector('[data-t-frame-clear]')?.addEventListener('click', () => {
            const t = getTier(); if (!t) return;
            t.frameUrl = ''; renderTiersTab(); persistConfig();
        });
        card.querySelector('[data-t-test]')?.addEventListener('click', async () => {
            const t = getTier(); if (!t) return;
            if (t.enabled === false) { flashWarn('Bậc đang tắt — bật lên để thử'); return; }
            await persistConfig().catch(() => {});
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'testTier', payload: { profileId: profile.id, tierId: id } })
            });
            flashOk('Đã thử bậc ' + t.name + ' — xem overlay OBS');
        });
    }

    function pickFile(kind, onFile) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = kind === 'image' ? 'image/png,image/webp,.png,.webp' : 'video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,.mp4,.webm,.mp3,.wav,.ogg,.m4a';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = () => { const f = inp.files?.[0]; inp.remove(); if (f) onFile(f); };
        inp.click();
    }

    // ============================================================
    // TAB: SỔ XU (tổng xu người xem đã tặng kênh — cộng dồn mọi buổi LIVE)
    // ============================================================
    function renderLedgerShell() {
        const host = $('#vw-ledger-pane');
        if (!host || host._vwWired) return;
        host._vwWired = true;
        host.innerHTML = `
            <div class="vw-pane-head">
                <div class="vw-pane-hint">💎 trên thẻ vào phòng = tổng xu người đó đã tặng kênh <b id="vw-ledger-host">…</b>, app tự cộng dồn qua mọi buổi LIVE (TikTok không cho xem lịch sử). Sửa số trực tiếp nếu cần.</div>
                <input type="text" id="vw-ledger-q" class="vw-search-input" placeholder="🔍 Tìm theo tên / @id" />
                <button id="vw-ledger-refresh" class="ghost small">🔄 Tải lại</button>
                <button id="vw-ledger-reset" class="danger small">🗑 Xoá sổ kênh này</button>
            </div>
            <div id="vw-ledger-list" class="vw-ledger-list"></div>`;
        let t = null;
        $('#vw-ledger-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(fetchLedger, 250); });
        $('#vw-ledger-refresh').addEventListener('click', fetchLedger);
        $('#vw-ledger-reset').addEventListener('click', async () => {
            const host = $('#vw-ledger-host')?.textContent || '';
            const ok = await (window.hpConfirm ? window.hpConfirm({
                icon: '🗑', tone: 'danger', title: 'Xoá sổ xu',
                body: `Xoá toàn bộ tổng xu của kênh <b>@${escapeHtml(host)}</b>?<br><span style="color:#8b93a8">Không thể hoàn tác.</span>`,
                okLabel: 'Xoá', cancelLabel: 'Huỷ'
            }) : Promise.resolve(confirm('Xoá toàn bộ sổ xu của kênh này?')));
            if (!ok) return;
            await fetch('/api/games/vipwelcome/ledger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) });
            fetchLedger();
        });
    }

    async function fetchLedger() {
        const list = $('#vw-ledger-list');
        if (!list) return;
        try {
            const q = encodeURIComponent($('#vw-ledger-q')?.value || '');
            const j = await (await fetch(`/api/games/vipwelcome/ledger?q=${q}&limit=200`)).json();
            const hostEl = $('#vw-ledger-host'); if (hostEl) hostEl.textContent = (!j.host || j.host === '_') ? '(chưa kết nối LIVE)' : '@' + j.host;
            const items = j.items || [];
            list.innerHTML = items.length === 0
                ? '<div class="vw-empty">Chưa có ai tặng quà (sổ cộng khi có quà thật từ TikTok).</div>'
                : items.map((it, i) => `<div class="vw-ledger-row" data-key="${escapeHtml(it.key)}">
                    <span class="vw-q-idx">#${i + 1}</span>
                    <span class="vw-ledger-name">${escapeHtml(it.nickname || it.uniqueId || it.key)}</span>
                    <span class="vw-q-user">${it.uniqueId ? '@' + escapeHtml(it.uniqueId) : ''}</span>
                    <label class="vw-inline">💎 <input type="number" min="0" step="1" value="${it.xu}" data-ledger-xu /></label>
                </div>`).join('');
            list.querySelectorAll('[data-ledger-xu]').forEach(inp => inp.addEventListener('change', async () => {
                const key = inp.closest('.vw-ledger-row').dataset.key;
                await fetch('/api/games/vipwelcome/ledger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', key, xu: Math.max(0, parseInt(inp.value, 10) || 0) }) });
                flashOk('Đã lưu');
            }));
        } catch (e) { list.innerHTML = '<div class="vw-empty">Không tải được sổ xu.</div>'; }
    }

    // ============================================================
    // TAB: 🏆 GHÉ PHÒNG — BXH khách quen (số buổi LIVE đã ghé) + cài đặt overlay BXH
    // ============================================================
    function renderVisitsShell() {
        const host = $('#vw-visits-pane');
        if (!host || host._vwWired) return;
        host._vwWired = true;
        const b = Object.assign({ title: 'KHÁCH QUEN CỦA PHÒNG', scope: 'month', skin: 'violet', limit: 10 }, cfg.joinCard?.board || {});
        const boardUrl = window.buildOverlayURL ? window.buildOverlayURL('/overlay/vipwelcome-board') : (location.origin + '/overlay/vipwelcome-board');
        host.innerHTML = `
            <div class="vw-pane-head">
                <div class="vw-pane-hint">Mỗi người đã ghé bao nhiêu <b>buổi LIVE</b> của kênh <b id="vw-visits-host">…</b> (ra vào nhiều lần trong 1 buổi vẫn tính 1) và 🔥 số buổi liền nhau. Ghi khi thẻ vào phòng đã hiện trên OBS.</div>
                <select id="vw-visits-scope"><option value="month">Tháng này</option><option value="all">Từ trước tới nay</option></select>
                <input type="text" id="vw-visits-q" class="vw-search-input" placeholder="🔍 Tìm theo tên / @id" />
                <button id="vw-visits-refresh" class="ghost small">🔄 Tải lại</button>
                <button id="vw-visits-reset" class="danger small">🗑 Xoá sổ kênh này</button>
            </div>
            <div id="vw-visits-list" class="vw-ledger-list"></div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">📺 Bảng xếp hạng trên OBS</div>
                <div class="vw-rule-row">
                    <button id="vw-board-copy" class="primary small">📋 Copy link OBS bảng xếp hạng</button>
                    <span class="vw-hint">${escapeHtml(boardUrl)}</span>
                </div>
                <label class="vw-inline">Tiêu đề <input type="text" maxlength="30" id="vw-board-title" value="${escapeHtml(b.title)}" /></label>
                <label class="vw-inline">Phạm vi
                    <select id="vw-board-scope">
                        <option value="month" ${b.scope !== 'all' ? 'selected' : ''}>Tháng này</option>
                        <option value="all" ${b.scope === 'all' ? 'selected' : ''}>Từ trước tới nay</option>
                    </select>
                </label>
                <label class="vw-inline">Skin
                    <select id="vw-board-skin">
                        <option value="violet" ${b.skin !== 'amber' ? 'selected' : ''}>💜 Tím</option>
                        <option value="amber" ${b.skin === 'amber' ? 'selected' : ''}>🧡 Vàng cam</option>
                    </select>
                </label>
                <label class="vw-inline">Số dòng <input type="number" min="3" max="20" id="vw-board-limit" value="${b.limit}" /></label>
            </div>`;
        const setBoard = (fn) => {
            cfg.joinCard = cfg.joinCard || window.HpGame.vipwelcome.defaultJoinCard();
            cfg.joinCard.board = Object.assign({ title: 'KHÁCH QUEN CỦA PHÒNG', scope: 'month', skin: 'violet', limit: 10 }, cfg.joinCard.board || {});
            fn(cfg.joinCard.board);
            schedulePersist();
        };
        $('#vw-board-title').addEventListener('input', (e) => setBoard(bb => { bb.title = e.target.value.trim() || 'KHÁCH QUEN CỦA PHÒNG'; }));
        $('#vw-board-scope').addEventListener('change', (e) => setBoard(bb => { bb.scope = e.target.value === 'all' ? 'all' : 'month'; }));
        $('#vw-board-skin').addEventListener('change', (e) => setBoard(bb => { bb.skin = e.target.value === 'amber' ? 'amber' : 'violet'; }));
        $('#vw-board-limit').addEventListener('input', (e) => setBoard(bb => { bb.limit = Math.max(3, Math.min(20, parseInt(e.target.value, 10) || 10)); }));
        $('#vw-board-copy').addEventListener('click', async () => {
            const ok = window.hpCopyText ? await window.hpCopyText(boardUrl) : false;
            if (ok) flashOk('✓ Đã copy link OBS bảng xếp hạng'); else flashWarn('Copy thất bại — link: ' + boardUrl);
        });
        let t = null;
        $('#vw-visits-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(fetchVisits, 250); });
        $('#vw-visits-scope').addEventListener('change', fetchVisits);
        $('#vw-visits-refresh').addEventListener('click', fetchVisits);
        $('#vw-visits-reset').addEventListener('click', async () => {
            const ok = await (window.hpConfirm ? window.hpConfirm({
                icon: '🗑', tone: 'danger', title: 'Xoá sổ ghé phòng',
                body: `Xoá toàn bộ lịch sử ghé phòng của kênh <b>${escapeHtml($('#vw-visits-host')?.textContent || '')}</b>?<br><span style="color:#8b93a8">Không thể hoàn tác.</span>`,
                okLabel: 'Xoá', cancelLabel: 'Huỷ'
            }) : Promise.resolve(confirm('Xoá toàn bộ sổ ghé phòng của kênh này?')));
            if (!ok) return;
            await fetch('/api/games/vipwelcome/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) });
            fetchVisits();
        });
    }

    async function fetchVisits() {
        const list = $('#vw-visits-list');
        if (!list) return;
        try {
            const scope = $('#vw-visits-scope')?.value === 'all' ? 'all' : 'month';
            const q = encodeURIComponent($('#vw-visits-q')?.value || '');
            const j = await (await fetch(`/api/games/vipwelcome/visits?scope=${scope}&q=${q}&limit=200`)).json();
            const hostEl = $('#vw-visits-host'); if (hostEl) hostEl.textContent = (!j.host || j.host === '_') ? '(chưa kết nối LIVE)' : '@' + j.host;
            const items = j.items || [];
            list.innerHTML = items.length === 0
                ? '<div class="vw-empty">Chưa có lần ghé nào (sổ ghi khi có người thật vào phòng trong LIVE).</div>'
                : items.map((it, i) => `<div class="vw-ledger-row">
                    <span class="vw-q-idx">#${i + 1}</span>
                    <span class="vw-ledger-name">${escapeHtml(it.nickname || it.uniqueId || it.key)}</span>
                    <span class="vw-q-user">${it.uniqueId ? '@' + escapeHtml(it.uniqueId) : ''}</span>
                    <span class="vw-q-meta">${scope === 'all' ? it.sessions : it.monthCount} buổi${it.streak >= 2 ? ` · 🔥 ${it.streak} liền` : ''} · kỷ lục ${it.bestStreak}</span>
                </div>`).join('');
        } catch (e) { list.innerHTML = '<div class="vw-empty">Không tải được sổ ghé phòng.</div>'; }
    }

    // ============================================================
    // TAB 2: GLOBAL (all users)
    // ============================================================
    function renderGlobalTab() {
        for (const kind of Object.keys(GLOBAL_KINDS)) renderGlobalCard(kind);
    }

    function renderGlobalCard(kind) {
        const K = GLOBAL_KINDS[kind];
        const host = K ? $(K.host) : null;
        if (!host) return;
        const profile = activeProfile();
        if (!profile) { host.innerHTML = ''; return; }
        const g = profile[K.key];
        if (!g) { host.innerHTML = ''; return; }   // profile chưa normalize → không crash
        const titleEmoji = K.emoji;
        const titleText = `[${escapeHtml(profile.name || '')}] TẤT CẢ USER — ${K.title}`;
        const styleOptions = ['<option value="">— Theo phong cách nhóm —</option>']
            .concat(LABEL_STYLE_DEFS.map(s => `<option value="${s.id}" ${g.labelStyle === s.id ? 'selected' : ''}>${s.emoji} ${escapeHtml(s.label)}</option>`))
            .join('');
        const hasFile = !!g.mediaUrl;
        const fileName = g.mediaName || (g.mediaUrl ? g.mediaUrl.split('/').pop() : '');
        const typeBadge = hasFile ? (g.mediaType === 'video' ? '🎞 VIDEO' : (g.mediaType === 'audio' ? '🔊 ÂM' : '📄')) : '';
        host.innerHTML = `
            <div class="vw-global-card${g.enabled ? ' enabled' : ' disabled'}${hasFile ? ' has-file' : ''}">
                <div class="vw-global-head">
                    <span class="vw-global-emoji">${titleEmoji}</span>
                    <div class="vw-global-title">${titleText}</div>
                    <label class="vw-rule-toggle">
                        <input type="checkbox" id="vw-${kind}-enabled" ${g.enabled ? 'checked' : ''} />
                        <span>Bật</span>
                    </label>
                </div>
                <div class="vw-rule-file" id="vw-${kind}-filedisplay">
                    ${hasFile
                        ? `<span class="vw-file-badge">${typeBadge}</span><span class="vw-file-name">${escapeHtml(fileName)}</span>`
                        : '<span class="vw-file-empty">Chưa chọn file — bấm "📁 Chọn" để tải video/âm thanh</span>'
                    }
                </div>
                <div class="vw-rule-row">
                    <label class="vw-inline">🔊 <input type="range" min="0" max="100" step="5" id="vw-${kind}-volume" value="${g.volume ?? 100}" />
                        <span id="vw-${kind}-volume-v">${g.volume ?? 100}%</span>
                    </label>
                    <label class="vw-inline">⭐ Min Level <input type="number" min="0" step="1" id="vw-${kind}-minlevel" value="${g.minLevel || 0}" /></label>
                    <label class="vw-inline" title="Chỉ phát cho user có dấu tích xanh trên TikTok (verified account)"><input type="checkbox" id="vw-${kind}-verified" ${g.requireVerified ? 'checked' : ''} /> ✓ Chỉ tích xanh</label>
                </div>
                <div class="vw-rule-row">
                    <label class="vw-inline" title="Chỉ phát cho người đang nằm TOP 1-3 người tặng quà trong phòng (TikTok gửi kèm topUserNo)"><input type="checkbox" id="vw-${kind}-topuser" ${g.requireTopUser ? 'checked' : ''} /> 🏆 Chỉ TOP 3 người tặng trong phòng</label>
                    <label class="vw-inline" title="Chỉ phát cho thành viên Fan club từ cấp này trở lên; 0 = bỏ qua điều kiện">🎗 Fan club từ cấp ≥ <input type="number" min="0" step="1" id="vw-${kind}-fanslevel" value="${g.minFansLevel || 0}" /></label>
                    ${kind === 'subscribe' ? '' : `<label class="vw-inline" title="Chỉ phát cho người đã đăng ký kênh (Sub)"><input type="checkbox" id="vw-${kind}-sub" ${g.requireSubscriber ? 'checked' : ''} /> ⭐ Chỉ người đã đăng ký kênh</label>`}
                    <label class="vw-inline" title="Chỉ phát cho người đang follow kênh"><input type="checkbox" id="vw-${kind}-following" ${g.requireFollowing ? 'checked' : ''} /> ➕ Chỉ người đang follow</label>
                </div>
                <div class="vw-hint">Dữ liệu TikTok gửi kèm khi vào phòng/tặng quà — không cần user làm thêm gì.</div>
                <div class="vw-rule-row">
                    <label class="vw-inline vw-msg-row">💬 Lời chúc:
                        <input type="text" id="vw-${kind}-message" placeholder="${K.ph}" value="${escapeHtml(g.message || '')}" />
                    </label>
                </div>
                <div class="vw-rule-row">
                    <label class="vw-inline" title="Phong cách lời chúc riêng cho rule này (mặc định theo tab Cài đặt)">🎨 Phong cách
                        <select id="vw-${kind}-style">${styleOptions}</select>
                    </label>
                </div>
                <div class="vw-rule-actions">
                    <button class="ghost small" id="vw-${kind}-pick">📁 Chọn file</button>
                    <button class="primary small" id="vw-${kind}-test" ${hasFile ? '' : 'disabled'}>▶ TEST</button>
                    <button class="danger small" id="vw-${kind}-clear" ${hasFile ? '' : 'disabled'}>🗑 Xoá file</button>
                </div>
                <div class="vw-hint">Biến: {nickname}, {level}, {gift}, {count}, {uniqueId}, {verified} (✓ tích xanh), {rank} (TOP N người tặng), {fans} (Fan LvN), {sub} (⭐ Sub), {mod} (🛡 Mod), {diamond} (kim cương quà)</div>
            </div>`;
        // Wire
        $(`#vw-${kind}-enabled`)?.addEventListener('change', (e) => {
            g.enabled = !!e.target.checked;
            renderGlobalCard(kind); renderProfileChips(); persistConfig();
        });
        const vol = $(`#vw-${kind}-volume`);
        vol?.addEventListener('input', () => {
            g.volume = +vol.value;
            $(`#vw-${kind}-volume-v`).textContent = vol.value + '%';
            schedulePersist();
        });
        $(`#vw-${kind}-minlevel`)?.addEventListener('input', (e) => {
            g.minLevel = Math.max(0, parseInt(e.target.value, 10) || 0); schedulePersist();
        });
        $(`#vw-${kind}-verified`)?.addEventListener('change', (e) => {
            g.requireVerified = !!e.target.checked; schedulePersist();
        });
        $(`#vw-${kind}-topuser`)?.addEventListener('change', (e) => {
            g.requireTopUser = !!e.target.checked; schedulePersist();
        });
        $(`#vw-${kind}-fanslevel`)?.addEventListener('input', (e) => {
            g.minFansLevel = Math.max(0, parseInt(e.target.value, 10) || 0); schedulePersist();
        });
        $(`#vw-${kind}-sub`)?.addEventListener('change', (e) => {
            g.requireSubscriber = !!e.target.checked; schedulePersist();
        });
        $(`#vw-${kind}-following`)?.addEventListener('change', (e) => {
            g.requireFollowing = !!e.target.checked; schedulePersist();
        });
        $(`#vw-${kind}-style`)?.addEventListener('change', (e) => {
            g.labelStyle = e.target.value || ''; schedulePersist();
        });
        $(`#vw-${kind}-message`)?.addEventListener('input', (e) => {
            g.message = e.target.value; schedulePersist();
        });
        $(`#vw-${kind}-pick`)?.addEventListener('click', () => pickFileForGlobal(kind));
        $(`#vw-${kind}-clear`)?.addEventListener('click', () => {
            if (!g.mediaUrl) return;
            if (!confirm('Xoá file?')) return;
            g.mediaUrl = ''; g.mediaName = ''; g.mediaType = '';
            renderGlobalCard(kind); persistConfig();
        });
        $(`#vw-${kind}-test`)?.addEventListener('click', async () => {
            if (!g.mediaUrl) { flashWarn('Chưa chọn file'); return; }
            await fetch('/api/games/vipwelcome/trigger', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'test', payload: {
                        profileId: cfg.activeProfileId,
                        ruleType: K.ruleType,
                        uniqueId: 'demo_user',
                        nickname: 'Demo VIP',
                        level: Math.max(g.minLevel || 30, 30),
                        verified: !!g.requireVerified,    // test với verified=true nếu rule đòi tích xanh
                        giftName: 'Hoa Hồng',
                        ...fakeTestUserFields(g, kind)    // TOP/Fan/Sub/Follow/diamond giả — server dùng khi hỗ trợ
                    }
                })
            });
            flashOk('Đã test');
        });
    }

    function pickFileForGlobal(kind) {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,.mp4,.webm,.mp3,.wav,.ogg,.m4a';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = async () => {
            const f = inp.files?.[0]; inp.remove();
            if (!f) return;
            const profile = activeProfile(); if (!profile) return;
            const g = profile[GLOBAL_KINDS[kind]?.key]; if (!g) return;
            await uploadFileToTarget(f, (meta) => {
                g.mediaUrl = meta.url;
                g.mediaName = f.name;
                g.mediaType = meta.type;
            }, () => renderGlobalCard(kind));
        };
        inp.click();
    }

    // ============================================================
    // TAB 3: SETTINGS
    // ============================================================
    function renderSettingsTab() {
        const host = $('#vw-settings-pane');
        if (!host) return;
        const d = cfg.display || {};
        const q = cfg.queue || {};
        const jc = cfg.joinCard || window.HpGame.vipwelcome.defaultJoinCard();
        const c = jc.card || {};
        const jb = jc.bar || {};   // thanh chào gọn
        const currentStyle = d.labelStyle || 'goldpink';
        const styleSwatches = LABEL_STYLE_DEFS.map(s => `
            <div class="vw-style-swatch${currentStyle === s.id ? ' active' : ''}" data-vw-style="${s.id}" title="${escapeHtml(s.label)}">
                <div class="vw-style-preview style-preview-${s.id}">CHÀO VIP ${s.emoji}</div>
                <div class="vw-style-name">${escapeHtml(s.label)}</div>
            </div>
        `).join('');
        host.innerHTML = `
            <div class="vw-setting-block">
                <div class="vw-setting-title">🎬 Khu video (và lời chúc của trigger khác)</div>
                <label class="vw-inline">Scale <input type="range" min="50" max="150" step="5" id="vw-set-scale" value="${d.scale || 100}" />
                    <span id="vw-set-scale-v">${d.scale || 100}%</span>
                </label>
                <label class="vw-inline">X% <input type="range" min="0" max="100" step="1" id="vw-set-x" value="${d.xPercent ?? 50}" />
                    <span id="vw-set-x-v">${d.xPercent ?? 50}</span>
                </label>
                <label class="vw-inline">Y% <input type="range" min="0" max="100" step="1" id="vw-set-y" value="${d.yPercent ?? 50}" />
                    <span id="vw-set-y-v">${d.yPercent ?? 50}</span>
                </label>
                <label class="vw-inline"><input type="checkbox" id="vw-set-showtext" ${d.showText !== false ? 'checked' : ''} /> Hiện lời chúc trên overlay</label>
                <label class="vw-inline"><input type="checkbox" id="vw-set-showavatar" ${d.showAvatar !== false ? 'checked' : ''} /> 👤 Hiện avatar user (tròn, cạnh lời chúc)</label>
                <label class="vw-inline">Vị trí text
                    <select id="vw-set-textpos">
                        <option value="top" ${d.textPosition === 'top' ? 'selected' : ''}>Trên</option>
                        <option value="middle" ${d.textPosition === 'middle' ? 'selected' : ''}>Giữa</option>
                        <option value="bottom" ${d.textPosition !== 'top' && d.textPosition !== 'middle' ? 'selected' : ''}>Dưới</option>
                    </select>
                </label>
            </div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">🎨 Phong cách lời chúc</div>
                <div class="vw-hint" style="margin-bottom:8px">Chọn 1 trong 12 phong cách — áp dụng cho overlay OBS. Bấm vào ô để chọn.</div>
                <div class="vw-style-grid" id="vw-style-grid">${styleSwatches}</div>
            </div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">⏱️ Hàng đợi &amp; chống spam</div>
                <label class="vw-inline">Tối đa item chờ <input type="number" min="1" max="500" step="1" id="vw-set-qmax" value="${q.maxLen || 50}" /></label>
                <label class="vw-inline">Cooldown / user (giây) — chỉ áp dụng cho Lên cấp <input type="number" min="0" step="5" id="vw-set-cooldown" value="${q.perUserCooldownSec || 60}" /></label>
                <label class="vw-inline">Khoảng cách giữa 2 lượt (ms) <input type="number" min="0" step="50" id="vw-set-gap" value="${q.perItemMinMs ?? 200}" /></label>
                <div class="vw-hint">💡 Video/âm thanh phát <b>nối tiếp</b>: lượt trước XONG mới tới lượt sau, ưu tiên người chỉ định → bậc cao. <b>Tối đa item chờ</b> = đông quá thì bỏ mục ưu tiên thấp nhất. <b>Khoảng cách giữa 2 lượt</b> = nghỉ giữa 2 clip.</div>
            </div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">🪪 Thẻ vào phòng</div>
                <label class="vw-inline"><input type="checkbox" id="vw-jc-enabled" ${jc.enabled !== false ? 'checked' : ''} /> Bật thẻ vào phòng</label>
                <label class="vw-inline">Kiểu thẻ
                    <select id="vw-jc-style">
                        <option value="bar" ${jc.style !== 'card' ? 'selected' : ''}>✨ Thanh chào gọn — sát khu bình luận (khuyên dùng)</option>
                        <option value="card" ${jc.style === 'card' ? 'selected' : ''}>🪪 Thẻ to (kiểu cũ)</option>
                    </select>
                </label>
                <div id="vw-jc-bar-opts" ${jc.style === 'card' ? 'hidden' : ''}>
                    <label class="vw-inline">X% <input type="range" min="0" max="60" step="1" id="vw-jb-x" value="${jb.xPercent ?? 2}" /> <span id="vw-jb-x-v">${jb.xPercent ?? 2}</span></label>
                    <label class="vw-inline" title="Mép DƯỚI của tầng thấp nhất — đặt ngay trên khu bình luận TikTok (thường 66–70%)">Y% (mép dưới, sát bình luận) <input type="range" min="30" max="95" step="0.5" id="vw-jb-y" value="${jb.yPercent ?? 68}" /> <span id="vw-jb-y-v">${jb.yPercent ?? 68}</span></label>
                    <label class="vw-inline">Cỡ <input type="range" min="60" max="160" step="5" id="vw-jb-scale" value="${jb.scale || 100}" /> <span id="vw-jb-scale-v">${jb.scale || 100}%</span></label>
                    <label class="vw-inline">Số tầng <select id="vw-jb-slots">${[1, 2, 3].map(n => `<option value="${n}" ${(jb.slots || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
                    <label class="vw-inline"><input type="checkbox" id="vw-jb-wow" ${jb.wow !== false ? 'checked' : ''} /> ✨ Hiệu ứng WOW (avatar lăn, chữ hiện từng chữ, viền chạy, bụi sao)</label>
                    <div class="vw-hint">💡 Người mới luôn vào <b>tầng dưới cùng</b> (đóng đinh sát bình luận), thanh cũ được đẩy lên; đầy tầng thì bỏ người <b>bậc thấp nhất</b> trước, Chí tôn ở lâu hơn Tân binh. Xem mẫu: <code>/_prototype/vip-compact.html</code></div>
                </div>
                <div id="vw-jc-card-opts" ${jc.style === 'card' ? '' : 'hidden'}>
                <label class="vw-inline">X% <input type="range" min="0" max="80" step="1" id="vw-jc-x" value="${c.xPercent ?? 3}" /> <span id="vw-jc-x-v">${c.xPercent ?? 3}</span></label>
                <label class="vw-inline">Y% <input type="range" min="5" max="100" step="1" id="vw-jc-y" value="${c.yPercent ?? 60}" /> <span id="vw-jc-y-v">${c.yPercent ?? 60}</span></label>
                <label class="vw-inline">Cỡ <input type="range" min="50" max="160" step="5" id="vw-jc-scale" value="${c.scale || 100}" /> <span id="vw-jc-scale-v">${c.scale || 100}%</span></label>
                <label class="vw-inline">Số thẻ hiện cùng lúc <input type="number" min="1" max="6" id="vw-jc-stack" value="${c.maxStack || 3}" /></label>
                <label class="vw-inline">Thẻ mới
                    <select id="vw-jc-dir">
                        <option value="up" ${c.direction !== 'down' ? 'selected' : ''}>ở dưới, đẩy thẻ cũ lên</option>
                        <option value="down" ${c.direction === 'down' ? 'selected' : ''}>ở trên, đẩy thẻ cũ xuống</option>
                    </select>
                </label>
                </div>
                <label class="vw-inline">Hiện mỗi thẻ (giây) <input type="number" min="2" max="20" step="0.5" id="vw-jc-dur" value="${(c.durationMs || 5000) / 1000}" /></label>
                <label class="vw-inline">Chữ "vào phòng" <input type="text" maxlength="20" id="vw-jc-text" value="${escapeHtml(jc.enterText || 'VÀO PHÒNG')}" /></label>
                <label class="vw-inline"><input type="checkbox" id="vw-jc-hidezero" ${jc.hideZeroXu !== false ? 'checked' : ''} /> Ẩn 💎 khi chưa tặng xu nào</label>
            </div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">🔁 Vào phòng / vào lại</div>
                <label class="vw-inline" title="TikTok có thể gửi 2 thông báo cho cùng 1 lần vào (member + banner) — gộp trong khoảng này">Gộp tín hiệu trùng trong (giây) <input type="number" min="3" max="60" id="vw-jc-antidup" value="${jc.antiDupSec || 10}" /></label>
                <label class="vw-inline"><input type="checkbox" id="vw-jc-late" ${jc.lateWelcome !== false ? 'checked' : ''} /> Chào muộn người TikTok không báo vào phòng (khi họ chat / thả tim / tặng quà lần đầu)</label>
                <label class="vw-inline">Bỏ video/âm thanh nếu chờ quá (giây) <input type="number" min="5" max="300" id="vw-jc-maxwait" value="${jc.mediaMaxWaitSec || 30}" /></label>
                <label class="vw-inline" title="Ghi dữ liệu thô TikTok gửi khi có người vào phòng vào data/logs/vipwelcome-raw.jsonl — bật khi cần gửi cho HP Media kiểm tra"><input type="checkbox" id="vw-jc-diag" ${jc.diagnostics ? 'checked' : ''} /> 🩺 Chẩn đoán: ghi dữ liệu vào phòng (logs/vipwelcome-raw.jsonl)</label>
                <div class="vw-hint">💡 Mỗi lần TikTok báo vào phòng là chào lại — kể cả ra vào liên tục. Muốn giãn cho từng người/bậc thì đặt "Cooldown vào lại" ở tab 👤 hoặc 🏅.</div>
            </div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">👥 Phòng đông · khách quen · giọng đọc</div>
                <label class="vw-inline" title="Khi đang đủ số thẻ trên màn hình mà người mới vẫn vào dồn dập, gom người bậc thấp vào 1 thẻ 'A, B và N người khác'"><input type="checkbox" id="vw-jc-batch" ${jc.batch?.enabled !== false ? 'checked' : ''} /> Gộp thẻ khi phòng đông</label>
                <label class="vw-inline">chỉ gộp người dưới LV <input type="number" min="0" max="99" id="vw-jc-batch-lv" value="${jc.batch?.belowTierLevel ?? 25}" /></label>
                <label class="vw-inline"><input type="checkbox" id="vw-jc-visits" ${jc.showVisits !== false ? 'checked' : ''} /> Hiện "Lần đầu ghé / Ghé lần thứ N / 🔥 buổi liền" trên thẻ</label>
                <label class="vw-inline"><input type="checkbox" id="vw-jc-tts" ${jc.tts?.enabled !== false ? 'checked' : ''} /> 🗣 Bật giọng đọc tên (từng bậc / người bật riêng)</label>
                <label class="vw-inline">Âm lượng giọng đọc <input type="range" min="0" max="100" step="5" id="vw-jc-tts-vol" value="${jc.tts?.volume ?? 90}" /> <span id="vw-jc-tts-vol-v">${jc.tts?.volume ?? 90}%</span></label>
            </div>
            <div class="vw-setting-block">
                <div class="vw-setting-title">⌨ Phím tắt (dùng được cả khi đang ở OBS / TikTok Studio)</div>
                <label class="vw-inline"><input type="checkbox" id="vw-jc-hk" ${jc.hotkeys?.enabled ? 'checked' : ''} /> Bật phím tắt</label>
                <label class="vw-inline">Bỏ qua mục đang phát: Ctrl+Shift+ <input type="text" maxlength="3" id="vw-jc-hk-skip" value="${escapeHtml(jc.hotkeys?.skip || 'S')}" style="width:48px" /></label>
                <label class="vw-inline">Xoá hết thẻ + hàng chờ: Ctrl+Shift+ <input type="text" maxlength="3" id="vw-jc-hk-clear" value="${escapeHtml(jc.hotkeys?.clear || 'C')}" style="width:48px" /></label>
                <div class="vw-hint">1 chữ cái, số hoặc F1–F12. Nếu phím đã bị phần mềm khác giữ thì phím đó không hoạt động — đổi phím khác.</div>
            </div>
        `;
        const setJc = (fn) => { cfg.joinCard = cfg.joinCard || window.HpGame.vipwelcome.defaultJoinCard(); cfg.joinCard.card = cfg.joinCard.card || {}; fn(cfg.joinCard, cfg.joinCard.card); schedulePersist(); };
        const setJb = (fn) => setJc(j => { j.bar = j.bar && typeof j.bar === 'object' ? j.bar : { xPercent: 2, yPercent: 68, scale: 100, slots: 3, wow: true }; fn(j.bar); });
        $('#vw-jc-style')?.addEventListener('change', (e) => {
            const card = e.target.value === 'card';
            setJc(j => { j.style = card ? 'card' : 'bar'; });
            $('#vw-jc-bar-opts').hidden = card;
            $('#vw-jc-card-opts').hidden = !card;
        });
        for (const [id, key, suffix] of [['vw-jb-x', 'xPercent', ''], ['vw-jb-y', 'yPercent', ''], ['vw-jb-scale', 'scale', '%']]) {
            $('#' + id)?.addEventListener('input', (e) => {
                const v = parseFloat(e.target.value);
                $('#' + id + '-v').textContent = v + suffix;
                setJb(b => { b[key] = v; });
            });
        }
        $('#vw-jb-slots')?.addEventListener('change', (e) => setJb(b => { b.slots = Math.max(1, Math.min(3, parseInt(e.target.value, 10) || 3)); }));
        $('#vw-jb-wow')?.addEventListener('change', (e) => setJb(b => { b.wow = !!e.target.checked; }));
        const clampInt = (v, lo, hi, d) => { const n = parseInt(v, 10); return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : d)); };   // 0 là số hợp lệ
        $('#vw-jc-enabled')?.addEventListener('change', (e) => setJc(j => { j.enabled = !!e.target.checked; }));
        for (const [id, key, suffix] of [['vw-jc-x', 'xPercent', ''], ['vw-jc-y', 'yPercent', ''], ['vw-jc-scale', 'scale', '%']]) {
            $('#' + id)?.addEventListener('input', (e) => {
                const v = parseInt(e.target.value, 10);
                $('#' + id + '-v').textContent = v + suffix;
                setJc((j, cc) => { cc[key] = v; });
            });
        }
        $('#vw-jc-stack')?.addEventListener('input', (e) => setJc((j, cc) => { cc.maxStack = clampInt(e.target.value, 1, 6, 3); }));
        $('#vw-jc-dir')?.addEventListener('change', (e) => setJc((j, cc) => { cc.direction = e.target.value === 'down' ? 'down' : 'up'; }));
        $('#vw-jc-dur')?.addEventListener('input', (e) => setJc((j, cc) => { cc.durationMs = Math.round(Math.max(2, Math.min(20, parseFloat(e.target.value) || 5)) * 1000); }));
        $('#vw-jc-text')?.addEventListener('input', (e) => setJc(j => { j.enterText = e.target.value.trim() || 'VÀO PHÒNG'; }));
        $('#vw-jc-hidezero')?.addEventListener('change', (e) => setJc(j => { j.hideZeroXu = !!e.target.checked; }));
        $('#vw-jc-antidup')?.addEventListener('input', (e) => setJc(j => { j.antiDupSec = clampInt(e.target.value, 3, 60, 10); }));
        $('#vw-jc-late')?.addEventListener('change', (e) => setJc(j => { j.lateWelcome = !!e.target.checked; }));
        const sub = (j, k, d) => (j[k] = j[k] && typeof j[k] === 'object' ? j[k] : d);
        $('#vw-jc-batch')?.addEventListener('change', (e) => setJc(j => { sub(j, 'batch', {}).enabled = !!e.target.checked; }));
        $('#vw-jc-batch-lv')?.addEventListener('input', (e) => setJc(j => { sub(j, 'batch', {}).belowTierLevel = clampInt(e.target.value, 0, 99, 25); }));
        $('#vw-jc-visits')?.addEventListener('change', (e) => setJc(j => { j.showVisits = !!e.target.checked; }));
        $('#vw-jc-tts')?.addEventListener('change', (e) => setJc(j => { sub(j, 'tts', {}).enabled = !!e.target.checked; }));
        $('#vw-jc-tts-vol')?.addEventListener('input', (e) => {
            $('#vw-jc-tts-vol-v').textContent = e.target.value + '%';
            const v = parseInt(e.target.value, 10);
            setJc(j => { sub(j, 'tts', {}).volume = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 90; });   // 0 hợp lệ (tắt tiếng)
        });
        const hkKey = (v, d) => { const k = String(v || '').trim().toUpperCase(); return /^([A-Z0-9]|F([1-9]|1[0-2]))$/.test(k) ? k : d; };
        $('#vw-jc-hk')?.addEventListener('change', (e) => setJc(j => { sub(j, 'hotkeys', {}).enabled = !!e.target.checked; }));
        // Ctrl+Shift+X là phím bắn mặc định của Bắn Cung — cùng phím thì chỉ app đăng ký trước nhận được
        const warnHk = (h) => {
            if (h.skip === h.clear) flashWarn('Hai phím tắt đang trùng nhau — đổi một phím khác');
            else if ([h.skip, h.clear].includes('X')) flashWarn('Ctrl+Shift+X đang là phím bắn của Bắn Cung — nếu bật cả hai, nên đổi phím');
        };
        $('#vw-jc-hk-skip')?.addEventListener('change', (e) => setJc(j => { const h = sub(j, 'hotkeys', {}); e.target.value = h.skip = hkKey(e.target.value, 'S'); warnHk(h); }));
        $('#vw-jc-hk-clear')?.addEventListener('change', (e) => setJc(j => { const h = sub(j, 'hotkeys', {}); e.target.value = h.clear = hkKey(e.target.value, 'C'); warnHk(h); }));
        $('#vw-jc-maxwait')?.addEventListener('input', (e) => setJc(j => { j.mediaMaxWaitSec = clampInt(e.target.value, 5, 300, 30); }));
        $('#vw-jc-diag')?.addEventListener('change', (e) => setJc(j => { j.diagnostics = !!e.target.checked; }));
        // Wire
        const wireRange = (id, key, fmt) => {
            const el = $(`#${id}`); if (!el) return;
            el.addEventListener('input', () => {
                const v = parseInt(el.value, 10);
                cfg.display[key] = v;
                const vSpan = $(`#${id}-v`); if (vSpan) vSpan.textContent = fmt ? fmt(v) : v;
                schedulePersist();
            });
        };
        wireRange('vw-set-scale', 'scale', v => v + '%');
        wireRange('vw-set-x', 'xPercent');
        wireRange('vw-set-y', 'yPercent');
        $('#vw-set-showtext')?.addEventListener('change', (e) => { cfg.display.showText = !!e.target.checked; schedulePersist(); });
        $('#vw-set-showavatar')?.addEventListener('change', (e) => { cfg.display.showAvatar = !!e.target.checked; schedulePersist(); });
        $('#vw-set-textpos')?.addEventListener('change', (e) => { cfg.display.textPosition = e.target.value; schedulePersist(); });
        $('#vw-set-qmax')?.addEventListener('input', (e) => { cfg.queue.maxLen = Math.max(1, Math.min(500, parseInt(e.target.value, 10) || 50)); schedulePersist(); });
        $('#vw-set-cooldown')?.addEventListener('input', (e) => { cfg.queue.perUserCooldownSec = Math.max(0, parseInt(e.target.value, 10) || 0); schedulePersist(); });
        $('#vw-set-gap')?.addEventListener('input', (e) => { cfg.queue.perItemMinMs = Math.max(0, parseInt(e.target.value, 10) || 0); schedulePersist(); });
        // Style swatches — click chọn phong cách lời chúc
        document.querySelectorAll('#vw-style-grid .vw-style-swatch').forEach(el => {
            el.addEventListener('click', async () => {
                const id = el.dataset.vwStyle;
                if (!id) return;
                cfg.display = cfg.display || {};
                cfg.display.labelStyle = id;
                document.querySelectorAll('#vw-style-grid .vw-style-swatch').forEach(x => x.classList.toggle('active', x.dataset.vwStyle === id));
                await persistConfig();
                flashOk(`Đã chọn phong cách "${(LABEL_STYLE_DEFS.find(s => s.id === id) || {}).label || id}"`);
            });
        });
    }

    // ============================================================
    // TAB 4: QUEUE & LOG
    // ============================================================
    async function fetchQueueSnapshot() {
        try {
            const r = await fetch('/api/games/vipwelcome/queue');
            const j = await r.json();
            renderQueue(j);
        } catch (e) { /* ignore */ }
    }

    function renderQueue(snapshot) {
        const sizeEl = $('#vipwelcome-queue-size');
        if (sizeEl) sizeEl.textContent = snapshot?.size ?? 0;
        const list = $('#vw-queue-list');
        if (list) {
            const items = snapshot?.items || [];
            list.innerHTML = items.length === 0
                ? `<div class="vw-empty">Hàng đợi trống.</div>`
                : items.map((it, i) => `<div class="vw-queue-item">
                    <span class="vw-q-idx">#${i + 1}</span>
                    <span class="vw-q-ev">${eventIcon(it.eventType)}</span>
                    <span class="vw-q-user">@${escapeHtml(it.uniqueId || '?')}</span>
                    <span class="vw-q-meta">cấp ${it.level || 0}</span>
                    <span class="vw-q-rule">${escapeHtml(it.ruleLabel || '')}</span>
                </div>`).join('');
        }
        const log = $('#vw-log');
        if (log) {
            const recent = snapshot?.recent || [];
            log.innerHTML = recent.length === 0
                ? `<div class="vw-empty">Chưa có log nào.</div>`
                : recent.map(e => renderLogLine(e)).join('');
        }
    }

    function renderLogLine(e) {
        const time = new Date(e.ts).toLocaleTimeString('vi-VN');
        let ico = '▶';
        let extra = '';
        if (e.kind === 'play') {
            ico = eventIcon(e.eventType);
            extra = `@${escapeHtml(e.uniqueId || '?')} (cấp ${e.level || 0}) — ${escapeHtml(e.ruleLabel || '')}`;
        } else if (e.kind === 'mediaMissing') {
            ico = '⚠';
            extra = `<b style="color:#ff8da6">FILE MEDIA MẤT</b> @${escapeHtml(e.uniqueId || '?')} — ${escapeHtml(e.ruleLabel || '')}<br><small style="color:#8b93a8">${escapeHtml(e.mediaUrl || '')}</small>`;
        } else if (e.kind === 'cooldown') {
            ico = '⏸';
            extra = `Cooldown: @${escapeHtml(e.uniqueId || '?')} — ${escapeHtml(e.ruleLabel || '')}`;
        } else if (e.kind === 'drop') {
            ico = '🗑';
            extra = `Drop ${e.dropped || 1} item — ${escapeHtml(e.ruleLabel || '')}`;
        } else if (e.kind === 'card' || e.kind === 'late') {
            ico = e.kind === 'late' ? '🕘' : '🪪';
            extra = `${e.kind === 'late' ? 'Chào muộn' : 'Thẻ vào phòng'}: ${escapeHtml(e.nickname || '')} @${escapeHtml(e.uniqueId || '?')} (LV ${e.level || 0}) — ${escapeHtml(e.ruleLabel || '')}`;
        } else if (e.kind === 'expire') {
            ico = '⏱';
            extra = `Bỏ media chờ quá lâu: @${escapeHtml(e.uniqueId || '?')} — ${escapeHtml(e.ruleLabel || '')}`;
        }
        return `<div class="vw-log-line vw-log-${e.kind}">${time} ${ico} ${extra}</div>`;
    }

    function addLogLine(entry) {
        const log = $('#vw-log');
        if (!log) return;
        const div = document.createElement('div');
        div.innerHTML = renderLogLine(entry);
        const node = div.firstChild;
        if (log.firstChild?.classList?.contains('vw-empty')) log.innerHTML = '';
        log.insertBefore(node, log.firstChild);
        while (log.children.length > 80) log.removeChild(log.lastChild);
    }

    // ============================================================
    // Helpers
    // ============================================================
    async function uploadFileToTarget(file, applyMeta, onDone, opts) {
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const allowed = opts?.image ? ['png', 'webp'] : ['mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a'];
        if (!allowed.includes(ext)) {
            flashWarn('Chỉ chấp nhận: ' + allowed.join(', '));
            return;
        }
        if (file.size > 30 * 1024 * 1024) {
            flashWarn('File quá 30MB — vui lòng nén lại');
            return;
        }
        try {
            const url = `/api/games/vipwelcome/upload?ext=${encodeURIComponent(ext)}&name=${encodeURIComponent(file.name)}`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': file.type || 'application/octet-stream' },
                body: file
            });
            const json = await r.json();
            if (!r.ok || !json.ok) throw new Error(json?.error || 'Upload thất bại');
            applyMeta({ url: json.url, type: ['mp4', 'webm'].includes(ext) ? 'video' : (opts?.image ? 'image' : 'audio') });
            await persistConfig();
            if (typeof onDone === 'function') onDone();
            flashOk(`Đã tải lên ${file.name}`);
        } catch (e) {
            flashWarn('Lỗi upload: ' + e.message);
        }
    }

    function schedulePersist() {
        clearTimeout(pendingSave);
        pendingSave = setTimeout(() => persistConfig().catch(() => {}), 400);
    }

    async function persistConfig() {
        clearTimeout(pendingSave);
        const r = await fetch('/api/games/vipwelcome/config', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cfg)
        });
        if (!r.ok) throw new Error('Save fail');
    }

    function flashWarn(text) { showToast(text, 'warn'); }
    function flashOk(text) { showToast(text, 'ok'); }
    function showToast(text, kind) {
        const el = document.createElement('div');
        el.className = 'caro-toast ' + (kind === 'ok' ? 'ok' : 'warn');
        el.textContent = (kind === 'ok' ? '✓ ' : '⚠️ ') + text;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
})();
