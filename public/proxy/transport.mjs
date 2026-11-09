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
  constructor (options) { this.base = options.base; }
  async init () { this.ready = true; }
  meta () { return {}; }
  async request (remote, method, body, headers, signal) {
    const response = await fetch(this.base + '/proxy/http', {
      method: 'POST',
      headers: { 'x-flowos-request': encode({ url: remote.href, method, headers }) },
      body,
      ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
      signal,
      credentials: 'omit',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Proxy request failed (${response.status})`);
    const metadata = decode(response.headers.get('x-flowos-response'));
    return { ...metadata, body: response.body };
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
