/* eslint-env browser */

import { config } from '../../../scripts/managers.js';

const valueLabels = new Map([['Celsius', '摂氏（℃）'], ['Fahrenheit', '華氏（℉）']]);

window.onload = () => {
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

window.openCSS = () => {
  console.log(parent);
  parent.WinBox({
    title: 'CSSエディター',
    icon: 'assets/icons/text-editor.svg',
    html: '<iframe src="/builtin/apps/css.html" scrolling="yes"></iframe>',
    x: 'center',
    y: 'center',
    width: '400px',
    height: '500px'
  });
};
