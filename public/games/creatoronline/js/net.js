/**
 * 🏢 Creator Online — bản đi dạo (?demo=1) chỉ chạy ngoại tuyến.
 * Bản chạy riêng có máy chủ LAN (server/server.mjs, WebSocket /ws); khi vào HP Action LIVE thì gỡ hẳn LAN
 * (spec 2026-11-03-creatoronline-design.md §15). Giữ nguyên giao diện Net để demo.js không phải sửa:
 * online luôn false, send/event không làm gì.
 */
export class Net {
  /** @param {object} handlers {onWelcome, onJoin, onLeave, onState, onChat, onLook, onEvent, onStatus} */
  constructor(handlers) {
    this.h = handlers;
    this.online = false;
    this.id = null;
  }

  connect() {
    this.h.onStatus?.('offline');
  }

  send() {}

  event() {}
}
