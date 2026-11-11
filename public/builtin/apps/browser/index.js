/* eslint-env browser */

import { Tab } from './browser.js';

import { browserAction, engine, navigate } from './engines.js';
import { toggleDevTools } from './devtools.js';

document.querySelector('.engine-badge').textContent = engine;
window.browserAction = action => browserAction(window.clickList[0], action);
window.goBrowser = value => {
  const frame = window.clickList[0];
  if (!frame) return;
  navigate(frame, value).catch(error => {
    window.dispatchEvent(new CustomEvent('flow-browser-navigation-error', { detail: error.message }));
  });
};

const input = document.querySelector('input');
const dropdownBtn = document.querySelector('.more');
const dropdownMenu = document.getElementById('dropdown');

const devTools = dropdownMenu.querySelector('.eruda');
if (engine === 'Rammerhead') devTools.hidden = true;
devTools.onclick = async () => {
  try {
    await toggleDevTools(window.clickList[0]);
  } catch (error) {
    window.dispatchEvent(new CustomEvent('flow-browser-navigation-error', { detail: error.message }));
  }
};

let inputShowing = true;

/**
 * Creates a new tab
 * @returns {Tab}
 */
window.newTab = () => new Tab();

/**
 * Toggles the options dropdown
 * @returns {boolean}
 */
window.toggleDropdown = () => dropdownMenu.classList.toggle('show');

document.querySelector('.hide').onclick = () => {
  switch (inputShowing) {
    case true:
      document.querySelector('.hide').innerText = 'expand_more';
      document.querySelector('.tb').style.display = 'none';
      break;
    case false:
      document.querySelector('.hide').innerText = 'expand_less';
      document.querySelector('.tb').style.display = 'flex';
      break;
  }

  inputShowing = !inputShowing;
};

dropdownBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  window.toggleDropdown();
});

document.documentElement.addEventListener('click', () => {
  if (dropdownMenu.classList.contains('show')) {
    window.toggleDropdown();
  }
});

input.onkeydown = (e) => {
  if (e.key === 'Enter') {
    if (input.value.startsWith('flow:')) {
      if (input.value === 'flow://history') window.goBrowser('/builtin/browser/history.html');
    } else {
      let inputValue = input.value.trim();
      if (!inputValue) return;

      if (!inputValue.startsWith('http://') && !inputValue.startsWith('https://')) {
        inputValue = 'https://' + inputValue;
      }
      window.goBrowser(inputValue);
    }
  }
};

window.onload = () => {
  window.newTab();
};
