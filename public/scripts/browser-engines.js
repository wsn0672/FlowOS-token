/* eslint-env browser */
export const browserEngines = [
  { id: 'Ultraviolet', label: 'A · Ultraviolet', description: 'FlowOSでこれまで使ってきた方式です。普段使いや比較の基準に向いています。' },
  { id: 'Scramjet', label: 'B · Scramjet', description: '新しい書き換え方式です。動的なサイトを試す候補ですが、一部の機能は動作しない場合があります。' },
  { id: 'Rammerhead', label: 'C · Rammerhead', description: 'サーバー側でページを書き換える方式です。ほかの方式で開けないサイトを試せます。Googleログインには対応していません。' }
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
