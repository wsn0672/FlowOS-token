/* eslint-env browser */
const day = document.querySelector('#day');
const zone = document.querySelector('#zone');
const ip = document.querySelector('#ip');
const filter = document.querySelector('#filter');
const records = document.querySelector('#records');
const status = document.querySelector('#status');
const older = document.querySelector('#older');
let entries = [];
let before = null;
let generation = 0;
const today = () => new Date(Date.now() + (zone.value === 'JST' ? 9 * 3600000 : 0)).toISOString().slice(0, 10);
day.value = today();
async function api (path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error('ログを読み込めませんでした。');
  return response.json();
}
function render () {
  const search = filter.value.toLowerCase();
  records.replaceChildren();
  const shown = entries.filter(entry => `${entry.url} ${entry.method} ${entry.type}`.toLowerCase().includes(search));
  for (const entry of shown) {
    const article = document.createElement('article');
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    for (const [text, className] of [[entry.timestamp.slice(11, 19), 'time'], [entry.method, 'method'], [entry.url, 'url'], [entry.status || entry.type, 'kind']]) {
      const span = document.createElement('span');
      span.textContent = text;
      span.className = className;
      summary.append(span);
    }
    const content = document.createElement('div');
    content.className = 'headers';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(entry, null, 2);
    content.append(pre);
    details.append(summary, content);
    article.append(details);
    records.append(article);
  }
  status.textContent = `${ip.value || '利用者を選択'} · ${shown.length}件表示 / ${entries.length}件読み込み済み（新しい順）`;
  older.hidden = before === null;
}
async function load (append = false) {
  const current = ++generation;
  if (!append) { entries = []; before = null; render(); }
  if (!ip.value) return;
  status.textContent = '読み込み中…';
  const query = new URLSearchParams({ day: day.value, zone: zone.value, ip: ip.value });
  if (append && before !== null) query.set('before', before);
  try {
    const result = await api('/api/logs?' + query);
    if (current !== generation) return;
    entries.push(...result.records);
    before = result.before;
    render();
  } catch (error) { if (current === generation) status.textContent = error.message; }
}
async function refresh () {
  const current = ++generation;
  const selectedDay = day.value;
  const selectedIP = ip.value;
  try {
    const users = await api('/api/users?' + new URLSearchParams({ day: selectedDay, zone: zone.value }));
    if (current !== generation) return;
    ip.replaceChildren();
    for (const value of users) {
      const option = document.createElement('option');
      option.value = option.textContent = value;
      ip.append(option);
    }
    if (users.includes(selectedIP)) ip.value = selectedIP;
    await load();
    if (!users.length) status.textContent = 'この日のログはまだありません。';
  } catch (error) { if (current === generation) status.textContent = error.message; }
}
zone.addEventListener('change', () => { day.value = today(); refresh(); });
day.addEventListener('change', refresh);
ip.addEventListener('change', () => load());
filter.addEventListener('input', render);
document.querySelector('#refresh').addEventListener('click', refresh);
older.addEventListener('click', () => load(true));
refresh();
