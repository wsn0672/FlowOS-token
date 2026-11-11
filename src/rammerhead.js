import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { Duplex, pipeline, Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { getClientIP } from './clientIP.js';
import { targetURL, rawHeaders, UPSTREAM_MAX_HEADER_SIZE } from './proxy.js';
import { publicLookup } from './proxyTargets.js';

const wrapper = fileURLToPath(new URL('./rammerhead-ui/frame.html', import.meta.url));
const maxBodySize = 32 * 1024 * 1024;
const clientIdentity = Symbol('Rammerhead client IP');
const serviceCommands = new Set(['hammerhead|command|get-uploaded-files', 'hammerhead|command|upload-files']);
const serviceRoutes = new Set(['/hammerhead.js', '/worker-hammerhead.js', '/transport-worker.js', '/task.js', '/iframe-task.js', '/rammerhead.js', '/messaging', '/api/shuffleDict', '/syncLocalStorage']);

function openDestination (ctx, app, logs, traffic) {
  const ip = getClientIP(ctx.req, app);
  const url = targetURL(ctx.dest.url, ['http:', 'https:', 'ws:', 'wss:'], false);
  if (['CONNECT', 'TRACE', 'TRACK'].includes(ctx.reqOpts.method.toUpperCase())) throw new Error('Invalid proxy method.');
  const tls = ['https:', 'wss:'].includes(url.protocol);
  const outboundURL = new URL(url);
  outboundURL.protocol = tls ? 'https:' : 'http:';
  const headers = { ...ctx.reqOpts.headers, 'accept-encoding': 'identity' };
  for (const key of Object.keys(headers)) {
    // These headers describe the incoming tunnel, never the upstream request.
    if (/^(?:cf-|x-forwarded-)/.test(key) || ['forwarded', 'x-real-ip', 'cdn-loop', 'proxy-authorization', 'proxy-connection', 'transfer-encoding', 'expect'].includes(key)) delete headers[key];
  }
  headers.host = outboundURL.host;
  if (ctx.isWebSocket) {
    if (!['upgrade', 'websocket'].every((value, i) => String(headers[['connection', 'upgrade'][i]]).toLowerCase().split(/,\s*/).includes(value))) {
      throw new Error('Invalid WebSocket handshake.');
    }
    delete headers['sec-websocket-extensions'];
    delete headers['content-length'];
  } else {
    delete headers.connection;
    delete headers.upgrade;
    if (headers['content-length'] != null) headers['content-length'] = ctx.reqBody.length;
  }
  const type = ctx.isWebSocket ? 'websocket' : 'http';
  const entry = { requestId: randomUUID(), url: url.href, method: ctx.reqOpts.method };
  const controller = new AbortController();

  return new Promise((resolve, reject) => {
    const upstream = (tls ? https : http).request(outboundURL, {
      method: entry.method,
      headers,
      maxHeaderSize: UPSTREAM_MAX_HEADER_SIZE,
      agent: false,
      lookup: publicLookup
    });
    function fail (error) {
      try { logs.write(ip, { ...entry, type: type + '-error', error: error.code || 'UPSTREAM_ERROR' }); } catch {}
      reject(error);
    }
    upstream.once('error', fail);
    try {
      entry.headers = upstream.getHeaders();
      logs.write(ip, { ...entry, type: type + '-request' });
      traffic.request(ip, url);
    } catch (error) {
      upstream.destroy(error);
      return;
    }
    ctx.res.once('close', () => {
      controller.abort();
      upstream.destroy();
    });
    upstream.setTimeout(60000, () => upstream.destroy(new Error('Upstream timeout.')));
    const meter = direction => traffic.stream(ip, url, direction, controller.signal);
    function audit (response) {
      logs.write(ip, { ...entry, type: type + '-response', status: response.statusCode, responseHeaders: rawHeaders(response.rawHeaders) });
    }
    upstream.once('response', response => {
      try {
        audit(response);
        const metered = Object.assign(meter('download'), {
          headers: response.headers,
          rawHeaders: response.rawHeaders,
          trailers: response.trailers,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          httpVersion: response.httpVersion
        });
        pipeline(response, metered, () => {});
        resolve(metered);
      } catch (error) {
        response.destroy();
        fail(error);
      }
    });
    upstream.once('upgrade', (response, socket, head) => {
      try {
        audit(response);
        if (head.length) socket.unshift(head);
        const upload = meter('upload');
        const download = meter('download');
        const relay = Duplex.from({ writable: upload, readable: download });
        pipeline(upload, socket, error => { if (error) relay.destroy(); });
        pipeline(socket, download, error => { if (error) relay.destroy(); });
        ctx.res.once('close', () => { relay.destroy(); socket.destroy(); });
        relay.on('error', () => ctx.res.destroy());
        relay.once('close', () => socket.destroy());
        response.socket = relay;
        resolve(response);
      } catch (error) {
        socket.destroy();
        fail(error);
      }
    });
    if (ctx.reqBody.length) pipeline(Readable.from([ctx.reqBody]), meter('upload'), upstream, () => {});
    else upstream.end();
  });
}

export function installRammerhead (app, logs, traffic, originValue = process.env.RAMMERHEAD_ORIGIN, desktopValue = process.env.FLOWOS_ORIGIN) {
  if (!originValue) return;
  function parseOrigin (value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Expected a browser origin.');
    return url;
  }
  const origin = parseOrigin(originValue);
  const desktop = parseOrigin(desktopValue);
  if (origin.hostname === desktop.hostname) throw new Error('RAMMERHEAD_ORIGIN must use a different hostname from FLOWOS_ORIGIN.');
  const require = createRequire(import.meta.url);
  const { RammerheadLogging, RammerheadProxy, RammerheadSessionMemoryStore } = require('rammerhead');
  const upstreamRequire = createRequire(require.resolve('rammerhead'));
  const { parseProxyUrl } = upstreamRequire('testcafe-hammerhead/lib/utils/url');
  const requestPipeline = upstreamRequire('testcafe-hammerhead/lib/request-pipeline/utils');
  const requestIP = new AsyncLocalStorage();
  const logger = new RammerheadLogging({ logger: () => {} });
  class OwnedSessions extends RammerheadSessionMemoryStore {
    get (id, update = true) {
      const session = super.get(id, false);
      const ip = requestIP.getStore();
      if (!session || (ip && session[clientIdentity] !== ip)) return;
      if (update) session.updateLastUsed();
      return session;
    }
  }
  const sessions = new OwnedSessions({ logger, staleTimeout: 60 * 60 * 1000, maxToLive: null });
  const proxy = new RammerheadProxy({
    logger,
    dontListen: true,
    crossDomainPort: null,
    disableLocalStorageSync: true,
    disableHttp2: true,
    getServerInfo: () => ({ hostname: origin.hostname, port: origin.port || (origin.protocol === 'https:' ? 443 : 80), protocol: origin.protocol })
  });
  sessions.attachToProxy(proxy);
  const owned = (id, req) => id && sessions.get(id, false)?.[clientIdentity] === getClientIP(req, app);
  // Rammerhead bundles Hammerhead 31.6.2. Replace its destination stage so even redirects,
  // upgrades and special protocols never fall back to its unmetered network or file access.
  requestPipeline.sendRequest = async ctx => {
    ctx.goToNextStage = false;
    try {
      if (!owned(ctx.session.id, ctx.req)) throw new Error('Session unavailable.');
      const response = await openDestination(ctx, app, logs, traffic);
      if (ctx.res.destroyed || ctx.isWebSocketConnectionReset) {
        response.socket?.destroy();
        response.destroy?.();
        return;
      }
      ctx.destRes = response;
      ctx.goToNextStage = true;
      ctx.buildContentInfo();
      ctx.calculateIsDestResReadableEnded();
    } catch {
      ctx.goToNextStage = false;
      if (!ctx.res.destroyed) {
        if (ctx.isWebSocket) ctx.res.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        else ctx.closeWithError(502, 'Upstream request unavailable.');
      }
    }
  };

  const matchesHost = req => String(req.headers.host).toLowerCase() === origin.host;
  function target (value) {
    if (!value) return null;
    try { return parseProxyUrl(value); } catch { return null; }
  }
  function permitted (req) {
    const { pathname, searchParams } = new URL(req.url, origin);
    if (serviceRoutes.has(pathname)) {
      if (pathname === '/api/shuffleDict') return owned(searchParams.get('id'), req);
      if (pathname === '/syncLocalStorage') return false;
      if (pathname === '/task.js' || pathname === '/iframe-task.js' || pathname === '/messaging') return owned(target(req.headers.referer)?.sessionId, req);
      return true;
    }
    const destination = target(req.url);
    if (!destination || !owned(destination.sessionId, req)) return false;
    if (destination.destUrl === 'about:blank' || destination.destUrl === 'about:error') return true;
    try { targetURL(destination.destUrl, ['http:', 'https:', 'ws:', 'wss:'], false); return true; } catch { return false; }
  }
  app.use((req, res, next) => {
    if (!matchesHost(req)) return next();
    const { pathname } = new URL(req.url, origin);
    res.set('Cache-Control', 'no-store');
    if (pathname === '/flowos/frame' && req.method === 'GET') {
      res.set('Content-Security-Policy', `frame-ancestors ${desktop.origin}`);
      return res.sendFile(wrapper);
    }
    if (pathname === '/flowos/frame.js' && req.method === 'GET') return res.sendFile(wrapper.replace('frame.html', 'frame.js'));
    if (pathname === '/flowos/session' && req.method === 'POST') {
      if (req.headers.origin !== origin.origin || req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0) return res.sendStatus(403);
      const ip = getClientIP(req, app);
      const ids = sessions.keys();
      if (ids.length >= 512 || ids.filter(id => sessions.get(id, false)?.[clientIdentity] === ip).length >= 32) return res.sendStatus(429);
      const id = randomBytes(16).toString('hex');
      const session = sessions.add(id);
      session.shuffleDict = null;
      session.proxy = proxy;
      session.disableCrossDomain();
      session[clientIdentity] = ip;
      const handleServiceMessage = session.handleServiceMessage.bind(session);
      session.handleServiceMessage = (message, serverInfo) => {
        if (!serviceCommands.has(message.cmd)) throw new Error('Unsupported service message.');
        return handleServiceMessage(message, serverInfo);
      };
      return res.json({ id, desktopOrigin: desktop.origin });
    }
    if (!permitted(req)) return res.sendStatus(404);
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) > maxBodySize) return res.sendStatus(413);
    return requestIP.run(getClientIP(req, app), () => proxy._onRequest(req, res));
  });
  return {
    origin: origin.origin,
    upgrade (req, socket, head) {
      if (!matchesHost(req)) return false;
      if (serviceRoutes.has(new URL(req.url, origin).pathname) || !permitted(req)) socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      else {
        socket.on('error', () => socket.destroy());
        requestIP.run(getClientIP(req, app), () => proxy._onUpgradeRequest(req, socket, head)).catch(() => socket.destroy());
      }
      return true;
    }
  };
}
