'use strict';
/* VIP Welcome — câu đọc tên (TTS) khi người xem vào phòng. Tên TikTok hay chứa emoji / ký tự trang trí
 * mà giọng đọc sẽ đọc lung tung → chỉ giữ chữ (mọi ngôn ngữ), số và dấu câu thường. */

const MAX_LEN = 80;

function cleanSpeech(s) {
    return String(s || '')
        .normalize('NFC')
        .replace(/[^\p{L}\p{M}\p{N}\s.,!?'"\-:;()]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function renderTts(template, ctx) {
    if (!template || !ctx || ctx.isEnigma) return '';
    const name = cleanSpeech(ctx.nickname || ctx.uniqueId);
    if (!name) return '';
    const text = String(template)
        .replace(/\{(tên|nickname)\}/g, name)
        .replace(/\{bậc\}/g, cleanSpeech(ctx.title))
        .replace(/\{lv\}/g, String(ctx.level || 0))
        .replace(/\{fan\}/g, String(ctx.fansLevel || 0))
        .replace(/\{lần\}/g, String(ctx.visitNo || 1));
    return cleanSpeech(text).slice(0, MAX_LEN).trim();
}

module.exports = { renderTts, cleanSpeech };
