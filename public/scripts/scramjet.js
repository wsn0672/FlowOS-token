/* eslint-env browser */
/* global $scramjetLoadController */
import { withTimeout } from './proxy-recovery.js';

export const SCRAMJET_SCOPE = '/scramjet/service/';
let ready;
export function initScramjet () {
  if (ready) return ready;
  ready = (async () => {
    if (!globalThis.$scramjetLoadController) {
      await withTimeout(new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/scramjet/assets/scramjet.all.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Scramjetの読み込みに失敗しました。'));
        document.head.append(script);
      }));
    }
    const { ScramjetController } = $scramjetLoadController();
    const controller = new ScramjetController({
      prefix: SCRAMJET_SCOPE,
      files: {
        all: '/scramjet/assets/scramjet.all.js',
        sync: '/scramjet/assets/scramjet.sync.js',
        wasm: '/scramjet/assets/scramjet.wasm.wasm'
      }
    });
    await withTimeout(controller.init());
    const registration = await withTimeout(navigator.serviceWorker.register('/scramjet/sw.js', { scope: SCRAMJET_SCOPE }));
    const worker = registration.active || registration.installing || registration.waiting;
    if (worker?.state !== 'activated') {
      await withTimeout(new Promise((resolve, reject) => {
        if (!worker) return reject(new Error('Scramjetの起動に失敗しました。'));
        function check () {
          if (worker.state === 'activated') resolve();
          if (worker.state === 'redundant') reject(new Error('Scramjetの起動に失敗しました。'));
        }
        worker.addEventListener('statechange', check);
        check();
      }));
    }
    return controller;
  })().catch(error => {
    ready = undefined;
    throw error;
  });
  return ready;
}
