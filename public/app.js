/* eslint-env browser */
/* global __uv$config */

import apps from './constants/apps.js';
import FlowInstance from './flow.js';
import FlowSDK from './sdk/index.js';
import { safeAppURL } from './scripts/app-safety.js';
import { confirmBrowser } from './scripts/desktop.js';
import Logger from './scripts/logger.js';
import { config } from './scripts/managers.js';
import { loadCSS, registerSettings, useCustomCSS } from './scripts/utilities.js';
import './uv/uv.config.js';

const content = document.querySelector('.app-tab-content');
const status = content.querySelector('[role="status"]');
const closeTab = () => {
  window.close();
  // A copied link opened manually may not be script-closable.
  if (!window.closed) location.replace('/os.html');
};
document.querySelector('.app-tab-bar button').onclick = closeTab;

async function openApp () {
  const id = new URLSearchParams(location.search).get('app');
  const definitions = apps();
  if (!Object.hasOwn(definitions, id)) {
    status.textContent = 'アプリが見つかりません。';
    return;
  }
  const app = definitions[id];
  const url = safeAppURL(app.url, null);
  if (!url) throw new Error('アプリのアドレスを開けませんでした。');
  const icon = safeAppURL(app.icon, '/assets/icons/application.svg', true);
  document.querySelector('.app-tab-bar img').src = icon;
  document.querySelector('.app-tab-bar span').textContent = app.title;
  document.querySelector('link[rel="icon"]').href = icon;
  document.title = app.title + ' · FlowOS';

  window.logger = new Logger();
  window.currentProxy = __uv$config;
  window.Flow = new FlowInstance({ proxy: id === 'browser' || app.proxy === true });
  registerSettings();
  if (!config.apps.get()) config.apps.set([]);
  if (!config.customApps.get()) config.customApps.set([]);
  loadCSS(config.settings.get('theme').url);
  useCustomCSS();

  if (id === 'settings') {
    for (const moduleURL of config.settings.get('modules').urls.filter(Boolean)) {
      try { await import(moduleURL); } catch (error) { console.error(error); }
    }
  }
  if (id === 'browser' && !await confirmBrowser()) {
    closeTab();
    return;
  }

  const frame = document.createElement('iframe');
  frame.title = app.title;
  frame.allow = 'autoplay; fullscreen; gamepad';
  if (app.proxy === true) {
    if (!await window.Flow.proxyReady) throw new Error('プロキシを開始できませんでした。');
    const proxied = window.currentProxy.prefix + window.currentProxy.encodeUrl(url);
    frame.src = proxied;
    frame.onload = () => {
      if (!frame.contentDocument) return;
      const sdk = new FlowSDK({ close: closeTab, focus: () => window.focus(), body: content }, proxied);
      frame.contentWindow.FlowSDK = sdk;
      sdk.onmanifest = manifest => {
        const uses = Array.isArray(manifest.uses) ? manifest.uses : [];
        if (uses.includes('theming')) loadCSS(config.settings.get('theme').url, frame.contentDocument);
        if (uses.includes('styling')) {
          loadCSS('/styles/style.css', frame.contentDocument);
          loadCSS('/styles/window.css', frame.contentDocument);
        }
      };
    };
  } else {
    frame.src = url;
  }
  content.replaceChildren(frame);
}

openApp().catch(error => { status.textContent = error.message; });
