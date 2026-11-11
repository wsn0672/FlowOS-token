/* eslint-env browser */
const frame = document.querySelector('iframe');
const message = document.querySelector('p');
let session;
let desktopOrigin;
function notify (kind, details = {}) {
  if (desktopOrigin) parent.postMessage({ kind: 'flowos-rammerhead-' + kind, ...details }, desktopOrigin);
}
async function openSession () {
  const response = await fetch('/flowos/session', { method: 'POST' });
  if (!response.ok) throw new Error('Rammerheadのセッションを開始できませんでした。');
  const result = await response.json();
  desktopOrigin = result.desktopOrigin;
  session = result.id;
}
frame.onload = () => {
  try {
    const page = frame.contentWindow.location;
    const url = page.pathname.match(new RegExp('^/' + session + '(?:![^/]*)?/(https?://.+)$'))?.[1];
    if (url) notify('page', { url: url + page.search + page.hash, title: frame.contentDocument.title || new URL(url).hostname });
  } catch {}
};
window.addEventListener('message', event => {
  if (event.source !== parent || event.origin !== desktopOrigin || event.data?.kind !== 'flowos-rammerhead-command') return;
  const command = event.data;
  if (command.action === 'back') frame.contentWindow.history.back();
  if (command.action === 'forward') frame.contentWindow.history.forward();
  if (command.action === 'reload') frame.contentWindow.location.reload();
  if (command.action !== 'navigate') return;
  try {
    const url = new URL(command.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    frame.src = '/' + session + '/' + url.href;
    frame.hidden = false;
    message.hidden = true;
  } catch {
    message.hidden = false;
    message.textContent = 'Rammerheadでページを開けませんでした。';
  }
});
openSession().then(() => notify('ready')).catch(error => { message.textContent = error.message; });
