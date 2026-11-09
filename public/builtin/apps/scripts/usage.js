/* eslint-env browser */
const text = (selector, value) => { document.querySelector(selector).textContent = value; };
const gb = bytes => (bytes / 1e9).toFixed(3) + ' GB';
let loading = false;
async function update () {
  if (loading || document.hidden) return;
  loading = true;
  try {
    const response = await fetch('/api/usage', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('通信量を取得できませんでした。');
    const data = await response.json();
    document.body.classList.toggle('is-limited', data.limited);
    text('#used', (data.totalBytes / 1e9).toFixed(3));
    text('#state', data.limited ? '1Mbps · 速度制限中' : '通常速度');
    document.querySelector('#meter').value = Math.min(3, data.totalBytes / 1e9);
    text('#remaining', data.limited ? '通常速度の容量を使い切りました。翌日まで1Mbpsで利用できます。' : `通常速度で使える残り ${gb(data.remainingBytes)}`);
    text('#upload', gb(data.uploadBytes));
    text('#download', gb(data.downloadBytes));
    text('#reset', `次のリセット: ${new Date(data.resetsAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST`);
    text('#identity', `IP: ${data.ip} · ${data.requests.toLocaleString()}リクエスト`);
    const sites = document.querySelector('#sites');
    sites.replaceChildren();
    for (const site of data.sites) {
      const row = document.createElement('div');
      row.className = 'site-row';
      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = site.site;
      const value = document.createElement('span');
      value.textContent = `${gb(site.totalBytes)} · ${site.requests.toLocaleString()}件`;
      const meter = document.createElement('progress');
      meter.max = Math.max(1, data.totalBytes);
      meter.value = site.totalBytes;
      meter.setAttribute('aria-label', site.site + 'の通信量');
      row.append(name, value, meter);
      sites.append(row);
    }
    if (!data.sites.length) sites.textContent = '本日の通信はまだありません。';
    text('#updated', '10秒ごとに更新 · HTTPヘッダーや暗号化などの付加容量を除く、転送データの合計です。');
  } catch (error) { text('#updated', error.message); } finally { loading = false; }
}
update();
setInterval(update, 10000);
document.addEventListener('visibilitychange', update);
