/* eslint-env browser */

import { config } from '../../../scripts/managers.js';
import { browserEngines, engineDescription, getBrowserEngine, loadBrowserEngines, setBrowserEngine } from '../../../scripts/browser-engines.js';

const valueLabels = new Map([['Celsius', '摂氏（℃）'], ['Fahrenheit', '華氏（℉）']]);

async function showBrowserEngines (container) {
  const form = document.createElement('form');
  form.className = 'browser-engine-settings';
  form.innerHTML = '<h2>プロキシエンジン</h2><label for="browser-engine">使用するエンジン</label><select id="browser-engine" aria-describedby="browser-engine-descriptions"><option value="">エンジンを選択</option></select><dl id="browser-engine-descriptions"></dl><p>変更は次に開くブラウザーに適用されます。ログイン状態はエンジン間で引き継がれません。</p><button type="submit" disabled>保存</button><span role="status"></span>';
  container.append(form);
  const select = form.querySelector('select');
  const button = form.querySelector('button');
  const descriptions = form.querySelector('dl');
  const status = form.querySelector('[role="status"]');
  const availability = await loadBrowserEngines();
  for (const engine of browserEngines) {
    const option = new Option(engine.label, engine.id);
    option.disabled = engine.id === 'Rammerhead' && !availability.rammerheadOrigin;
    select.add(option);
    const name = document.createElement('dt');
    name.textContent = engine.label;
    const description = document.createElement('dd');
    description.textContent = engineDescription(engine, availability);
    descriptions.append(name, description);
  }
  select.value = getBrowserEngine() || '';
  select.onchange = () => {
    button.disabled = !select.value;
    status.textContent = '';
  };
  form.onsubmit = event => {
    event.preventDefault();
    if (!select.value || select.selectedOptions[0].disabled) return;
    setBrowserEngine(select.value);
    button.disabled = true;
    status.textContent = ' 保存しました。ブラウザーを開き直すと切り替わります。';
  };
}

window.onload = () => {
  showBrowserEngines(document.querySelector('#modules'));
  Object.values(parent.Flow.settings.items).forEach((setting) => {
    const section = document.createElement('form');
    section.classList.add(`settings-${setting.SETTING_ID}`);

    const button = document.createElement('button');
    button.innerText = '保存して反映';

    const heading = document.createElement('h2');
    heading.innerText = setting.title;

    section.appendChild(heading);

    setting.inputs.forEach(input => {
      const inputEl = document.createElement(input.type);
      const label = document.createElement('label');
      const sub = document.createElement('sub');

      label.innerText = input.label;
      sub.innerText = `初期値: ${valueLabels.get(input.defaultValue) ?? input.defaultValue}\n\n`;

      inputEl.id = `settings-${setting.SETTING_ID}-${input.SETTING_INPUT_ID}`;
      label.htmlFor = inputEl.id;
      inputEl.classList.add(inputEl.id);
      inputEl.placeholder = input.placeholder;

      if (input.type === 'select') {
        input.options.forEach((option) => {
          const optionEl = document.createElement('option');
          optionEl.value = option;
          optionEl.innerText = valueLabels.get(option) ?? option;

          inputEl.append(optionEl);
        });
      }

      inputEl.value = input.type === 'textarea' ? config.settings.get(setting.SETTING_ID)[input.SETTING_INPUT_ID].join('\n') : config.settings.get(setting.SETTING_ID)[input.SETTING_INPUT_ID];

      section.appendChild(label);
      section.appendChild(inputEl);
      section.appendChild(sub);

      section.appendChild(button);

      section.onsubmit = (e) => {
        e.preventDefault();

        const obj = {};

        setting.inputs.forEach((input) => {
          obj[input.SETTING_INPUT_ID] = input.type === 'textarea' ? document.querySelector(`.settings-${setting.SETTING_ID}-${input.SETTING_INPUT_ID}`).value.split('\n') : document.querySelector(`.settings-${setting.SETTING_ID}-${input.SETTING_INPUT_ID}`).value;
        });

        config.settings.set(setting.SETTING_ID, obj);
        parent.window.location.reload();
      };
    });

    if (setting.SETTING_ID === 'theme') {
      document.querySelector('#look').appendChild(section);
    } else if (setting.SETTING_ID === 'modules') {
      document.querySelector('#scripts').appendChild(section);
    } else {
      document.querySelector('#modules').appendChild(section);
    }
  });
};

window.openCSS = () => parent.Flow.wm.open('css');
