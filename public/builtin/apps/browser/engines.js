/* eslint-env browser */
import { getBrowserEngine, loadBrowserEngines } from '../../../scripts/browser-engines.js';
import { initScramjet, SCRAMJET_SCOPE } from '../../../scripts/scramjet.js';

export const engine = getBrowserEngine() || 'Ultraviolet';
const frames = new WeakMap();
let availability;

function post (frame, state, command) {
  frame.contentWindow.postMessage({ kind: 'flowos-rammerhead-command', ...command }, state.origin);
}

window.addEventListener('message', event => {
  const frame = [...document.querySelectorAll('main > iframe')].find(item => item.contentWindow === event.source);
  const state = frame && frames.get(frame);
  if (!state?.origin || state.origin !== event.origin) return;
  if (event.data?.kind === 'flowos-rammerhead-ready') {
    state.ready = true;
    if (state.url) post(frame, state, { action: 'navigate', url: state.url });
  }
  if (event.data?.kind === 'flowos-rammerhead-page') {
    try {
      const url = new URL(event.data.url);
      if (!['http:', 'https:'].includes(url.protocol)) return;
      state.url = url.href;
      frame.dispatchEvent(new CustomEvent('flow-page', { detail: { url: url.href, title: String(event.data.title).slice(0, 200) } }));
    } catch {}
  }
});

export async function navigate (frame, value) {
  let state = frames.get(frame);
  if (!state) {
    state = { generation: 0 };
    frames.set(frame, state);
  }
  const generation = ++state.generation;
  const current = () => frame.isConnected && generation === state.generation;
  if (value.startsWith('/builtin/browser/')) {
    state.ready = false;
    state.origin = undefined;
    frame.src = value;
    return;
  }
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('HTTPまたはHTTPSのアドレスを入力してください。');
  if (engine === 'Rammerhead') {
    availability ||= loadBrowserEngines();
    const { rammerheadOrigin } = await availability;
    if (!current()) return;
    if (!rammerheadOrigin) throw new Error('このサーバーではRammerheadが有効になっていません。設定から別のエンジンを選択してください。');
    state.url = url.href;
    if (!state.origin) {
      state.origin = rammerheadOrigin;
      frame.src = rammerheadOrigin + '/flowos/frame';
    } else if (state.ready) post(frame, state, { action: 'navigate', url: state.url });
    return;
  }
  const initialized = await parent.Flow.proxyReady || await parent.Flow.recoverProxy();
  if (!current()) return;
  if (!initialized) throw new Error('プロキシを開始できませんでした。');
  if (engine === 'Scramjet') {
    const controller = await initScramjet();
    if (current()) {
      state.controller = controller;
      frame.src = controller.encodeUrl(url);
    }
  } else {
    const proxy = parent.currentProxy;
    frame.src = proxy.prefix + proxy.encodeUrl(url.href);
  }
}

export function displayURL (frame) {
  const state = frames.get(frame);
  if (state?.origin) return state.url || '';
  const page = new URL(frame.contentWindow.location.href);
  const proxy = parent.currentProxy;
  if (page.pathname.startsWith('/builtin/browser/')) return 'flow://' + page.pathname.split('/').pop().replace(/\.html$/, '');
  if (page.pathname.startsWith(SCRAMJET_SCOPE) && state?.controller) return state.controller.decodeUrl(page);
  if (page.pathname.startsWith(proxy.prefix)) return proxy.decodeUrl(page.pathname.slice(proxy.prefix.length)) + page.search + page.hash;
  return '';
}

export function browserAction (frame, action) {
  if (!frame) return;
  const state = frames.get(frame);
  if (state?.origin) {
    if (state.ready) post(frame, state, { action });
  } else if (action === 'reload') frame.contentWindow.location.reload();
  else frame.contentWindow.history[action]();
}
