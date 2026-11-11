/* eslint-env browser */
import { displayURL } from './engines.js';

const tools = new WeakMap();

function load (doc, url) {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(new Error('開発者ツールを読み込めませんでした。'));
    };
    doc.head.append(script);
  });
}

export async function toggleDevTools (frame) {
  const doc = frame?.contentDocument;
  if (!doc?.head || !/^https?:/.test(displayURL(frame))) return;
  let state = tools.get(doc);
  if (!state) {
    state = { visible: false };
    tools.set(doc, state);
    try {
      await load(doc, 'https://cdn.jsdelivr.net/npm/eruda');
      if (frame.contentDocument !== doc) return;
      state.instance = frame.contentWindow.eruda;
      state.instance.init({ tool: ['console', 'elements', 'code', 'sources'] });
      state.instance._entryBtn.hide();
      load(doc, 'https://cdn.jsdelivr.net/npm/eruda-code').then(() => {
        if (frame.contentDocument === doc) state.instance.add(frame.contentWindow.erudaCode);
      }).catch(() => {});
    } catch (error) {
      tools.delete(doc);
      if (frame.contentDocument === doc) throw error;
      return;
    }
  }
  if (!state.instance || frame.contentDocument !== doc) return;
  if (state.visible) state.instance.hide();
  else state.instance.show();
  state.visible = !state.visible;
}
