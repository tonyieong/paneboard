'use strict';

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');

const root = path.join(__dirname, '..');
const LICENSE_SOURCES = [
  {
    id: 'node-runtime',
    name: 'Node.js',
    version: '22.23.2',
    destination: 'licenses/node-v22.23.2-LICENSE',
    url: 'https://raw.githubusercontent.com/nodejs/node/v22.23.2/LICENSE',
    sha256: 'c738ae413cf561f174e34f6961f8ca458aae2369a73640dda6234c629b98bcc4'
  },
  {
    id: 'ofl-1.1',
    name: 'SIL Open Font License',
    version: '1.1',
    destination: 'licenses/OFL-1.1.txt',
    url: 'https://raw.githubusercontent.com/spdx/license-list-data/v3.27.0/text/OFL-1.1.txt',
    sha256: '8eea8287e5876b539670cadb82e99f9a7afddec6f6730811be1daf25d2e9bcfd'
  },
  {
    id: 'excalidraw-webpack-notice',
    name: 'Excalidraw webpack notices',
    version: '0.17.1',
    destination: 'plugin-panes/whiteboard/assets/excalidraw/excalidraw-with-preact.production.min.js.LICENSE.txt',
    url: 'https://unpkg.com/@excalidraw/excalidraw@0.17.1/dist/excalidraw-with-preact.production.min.js.LICENSE.txt',
    sha256: '6f041978ab638280d73d266251fa50856e40e4b6e9d8ef9652026c7d4fac9518'
  }
];

function sourcePath(source) {
  return path.join(root, source.destination);
}

function digest(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verifyLicenseSources() {
  const problems = [];
  for (const source of LICENSE_SOURCES) {
    const file = sourcePath(source);
    if (!fs.existsSync(file)) {
      problems.push(`${source.destination} is missing`);
      continue;
    }
    const actual = digest(fs.readFileSync(file));
    if (actual !== source.sha256) {
      problems.push(`${source.destination} has SHA256 ${actual}, expected ${source.sha256}`);
    }
  }
  return problems;
}

function download(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) {
        response.resume();
        resolve(download(new URL(response.headers.location, url).toString(), redirects - 1));
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function syncLicenseSources() {
  for (const source of LICENSE_SOURCES) {
    const content = await download(source.url);
    const actual = digest(content);
    if (actual !== source.sha256) {
      throw new Error(`${source.name} ${source.version} has SHA256 ${actual}, expected ${source.sha256}`);
    }
    const file = sourcePath(source);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    process.stdout.write(`Wrote ${source.destination}\n`);
  }
}

if (require.main === module) {
  syncLicenseSources().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { LICENSE_SOURCES, sourcePath, verifyLicenseSources };
