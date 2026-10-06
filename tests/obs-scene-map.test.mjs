// node --test tests/obs-scene-map.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { itemMatrix, apply, cameraToStage } from '../public/lib/obs-scene-map.mjs';

const near = (p, x, y, msg) => {
    assert.ok(Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01, `${msg}: được (${p.x}, ${p.y}), cần (${x}, ${y})`);
};
const cam = o => ({ sourceWidth: 1920, sourceHeight: 1080, positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, alignment: 5, rotation: 0, boundsType: 'OBS_BOUNDS_NONE', ...o });

test('không biến đổi', () => near(apply(itemMatrix(cam()), 100, 50), 100, 50, 'identity'));

test('thu nhỏ 0.5, căn giữa', () => {
    const m = itemMatrix(cam({ scaleX: 0.5, scaleY: 0.5, alignment: 0, positionX: 540, positionY: 960 }));
    near(apply(m, 0, 0), 60, 690, 'góc trên trái');
    near(apply(m, 960, 540), 540, 960, 'tâm');
});

test('lật ngang (Flip Horizontal của OBS = scale âm + căn giữa)', () => {
    const m = itemMatrix(cam({ scaleX: -1, alignment: 0, positionX: 960, positionY: 540 }));
    near(apply(m, 0, 0), 1920, 0, 'mép trái ảnh ra mép phải');
    near(apply(m, 1920, 1080), 0, 1080, 'mép phải ra mép trái');
});

test('crop', () => near(apply(itemMatrix(cam({ cropLeft: 420, cropRight: 420 })), 420, 0), 0, 0, 'crop trái'));

test('xoay 90°', () => near(apply(itemMatrix(cam({ rotation: 90, positionX: 100, positionY: 100 })), 10, 0), 100, 110, 'xoay'));

test('bounds: vừa khít bên trong (letterbox)', () => {
    const m = itemMatrix(cam({ boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }));
    near(apply(m, 0, 0), 0, 656.25, 'trên trái');
    near(apply(m, 1920, 1080), 1080, 1263.75, 'dưới phải');
});

test('bounds: phủ kín (cover) giữ tâm', () => {
    const m = itemMatrix(cam({ boundsType: 'OBS_BOUNDS_SCALE_OUTER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 }));
    near(apply(m, 960, 540), 540, 960, 'tâm');
});

test('bounds + lật ngang', () => {
    const m = itemMatrix(cam({ scaleX: -1, boundsType: 'OBS_BOUNDS_STRETCH', boundsWidth: 1080, boundsHeight: 1920 }));
    near(apply(m, 0, 0), 1080, 0, 'trái ↔ phải');
    near(apply(m, 1920, 1080), 0, 1920, 'phải ↔ trái');
});

test('cameraToStage: overlay 4K thu 0.5 vẫn khớp', () => {
    const layout = {
        canvas: { w: 1080, h: 1920 },
        cam: { found: true, chain: [cam({ boundsType: 'OBS_BOUNDS_SCALE_OUTER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 })] },
        overlay: { found: true, chain: [{ sourceWidth: 2160, sourceHeight: 3840, scaleX: 0.5, scaleY: 0.5, alignment: 5 }] }
    };
    const m = cameraToStage(layout, 960, 540, 1080, 1920);   // ảnh chụp 960×540
    near(apply(m, 480, 270), 540, 960, 'tâm camera = tâm sân khấu');
});

test('cameraToStage: camera nằm trong group bị dời', () => {
    const layout = {
        canvas: { w: 1080, h: 1920 },
        cam: { found: true, chain: [{ sourceWidth: 1080, sourceHeight: 1920, positionX: 0, positionY: 500, alignment: 5 }, cam({ scaleX: 0.25, scaleY: 0.25 })] },
        overlay: { found: false }
    };
    near(apply(cameraToStage(layout, 1920, 1080, 1080, 1920), 0, 0), 0, 500, 'cộng dời của group');
});

test('cameraToStage: nhiều overlay — chọn theo gameId, không có thì rơi về overlay chung', () => {
    const base = {
        canvas: { w: 1080, h: 1920 },
        cam: { found: true, chain: [cam({ boundsType: 'OBS_BOUNDS_SCALE_OUTER', boundsWidth: 1080, boundsHeight: 1920, boundsAlignment: 0 })] },
        overlay: { found: true, chain: [{ sourceWidth: 1080, sourceHeight: 1920, alignment: 5 }] },
        overlays: {
            touchplay: { found: true, chain: [{ sourceWidth: 1080, sourceHeight: 1920, alignment: 5 }] },
            // Browser Source Bắn cung bị dời xuống 200px → toạ độ sân khấu phải trừ 200
            bancung: { found: true, chain: [{ sourceWidth: 1080, sourceHeight: 1920, alignment: 5, positionX: 0, positionY: 200 }] }
        }
    };
    near(apply(cameraToStage(base, 960, 540, 1080, 1920, 'bancung'), 480, 270), 540, 760, 'overlay bancung dời 200');
    near(apply(cameraToStage(base, 960, 540, 1080, 1920, 'touchplay'), 480, 270), 540, 960, 'overlay touchplay đứng yên');
    near(apply(cameraToStage(base, 960, 540, 1080, 1920, 'khac'), 480, 270), 540, 960, 'id lạ → overlay chung');
    near(apply(cameraToStage(base, 960, 540, 1080, 1920), 480, 270), 540, 960, 'không id → overlay chung');
});
