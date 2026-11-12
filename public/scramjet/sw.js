/* eslint-env serviceworker */
/* global $scramjetLoadWorker, ScramjetCookies */
importScripts('/scramjet/assets/scramjet.all.js', '/scramjet/psl.js', '/scramjet/cookies.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const prefix = '/scramjet/service/';

function destination (value) {
  try {
    const url = new URL(value);
    if (url.origin !== self.location.origin || !url.pathname.startsWith(prefix)) return;
    const target = new URL(decodeURIComponent(url.pathname.slice(prefix.length)));
    if (['https:', 'http:'].includes(target.protocol)) return target;
  } catch {}
}

// Extend the worker lifetime for script-set cookies and leave the upstream
// listener in charge of its other messages.
self.addEventListener('message', event => {
  const data = event.data;
  if (data?.scramjet$type !== 'cookie') return;
  event.stopImmediatePropagation();
  if ('scramjet$token' in data) return;
  const source = destination(event.source?.url);
  let target;
  try { target = new URL(data.url); } catch { return; }
  if (source?.origin !== target.origin) return;
  event.waitUntil(cookies.ready.then(() => {
    cookies.setCookies([data.cookie], target, true);
    return cookies.written;
  }));
});

const worker = new ScramjetServiceWorker();
const cookies = new ScramjetCookies(new worker.cookieStore.constructor());
let configReady;
worker.addEventListener('request', event => {
  // Never pass the hosting site's browser cookies to an upstream website.
  for (const key of Object.keys(event.requestHeaders)) {
    if (key.toLowerCase() === 'cookie') delete event.requestHeaders[key];
  }
  const header = cookies.getCookies(event.url);
  if (header) event.requestHeaders.Cookie = header;
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const response = (async () => {
    configReady ||= worker.loadConfig().catch(error => {
      configReady = undefined;
      worker.config = undefined;
      throw error;
    });
    await configReady;
    if (!worker.route(event)) return fetch(event.request);
    await cookies.ready;
    const target = destination(event.request.url);
    const context = Object.create(worker);
    context.dispatchEvent = worker.dispatchEvent.bind(worker);
    context.dispatch = (client, data) => {
      // 1.1.0 sends array indexes here instead of cookie values, then waits
      // for an acknowledgement that can be lost when a tab navigates/closes.
      if (data.scramjet$type === 'cookie') return Promise.resolve();
      return worker.dispatch(client, data);
    };
    context.cookieStore = {
      getCookies: url => cookies.getCookies(url),
      dump: () => cookies.dump(target),
      setCookies: async (values, url) => {
        const updates = cookies.setCookies(values, url);
        const committed = cookies.written;
        if (updates.length && event.clientId && event.request.mode !== 'navigate') {
          // The client may have closed by the time the response arrives.
          self.clients.get(event.clientId).then(client => {
            if (destination(client?.url)?.origin !== url.origin) return;
            for (const cookie of updates) client.postMessage({ scramjet$type: 'cookie', scramjet$token: -1, cookie, url: url.href });
          }).catch(() => {});
        }
        await committed;
      }
    };
    return worker.fetch.call(context, event);
  })();
  event.respondWith(response);
});
