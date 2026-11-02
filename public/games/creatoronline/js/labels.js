/**
 * Floating name tags and chat bubbles rendered as DOM via CSS2DRenderer.
 * Tags scale with distance so near characters get big labels, like the reference.
 */
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/**
 * Attach a name tag above a character.
 * @param {object} char from createCharacter
 * @param {string} name
 * @param {'npc'|'guard'|'player'|'remote'} kind
 */
export function attachLabel(char, name, kind = 'npc') {
  const wrap = document.createElement('div');
  wrap.className = 'tag-wrap';
  const inner = document.createElement('div');
  inner.className = 'tag-inner';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const tag = document.createElement('div');
  tag.className = `nametag ${kind}`;
  tag.textContent = name;
  inner.append(bubble, tag);
  wrap.append(inner);
  const obj = new CSS2DObject(wrap);
  obj.center.set(0.5, 1);
  obj.position.set(0, 1.9, 0);
  char.root.add(obj);

  let bubbleTime = 0;
  let lastScale = -1;
  return {
    obj,
    setName(n) {
      tag.textContent = n;
    },
    /** Show a chat bubble for `seconds`. */
    say(text, seconds = 4.5) {
      bubble.textContent = text;
      bubble.classList.add('show');
      bubbleTime = seconds;
    },
    /** Per-frame: fade bubble, scale by camera distance. */
    update(dt, dist, maxDist = 30) {
      if (bubbleTime > 0) {
        bubbleTime -= dt;
        if (bubbleTime <= 0) bubble.classList.remove('show');
      }
      const visible = dist < maxDist;
      obj.visible = visible; // CSS2DRenderer owns style.display
      if (!visible) return;
      const s = Math.round(Math.max(0.42, Math.min(1.45, 9.5 / Math.max(dist, 0.1))) * 50) / 50;
      if (s !== lastScale) {
        inner.style.transform = `scale(${s})`;
        lastScale = s;
      }
    },
    dispose() {
      char.root.remove(obj);
      wrap.remove();
    },
  };
}
