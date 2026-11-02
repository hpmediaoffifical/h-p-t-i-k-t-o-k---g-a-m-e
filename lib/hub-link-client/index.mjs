// Bản ESM: chỉ re-export từ index.cjs để app dùng `import { createHubLink } from './lib/hub-link-client/index.mjs'`.
import cjs from './index.cjs';

export const createHubLink = cjs.createHubLink;
export const pidAlive = cjs.pidAlive;
export default cjs;
