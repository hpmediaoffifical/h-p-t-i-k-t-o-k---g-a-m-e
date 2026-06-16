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
            maxFruitsPerPlant: 12,
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
                stemCount: 7,
                showStatus: true,
                showNames: true,
                showButterflies: true,
                showBees: true,
                showCaterpillars: true,
                showFlowers: true,
                showWeatherFx: true,
                showDragon: true,
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
