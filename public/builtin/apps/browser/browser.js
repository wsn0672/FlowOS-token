/* eslint-env browser */

import { config } from '../../../scripts/managers.js';
import { removeObjectWithId } from '../../../scripts/utilities.js';
import { TabManager, HistoryManager } from './managers.js';
import { displayURL, navigate } from './engines.js';
import { isProxyError } from './proxy-error.js';

const input = document.querySelector('input');

let id = 0;
const tabs = [];
window.clickList = [];

const tm = new TabManager();
const history = new HistoryManager();

export class Tab {
  constructor () {
    id++;
    const _id = id;

    const div = document.createElement('div');
    const titleBtn = document.createElement('a');
    const closeBtn = document.createElement('a');
    const img = document.createElement('img');

    titleBtn.id = id;
    titleBtn.innerText = 'Loading... ';
    titleBtn.href = '#';

    closeBtn.innerText = '[x]';
    closeBtn.href = '#';

    img.width = '18';
    img.height = '18';
    img.src = '/assets/loading.gif';

    const createFrame = this.#createFrame;
    const iframe = createFrame(titleBtn, img);

    tabs.push({ iframe, id: _id });

    titleBtn.onclick = () => {
      tm.setActiveTab(iframe);
    };

    closeBtn.onclick = () => {
      iframe.remove();
      div.remove();

      removeObjectWithId(tabs, _id);

      if (window.clickList[0] !== iframe) return;
      if (tabs.length > 0) return tm.setActiveTab(tabs.at(-1).iframe);
      return new Tab();
    };

    div.appendChild(img);
    div.appendChild(titleBtn);
    div.appendChild(closeBtn);

    document.querySelector('.tabs').append(div);
    document.querySelector('main').append(iframe);

    tm.setActiveTab(iframe);
    navigate(iframe, config.settings.get('search').url).catch(error => {
      titleBtn.innerText = '接続できません';
      window.dispatchEvent(new CustomEvent('flow-browser-navigation-error', { detail: error.message }));
    });
  }

  /**
   * Creates an iFrame for a tab
   * @param {HTMLAnchorElement} titleBtn
   * @param {HTMLImageElement} img
   * @returns {HTMLIFrameElement}
   */
  #createFrame = (titleBtn, img) => {
    const iframe = document.createElement('iframe');
    iframe.addEventListener('flow-page', event => this.#updateTab(iframe, titleBtn, img, event.detail));
    iframe.id = id;
    iframe.onload = () => {
      this.#handleTab(iframe, titleBtn, img);
    };
    return iframe;
  };

  /**
    * Handles the iFrame onLoad event
    * @param {HTMLIFrameElement} tab
    * @param {HTMLAnchorElement} titleBtn
    * @param {HTMLImageElement} img
    * @returns {void}
    */
  #handleTab = (iframe, titleBtn, img) => {
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;
    const url = displayURL(iframe);
    if (!url) return;
    if (isProxyError(doc) && window.clickList[0] === iframe) {
      window.dispatchEvent(new CustomEvent('flow-proxy-error'));
    }
    this.#updateTab(iframe, titleBtn, img, { url, title: doc.title });
    if (url.startsWith('flow:')) return;

    config.settings.get('search').urls.forEach((url) => {
      this.#injectJS(iframe, url, false, () => {});
    });

    document.querySelector('.block').onclick = () => {
      this.#blockElement(iframe);
    };
  };

  #updateTab (iframe, titleBtn, img, { url, title }) {
    if (window.clickList[0] === iframe) input.value = url;
    titleBtn.innerText = title || url;
    img.src = '/assets/icons/browser.svg';
    if (!url.startsWith('flow:')) history.add(url, title || url, img.src);
  }

  /**
    * Injects JS code into the iFrame
    * @param {HTMLIFrameElement} iframe
    * @param {string} FILE_URL
    * @param {boolean} async
    * @param {function} callback
    * @returns {Event}
    */
  #injectJS = (iframe, FILE_URL, async = true, callback) => {
    const scriptEle = document.createElement('script');

    scriptEle.setAttribute('src', FILE_URL);
    scriptEle.setAttribute('defer', async);

    iframe.contentDocument.body.appendChild(scriptEle);

    scriptEle.addEventListener('load', (e) => {
      callback(e);
    });

    scriptEle.addEventListener('error', (e) => {
      console.error(e, FILE_URL);
    });
  };

  /**
    * Injects the block element script into iFrame
    * @param {HTMLIFrameElement} iframe
    * @returns {void}
    */
  #blockElement = (iframe) => {
    const cursor = (cur) => { iframe.contentDocument.body.style.cursor = cur; };

    for (const element of iframe.contentDocument.getElementsByTagName('a')) {
      (element).style.pointerEvents = 'none';
    }

    const handler = (e) => {
      e = e || window.event;
      const target = e.target || e.srcElement;
      target.style.display = 'none';

      iframe.contentDocument.removeEventListener('click', handler, false);
      cursor('default');

      for (const element of iframe.contentDocument.getElementsByTagName('a')) {
        (element).style.pointerEvents = 'initial';
      }
    };

    iframe.contentDocument.addEventListener('click', handler, false);
    cursor('crosshair');
  };
}
