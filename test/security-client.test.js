import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { readAppDefinition, safeWindowConfig } from '../public/scripts/app-safety.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');

test('app manifests retain layout while excluding executable URLs and WinBox markup', () => {
  globalThis.window = { location: { href: 'https://flow.example/os.html' } };
  try {
    const config = safeWindowConfig({ width: '750px', height: '80%', class: ['no-resize'], html: '<img onerror=alert(1)>', url: 'javascript:alert(1)', root: 'body' });
    assert.deepEqual(config, { width: '750px', height: '80%', class: ['no-resize'] });
    const app = readAppDefinition({ APP_ID: 'example', title: 'Example', url: '/app.html', icon: 'javascript:alert(1)', proxy: true, config });
    assert.equal(app.url, 'https://flow.example/app.html');
    assert.equal(app.icon, '/assets/icons/application.svg');
    assert.equal(app.proxy, true);
    assert.throws(() => readAppDefinition({ APP_ID: 'example', title: 'Example', url: 'javascript:alert(1)' }));
    assert.throws(() => readAppDefinition({ APP_ID: '__proto__', title: 'Example', url: '/app.html' }));
  } finally { delete globalThis.window; }
});

test('launcher treats hostile titles as text and icon attributes as data', () => {
  const items = [];
  const title = '<img src=x onerror="alert(1)">';
  const context = {
    location: { protocol: 'https:', hostname: 'flow.example' },
    WindowManager: class {},
    Logger: class {},
    registerSW () {},
    fetch: async () => ({ json: async () => ({}) }),
    apps: () => ({ example: { title, icon: 'x" onerror="alert(1)' } }),
    safeAppURL: () => '/assets/icons/application.svg',
    document: {
      querySelector: () => ({ append: item => items.push(item) }),
      createElement: tag => ({ tag, append (...children) { this.children = children; } })
    }
  };
  vm.runInNewContext(source('../public/flow.js').replace('export default class FlowInstance', 'globalThis.FlowInstance = class FlowInstance'), context);
  new context.FlowInstance().apps.register();
  assert.equal(items[0].innerHTML, undefined);
  assert.equal(items[0].children[1].textContent, title);
  assert.equal(items[0].children[0].src, '/assets/icons/application.svg');
});

test('SDK grants sensitive capabilities only after desktop approval', async () => {
  for (const approved of [false, true]) {
    const prompts = [];
    const config = {};
    const wm = {};
    const context = {
      URL,
      console,
      config,
      window: { currentProxy: { decodeUrl: value => value }, Flow: { wm }, confirm: text => { prompts.push(text); return approved; } },
      fetch: async () => ({ status: 200, json: async () => ({ permissions: ['config', 'windowManager'], uses: [] }) })
    };
    vm.runInNewContext(source('../public/sdk/index.js').replace('export default FlowSDK;', 'globalThis.FlowSDK = FlowSDK;'), context);
    const sdk = new context.FlowSDK({}, 'https://app.example/path');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /https:\/\/app\.example/);
    assert.equal(sdk.config, approved ? config : undefined);
    assert.equal(sdk.windowManager, approved ? wm : undefined);
  }
});
