/* eslint-env browser */

import { displayURL } from './engines.js';

const input = document.querySelector('input');

export class HistoryManager {
  constructor () {
    if (!window.localStorage.getItem('history')) { window.localStorage.setItem('history', '[]'); }
  }

  /**
   * Adds a URL to the history
   * @param {string} url
   * @param {string} title
   * @param {string} favicon
   * @returns {Array}
   */
  add = (url, title, favicon) => {
    return window.localStorage.setItem('history', JSON.stringify([{ url, title, favicon, date: new Date() }, ...this.get()]));
  };

  /**
   * Gets the history
   * @returns {Array}
   */
  get = () => JSON.parse(window.localStorage.getItem('history'));
}

export class TabManager {
  constructor () {
    document.querySelector('.tabs').addEventListener('wheel', (evt) => {
      evt.preventDefault();
      document.querySelector('.tabs').scrollLeft += evt.deltaY;
    });
  }

  /**
   * Sets the active tab
   * @param {HTMLIFrameElement} iframe
   * @returns {void}
   */
  setActiveTab = (iframe) => {
    if (!iframe) return;
    if (window.clickList[0]) window.clickList[0].style.display = 'none';
    window.clickList[0] = iframe;
    try { input.value = displayURL(iframe); } catch { input.value = ''; }
    iframe.style.display = 'block';
  };
}
