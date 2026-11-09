/* eslint-env browser */
const encode = value => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))));

export default class ServerTransport {
  ready = false;
  constructor (options) { this.base = options.base; this.retryDelays = options.retryDelays ?? [300, 900]; }
  async init () { this.ready = true; }
  meta () { return {}; }
  async request (remote, method, body, headers, signal) {
    // Replay only body-free GET/HEAD operations, never form submissions or uploads.
    const safe = ['GET', 'HEAD'].includes(method.toUpperCase()) && body == null;
    for (let attempt = 0; ; attempt++) {
      const timeout = new AbortController();
      const timer = safe ? setTimeout(() => timeout.abort(new DOMException('接続がタイムアウトしました。', 'TimeoutError')), 15000) : null;
      try {
        const response = await fetch(this.base + '/proxy/http', {
          method: 'POST',
          headers: { 'x-flowos-request': encode({ url: remote.href, method, headers }) },
          body,
          ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
          signal: safe ? (signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal) : signal,
          credentials: 'omit',
          cache: 'no-store'
        });
        if (!response.ok) {
          const error = new Error(`プロキシ通信に失敗しました（${response.status}）。`);
          error.retryable = [502, 503, 504, 520, 521, 522, 523, 524].includes(response.status);
          await response.body?.cancel();
          throw error;
        }
        const metadata = decode(response.headers.get('x-flowos-response'));
        return { ...metadata, body: response.body };
      } catch (error) {
        const transient = error instanceof TypeError || error.name === 'TimeoutError' || error.retryable === true;
        if (!safe || signal?.aborted || !transient || attempt >= this.retryDelays.length) throw error;
      } finally { clearTimeout(timer); }
      await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, this.retryDelays[attempt]);
        if (signal?.aborted) return abort();
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }

  connect (url, origin, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
    const endpoint = new URL('/proxy/ws', this.base);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    endpoint.searchParams.set('meta', encode({ url: url.href, protocols, headers: { ...requestHeaders, origin } }));
    const socket = new WebSocket(endpoint);
    socket.binaryType = 'arraybuffer';
    let opened = false;
    socket.onmessage = event => {
      if (!opened) {
        opened = true;
        onopen(JSON.parse(event.data).protocol);
      } else onmessage(event.data);
    };
    socket.onerror = () => onerror('Proxy WebSocket failed.');
    socket.onclose = event => onclose(event.code, event.reason);
    return [data => socket.send(data), (code, reason) => socket.close(code, reason)];
  }
}
