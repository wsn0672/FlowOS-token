/* eslint-env browser */
export const browserEngines = [
  { id: 'Ultraviolet', label: 'A · Ultraviolet', description: '非推奨です。非常に不安定。FlowOSでこれまで使ってきた方式です。YouTube再生不可。' },
  { id: 'Scramjet', label: 'B · Scramjet', description: '【推奨】新しい書き換え方式です。動的なwebサイトでの表示成功率が高いです。YouTube再生OK。Xログイン・投稿OK。Googleログイン不可。' },
  { id: 'Rammerhead', label: 'C · Rammerhead', description: 'サーバー側でページを書き換える方式です。理論的にはこちらが最も安定しますが、現状、とても不安定です。別ドメイン "rammerhead.wsn0672.jp" を使用するため、検閲される可能性があります。Googleログイン不可。' }
];

const KEY = 'flowos-browser-engine';
let selected;
export function getBrowserEngine () {
  try { return localStorage.getItem(KEY) || selected; } catch { return selected; }
}
export function setBrowserEngine (id) {
  if (!browserEngines.some(engine => engine.id === id)) return;
  selected = id;
  try { localStorage.setItem(KEY, id); } catch {}
}

export function loadBrowserEngines () {
  return fetch('/api/browser-engines', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    .then(response => response.ok ? response.json() : {})
    .catch(() => ({}));
}

export function engineDescription (engine, availability) {
  return engine.description + (engine.id === 'Rammerhead' && !availability.rammerheadOrigin ? ' このサーバーではまだ有効になっていません。' : '');
}
