// ⛓️ Nhà Tù Online — camera cho người tương tác miễn phí: chia sẻ > theo dõi > bình luận > thả tim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Interest, CameoQueue, INTEREST_WEIGHT } from '../public/games/nhatu/js/logic/cameo.js';

test('bậc ưu tiên miễn phí: chia sẻ > theo dõi > bình luận > thả tim', () => {
  const w = INTEREST_WEIGHT;
  assert.ok(w.share > w.follow && w.follow > w.comment && w.comment > w.like);
});

test('Interest cộng dồn rồi giảm một nửa sau mỗi chu kỳ bán rã', () => {
  // Arrange
  const it = new Interest({ halfLifeSec: 10 });
  // Act
  it.bump('a', 'comment', 0);
  it.bump('a', 'comment', 0);
  // Assert
  assert.equal(it.score('a', 0), 6);
  assert.equal(it.score('a', 10000), 3);
  assert.equal(it.score('nobody', 0), 0);
});

test('Interest.pick bốc theo trọng số: người chia sẻ được chọn nhiều hơn người thả 1 tim', () => {
  // Arrange
  const it = new Interest({ halfLifeSec: 60 });
  it.bump('sharer', 'share', 0);
  it.bump('liker', 'like', 0);
  // Act: rng chia đều 0..1
  let sharer = 0;
  for (let i = 0; i < 90; i++) if (it.pick(['sharer', 'liker'], 0, () => (i + 0.5) / 90) === 'sharer') sharer++;
  // Assert: 8 / (8 + 1) ≈ 89%
  assert.equal(sharer, 80);
});

test('Interest.pick trả null khi không ai tương tác gần đây', () => {
  const it = new Interest({ halfLifeSec: 1 });
  it.bump('a', 'like', 0);
  assert.equal(it.pick(['a', 'b'], 60000, () => 0.5), null);
  assert.equal(it.pick([], 0), null);
});

test('CameoQueue: mỗi người 1 lần, chia sẻ được ghé trước theo dõi', () => {
  // Arrange
  const q = new CameoQueue({ max: 4, ttlSec: 90 });
  // Act
  assert.equal(q.push('f1', 'follow', 0), true);
  assert.equal(q.push('s1', 'share', 1000), true);
  assert.equal(q.push('s1', 'share', 2000), false, 'đã chờ thì không xếp lại');
  // Assert
  assert.equal(q.next(3000).id, 's1');
  assert.equal(q.next(3000).id, 'f1');
  assert.equal(q.next(3000), null);
});

test('CameoQueue đầy: chia sẻ thay chỗ người theo dõi, theo dõi thì bị từ chối; chờ quá hạn thì bỏ', () => {
  const q = new CameoQueue({ max: 2, ttlSec: 10 });
  q.push('f1', 'follow', 0);
  q.push('f2', 'follow', 0);
  assert.equal(q.push('f3', 'follow', 0), false);
  assert.equal(q.push('s1', 'share', 0), true);
  assert.equal(q.size, 2);
  assert.equal(q.next(0).id, 's1');
  assert.equal(q.next(10001), null, 'f2 chờ quá 10 giây → bỏ');
});
