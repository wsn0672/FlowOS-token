/* eslint-env browser */
const day = document.querySelector('#day');
const ip = document.querySelector('#ip');
const filter = document.querySelector('#filter');
const status = document.querySelector('#status');
const gb = bytes => (bytes / 1e9).toFixed(3) + ' GB';
let data;
let generation = 0;
day.value = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const text = (selector, value) => { document.querySelector(selector).textContent = value; };
function cells (parent, values) {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    if (value instanceof Node) cell.append(value); else cell.textContent = value;
    row.append(cell);
  }
  parent.append(row);
}
function bars (selector, sites, field, formatter) {
  const chart = document.querySelector(selector);
  chart.replaceChildren();
  const top = [...sites].sort((a, b) => b[field] - a[field]).slice(0, 12);
  const max = Math.max(1, ...top.map(site => site[field]));
  for (const site of top) {
    const row = document.createElement('div');
    row.className = 'chart-row';
    const name = document.createElement('span');
    name.textContent = site.site;
    const value = document.createElement('strong');
    value.textContent = formatter(site[field]);
    const bar = document.createElement('progress');
    bar.max = max;
    bar.value = site[field];
    bar.setAttribute('aria-label', `${site.site}: ${formatter(site[field])}`);
    row.append(name, value, bar);
    chart.append(row);
  }
  if (!top.length) chart.textContent = '通信はまだありません。';
}
function hourly (hours) {
  const chart = document.querySelector('#hourly');
  chart.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 960 210');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '時間帯別通信量。' + hours.map(hour => `${hour.hour}時 ${gb(hour.totalBytes)}`).join('、'));
  const max = Math.max(1, ...hours.map(hour => hour.totalBytes));
  const maxLabel = document.createElementNS(ns, 'text');
  maxLabel.setAttribute('x', '4'); maxLabel.setAttribute('y', '14');
  maxLabel.textContent = `最大 ${(max / 1e9).toFixed(3)} GB`;
  svg.append(maxLabel);
  for (const hour of hours) {
    const rect = document.createElementNS(ns, 'rect');
    const height = hour.totalBytes / max * 135;
    rect.setAttribute('x', String(hour.hour * 39 + 10));
    rect.setAttribute('y', String(170 - height));
    rect.setAttribute('width', '25');
    rect.setAttribute('height', String(Math.max(hour.totalBytes ? 2 : 0, height)));
    rect.setAttribute('rx', '3');
    const title = document.createElementNS(ns, 'title');
    title.textContent = `${hour.hour}時: ${gb(hour.totalBytes)}・${hour.requests}件`;
    rect.append(title);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(hour.hour * 39 + 10));
    label.setAttribute('y', '195');
    label.textContent = String(hour.hour).padStart(2, '0');
    svg.append(rect, label);
  }
  chart.append(svg);
}
function render () {
  if (!data) return;
  text('#total', gb(data.totals.totalBytes));
  text('#upload', gb(data.totals.uploadBytes));
  text('#download', gb(data.totals.downloadBytes));
  text('#requests', data.totals.requests.toLocaleString() + ' 件');
  const users = document.querySelector('#users');
  users.replaceChildren();
  for (const user of data.ips) {
    const button = document.createElement('button');
    button.className = 'ip-link';
    button.textContent = user.ip;
    button.onclick = () => { ip.value = user.ip; refresh(); };
    cells(users, [button, user.requests.toLocaleString(), gb(user.uploadBytes), gb(user.downloadBytes), gb(user.totalBytes)]);
  }
  const shown = data.sites.filter(site => site.site.toLowerCase().includes(filter.value.toLowerCase()));
  bars('#traffic-chart', shown, 'totalBytes', gb);
  bars('#request-chart', shown, 'requests', value => value.toLocaleString() + ' 件');
  hourly(data.hours);
  const sites = document.querySelector('#sites');
  sites.replaceChildren();
  for (const site of shown) cells(sites, [site.site, site.requests.toLocaleString(), gb(site.uploadBytes), gb(site.downloadBytes), gb(site.totalBytes)]);
  status.textContent = `${data.day} JST · ${ip.value || 'すべてのIP'} · ${data.ips.length} IP · サイト別グラフは上位12件`;
}
async function refresh () {
  const current = ++generation;
  status.textContent = '統計を読み込み中…';
  const query = new URLSearchParams({ day: day.value });
  if (ip.value) query.set('ip', ip.value);
  try {
    const response = await fetch('/api/statistics?' + query, { cache: 'no-store' });
    if (!response.ok) throw new Error('統計を取得できませんでした。');
    const result = await response.json();
    if (current !== generation) return;
    data = result;
    const selected = ip.value;
    ip.replaceChildren(new Option('すべてのIP', ''));
    for (const user of data.ips) ip.append(new Option(user.ip, user.ip));
    ip.value = data.ips.some(user => user.ip === selected) ? selected : '';
    render();
  } catch (error) { if (current === generation) status.textContent = error.message; }
}
ip.onchange = refresh;
day.onchange = () => { ip.value = ''; refresh(); };
filter.oninput = render;
document.querySelector('#refresh').onclick = refresh;
refresh();
