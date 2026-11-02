/** Small formatting helpers shared by the HUD and the server. Pure logic. */

/** 13386 -> "13.386" (Vietnamese thousands separator). */
export function formatThousands(n) {
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.floor(Math.abs(n)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Pick the highest rank whose `min` is <= points. Ranks must be non-empty and sorted. */
export function rankFor(points, ranks) {
  let label = ranks[0].label;
  for (const r of ranks) if (points >= r.min) label = r.label;
  return label;
}

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

/** Strip control characters, collapse whitespace and clamp length; used for names and chat. */
export function cleanText(text, maxLen) {
  return String(text ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
