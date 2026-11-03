import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, GAME_BASE } from '../public/games/creatoronline/js/logic/paths.js';

test('assetUrl: đường dẫn tương đối trong data.json đổi sang tuyệt đối dưới thư mục game', () => {
  assert.equal(assetUrl('audio/kpop.mp3'), '/games/creatoronline/audio/kpop.mp3');
  assert.equal(assetUrl('./assets/logo-mark.svg'), '/games/creatoronline/assets/logo-mark.svg');
  assert.equal(GAME_BASE, '/games/creatoronline/');
});

test('assetUrl: giữ nguyên đường dẫn tuyệt đối và link http(s)', () => {
  assert.equal(assetUrl('/games/other/a.mp3'), '/games/other/a.mp3');
  assert.equal(assetUrl('https://cdn.example.com/a.mp3'), 'https://cdn.example.com/a.mp3');
  assert.equal(assetUrl('http://127.0.0.1/a.mp3'), 'http://127.0.0.1/a.mp3');
});

test('assetUrl: rỗng / thiếu → chuỗi rỗng', () => {
  assert.equal(assetUrl(''), '');
  assert.equal(assetUrl(undefined), '');
});
