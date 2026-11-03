import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the real notice initialization without the unrelated rest of the application.
const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const noticeCode = `${source.slice(0, source.indexOf('  // Theme'))}\n})();`;

test('failed ad loading leaves content visible and produces a dismissible nonmodal notice', async () => {
  const children = [], classes = [], attrs = {};
  let dismiss, focused = false;
  const button = { addEventListener: (_event, fn) => { dismiss = fn; }, focus: () => { focused = true; } };
  const document = {
    readyState: 'complete', referrer: '',
    documentElement: {
      hasAttribute: () => true,
      classList: { add: (name) => classes.push(name) },
    },
    querySelector: () => null,
    body: { append: (element) => children.push(element) },
    createElement: () => ({
      style: {}, isConnected: true, offsetHeight: 1,
      setAttribute(name, value) { attrs[name] = value; },
      querySelector: () => button,
      remove() { this.isConnected = false; const i = children.indexOf(this); if (i >= 0) children.splice(i, 1); },
    }),
  };
  vm.runInNewContext(noticeCode, {
    document, navigator: { onLine: true }, location: { search: '' },
    sessionStorage: { getItem: () => null },
    fetch: () => Promise.reject(new Error('blocked advertising request')),
    getComputedStyle: () => ({ display: 'block' }),
    // Make the notice's post-load callback immediate; this is a deterministic unit fixture.
    setTimeout: (fn) => fn(),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(children.length, 1);
  assert.equal(children[0].className, 'adwall');
  assert.equal(attrs.role, 'region');
  assert.equal(attrs['aria-modal'], undefined);
  assert.deepEqual(classes, [], 'must not hide the document');
  assert.equal(focused, false, 'must not steal keyboard focus');
  assert.match(children[0].innerHTML, /keep reading either way/);
  dismiss();
  assert.equal(children.length, 0, 'dismiss removes only the notice');
});
