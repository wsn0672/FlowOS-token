/* eslint-env browser */
import apps from '../constants/apps.js';

let browserNotice;
export function confirmBrowser () {
  if (browserNotice) return browserNotice;
  browserNotice = new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'browser-notice';
    dialog.setAttribute('aria-labelledby', 'browser-notice-title');
    dialog.innerHTML = '<span class="notice-eyebrow">FLOW OS · PRIVACY</span><h2 id="browser-notice-title">通信は記録されます</h2><p>このブラウザーの通信では、IPアドレス・アクセス先・HTTPメソッド・ヘッダー・通信量がサーバーに記録されます。</p><p>通信本文は保存されません。CookieやAuthorizationなどの認証ヘッダーは伏せ字で記録されます。</p><p class="notice-quota">1日3GBまで通常速度。超過後は同じIPの通信全体が1Mbpsに制限され、日本時間の午前0時に解除されます。</p><div class="notice-actions"><button type="button" data-choice="cancel">キャンセル</button><button type="button" data-choice="continue" class="primary-button">確認してブラウザーを開く</button></div>';
    const finish = allowed => {
      dialog.close();
      dialog.remove();
      browserNotice = null;
      previous?.focus();
      resolve(allowed);
    };
    dialog.querySelector('[data-choice="cancel"]').onclick = () => finish(false);
    dialog.querySelector('[data-choice="continue"]').onclick = () => finish(true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector('[data-choice="cancel"]').focus();
  });
  return browserNotice;
}

export function initDesktop (flow) {
  if (document.querySelector('.desktop-apps')) return;
  const launcher = document.createElement('nav');
  launcher.className = 'desktop-apps';
  launcher.setAttribute('aria-label', 'デスクトップアプリ');
  const definitions = apps();
  for (const [id, label] of [['games', 'ゲーム'], ['browser', 'ブラウザー'], ['usage', 'ギガ確認'], ['settings', '設定']]) {
    const button = document.createElement('button');
    button.type = 'button';
    const image = document.createElement('img');
    image.src = definitions[id].icon;
    image.alt = '';
    const text = document.createElement('span');
    text.textContent = label;
    button.append(image, text);
    button.onclick = () => flow.wm.open(id);
    launcher.append(button);
  }
  document.querySelector('.container').prepend(launcher);
  const meter = document.createElement('button');
  meter.type = 'button';
  meter.className = 'statusbar-item statusbar-giga';
  meter.innerHTML = '<span class="giga-symbol">GB</span><span class="giga-value">取得中</span><progress max="3" value="0" aria-label="本日の通信量"></progress>';
  meter.onclick = () => flow.wm.open('usage');
  document.querySelector('.statusbar .right').prepend(meter);
  let loading = false;
  async function update () {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const response = await fetch('/api/usage', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Usage unavailable.');
      const data = await response.json();
      const used = (data.totalBytes / 1e9).toFixed(2);
      meter.querySelector('.giga-value').textContent = `${used} / 3 GB${data.limited ? ' · 1Mbps' : ''}`;
      meter.querySelector('progress').value = Math.min(3, data.totalBytes / 1e9);
      meter.classList.toggle('is-limited', data.limited);
      meter.title = `本日 ${used} GB使用。クリックして詳細を表示`;
      meter.setAttribute('aria-label', `ギガ確認。本日 ${used} GB、3 GBまで${data.limited ? '、速度制限中' : ''}`);
    } catch {
      meter.querySelector('.giga-value').textContent = '取得できません';
    } finally { loading = false; }
  }
  update();
  setInterval(update, 10000);
  document.addEventListener('visibilitychange', update);
}
