/* eslint-env browser */
import apps from '../constants/apps.js';
import { browserEngines, engineDescription, getBrowserEngine, loadBrowserEngines, setBrowserEngine } from './browser-engines.js';

const NOTICE_KEY = 'flowos-browser-notice-v1';
let noticeAccepted = false;
let browserNotice;
export async function confirmBrowser () {
  try { if (localStorage.getItem(NOTICE_KEY) === 'accepted') noticeAccepted = true; } catch {}
  if (noticeAccepted && getBrowserEngine()) return true;
  const availability = getBrowserEngine() ? {} : await loadBrowserEngines();
  if (browserNotice) return browserNotice;
  if (noticeAccepted && getBrowserEngine()) return true;
  browserNotice = new Promise(resolve => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'browser-notice';
    dialog.setAttribute('aria-labelledby', 'browser-notice-title');
    dialog.innerHTML = `<span class="notice-eyebrow">FLOW OS · BROWSER</span>
      <h2 id="browser-notice-title">${noticeAccepted ? 'プロキシエンジンを選択' : '通信は記録されます'}</h2>
      <div class="notice-copy"><p>このブラウザーの通信では、IPアドレス・アクセス先・HTTPメソッド・ヘッダー・通信量がサーバーに記録されます。</p><p>通信本文は保存されません。CookieやAuthorizationなどの認証ヘッダーは伏せ字で記録されます。</p><p class="notice-quota">1日3GBまで通常速度。超過後は同じIPの通信全体が1Mbpsに制限され、日本時間の午前0時に解除されます。</p></div>
      <div class="notice-engines"></div>
      <div class="notice-actions"><button type="button" data-choice="cancel">キャンセル</button><button type="button" data-choice="continue" class="primary-button">ブラウザーを開く</button></div>`;
    dialog.querySelector('.notice-copy').hidden = noticeAccepted;
    const choices = dialog.querySelector('.notice-engines');
    const next = dialog.querySelector('[data-choice="continue"]');
    if (!getBrowserEngine()) {
      choices.innerHTML = '<fieldset><legend>使用するプロキシエンジン</legend><p>設定からいつでも変更できます。同じサイトで表示・ログイン・再生を比べてください。</p></fieldset>';
      const options = choices.querySelector('fieldset');
      next.disabled = true;
      for (const engine of browserEngines) {
        const label = document.createElement('label');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'engine';
        radio.value = engine.id;
        radio.disabled = engine.id === 'Rammerhead' && !availability.rammerheadOrigin;
        radio.onchange = () => { next.disabled = false; };
        const name = document.createElement('strong');
        name.textContent = engine.label;
        const description = document.createElement('small');
        description.textContent = engineDescription(engine, availability);
        label.append(radio, name, description);
        options.append(label);
      }
    }
    const finish = allowed => {
      if (allowed) {
        const selection = choices.querySelector('input:checked');
        if (selection) setBrowserEngine(selection.value);
        noticeAccepted = true;
        try { localStorage.setItem(NOTICE_KEY, 'accepted'); } catch {}
      }
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
