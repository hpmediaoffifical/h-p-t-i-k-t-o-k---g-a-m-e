// ⛓️ Nhà Tù Online — phòng = đội: chọn phòng bằng bình luận, thi đua theo vòng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoomCode, leastCrowdedRoom, RoomRace, ROOM_POINTS } from '../public/games/nhatu/js/logic/rooms.js';

test('parseRoomCode đọc P3 / phòng 3 / phong3 ở đầu bình luận', () => {
  assert.equal(parseRoomCode('P3', 6), 3);
  assert.equal(parseRoomCode('p 2 nha', 6), 2);
  assert.equal(parseRoomCode('Phòng 5', 6), 5);
  assert.equal(parseRoomCode('phong1', 6), 1);
  assert.equal(parseRoomCode('#P6', 6), 6);
});

test('parseRoomCode bỏ phòng ngoài phạm vi và bình luận thường', () => {
  assert.equal(parseRoomCode('P7', 6), null);
  assert.equal(parseRoomCode('P0', 6), null);
  assert.equal(parseRoomCode('P4823', 6), null, 'mã số tù nhân không phải mã phòng');
  assert.equal(parseRoomCode('phở ngon quá', 6), null);
  assert.equal(parseRoomCode('vào phòng 3 đi', 6), null, 'chỉ đọc ở đầu câu');
  assert.equal(parseRoomCode('', 6), null);
});

test('leastCrowdedRoom chia đều người mới, hoà thì phòng số nhỏ', () => {
  assert.equal(leastCrowdedRoom(3, new Map()), 1);
  assert.equal(leastCrowdedRoom(3, new Map([[1, 2], [2, 1], [3, 1]])), 2);
  assert.equal(leastCrowdedRoom(3, new Map([[1, 1], [2, 1]])), 3);
});

test('RoomRace: hết vòng → phòng nhiều điểm nhất thắng, vòng mới bắt đầu từ 0', () => {
  // Arrange
  const r = new RoomRace({ rooms: 6, roundSec: 60 });
  r.start(0);
  r.add(2, ROOM_POINTS.share);
  r.add(5, ROOM_POINTS.like * 30);
  r.add(5, ROOM_POINTS.comment * 5);
  // Act
  const mid = r.tick(30000);
  const end = r.tick(60000);
  // Assert
  assert.equal(mid, null);
  assert.equal(end.winner, 5);
  assert.equal(end.score, 55);
  assert.deepEqual(end.ranking.map((x) => x.room), [5, 2]);
  assert.deepEqual(r.ranking(), []);
  assert.equal(r.left(60000), 60);
});

test('RoomRace: vòng không ai tương tác thì không có phòng thắng; điểm phòng sai bị bỏ', () => {
  const r = new RoomRace({ rooms: 3, roundSec: 10 });
  r.start(0);
  r.add(9, 100);
  r.add(1, -5);
  r.add(1, NaN);
  const end = r.tick(10000);
  assert.equal(end.winner, null);
  assert.deepEqual(end.ranking, []);
});

test('RoomRace hoà điểm → phòng số nhỏ đứng trước', () => {
  const r = new RoomRace({ rooms: 6, roundSec: 10 });
  r.start(0);
  r.add(4, 10);
  r.add(2, 10);
  assert.deepEqual(r.ranking().map((x) => x.room), [2, 4]);
});
