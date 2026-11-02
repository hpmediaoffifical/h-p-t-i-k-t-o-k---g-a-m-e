/**
 * Client side of the LAN relay. If no server is reachable the game keeps
 * running offline with NPCs only.
 *
 * Messages: join/welcome/leave, s (position), chat, look, and `ev` room events
 * (gift, comment, heart, genre, theme, idols, role, fx, pk) that the server
 * validates and relays to everybody.
 */
export class Net {
  /**
   * @param {object} handlers {onWelcome, onJoin, onLeave, onState, onChat, onLook, onEvent, onStatus}
   */
  constructor(handlers) {
    this.h = handlers;
    this.ws = null;
    this.online = false;
    this.id = null;
  }

  connect(joinMsg) {
    this.joinMsg = joinMsg;
    if (!/^https?:$/.test(location.protocol)) {
      this.h.onStatus?.('offline');
      return;
    }
    let ws;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    } catch {
      this.h.onStatus?.('offline');
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', ...joinMsg }));
    ws.onmessage = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.t) {
        case 'welcome':
          this.online = true;
          this.id = m.id;
          this.h.onWelcome?.(m);
          this.h.onStatus?.('online');
          break;
        case 'join':
          this.h.onJoin?.(m.p);
          break;
        case 'leave':
          this.h.onLeave?.(m.id);
          break;
        case 's':
          this.h.onState?.(m);
          break;
        case 'chat':
          this.h.onChat?.(m);
          break;
        case 'look':
          this.h.onLook?.(m);
          break;
        case 'ev':
          this.h.onEvent?.(m);
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      const was = this.online;
      this.online = false;
      this.h.onStatus?.('offline', was);
    };
    ws.onerror = () => {};
  }

  send(msg) {
    if (this.online && this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  /** Send a room event. */
  event(kind, data) {
    this.send({ t: 'ev', kind, ...data });
  }
}
