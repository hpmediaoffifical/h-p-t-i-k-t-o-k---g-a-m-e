/**
 * 🏢 Creator Online — đường dẫn file của game. Bản LIVE chạy ở /overlay/creatoronline nên đường dẫn tương đối
 * trong data.json ("audio/kpop.mp3") phải đổi sang tuyệt đối /games/creatoronline/… (bản đi dạo chạy ở thư mục game).
 */
export const GAME_BASE = '/games/creatoronline/';

/** "audio/x.mp3" → "/games/creatoronline/audio/x.mp3"; giữ nguyên "/…" và "http(s)://…". */
export function assetUrl(file, base = GAME_BASE) {
  const f = String(file ?? '');
  if (!f) return '';
  if (f.startsWith('/') || /^https?:/i.test(f)) return f;
  return base + (f.startsWith('./') ? f.slice(2) : f);
}
