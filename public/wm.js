/* eslint-env browser */

import WinBox from 'https://cdn.jsdelivr.net/npm/winbox@0.2.82/src/js/winbox.js';
import apps from './constants/apps.js';
window.WinBox = WinBox;

export class WindowManager {
  open = (appId) => {
    if (!Object.hasOwn(apps(), appId)) return null;
    const url = new URL('/app.html', location.origin);
    url.searchParams.set('app', appId);
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      window.alert('アプリのタブを開けませんでした。このサイトのポップアップを許可してから、もう一度お試しください。');
      return null;
    }
    tab.opener = null;
    tab.location.replace(url.href);
    return tab;
  };

  createPopup = (type, title, content, callback = () => {}) => {
    const popup = new WinBox({
      title,
      class: ['no-min', 'no-max', 'no-full'],
      html: `
        <div style="display: flex;align-items: center;justify-content: center;height: 100%;">
          <div style="display: flex;gap: 10px;padding: 10px;">
            <img src="/assets/icons/${type}.svg" width="50px" style="position: sticky;top: 0;align-self: flex-start;">
            <p style="margin: 0;max-width: 230px;">${content}<br/></p>
          </div>
        </div>
      `,
      x: 'center',
      y: 'center',
      height: '200px',
      width: '350px'
    });

    const button = document.createElement('button');
    button.innerText = 'Ok';
    button.classList.add('btn');
    button.onclick = () => {
      popup.hide(true);
      callback();
    };
    popup.body.querySelector('div > div > p').append(button);
  };
}
