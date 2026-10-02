const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const tokenExpression = source.match(/ {4}token: (.*),/)[1];
const tokenFunctions = source.slice(source.indexOf('  function saveToken('), source.indexOf('  function loadFilePathHistory('));

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

// Each launch has new WebView storage, just like the random loopback origin.
function launch(native) {
  const context = vm.createContext({ localStorage: storage(), sessionStorage: storage(), window: { PaneboardAndroid: native }, state: {} });
  vm.runInContext(`state.token = ${tokenExpression}; ${tokenFunctions}`, context);
  return context;
}

test('remembered Android login survives a new loopback origin; ordinary login and logout clear it', () => {
  let token = '';
  const native = { getToken: () => token, saveToken: (value) => { token = value; } };
  const first = launch(native);
  first.saveToken('remembered-session', true);
  assert.equal(launch(native).state.token, 'remembered-session');
  first.saveToken('temporary-session', false);
  assert.equal(first.sessionStorage.getItem('paneboard.token'), 'temporary-session');
  assert.equal(launch(native).state.token, '');
  first.saveToken('remembered-again', true);
  const reopened = launch(native);
  reopened.clearToken();
  assert.equal(reopened.state.token, '');
  assert.equal(launch(native).state.token, '');
});

test('web browser keeps existing remembered and temporary storage behavior without Android', () => {
  const browser = launch(undefined);
  browser.saveToken('web-remembered', true);
  assert.equal(browser.localStorage.getItem('paneboard.token'), 'web-remembered');
  browser.saveToken('web-temporary', false);
  assert.equal(browser.localStorage.getItem('paneboard.token'), null);
  assert.equal(browser.sessionStorage.getItem('paneboard.token'), 'web-temporary');
  browser.clearToken();
  assert.equal(browser.sessionStorage.getItem('paneboard.token'), null);
});
