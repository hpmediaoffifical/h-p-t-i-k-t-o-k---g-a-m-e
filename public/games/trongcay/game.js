/* HP Trồng Cây — client helpers */
(function () {
    'use strict';
    window.HpGame = window.HpGame || {};

    function defaultConfig() {
        return {
            enabled: true,
            sessionActive: false,
            schemaVersion: 2,
            growthMode: 'perCoin',
            perCoinGrowth: 2,
            perGiftGrowth: 5,
            specificGifts: [],
            chooseTreeEnabled: false,
            activateGifts: [],
            deactivateGifts: [],
            chooseWindowSeconds: 90,
            waterGifts: [],
            waterCommentAutoWater: true,
            waterCommentKeyword: 'tuoicay',
            waterCommentAmount: 6,
            waterCommentCooldownSeconds: 8,
            sunGifts: [],
            cutGifts: [],
            butterflyGifts: [],
            beeGifts: [],
            beesPerGift: 3,
            beeHarvestPerTrip: 1,
            beePointsPerFruit: 50,
            maxBees: 30,
            teamMinContributors: 3,
            caterpillarGifts: [],
            caterpillarsPerGift: 2,
            caterpillarBite: 1,
            caterpillarBiteEverySec: 5,
            caterpillarStartDelaySec: 5,
            caterpillarLifeSeconds: 75,
            maxCaterpillars: 20,
            sprayGifts: [],
            sprayProtectSeconds: 30,
            sprayRadiusPercent: 28,
            dragonGifts: [],
            dragonBurnSeconds: 10,
            maxCaterpillarCorpses: 36,
            weatherEffectDelaySec: 1.0,
            cutSnipDelaySec: 1.8,
            carnivorousGifts: [],
            maxHeight: 100,
            initialHeight: 30,
            initialWater: 55,
            initialSun: 28,
            initialWilt: 0,
            waterLossPerSecond: 0.22,
            sunReturnPerSecond: 0.18,
            wiltGainPerSecond: 0.45,
            wiltRecoverPerSecond: 0.28,
            wiltGrowthBlockAt: 62,
            fruitsPerHarvest: 3,
            maxFruitsPerPlant: 24,
            fruitDropWilt: 55,
            fruitDropChancePerSec: 0.6,
            groundFruitMax: 40,
            butterflyLifeSeconds: 45,
            butterflySunDamagePerSecond: 2.4,
            predatorChancePerSecond: 0.006,
            carnivoreDamage: 55,
            maxFlowers: 80,
            maxButterflies: 28,
            display: {
                gardenXPercent: 50,
                gardenYPercent: 82,
                scale: 100,
                treeHeightScale: 100,
                stemCount: 7,
                showStatus: true,
                showNames: true,
                showButterflies: true,
                showBees: true,
                showCaterpillars: true,
                showFlowers: true,
                showWeatherFx: true,
                showDragon: true,
                showGroundDecor: true,    // 🪧 lớp trang trí mặt đất (bảng TOP 3 + hàng rào + đồ vật)
                showTopBoard: true,       // bảng ghi danh TOP 3 tặng điểm cắm trên đất
                showFence: true,          // hàng rào cọc + giàn hoa leo
                showGardenProps: true,    // nấm, hoa, chậu cây trang trí
                topBoardMedia: '',        // (tuỳ chọn) URL ảnh PNG hoặc video WEBM/MP4 thay mặt bảng — để trống = vẽ mặc định
                // ⚙ Kích thước & vị trí từng phần trang trí (scale %, X ngang, Y dọc theo toạ độ vườn). 100/0/0 = mặc định.
                boardScale: 100, boardX: 0, boardY: 0,
                fenceScale: 100, fenceX: 0, fenceY: 0,
                propsScale: 100, propsX: 0, propsY: 0,
                // 💎 KPI Kim Cương: đạt mốc tổng 💎 buổi LIVE → tự mở khoá từng phần trang trí (mặc định TẮT = luôn hiện)
                kpiUnlockEnabled: false,
                kpiProps: 2000, kpiFence: 3000, kpiBoard: 5000, kpiLeaderboard: 10000, kpiPet: 20000,
                // 🐾 Thú cưng: 3 con theo TOP 1/2/3 (ghi tên người TOP, KHÔNG dùng chó) + 2 con trang trí.
                showPets: true,
                petScale: 100,
                topPets: [
                    { kind: 'cat', media: '' },     // TOP 1
                    { kind: 'rabbit', media: '' },  // TOP 2
                    { kind: 'turtle', media: '' }   // TOP 3
                ],
                decorPets: [
                    { kind: 'dog', enabled: true, media: '' },
                    { kind: 'duck', enabled: true, media: '' },
                    { kind: 'bird', enabled: true, media: '' }
                ],
                showLeaderboard: true,
                showMilestones: true,
                autoHarvest: true,
                soundEnabled: true,
                theme: 'cute'
            }
        };
    }
    function clamp(v, lo, hi) {
        v = Number(v);
        if (!isFinite(v)) return lo;
        return Math.max(lo, Math.min(hi, v));
    }
    window.HpGame.trongcay = { defaultConfig, clamp };
})();
