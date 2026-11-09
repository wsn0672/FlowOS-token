import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { isPublicAddress, publicLookup } from './proxyTargets.js';
import https from 'node:https';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { pipeline } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';

import { getClientIP } from './clientIP.js';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length']);
function targetURL (value, protocols, allowPrivateTargets) {
  const url = new URL(value);
  if (!protocols.includes(url.protocol) || url.username || url.password) throw new Error('Invalid proxy target.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowPrivateTargets && isIP(host) && !isPublicAddress(host)) throw new Error('Private proxy destinations are not allowed.');
  return url;
}
function outgoingHeaders (input = {}) {
  const headers = {};
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Invalid headers.');
  const blocked = new Set([...hopHeaders, ...String(input.connection || '').toLowerCase().split(',').map(v => v.trim())]);
  for (const [name, value] of Object.entries(input)) {
    if (!blocked.has(name.toLowerCase()) && !name.toLowerCase().startsWith('sec-websocket-')) {
      http.validateHeaderName(name);
      for (const part of Array.isArray(value) ? value : [value]) http.validateHeaderValue(name, part);
      headers[name.toLowerCase()] = value;
    }
  }
  headers['accept-encoding'] = 'identity';
  return headers;
}
function rawHeaders (raw) {
  const result = {};
  for (let i = 0; i < raw.length; i += 2) {
    const key = raw[i].toLowerCase();
    result[key] = key in result ? [].concat(result[key], raw[i + 1]) : raw[i + 1];
  }
  return result;
}

export function installProxy (app, server, logs, { allowPrivateTargets = false, traffic } = {}) {
  app.post('/proxy/http', (req, res) => {
    const ip = getClientIP(req, app);
    let url, meta, headers;
    try {
      meta = JSON.parse(Buffer.from(req.get('x-flowos-request') || '', 'base64url').toString());
      url = targetURL(meta.url, ['http:', 'https:'], allowPrivateTargets);
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/.test(meta.method) || ['CONNECT', 'TRACE', 'TRACK'].includes(meta.method.toUpperCase())) throw new Error('Invalid method.');
      headers = outgoingHeaders(meta.headers);
    } catch {
      return res.status(400).send('Invalid proxy request.');
    }
    const controller = new AbortController();
    const entry = { requestId: randomUUID(), type: 'http-request', url: url.href, method: meta.method, headers };
    let upstream;
    try {
      upstream = (url.protocol === 'https:' ? https : http).request(url, { method: meta.method, headers, lookup: allowPrivateTargets ? undefined : publicLookup }, response => {
        const responseHeaders = rawHeaders(response.rawHeaders);
        try {
          logs.write(ip, { ...entry, type: 'http-response', status: response.statusCode, responseHeaders });
        } catch (error) {
          console.error('Proxy log write failed:', error.message);
          response.destroy();
          return res.destroy();
        }
        const encoding = String(responseHeaders['content-encoding'] || '').toLowerCase();
        const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'br' ? createBrotliDecompress() : encoding === 'deflate' ? createInflate() : null;
        if (decoder) {
          delete responseHeaders['content-encoding'];
          delete responseHeaders['content-length'];
        }
        const metadata = { status: response.statusCode, statusText: response.statusMessage, headers: responseHeaders };
        res.set('x-flowos-response', Buffer.from(JSON.stringify(metadata)).toString('base64url'));
        res.set('content-type', 'application/octet-stream');
        res.set('cache-control', 'no-store');
        const streams = [response];
        if (decoder && meta.method.toUpperCase() !== 'HEAD') streams.push(decoder);
        if (traffic) streams.push(traffic.stream(ip, url, 'download', controller.signal));
        streams.push(res);
        pipeline(...streams, () => {});
      });
      entry.headers = upstream.getHeaders();
      logs.write(ip, entry);
      traffic?.request(ip, url);
    } catch (error) {
      upstream?.destroy();
      console.error('Proxy request/log error:', error.message);
      return res.status(503).send('Proxy request unavailable.');
    }
    upstream.setTimeout(60000, () => upstream.destroy(new Error('Upstream timeout.')));
    upstream.on('error', error => {
      try { logs.write(ip, { ...entry, type: 'http-error', error: error.code || 'UPSTREAM_ERROR' }); } catch (logError) { console.error(logError.message); }
      if (!res.headersSent) res.status(502).send('Upstream request failed.');
      else res.destroy();
    });
    req.on('aborted', () => { controller.abort(); upstream.destroy(); });
    res.on('close', () => { controller.abort(); if (!res.writableFinished) upstream.destroy(); });
    if (traffic) pipeline(req, traffic.stream(ip, url, 'upload', controller.signal), upstream, () => {});
    else req.pipe(upstream);
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    let target, headers, protocols;
    try {
      const local = new URL(req.url, 'http://localhost');
      if (local.pathname !== '/proxy/ws') throw new Error('Unknown upgrade route.');
      const meta = JSON.parse(Buffer.from(local.searchParams.get('meta') || '', 'base64url').toString());
      target = targetURL(meta.url, ['ws:', 'wss:'], allowPrivateTargets);
      headers = outgoingHeaders(meta.headers);
      protocols = meta.protocols || [];
      if (!Array.isArray(protocols) || protocols.some(v => typeof v !== 'string')) throw new Error('Invalid protocols.');
      const ip = getClientIP(req, app);
      const requestId = randomUUID();
      logs.write(ip, { requestId, type: 'websocket-request', url: target.href, method: 'GET', headers });
      traffic?.request(ip, target);
      wss.handleUpgrade(req, socket, head, client => {
        let upstream;
        try {
          upstream = new WebSocket(target, protocols, { headers, lookup: allowPrivateTargets ? undefined : publicLookup, perMessageDeflate: false, maxPayload: 16 * 1024 * 1024, handshakeTimeout: 30000 });
        } catch { client.close(1011, 'Upstream connection failed'); return; }
        upstream.on('upgrade', response => {
          try {
            logs.write(ip, { requestId, type: 'websocket-response', url: target.href, method: 'GET', headers: upstream._req.getHeaders(), status: response.statusCode, responseHeaders: rawHeaders(response.rawHeaders) });
          } catch (error) { console.error(error.message); upstream.terminate(); client.terminate(); }
        });
        upstream.on('open', () => client.send(JSON.stringify({ protocol: upstream.protocol })));
        const controller = new AbortController();
        function relay (source, destination, direction) {
          let tail = Promise.resolve();
          let pending = 0;
          source.on('message', (data, binary) => {
            pending += data.length;
            if (pending > 32 * 1024 * 1024) { source.terminate(); destination.terminate(); return; }
            source.pause();
            tail = tail.then(async () => {
              const send = (part, fin) => new Promise((resolve, reject) => {
                if (destination.readyState !== WebSocket.OPEN) return reject(new Error('WebSocket closed.'));
                destination.send(part, { binary, fin }, error => error ? reject(error) : resolve());
              });
              if (!data.length) await send(data, true);
              for (let offset = 0; offset < data.length;) {
                const bytes = traffic ? await traffic.grant(ip, target.hostname, direction, data.length - offset, controller.signal) : data.length - offset;
                await send(data.subarray(offset, offset + bytes), offset + bytes === data.length);
                offset += bytes;
              }
            }).catch(() => { source.terminate(); destination.terminate(); }).finally(() => {
              pending -= data.length;
              if (!pending && source.readyState === WebSocket.OPEN) source.resume();
            });
          });
        }
        relay(upstream, client, 'download');
        relay(client, upstream, 'upload');
        const close = (peer, code, reason) => {
          if (peer.readyState === WebSocket.OPEN) peer.close(code >= 1000 && code <= 4999 && ![1004, 1005, 1006, 1015].includes(code) ? code : 1000, reason);
          else if (peer.readyState === WebSocket.CONNECTING) peer.terminate();
        };
        upstream.on('close', (code, reason) => { controller.abort(); close(client, code, reason); });
        client.on('close', (code, reason) => { controller.abort(); close(upstream, code, reason); });
        upstream.on('error', error => {
          try { logs.write(ip, { requestId, type: 'websocket-error', url: target.href, method: 'GET', headers, error: error.code || 'UPSTREAM_ERROR' }); } catch (logError) { console.error(logError.message); }
          close(client, 1011, 'Upstream connection failed');
        });
        client.on('error', () => upstream.terminate());
      });
    } catch {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    }
  });
}
