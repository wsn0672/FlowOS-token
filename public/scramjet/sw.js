/* eslint-env serviceworker */
/* global $scramjetLoadWorker */
importScripts('/scramjet/assets/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const worker = new ScramjetServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    await worker.loadConfig();
    return worker.route(event) ? worker.fetch(event) : fetch(event.request);
  })());
});
