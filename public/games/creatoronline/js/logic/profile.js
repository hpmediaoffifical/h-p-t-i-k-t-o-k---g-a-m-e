/** Player profile persisted in localStorage. Pure logic with an injected storage. */

import { cleanText } from './format.js';

export const PROFILE_KEY = 'creator_online_profile_v1';

export const LOOK_VALUES = {
  outfit: ['hoodie', 'tee', 'street', 'idolPink', 'idolWhite', 'idolBlack', 'mcSuit', 'gamer'],
  hair: ['brown', 'black', 'blonde', 'pink', 'blue', 'silver'],
  hat: ['none', 'cap', 'red', 'crown'],
};

const FREE_ITEMS = ['outfit_hoodie', 'outfit_tee', 'hair_brown', 'hair_black', 'hat_none'];

/** Fresh profile for a new player. */
export function defaultProfile(name, startCoins = 500) {
  return {
    name: cleanText(name, 20) || 'Tân Binh',
    look: { outfit: 'hoodie', hair: 'brown', hat: 'none' },
    coins: startCoins,
    gifted: 0,
    hearts: 0,
    earned: 0,
    owned: FREE_ITEMS.slice(),
    wheelAt: 0,
    claimed: {},
  };
}

/** Keep only known values for look fields. */
export function sanitizeLook(look) {
  const out = {};
  for (const [k, allowed] of Object.entries(LOOK_VALUES)) {
    out[k] = allowed.includes(look?.[k]) ? look[k] : allowed[0];
  }
  return out;
}

/** Validate a parsed profile; anything malformed falls back to defaults. */
export function sanitizeProfile(raw, fallbackName, startCoins) {
  const base = defaultProfile(fallbackName, startCoins);
  if (!raw || typeof raw !== 'object') return base;
  const num = (v, d) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
  const owned = Array.isArray(raw.owned) ? raw.owned.filter((s) => typeof s === 'string') : [];
  return {
    name: cleanText(raw.name, 20) || base.name,
    look: sanitizeLook(raw.look ?? base.look),
    coins: num(raw.coins, base.coins),
    gifted: num(raw.gifted, 0),
    hearts: num(raw.hearts, 0),
    earned: num(raw.earned, 0),
    owned: [...new Set([...base.owned, ...owned])],
    wheelAt: num(raw.wheelAt, 0),
    claimed: raw.claimed && typeof raw.claimed === 'object' && !Array.isArray(raw.claimed) ? raw.claimed : {},
  };
}

export function loadProfile(storage, fallbackName, startCoins) {
  try {
    const text = storage?.getItem(PROFILE_KEY);
    return sanitizeProfile(text ? JSON.parse(text) : null, fallbackName, startCoins);
  } catch {
    return defaultProfile(fallbackName, startCoins);
  }
}

export function saveProfile(storage, profile) {
  try {
    storage?.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* storage may be blocked (private mode); the game still works */
  }
}

/** Spend coins if affordable. Returns false (and changes nothing) otherwise. */
export function spend(profile, amount) {
  if (!Number.isFinite(amount) || amount < 0 || profile.coins < amount) return false;
  profile.coins -= amount;
  return true;
}
