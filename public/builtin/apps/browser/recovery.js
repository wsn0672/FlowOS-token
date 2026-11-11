/* eslint-env browser */
const banner = document.querySelector('#connection-status');
const message = banner.querySelector('p');
const reconnect = banner.querySelector('[data-action="reconnect"]');
const reload = banner.querySelector('[data-action="reload"]');
const dismiss = banner.querySelector('[data-action="dismiss"]');
let hadFailure = false;
function activeError () {
  try {
    const frame = window.clickList?.[0];
    return frame?.contentDocument?.querySelector('#errorTitle')?.textContent === 'Error processing your request';
  } catch { return false; }
}
function show (detail) {
  if (detail.status === 'checking') {
    if (!hadFailure && !activeError()) return;
    message.textContent = '接続を確認しています…';
    reconnect.disabled = true;
    reload.hidden = true;
  } else if (detail.status === 'unavailable') {
    hadFailure = true;
    message.textContent = '接続が切れています。スリープ復帰後は、ネットワーク接続を確認して再接続してください。';
    reconnect.disabled = false;
    reload.hidden = true;
  } else {
    if (!hadFailure && !detail.restored && !activeError()) return;
    message.textContent = '接続を確認しました。表示が戻らない場合は、このタブを再読み込みしてください。入力中の内容は失われる場合があります。';
    reconnect.disabled = false;
    reload.hidden = false;
    hadFailure = false;
  }
  banner.hidden = false;
}
const onStatus = event => show(event.detail);
parent.addEventListener('flow-proxy-status', onStatus);
window.addEventListener('pagehide', () => parent.removeEventListener('flow-proxy-status', onStatus), { once: true });
reconnect.onclick = () => parent.Flow.recoverProxy();
reload.onclick = () => {
  const frame = window.clickList?.[0];
  if (frame && window.confirm('このタブを再読み込みしますか？入力中の内容や送信済みフォームを確認してください。')) window.browserAction('reload');
};
dismiss.onclick = () => { banner.hidden = true; };
window.addEventListener('flow-proxy-error', () => {
  hadFailure = true;
  show({ status: 'unavailable' });
  parent.Flow.recoverProxy();
});
if (parent.flowProxyStatus) show(parent.flowProxyStatus);

window.addEventListener('flow-browser-navigation-error', event => {
  message.textContent = event.detail;
  banner.hidden = false;
  reload.hidden = true;
});
