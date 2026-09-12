// On-demand regression check for the mobile PowerShell pane's touch-scroll
// direction. Not part of `npm test` / CI: it needs a real Chromium (via
// `playwright`, a devDependency) and spawns a real, isolated Paneboard instance.
//
// Why this exists: `installMobileTerminalTouchScroll` in public/app.js turns
// finger movement into a synthetic `WheelEvent` dispatched on
// `.xterm-scrollable-element`. A dispatched (untrusted) WheelEvent scrolls
// xterm the OPPOSITE way from a real mouse wheel with the same deltaY, so the
// direction can only be trusted by reading the rendered rows, never by
// reasoning about the sign of deltaY. See memory `xterm-synthetic-wheel-inverted`.
//
// Usage:
//   npm i -D playwright && npx playwright install chromium
//   node scripts/verify-mobile-scroll.js
//
// The script backs up config.toml and data/state.json(.bak) in this project
// root, runs an isolated instance on a free port with a fresh default pane,
// drives a real touch drag over CDP, and restores the backups afterward.

/* global document */
// `document` above is used inside page.evaluate/waitForFunction callbacks,
// which Playwright serializes to run in the browser page, not this process.

const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const configPath = path.join(root, 'config.toml');
const dataDir = path.join(root, 'data');
const statePath = path.join(dataDir, 'state.json');
const stateBakPath = path.join(dataDir, 'state.json.bak');
const controlTokenPath = path.join(dataDir, 'control-token');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function backupAside(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  const backup = `${file}.verify-mobile-scroll-backup`;
  fs.renameSync(file, backup);
  return backup;
}

function restoreFrom(file, backup) {
  if (fs.existsSync(file)) {
    fs.rmSync(file);
  }
  if (backup) {
    fs.renameSync(backup, file);
  }
}

function waitForHttp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/config', timeout: 1000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Server did not respond on port ${port} within ${timeoutMs}ms`));
        return;
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

function requestShutdown(port, token) {
  return new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/runtime/shutdown',
      method: 'POST',
      headers: { 'X-Paneboard-Control-Token': token }
    }, (res) => {
      res.resume();
      resolve();
    });
    req.on('error', () => resolve());
    req.end();
  });
}

async function main() {
  let playwright;
  try {
    playwright = require('playwright');
  } catch {
    console.error('playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
    process.exitCode = 1;
    return;
  }

  const port = await freePort();
  const configBackup = backupAside(configPath);
  const stateBackup = backupAside(statePath);
  const stateBakBackup = backupAside(stateBakPath);

  fs.writeFileSync(configPath, [
    '[server]',
    'host = "127.0.0.1"',
    `port = ${port}`,
    'open_browser = false',
    '',
    '[auth]',
    'password_hash = ""',
    ''
  ].join('\n'));

  const child = spawn(process.execPath, [path.join(root, 'src', 'main.js')], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  let browser;
  let passed = false;
  let failure = null;

  try {
    await waitForHttp(port, 20000);

    browser = await playwright.chromium.launch();
    const context = await browser.newContext({ ...playwright.devices['iPhone 13'] });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);

    // xterm.js nests its own div.terminal.xterm inside the pane's container, so
    // the plain .terminal class matches two elements; data-terminal-tab is the
    // app's own attribute and only ever lands on the outer pane container.
    const terminal = 'div[data-terminal-tab]:not([hidden])';
    await page.waitForSelector(`${terminal} .xterm-rows`, { timeout: 15000 });

    // Wait for the shell to reach an idle prompt before typing into it.
    await page.waitForFunction((sel) => {
      const rows = document.querySelector(`${sel} .xterm-rows`);
      return !!rows && /PS [^>]*>\s*$/.test(rows.textContent || '');
    }, terminal, { timeout: 15000 });

    await page.click(terminal);
    await page.keyboard.type('1..130 | ForEach-Object { $_ }');
    await page.keyboard.press('Enter');
    await page.waitForFunction((sel) => {
      const rows = document.querySelector(`${sel} .xterm-rows`);
      return !!rows && rows.textContent.includes('130');
    }, terminal, { timeout: 15000 });
    await page.waitForTimeout(500);

    const readTopLine = () => page.evaluate((sel) => {
      const row = document.querySelector(`${sel} .xterm-rows > div`);
      return row ? row.textContent.trim() : '';
    }, terminal);

    const topLineBefore = await readTopLine();

    const box = await page.locator(terminal).boundingBox();
    const cx = box.x + box.width / 2;
    const startY = box.y + box.height * 0.3;
    const endY = box.y + box.height * 0.8;

    // Real hardware-level touch, dispatched over CDP so the browser's normal
    // (trusted) event path runs — not a hand-built untrusted TouchEvent.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: startY }] });
    const steps = 8;
    for (let i = 1; i <= steps; i += 1) {
      const y = startY + ((endY - startY) * i) / steps;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y }] });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);

    const topLineAfter = await readTopLine();

    const before = Number.parseInt(topLineBefore, 10);
    const after = Number.parseInt(topLineAfter, 10);
    if (!Number.isFinite(before) || !Number.isFinite(after)) {
      throw new Error(`Could not read numbered rows (before="${topLineBefore}" after="${topLineAfter}")`);
    }
    // Dragging the finger down pulls older (smaller-numbered) output into view.
    if (!(after < before)) {
      throw new Error(`Dragging down should reveal older, smaller-numbered lines: before=${before} after=${after}`);
    }

    passed = true;
    console.log(`PASS: dragging down moved the top visible line from ${before} to ${after} (older content came into view, as expected).`);
  } catch (error) {
    failure = error;
  } finally {
    if (browser) {
      await browser.close();
    }
    try {
      const controlToken = fs.readFileSync(controlTokenPath, 'utf8').trim();
      await requestShutdown(port, controlToken);
    } catch {
      // Nothing to shut down cleanly with; the process kill below covers it.
    }
    await new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('exit', resolve);
      setTimeout(resolve, 5000).unref();
    });
    if (child.exitCode === null) {
      child.kill();
    }

    restoreFrom(configPath, configBackup);
    restoreFrom(statePath, stateBackup);
    restoreFrom(stateBakPath, stateBakBackup);
  }

  if (!passed) {
    console.error('FAIL:', failure ? failure.message : 'unknown error');
    console.error('--- server stdout ---\n' + stdout);
    console.error('--- server stderr ---\n' + stderr);
    process.exitCode = 1;
  }
}

main();
