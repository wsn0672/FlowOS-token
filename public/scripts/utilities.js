/* eslint-env browser */
/* global __uv$config, BareMux */

import { SettingsCategory, SettingsInput, SettingsTextarea } from './classes.js';
import { config } from './managers.js';
import Logger from './logger.js';
import { createProxyRecovery, watchProxyRecovery, withTimeout } from './proxy-recovery.js';

const logger = new Logger();

let recovery;
let registration;
export const registerSW = () => {
  if (registration) return registration;
  registration = (async () => {
    if (!('serviceWorker' in navigator)) return;
    const connection = new BareMux.BareMuxConnection('/baremux/worker.js');
    recovery = createProxyRecovery({
      connection,
      probe: async () => {
        const response = await fetch('/api/proxy-health', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (response.status !== 204 || response.headers.get('x-flowos-health') !== 'ok') throw new Error('サーバーに接続できません。');
        if (!await withTimeout(navigator.serviceWorker.getRegistration(__uv$config.prefix))) {
          await withTimeout(navigator.serviceWorker.register('/uv/sw.js', { scope: __uv$config.prefix }));
        }
      },
      notify: detail => {
        window.flowProxyStatus = detail;
        window.dispatchEvent(new CustomEvent('flow-proxy-status', { detail }));
      }
    });
    watchProxyRecovery(recovery);
    await recovery.ensure();
    await withTimeout(navigator.serviceWorker.register('/uv/sw.js', { scope: __uv$config.prefix }));
    return true;
  })();
  return registration;
};

export const recoverProxy = () => recovery ? recovery.recover() : Promise.resolve(false);

export const loadCSS = (FILE_URL) => {
  const startDate = new Date();
  const styleEle = document.createElement('link');

  styleEle.setAttribute('rel', 'stylesheet');
  styleEle.setAttribute('type', 'text/css');
  styleEle.setAttribute('href', FILE_URL);

  document.head.appendChild(styleEle);

  styleEle.addEventListener('load', () => {
    const nowDate = new Date();
    logger.debug(FILE_URL + ' - ' + Math.abs(startDate - nowDate) + 'ms');
    return true;
  });

  styleEle.addEventListener('error', (ev) => {
    logger.debug(FILE_URL, ev);
    return false;
  });
};

export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const registerSettings = () => {
  const search = new SettingsCategory('search', 'ブラウザー', [
    new SettingsInput('url', '検索エンジンのURL', 'https://duckduckgo.com', 'https://duckduckgo.com'),
    new SettingsTextarea('urls', '拡張スクリプトのURL（1行に1件）', 'https://mysite.to/script1.js\nhttps://mysite.to/script2.js\nhttps://mysite.to/script3.js', '')
  ]);

  const theme = new SettingsCategory('theme', 'テーマ', [
    new SettingsInput('url', 'テーマのURL', 'https://mysite.to/theme.css', '/builtin/themes/catppuccin-macchiato.css')
  ]);

  const modules = new SettingsCategory('modules', 'モジュール・スクリプト', [
    new SettingsTextarea('urls', 'モジュールのURL（1行に1件）', 'https://mysite.to/script1.js\nhttps://mysite.to/script2.js\nhttps://mysite.to/script3.js', '/builtin/modules/battery.js\n/builtin/modules/clock.js\n/builtin/modules/weather.js')
  ]);

  return { search, theme, modules };
};

export const useCustomCSS = () => {
  const style = document.createElement('style');
  style.setAttribute('flow-style', 'true');
  style.innerHTML = config.css.get();
  document.head.append(style);
  return true;
};

export const removeObjectWithId = (arr, id) => {
  arr.splice(arr.findIndex((i) => {
    return i.id === id;
  }), 1);
};
